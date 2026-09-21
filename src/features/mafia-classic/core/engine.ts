import {
  allConnectedConfirmed,
  allNightActionsConfirmed,
  allVotesConfirmed,
  validateAction,
} from "./actionValidator.js";
import {
  assignClassicRoles,
  emptyNightActions,
  livingByAlignment,
  livingPlayers,
} from "./gameState.js";
import type { RandomSource } from "./random.js";
import {
  resolveExecution,
  resolveNight,
  resolveVote,
  resolveWinCheck,
} from "./resolvers.js";
import { transitionPhase } from "./stateMachine.js";
import type {
  DispatchResult,
  GameAction,
  GameState,
  PublicEvent,
  ReplayEntry,
} from "./types.js";

function appendEvent(state: GameState, event: Omit<PublicEvent, "seq">): GameState {
  return {
    ...state,
    publicEvents: [
      ...state.publicEvents,
      {
        ...event,
        seq: state.publicEvents.length + 1,
      },
    ],
  };
}

function recordAction(before: GameState, after: GameState, action: GameAction): GameState {
  const entry: ReplayEntry = {
    seq: before.replay.length + 1,
    revisionBefore: before.revision,
    actorId: action.playerId,
    action,
  };
  return {
    ...after,
    replay: [...after.replay, entry],
  };
}

function markReady(state: GameState, playerId: string, ready: boolean): GameState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId ? { ...player, ready } : player,
    ),
    revision: state.revision + 1,
  };
}

function startGame(state: GameState, rng: RandomSource): GameState {
  let next = transitionPhase(state, "ROLE_ASSIGNMENT");
  next = assignClassicRoles(next, rng);
  next = appendEvent(next, {
    type: "GAME_STARTED",
    day: 0,
  });
  return transitionPhase(next, "ROLE_REVEAL");
}

function confirmRole(state: GameState, playerId: string): GameState {
  const next: GameState = {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId ? { ...player, roleConfirmed: true } : player,
    ),
    revision: state.revision + 1,
  };
  if (!next.players.every((player) => player.roleConfirmed)) return next;
  return beginNight(transitionPhase(next, "NIGHT_START"));
}

function beginNight(state: GameState): GameState {
  if (state.phase !== "NIGHT_START") throw new Error("beginNight requires NIGHT_START.");
  const night = state.night + 1;
  let next: GameState = {
    ...state,
    night,
    nightActions: emptyNightActions(),
    nominations: {},
    votes: {},
    voteResult: null,
    pendingExecutionId: null,
    phaseConfirmations: [],
    revision: state.revision + 1,
  };
  next = appendEvent(next, {
    type: "NIGHT_STARTED",
    day: state.day,
  });
  return transitionPhase(next, "NIGHT_ACTION");
}

function selectNightTarget(state: GameState, playerId: string, targetId: string): GameState {
  const player = state.players.find((candidate) => candidate.id === playerId)!;
  if (player.role === "MAFIA") {
    return {
      ...state,
      nightActions: {
        ...state.nightActions,
        mafiaVotes: {
          ...state.nightActions.mafiaVotes,
          [playerId]: { targetId, confirmed: false },
        },
      },
      revision: state.revision + 1,
    };
  }
  if (player.role === "DOCTOR") {
    return {
      ...state,
      nightActions: {
        ...state.nightActions,
        doctor: { targetId, confirmed: false },
      },
      revision: state.revision + 1,
    };
  }
  return {
    ...state,
    nightActions: {
      ...state.nightActions,
      detective: { targetId, confirmed: false },
    },
    revision: state.revision + 1,
  };
}

function confirmNightAction(state: GameState, playerId: string): GameState {
  const player = state.players.find((candidate) => candidate.id === playerId)!;
  let next = state;

  if (player.role === "MAFIA") {
    const selected = state.nightActions.mafiaVotes[playerId]!;
    next = {
      ...state,
      nightActions: {
        ...state.nightActions,
        mafiaVotes: {
          ...state.nightActions.mafiaVotes,
          [playerId]: { ...selected, confirmed: true },
        },
      },
      revision: state.revision + 1,
    };
  } else if (player.role === "DOCTOR") {
    next = {
      ...state,
      nightActions: {
        ...state.nightActions,
        doctor: { ...state.nightActions.doctor, confirmed: true },
      },
      revision: state.revision + 1,
    };
  } else if (player.role === "DETECTIVE") {
    next = {
      ...state,
      nightActions: {
        ...state.nightActions,
        detective: { ...state.nightActions.detective, confirmed: true },
      },
      revision: state.revision + 1,
    };
  }

  if (!allNightActionsConfirmed(next)) return next;

  const resolving = transitionPhase(next, "NIGHT_RESOLVE");
  const night = resolveNight(resolving);
  if (night.needsMafiaRevote) return night.state;

  let checked = resolveWinCheck(night.state, "DAWN");
  if (checked.phase === "DAWN") {
    checked = {
      ...checked,
      day: checked.night,
      revision: checked.revision + 1,
    };
    checked = appendEvent(checked, {
      type: "DAY_STARTED",
      day: checked.day,
    });
  }
  return checked;
}

