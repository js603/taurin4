import type { GamePhase, GameState } from "./types.js";

const ALLOWED_TRANSITIONS: Readonly<Record<GamePhase, readonly GamePhase[]>> = {
  LOBBY: ["ROLE_ASSIGNMENT"],
  ROLE_ASSIGNMENT: ["ROLE_REVEAL"],
  ROLE_REVEAL: ["NIGHT_START"],
  NIGHT_START: ["NIGHT_ACTION"],
  NIGHT_ACTION: ["NIGHT_RESOLVE"],
  NIGHT_RESOLVE: ["NIGHT_ACTION", "WIN_CHECK"],
  WIN_CHECK: ["GAME_OVER", "DAWN", "NIGHT_START"],
  DAWN: ["DAY_DISCUSSION"],
  DAY_DISCUSSION: ["NOMINATION"],
  NOMINATION: ["DAY_VOTE", "WIN_CHECK"],
  DAY_VOTE: ["VOTE_RESULT"],
  VOTE_RESULT: ["EXECUTION", "WIN_CHECK"],
  EXECUTION: ["WIN_CHECK"],
  GAME_OVER: [],
};

export function canTransition(from: GamePhase, to: GamePhase): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function transitionPhase(state: GameState, to: GamePhase): GameState {
  if (!canTransition(state.phase, to)) {
    throw new Error("INVALID_TRANSITION: " + state.phase + " -> " + to);
  }
  return {
    ...state,
    phase: to,
    phaseConfirmations: [],
    revision: state.revision + 1,
  };
}

export function phaseContract(phase: GamePhase): {
  readonly automatic: boolean;
  readonly description: string;
} {
  switch (phase) {
    case "ROLE_ASSIGNMENT":
    case "NIGHT_START":
    case "NIGHT_RESOLVE":
    case "WIN_CHECK":
      return { automatic: true, description: "Engine-only automatic phase." };
    case "GAME_OVER":
      return { automatic: false, description: "Terminal phase. No actions are accepted." };
    default:
      return { automatic: false, description: "Player or host action phase." };
  }
}
