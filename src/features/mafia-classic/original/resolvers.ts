import {
  livingOriginalHonest,
  livingOriginalMafia,
  livingOriginalPlayers,
  originalPlayer,
} from "./gameState.js";
import { originalTransition } from "./stateMachine.js";
import type {
  OriginalGameState,
  PlayerId,
  SystemPayload,
} from "./types.js";

export function appendSystem(
  state: OriginalGameState,
  system: SystemPayload,
): OriginalGameState {
  return {
    ...state,
    chat: [
      ...state.chat,
      {
        seq: state.chat.length + 1,
        day: state.day,
        phase: state.phase,
        channel: "SYSTEM",
        kind: "SYSTEM",
        senderId: null,
        text: null,
        system,
      },
    ],
  };
}

export function killOriginalPlayer(
  state: OriginalGameState,
  playerId: PlayerId,
  cause: "EXECUTION" | "MAFIA",
): OriginalGameState {
  const target = originalPlayer(state, playerId);
  if (!target?.alive) throw new Error("ORIGINAL_DOUBLE_DEATH");

  return {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId
        ? {
            ...player,
            alive: false,
            deathDay: state.day,
            deathCause: cause,
          }
        : player,
    ),
  };
}

export function resolveGuiltyVote(state: OriginalGameState): OriginalGameState {
  if (state.phase !== "GUILTY_VOTE" || !state.accusation || !state.guiltyVote) {
    throw new Error("ORIGINAL_GUILTY_RESOLVE_PHASE");
  }

  const votes = Object.values(state.guiltyVote.votes);
  const guilty = votes.filter(Boolean).length;
  const notGuilty = votes.length - guilty;
  const passed = guilty >= state.guiltyVote.required;
  const accusedId = state.accusation.accusedId;

  let next = appendSystem(state, {
    code: passed ? "GUILTY_VOTE_PASSED" : "GUILTY_VOTE_FAILED",
    targetId: accusedId,
    guilty,
    notGuilty,
    required: state.guiltyVote.required,
  });

  if (passed) {
    next = killOriginalPlayer(next, accusedId, "EXECUTION");
    next = appendSystem(next, {
      code: "PLAYER_EXECUTED",
      targetId: accusedId,
    });
  }

  next = {
    ...next,
    accusation: null,
    guiltyVote: null,
    revision: next.revision + 1,
  };

  if (passed && livingOriginalHonest(next).length === 0) {
    next = originalTransition(next, "GAME_OVER");
    next = {
      ...next,
      winner: "MAFIA",
    };
    return appendSystem(next, { code: "GAME_WON", winner: "MAFIA" });
  }

  return originalTransition(next, "DAY_DISCUSSION");
}

export function resolveNightProposal(state: OriginalGameState): OriginalGameState {
  if (state.phase !== "NIGHT_PROPOSAL_VOTE" || !state.nightProposal) {
    throw new Error("ORIGINAL_NIGHT_PROPOSAL_RESOLVE_PHASE");
  }

  const votes = Object.values(state.nightProposal.vote.votes);
  const agree = votes.filter(Boolean).length;
  const disagree = votes.length - agree;
  const passed = agree >= state.nightProposal.vote.required;

  let next = appendSystem(state, {
    code: passed ? "NIGHT_PROPOSAL_PASSED" : "NIGHT_PROPOSAL_FAILED",
    actorId: state.nightProposal.proposerId,
    agree,
    disagree,
    required: state.nightProposal.vote.required,
  });

  next = {
    ...next,
    nightProposal: null,
    revision: next.revision + 1,
  };

  if (!passed) return originalTransition(next, "DAY_DISCUSSION");

  next = originalTransition(next, "MAFIA_NIGHT");
  next = {
    ...next,
    nightNotes: {},
    revision: next.revision + 1,
  };
  return appendSystem(next, { code: "NIGHT_STARTED" });
}

export function resolveOriginalNight(state: OriginalGameState): OriginalGameState {
  if (state.phase !== "NIGHT_RESOLVE") {
    throw new Error("ORIGINAL_NIGHT_RESOLVE_PHASE");
  }

  const mafiaNotes = livingOriginalMafia(state)
    .map((mafia) => state.nightNotes[mafia.id])
    .filter((note) => note?.kind === "TARGET");

  const targetIds = mafiaNotes.map((note) =>
    note && note.kind === "TARGET" ? note.targetId : "",
  ).filter(Boolean);

  let next: OriginalGameState = {
    ...state,
    publicMafiaCount: targetIds.length,
    revision: state.revision + 1,
  };

  next = appendSystem(next, {
    code: "NIGHT_NOTES_REVEALED",
    mafiaCount: targetIds.length,
    targetIds,
  });

  if (targetIds.length === 0) {
    next = originalTransition(next, "GAME_OVER");
    next = { ...next, winner: "HONEST" };
    return appendSystem(next, { code: "GAME_WON", winner: "HONEST" });
  }

  const unanimous = targetIds.every((targetId) => targetId === targetIds[0]);
  if (unanimous) {
    const murderedId = targetIds[0]!;
    next = killOriginalPlayer(next, murderedId, "MAFIA");
    next = appendSystem(next, { code: "NIGHT_MURDER", targetId: murderedId });
  } else {
    next = appendSystem(next, {
      code: "NIGHT_NO_MURDER",
      targetIds,
    });
  }

  if (livingOriginalHonest(next).length === 0) {
    next = originalTransition(next, "GAME_OVER");
    next = { ...next, winner: "MAFIA" };
    return appendSystem(next, { code: "GAME_WON", winner: "MAFIA" });
  }

  next = originalTransition(next, "DAY_DISCUSSION");
  next = {
    ...next,
    day: next.day + 1,
    nightNotes: {},
    revision: next.revision + 1,
  };
  return appendSystem(next, { code: "DAY_STARTED" });
}

export function allGuiltyVotesSubmitted(state: OriginalGameState): boolean {
  if (!state.accusation || !state.guiltyVote) return false;
  const eligible = livingOriginalPlayers(state).filter(
    (player) => player.id !== state.accusation!.accusedId,
  );
  return eligible.every((player) =>
    Object.prototype.hasOwnProperty.call(state.guiltyVote!.votes, player.id),
  );
}

export function allNightProposalVotesSubmitted(state: OriginalGameState): boolean {
  if (!state.nightProposal) return false;
  return livingOriginalPlayers(state).every((player) =>
    Object.prototype.hasOwnProperty.call(state.nightProposal!.vote.votes, player.id),
  );
}

export function allNightNotesSubmitted(state: OriginalGameState): boolean {
  return livingOriginalPlayers(state).every((player) =>
    Object.prototype.hasOwnProperty.call(state.nightNotes, player.id),
  );
}
