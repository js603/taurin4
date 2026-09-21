import type { RandomSource } from "../core/random.js";
import { canWriteChat } from "./chatPolicy.js";
import {
  assignOriginalRoles,
  livingOriginalPlayers,
  originalPlayer,
} from "./gameState.js";
import {
  guiltyVoteRequired,
  nightProposalRequired,
  validateOriginalAction,
} from "./actionValidator.js";
import {
  allGuiltyVotesSubmitted,
  allNightNotesSubmitted,
  allNightProposalVotesSubmitted,
  appendSystem,
  resolveGuiltyVote,
  resolveNightProposal,
  resolveOriginalNight,
} from "./resolvers.js";
import { originalTransition } from "./stateMachine.js";
import type {
  OriginalAction,
  OriginalDispatchResult,
  OriginalGameState,
  OriginalReplayEntry,
} from "./types.js";

function record(
  before: OriginalGameState,
  after: OriginalGameState,
  action: OriginalAction,
): OriginalGameState {
  const entry: OriginalReplayEntry = {
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

function setReady(
  state: OriginalGameState,
  playerId: string,
  ready: boolean,
): OriginalGameState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId ? { ...player, ready } : player,
    ),
    revision: state.revision + 1,
  };
}

function startOriginalGame(
  state: OriginalGameState,
  rng: RandomSource,
): OriginalGameState {
  let next = assignOriginalRoles(state, rng);
  next = originalTransition(next, "ROLE_REVEAL");
  return appendSystem(next, { code: "GAME_STARTED" });
}

function confirmRole(
  state: OriginalGameState,
  playerId: string,
): OriginalGameState {
  let next: OriginalGameState = {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId ? { ...player, roleConfirmed: true } : player,
    ),
    revision: state.revision + 1,
  };

  if (!next.players.every((player) => player.roleConfirmed)) return next;
  next = originalTransition(next, "SUNRISE");
  return appendSystem(next, { code: "SUNRISE_STARTED" });
}

function confirmSunrise(
  state: OriginalGameState,
  playerId: string,
): OriginalGameState {
  let next: OriginalGameState = {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId ? { ...player, sunriseConfirmed: true } : player,
    ),
    revision: state.revision + 1,
  };

  if (!next.players.every((player) => player.sunriseConfirmed)) return next;

  next = originalTransition(next, "DAY_DISCUSSION");
  next = {
    ...next,
    day: 1,
    revision: next.revision + 1,
  };
  return appendSystem(next, { code: "DAY_STARTED" });
}

function sendChat(
  state: OriginalGameState,
  action: Extract<OriginalAction, { type: "SEND_CHAT" }>,
): OriginalGameState {
  if (!canWriteChat(state, action.playerId, action.channel)) {
    throw new Error("ORIGINAL_CHAT_POLICY_BYPASS");
  }

  return {
    ...state,
    chat: [
      ...state.chat,
      {
        seq: state.chat.length + 1,
        day: state.day,
        phase: state.phase,
        channel: action.channel,
        kind: "PLAYER",
        senderId: action.playerId,
        text: action.text.trim(),
        system: null,
      },
    ],
    revision: state.revision + 1,
  };
}

function accuse(
  state: OriginalGameState,
  accuserId: string,
  accusedId: string,
): OriginalGameState {
  let next = originalTransition(state, "ACCUSATION");
  next = {
    ...next,
    accusation: { accuserId, accusedId },
    guiltyVote: null,
    revision: next.revision + 1,
  };
  return appendSystem(next, {
    code: "PLAYER_ACCUSED",
    actorId: accuserId,
    targetId: accusedId,
  });
}

function callGuiltyVote(state: OriginalGameState): OriginalGameState {
  if (!state.accusation) throw new Error("ORIGINAL_ACCUSATION_MISSING");
  let next = originalTransition(state, "GUILTY_VOTE");
  next = {
    ...next,
    guiltyVote: {
      votes: {},
      required: guiltyVoteRequired(state),
    },
    revision: next.revision + 1,
  };
  return appendSystem(next, {
    code: "GUILTY_VOTE_OPENED",
    actorId: state.accusation.accuserId,
    targetId: state.accusation.accusedId,
    required: guiltyVoteRequired(state),
  });
}

