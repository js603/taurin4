export type PlayerId = string;

export type Role = "murderer" | "investigator" | "apothecary" | "commoner";
export type Faction = "residents" | "murderers";

export type GamePhase =
  | "prologue-night"
  | "dawn"
  | "discussion"
  | "accusation"
  | "defense"
  | "verdict"
  | "night"
  | "game-over";

export type TestimonyStrength = "weak" | "medium" | "strong";

export interface PlayerState {
  readonly id: PlayerId;
  readonly seat: number;
  readonly name: string;
  readonly role: Role;
  readonly faction: Faction;
  alive: boolean;
  selfProtectionUsed: boolean;
  lastProtectedTargetId: PlayerId | null;
}

export interface NightIntent {
  readonly murderTargetId: PlayerId;
  readonly investigationTargetId: PlayerId | null;
  readonly protectionTargetId: PlayerId | null;
}

export interface InvestigationResult {
  readonly day: number;
  readonly investigatorId: PlayerId;
  readonly targetId: PlayerId;
  readonly targetActed: boolean;
}

export interface Testimony {
  readonly id: string;
  readonly day: number;
  readonly recipientId: PlayerId;
  readonly strength: TestimonyStrength;
  readonly candidateIds: readonly PlayerId[];
  readonly sourceActorId: PlayerId | null;
}

export interface NightResolution {
  readonly day: number;
  readonly prologue: boolean;
  readonly murderTargetId: PlayerId;
  readonly protectedTargetId: PlayerId | null;
  readonly murderPrevented: boolean;
  readonly killedPlayerId: PlayerId | null;
  readonly investigation: InvestigationResult | null;
  readonly testimonies: readonly Testimony[];
}

export interface AccusationResolution {
  readonly day: number;
  readonly votes: Readonly<Record<PlayerId, PlayerId>>;
  readonly finalists: readonly [PlayerId, PlayerId];
}

export interface VerdictResolution {
  readonly day: number;
  readonly votes: Readonly<Record<PlayerId, PlayerId>>;
  readonly finalists: readonly [PlayerId, PlayerId];
  readonly eliminatedPlayerId: PlayerId | null;
  readonly tied: boolean;
}

export interface GameState {
  readonly gameId: string;
  readonly seed: number;
  day: number;
  phase: GamePhase;
  players: PlayerState[];
  nightHistory: NightResolution[];
  accusationHistory: AccusationResolution[];
  verdictHistory: VerdictResolution[];
  winner: Faction | null;
}
