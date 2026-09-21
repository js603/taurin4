import type { OriginalGameState, OriginalPhase } from "./types.js";

const TRANSITIONS: Readonly<Record<OriginalPhase, readonly OriginalPhase[]>> = {
  LOBBY: ["ROLE_REVEAL"],
  ROLE_REVEAL: ["SUNRISE"],
  SUNRISE: ["DAY_DISCUSSION"],
  DAY_DISCUSSION: ["ACCUSATION", "NIGHT_PROPOSAL_VOTE"],
  ACCUSATION: ["GUILTY_VOTE"],
  GUILTY_VOTE: ["DAY_DISCUSSION", "GAME_OVER"],
  NIGHT_PROPOSAL_VOTE: ["DAY_DISCUSSION", "MAFIA_NIGHT"],
  MAFIA_NIGHT: ["NIGHT_RESOLVE"],
  NIGHT_RESOLVE: ["DAY_DISCUSSION", "GAME_OVER"],
  GAME_OVER: [],
};

export function canOriginalTransition(
  from: OriginalPhase,
  to: OriginalPhase,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function originalTransition(
  state: OriginalGameState,
  to: OriginalPhase,
): OriginalGameState {
  if (!canOriginalTransition(state.phase, to)) {
    throw new Error("ORIGINAL_INVALID_TRANSITION: " + state.phase + " -> " + to);
  }
  return {
    ...state,
    phase: to,
    revision: state.revision + 1,
  };
}