function castGuiltyVote(
  state: OriginalGameState,
  playerId: string,
  guilty: boolean,
): OriginalGameState {
  if (!state.guiltyVote) throw new Error("ORIGINAL_GUILTY_VOTE_MISSING");
  let next: OriginalGameState = {
    ...state,
    guiltyVote: {
      ...state.guiltyVote,
      votes: {
        ...state.guiltyVote.votes,
        [playerId]: guilty,
      },
    },
    revision: state.revision + 1,
  };
  if (allGuiltyVotesSubmitted(next)) next = resolveGuiltyVote(next);
  return next;
}

function proposeNight(
  state: OriginalGameState,
  proposerId: string,
): OriginalGameState {
  let next = originalTransition(state, "NIGHT_PROPOSAL_VOTE");
  const required = nightProposalRequired(state);
  next = {
    ...next,
    nightProposal: {
      proposerId,
      vote: { votes: {}, required },
    },
    revision: next.revision + 1,
  };
  return appendSystem(next, {
    code: "NIGHT_PROPOSED",
    actorId: proposerId,
    required,
  });
}

function castNightProposalVote(
  state: OriginalGameState,
  playerId: string,
  agree: boolean,
): OriginalGameState {
  if (!state.nightProposal) throw new Error("ORIGINAL_NIGHT_PROPOSAL_MISSING");
  let next: OriginalGameState = {
    ...state,
    nightProposal: {
      ...state.nightProposal,
      vote: {
        ...state.nightProposal.vote,
        votes: {
          ...state.nightProposal.vote.votes,
          [playerId]: agree,
        },
      },
    },
    revision: state.revision + 1,
  };
  if (allNightProposalVotesSubmitted(next)) next = resolveNightProposal(next);
  return next;
}

function submitNightNote(
  state: OriginalGameState,
  playerId: string,
  note: Extract<OriginalAction, { type: "SUBMIT_NIGHT_NOTE" }>["note"],
): OriginalGameState {
  let next: OriginalGameState = {
    ...state,
    nightNotes: {
      ...state.nightNotes,
      [playerId]: note,
    },
    revision: state.revision + 1,
  };

  if (!allNightNotesSubmitted(next)) return next;
  next = originalTransition(next, "NIGHT_RESOLVE");
  return resolveOriginalNight(next);
}

export function dispatchOriginalAction(
  state: OriginalGameState,
  action: OriginalAction,
  rng: RandomSource,
): OriginalDispatchResult {
  const validation = validateOriginalAction(state, action);
  if (!validation.ok) {
    return { ok: false, state, error: validation };
  }

  let next: OriginalGameState;
  switch (action.type) {
    case "SET_READY":
      next = setReady(state, action.playerId, action.ready);
      break;
    case "START_GAME":
      next = startOriginalGame(state, rng);
      break;
    case "CONFIRM_ROLE":
      next = confirmRole(state, action.playerId);
      break;
    case "CONFIRM_SUNRISE":
      next = confirmSunrise(state, action.playerId);
      break;
    case "SEND_CHAT":
      next = sendChat(state, action);
      break;
    case "ACCUSE_PLAYER":
      next = accuse(state, action.playerId, action.targetId);
      break;
    case "CALL_GUILTY_VOTE":
      next = callGuiltyVote(state);
      break;
    case "CAST_GUILTY_VOTE":
      next = castGuiltyVote(state, action.playerId, action.guilty);
      break;
    case "PROPOSE_MAFIA_NIGHT":
      next = proposeNight(state, action.playerId);
      break;
    case "CAST_NIGHT_PROPOSAL_VOTE":
      next = castNightProposalVote(state, action.playerId, action.agree);
      break;
    case "SUBMIT_NIGHT_NOTE":
      next = submitNightNote(state, action.playerId, action.note);
      break;
  }

  return {
    ok: true,
    state: record(state, next, action),
    error: null,
  };
}

export function originalEligibleGuiltyVoters(state: OriginalGameState): string[] {
  if (!state.accusation) return [];
  return livingOriginalPlayers(state)
    .filter((player) => player.id !== state.accusation!.accusedId)
    .map((player) => player.id);
}

export function originalLivingIds(state: OriginalGameState): string[] {
  return livingOriginalPlayers(state).map((player) => player.id);
}

export function originalRoleOf(
  state: OriginalGameState,
  playerId: string,
) {
  return originalPlayer(state, playerId)?.role ?? null;
}
