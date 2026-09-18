import type { Faction, Role } from "../domain/types";

export type TrialPhase =
  | "opening-night"
  | "night"
  | "debate"
  | "accusation"
  | "defendants"
  | "verdict"
  | "resolution"
  | "ended";

export interface TrialPlayer {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly living: boolean;
  readonly isHuman: boolean;
}

export interface TrialOpeningAttack {
  readonly targetId: string;
  readonly targetName: string;
  readonly killed: false;
  readonly description: string;
}

export interface TrialTestimony {
  readonly id: string;
  readonly speakerId: string;
  readonly speakerName: string;
  readonly text: string;
  readonly reliability: "faint" | "clear" | "strong";
}

export interface TrialVoteTally {
  readonly playerId: string;
  readonly count: number;
}

export interface TrialResolution {
  readonly kind: "execution" | "deadlock";
  readonly targetId: string | null;
  readonly targetName: string | null;
  readonly text: string;
}

export interface TrialSessionState {
  readonly seed: number;
  readonly phase: TrialPhase;
  readonly day: number;
  readonly night: number;
  readonly playerId: string;
  readonly playerRole: Role;
  readonly observing: boolean;
  readonly legalNightTargets: readonly string[];
  readonly privateNotes: readonly string[];
  readonly defenses: Readonly<Record<string, string>>;
  readonly players: readonly TrialPlayer[];
  readonly openingAttack: TrialOpeningAttack;
  readonly testimonies: readonly TrialTestimony[];
  readonly accusationVotes: readonly TrialVoteTally[];
  readonly defendants: readonly string[];
  readonly verdictVotes: readonly TrialVoteTally[];
  readonly resolution: TrialResolution | null;
  readonly winner: Faction | null;
  readonly currentPrompt: string;
  readonly chronicle: readonly string[];
}

export interface TrialIntentResult {
  readonly state: TrialSessionState;
  readonly error: string | null;
}

export const TRIAL_PHASE_LABELS: Record<TrialPhase, string> = {
  "opening-night": "개막의 밤",
  night: "밤의 행동",
  debate: "자유 토론",
  accusation: "고발",
  defendants: "피고석",
  verdict: "최종 판결",
  resolution: "판결 기록",
  ended: "재판 종결",
};
