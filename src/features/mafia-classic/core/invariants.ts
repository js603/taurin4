import { roleAlignment } from "./gameState.js";
import type { GameState } from "./types.js";

export function assertGameStateInvariants(state: GameState): void {
  const ids = state.players.map((player) => player.id);
  if (new Set(ids).size !== ids.length) throw new Error("INVARIANT_DUPLICATE_PLAYER_ID");

  if (state.winner !== null && state.phase !== "GAME_OVER") {
    throw new Error("INVARIANT_WINNER_OUTSIDE_GAME_OVER");
  }
  if (state.phase === "GAME_OVER" && state.winner === null) {
    throw new Error("INVARIANT_GAME_OVER_WITHOUT_WINNER");
  }

  for (const player of state.players) {
    if (player.role !== null) {
      if (player.alignment !== roleAlignment(player.role)) {
        throw new Error("INVARIANT_ROLE_ALIGNMENT_MISMATCH");
      }
    } else if (player.alignment !== null) {
      throw new Error("INVARIANT_ALIGNMENT_WITHOUT_ROLE");
    }

    if (player.alive) {
      if (player.deathCause !== null || player.deathDay !== null) {
        throw new Error("INVARIANT_LIVING_PLAYER_HAS_DEATH_METADATA");
      }
    } else if (player.deathCause === null || player.deathDay === null) {
      throw new Error("INVARIANT_DEAD_PLAYER_MISSING_DEATH_METADATA");
    }
  }

  for (const [playerId, choice] of Object.entries(state.nightActions.mafiaVotes)) {
    const player = state.players.find((candidate) => candidate.id === playerId);
    if (!player || player.role !== "MAFIA") {
      throw new Error("INVARIANT_NON_MAFIA_IN_MAFIA_VOTES");
    }
    if (choice.targetId) {
      const target = state.players.find((candidate) => candidate.id === choice.targetId);
      if (!target || target.role === "MAFIA") {
        throw new Error("INVARIANT_ILLEGAL_MAFIA_TARGET");
      }
    }
  }

  if (state.phase === "DAY_VOTE") {
    for (const [voterId, vote] of Object.entries(state.votes)) {
      const voter = state.players.find((player) => player.id === voterId);
      if (!voter) throw new Error("INVARIANT_UNKNOWN_VOTER");
      if (vote.confirmed && !voter.alive) {
        throw new Error("INVARIANT_DEAD_PLAYER_CONFIRMED_VOTE");
      }
    }
  }

  if (state.pendingExecutionId) {
    const target = state.players.find((player) => player.id === state.pendingExecutionId);
    if (!target) throw new Error("INVARIANT_UNKNOWN_EXECUTION_TARGET");
  }
}
