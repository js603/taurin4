import {
  livingByAlignment,
  livingPlayers,
} from "./gameState.js";
import type {
  GameState,
  InvestigationResult,
  PlayerId,
  PublicEvent,
  Role,
  Winner,
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

function killPlayer(
  state: GameState,
  playerId: PlayerId,
  cause: "MAFIA" | "EXECUTION" | "FORCED",
): GameState {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player?.alive) throw new Error("Death resolver cannot kill a missing or dead player.");
  if (!player.role) throw new Error("Death resolver requires assigned roles.");

  let next: GameState = {
    ...state,
    players: state.players.map((candidate) =>
      candidate.id === playerId
        ? {
            ...candidate,
            alive: false,
            deathCause: cause,
            deathDay: state.day,
          }
        : candidate,
    ),
  };

  next = appendEvent(next, {
    type: cause === "EXECUTION" ? "PLAYER_EXECUTED" : "PLAYER_DIED",
    day: state.day,
    playerId,
    cause,
  });
  next = appendEvent(next, {
    type: "ROLE_REVEALED",
    day: state.day,
    playerId,
    role: player.role,
  });
  return next;
}

function mafiaTargetFromVotes(
  state: GameState,
): { targetId: PlayerId | null; tied: boolean } {
  const counts = new Map<PlayerId, number>();
  for (const mafia of livingByAlignment(state, "MAFIA")) {
    const targetId = state.nightActions.mafiaVotes[mafia.id]?.targetId;
    if (!targetId) throw new Error("Night resolver requires every living Mafia vote.");
    counts.set(targetId, (counts.get(targetId) ?? 0) + 1);
  }

  const entries = [...counts.entries()];
  if (entries.length === 0) return { targetId: null, tied: false };
  const maxVotes = Math.max(...entries.map(([, count]) => count));
  const leaders = entries.filter(([, count]) => count === maxVotes);
  return leaders.length === 1
    ? { targetId: leaders[0]![0], tied: false }
    : { targetId: null, tied: true };
}

export interface NightResolution {
  readonly state: GameState;
  readonly needsMafiaRevote: boolean;
}

export function resolveNight(state: GameState): NightResolution {
  if (state.phase !== "NIGHT_RESOLVE") throw new Error("Night resolver requires NIGHT_RESOLVE.");

  const mafiaDecision = mafiaTargetFromVotes(state);
  if (mafiaDecision.tied && state.nightActions.mafiaRevoteRound === 0) {
    const resetVotes = Object.fromEntries(
      livingByAlignment(state, "MAFIA").map((player) => [
        player.id,
        { targetId: null, confirmed: false },
      ]),
    );

    return {
      needsMafiaRevote: true,
      state: {
        ...state,
        phase: "NIGHT_ACTION",
        nightActions: {
          ...state.nightActions,
          mafiaVotes: resetVotes,
          mafiaTarget: null,
          mafiaRevoteRound: 1,
        },
        revision: state.revision + 1,
      },
    };
  }

  const attackTarget = mafiaDecision.tied ? null : mafiaDecision.targetId;
  const doctorTarget = state.nightActions.doctor.targetId;
  const detectiveTarget = state.nightActions.detective.targetId;
  const detective = state.players.find((player) => player.alive && player.role === "DETECTIVE");

  let next: GameState = {
    ...state,
    nightActions: {
      ...state.nightActions,
      mafiaTarget: attackTarget,
    },
    doctorLastProtectedTargetId:
      state.players.some((player) => player.alive && player.role === "DOCTOR")
        ? doctorTarget
        : state.doctorLastProtectedTargetId,
  };

  if (detective && detectiveTarget) {
    const target = state.players.find((player) => player.id === detectiveTarget);
    if (!target?.role) throw new Error("Detective target must have an assigned role.");

    const result: InvestigationResult = {
      night: state.night,
      targetId: detectiveTarget,
      result: target.role === "MAFIA" ? "MAFIA" : "NOT_MAFIA",
    };
    next = {
      ...next,
      investigationResults: {
        ...next.investigationResults,
        [detective.id]: [...(next.investigationResults[detective.id] ?? []), result],
      },
    };
  }

  if (attackTarget && attackTarget !== doctorTarget) {
    next = killPlayer(next, attackTarget, "MAFIA");
  } else {
    next = appendEvent(next, {
      type: "NO_NIGHT_DEATH",
      day: state.day,
    });
  }

  return {
    needsMafiaRevote: false,
    state: {
      ...next,
      phase: "WIN_CHECK",
      phaseConfirmations: [],
      revision: next.revision + 1,
    },
  };
}

const NO_EXECUTION = "__NO_EXECUTION__";

export function resolveVote(state: GameState): GameState {
  if (state.phase !== "VOTE_RESULT") throw new Error("Vote resolver requires VOTE_RESULT.");

  const tally: Record<string, number> = {};
  for (const player of livingPlayers(state)) {
    const vote = state.votes[player.id];
    if (!vote?.confirmed) throw new Error("Vote resolver requires all living votes.");
    const key = vote.targetId ?? NO_EXECUTION;
    tally[key] = (tally[key] ?? 0) + 1;
  }

  const entries = Object.entries(tally);
  const maxVotes = entries.length > 0 ? Math.max(...entries.map(([, count]) => count)) : 0;
  const leaders = entries.filter(([, count]) => count === maxVotes);
  const executionTargetId =
    leaders.length === 1 && leaders[0]![0] !== NO_EXECUTION ? leaders[0]![0] : null;

  let next: GameState = {
    ...state,
    voteResult: {
      tally,
      executionTargetId,
    },
    pendingExecutionId: executionTargetId,
    phaseConfirmations: [],
    revision: state.revision + 1,
  };
  next = appendEvent(next, {
    type: "VOTE_COMPLETED",
    day: state.day,
    tally,
  });
  return next;
}

export function resolveExecution(state: GameState): GameState {
  if (state.phase !== "EXECUTION") throw new Error("Execution resolver requires EXECUTION.");
  if (!state.pendingExecutionId) throw new Error("Execution resolver requires a target.");

  const next = killPlayer(state, state.pendingExecutionId, "EXECUTION");
  return {
    ...next,
    phaseConfirmations: [],
    revision: next.revision + 1,
  };
}

export function calculateWinner(state: GameState): Winner {
  const mafia = livingByAlignment(state, "MAFIA").length;
  const town = livingByAlignment(state, "TOWN").length;
  if (mafia === 0) return "TOWN";
  if (mafia >= town) return "MAFIA";
  return null;
}

export function resolveWinCheck(
  state: GameState,
  nextPhase: "DAWN" | "NIGHT_START",
): GameState {
  if (state.phase !== "WIN_CHECK") throw new Error("Win resolver requires WIN_CHECK.");

  const winner = calculateWinner(state);
  if (!winner) {
    return {
      ...state,
      phase: nextPhase,
      phaseConfirmations: [],
      revision: state.revision + 1,
    };
  }

  let next: GameState = {
    ...state,
    winner,
    phase: "GAME_OVER",
    phaseConfirmations: [],
    revision: state.revision + 1,
  };
  next = appendEvent(next, {
    type: "GAME_WON",
    day: state.day,
    winner,
  });
  return next;
}

export function publicRoleOf(state: GameState, playerId: PlayerId): Role | null {
  const reveal = [...state.publicEvents]
    .reverse()
    .find((event) => event.type === "ROLE_REVEALED" && event.playerId === playerId);
  return reveal?.role ?? null;
}
