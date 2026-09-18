export const ROLE_LABELS = {
  murderer: "살인자",
  bailiff: "집행관",
  apothecary: "약제사",
  commoner: "평민",
} as const;

export type Role = keyof typeof ROLE_LABELS;

export type GamePhase =
  "opening-night" | "debate" | "accusation" | "defendants" | "verdict" | "resolution" | "ended";

export type Winner = "commoners" | "murderers" | null;

export interface Player {
  id: string;
  name: string;
  title: string;
  role: Role;
  living: boolean;
  isHuman: boolean;
}

export interface OpeningAttack {
  targetId: string;
  targetName: string;
  killed: false;
  description: string;
}

export interface Testimony {
  id: string;
  speakerId: string;
  speakerName: string;
  text: string;
  reliability: "faint" | "clear" | "strong";
}

export interface VoteTally {
  playerId: string;
  count: number;
}

export interface Resolution {
  kind: "execution" | "deadlock";
  targetId: string | null;
  targetName: string | null;
  text: string;
}

export interface GameState {
  seed: number;
  phase: GamePhase;
  day: number;
  night: number;
  playerId: string;
  players: Player[];
  openingAttack: OpeningAttack;
  testimonies: Testimony[];
  accusationVotes: VoteTally[];
  defendants: string[];
  verdictVotes: VoteTally[];
  resolution: Resolution | null;
  winner: Winner;
  currentPrompt: string;
  chronicle: string[];
}

export interface PlayerIntentResult {
  state: GameState;
  error: string | null;
}