function addConfirmation(state: GameState, playerId: string): GameState {
  return {
    ...state,
    phaseConfirmations: [...state.phaseConfirmations, playerId],
    revision: state.revision + 1,
  };
}

function confirmResult(state: GameState, playerId: string): GameState {
  let next = addConfirmation(state, playerId);
  if (!allConnectedConfirmed(next)) return next;

  if (state.phase === "DAWN") {
    return transitionPhase(next, "DAY_DISCUSSION");
  }

  if (state.phase === "VOTE_RESULT") {
    if (next.pendingExecutionId) {
      next = transitionPhase(next, "EXECUTION");
      return resolveExecution(next);
    }
    next = transitionPhase(next, "WIN_CHECK");
    const checked = resolveWinCheck(next, "NIGHT_START");
    return checked.phase === "NIGHT_START" ? beginNight(checked) : checked;
  }

  next = transitionPhase(next, "WIN_CHECK");
  const checked = resolveWinCheck(next, "NIGHT_START");
  return checked.phase === "NIGHT_START" ? beginNight(checked) : checked;
}

function endDiscussion(state: GameState): GameState {
  return transitionPhase(state, "NOMINATION");
}

function nominate(state: GameState, playerId: string, targetId: string): GameState {
  return {
    ...state,
    nominations: {
      ...state.nominations,
      [playerId]: targetId,
    },
    revision: state.revision + 1,
  };
}

function endNomination(state: GameState): GameState {
  const nomineeIds = [...new Set(Object.values(state.nominations))];
  let next = appendEvent(state, {
    type: "NOMINATIONS_CLOSED",
    day: state.day,
  });

  if (nomineeIds.length === 0) {
    next = transitionPhase(next, "WIN_CHECK");
    const checked = resolveWinCheck(next, "NIGHT_START");
    return checked.phase === "NIGHT_START" ? beginNight(checked) : checked;
  }

  return transitionPhase(
    {
      ...next,
      votes: {},
      voteResult: null,
      pendingExecutionId: null,
      revision: next.revision + 1,
    },
    "DAY_VOTE",
  );
}

function selectVote(state: GameState, playerId: string, targetId: string | null): GameState {
  return {
    ...state,
    votes: {
      ...state.votes,
      [playerId]: { targetId, confirmed: false },
    },
    revision: state.revision + 1,
  };
}

function confirmVote(state: GameState, playerId: string): GameState {
  const selected = state.votes[playerId]!;
  let next: GameState = {
    ...state,
    votes: {
      ...state.votes,
      [playerId]: { ...selected, confirmed: true },
    },
    revision: state.revision + 1,
  };

  if (!allVotesConfirmed(next)) return next;
  next = transitionPhase(next, "VOTE_RESULT");
  return resolveVote(next);
}

export function dispatchAction(
  state: GameState,
  action: GameAction,
  rng: RandomSource,
): DispatchResult {
  const validation = validateAction(state, action);
  if (!validation.ok) {
    return {
      ok: false,
      state,
      error: validation,
    };
  }

  let next: GameState;
  switch (action.type) {
    case "SET_READY":
      next = markReady(state, action.playerId, action.ready);
      break;
    case "START_GAME":
      next = startGame(state, rng);
      break;
    case "CONFIRM_ROLE":
      next = confirmRole(state, action.playerId);
      break;
    case "SELECT_NIGHT_TARGET":
      next = selectNightTarget(state, action.playerId, action.targetId);
      break;
    case "CONFIRM_NIGHT_ACTION":
      next = confirmNightAction(state, action.playerId);
      break;
    case "CONFIRM_RESULT":
      next = confirmResult(state, action.playerId);
      break;
    case "END_DISCUSSION":
      next = endDiscussion(state);
      break;
    case "NOMINATE_PLAYER":
      next = nominate(state, action.playerId, action.targetId);
      break;
    case "END_NOMINATION":
      next = endNomination(state);
      break;
    case "SELECT_VOTE":
      next = selectVote(state, action.playerId, action.targetId);
      break;
    case "CONFIRM_VOTE":
      next = confirmVote(state, action.playerId);
      break;
  }

  return {
    ok: true,
    state: recordAction(state, next, action),
    error: null,
  };
}

export function requiredNightActors(state: GameState): readonly string[] {
  return livingPlayers(state)
    .filter((player) => player.role === "MAFIA" || player.role === "DOCTOR" || player.role === "DETECTIVE")
    .map((player) => player.id);
}

export function livingMafiaCount(state: GameState): number {
  return livingByAlignment(state, "MAFIA").length;
}
