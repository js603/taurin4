export type PlayerId = string;

export type Role = "CITIZEN" | "DETECTIVE" | "DOCTOR" | "MAFIA";
export type Alignment = "TOWN" | "MAFIA";
export type Winner = Alignment | null;

export type GamePhase =
  | "LOBBY"
  | "ROLE_ASSIGNMENT"
  | "ROLE_REVEAL"
  | "NIGHT_START"
  | "NIGHT_ACTION"
  | "NIGHT_RESOLVE"
  | "WIN_CHECK"
  | "DAWN"
  | "DAY_DISCUSSION"
  | "NOMINATION"
  | "DAY_VOTE"
  | "VOTE_RESULT"
  | "EXECUTION"
  | "GAME_OVER";

export type DeathCause = "MAFIA" | "EXECUTION" | "FORCED" | null;

export interface PlayerState {
  readonly id: PlayerId;
  readonly name: string;
  readonly role: Role | null;
  readonly alignment: Alignment | null;
  readonly alive: boolean;
  readonly ready: boolean;
  readonly connected: boolean;
  readonly roleConfirmed: boolean;
  readonly deathCause: DeathCause;
  readonly deathDay: number | null;
}

export interface ConfirmableTarget {
  readonly targetId: PlayerId | null;
  readonly confirmed: boolean;
}

export interface NightActions {
  readonly mafiaVotes: Readonly<Record<PlayerId, ConfirmableTarget>>;
  readonly mafiaTarget: PlayerId | null;
  readonly mafiaRevoteRound: 0 | 1;
  readonly doctor: ConfirmableTarget;
  readonly detective: ConfirmableTarget;
}

export interface VoteChoice {
  readonly targetId: PlayerId | null;
  readonly confirmed: boolean;
}

export interface InvestigationResult {
  readonly night: number;
  readonly targetId: PlayerId;
  readonly result: "MAFIA" | "NOT_MAFIA";
}

export interface PublicEvent {
  readonly seq: number;
  readonly type:
    | "GAME_STARTED"
    | "ROLE_REVEALED"
    | "NIGHT_STARTED"
    | "NO_NIGHT_DEATH"
    | "PLAYER_DIED"
    | "DAY_STARTED"
    | "NOMINATIONS_CLOSED"
    | "VOTE_COMPLETED"
    | "PLAYER_EXECUTED"
    | "GAME_WON";
  readonly day: number;
  readonly playerId?: PlayerId;
  readonly role?: Role;
  readonly cause?: Exclude<DeathCause, null>;
  readonly winner?: Exclude<Winner, null>;
  readonly tally?: Readonly<Record<string, number>>;
}

export interface ReplayEntry {
  readonly seq: number;
  readonly revisionBefore: number;
  readonly actorId: PlayerId | null;
  readonly action: GameAction;
}

export interface GameState {
  readonly gameId: string;
  readonly hostId: PlayerId;
  readonly phase: GamePhase;
  readonly day: number;
  readonly night: number;
  readonly players: readonly PlayerState[];
  readonly nightActions: NightActions;
  readonly nominations: Readonly<Record<PlayerId, PlayerId>>;
  readonly votes: Readonly<Record<PlayerId, VoteChoice>>;
  readonly voteResult: {
    readonly tally: Readonly<Record<string, number>>;
    readonly executionTargetId: PlayerId | null;
  } | null;
  readonly pendingExecutionId: PlayerId | null;
  readonly phaseConfirmations: readonly PlayerId[];
  readonly investigationResults: Readonly<Record<PlayerId, readonly InvestigationResult[]>>;
  readonly doctorLastProtectedTargetId: PlayerId | null;
  readonly publicEvents: readonly PublicEvent[];
  readonly winner: Winner;
  readonly revision: number;
  readonly replay: readonly ReplayEntry[];
}

export type GameAction =
  | { readonly type: "SET_READY"; readonly playerId: PlayerId; readonly ready: boolean }
  | { readonly type: "START_GAME"; readonly playerId: PlayerId }
  | { readonly type: "CONFIRM_ROLE"; readonly playerId: PlayerId }
  | {
      readonly type: "SELECT_NIGHT_TARGET";
      readonly playerId: PlayerId;
      readonly targetId: PlayerId;
    }
  | { readonly type: "CONFIRM_NIGHT_ACTION"; readonly playerId: PlayerId }
  | { readonly type: "CONFIRM_RESULT"; readonly playerId: PlayerId }
  | { readonly type: "END_DISCUSSION"; readonly playerId: PlayerId }
  | {
      readonly type: "NOMINATE_PLAYER";
      readonly playerId: PlayerId;
      readonly targetId: PlayerId;
    }
  | { readonly type: "END_NOMINATION"; readonly playerId: PlayerId }
  | {
      readonly type: "SELECT_VOTE";
      readonly playerId: PlayerId;
      readonly targetId: PlayerId | null;
    }
  | { readonly type: "CONFIRM_VOTE"; readonly playerId: PlayerId };

export type ActionErrorCode =
  | "GAME_OVER"
  | "UNKNOWN_PLAYER"
  | "PLAYER_DISCONNECTED"
  | "ILLEGAL_PHASE"
  | "ILLEGAL_ACTION_DEAD_PLAYER"
  | "ILLEGAL_ROLE_ACTION"
  | "INVALID_TARGET"
  | "ACTION_ALREADY_CONFIRMED"
  | "ACTION_NOT_SELECTED"
  | "HOST_ONLY"
  | "START_CONDITIONS_NOT_MET"
  | "UNSUPPORTED_PLAYER_COUNT"
  | "ROLE_ALREADY_CONFIRMED"
  | "RESULT_ALREADY_CONFIRMED"
  | "NO_NOMINEES"
  | "INVALID_VOTE_TARGET";

export interface ValidationResult {
  readonly ok: boolean;
  readonly code: ActionErrorCode | null;
  readonly message: string | null;
}

export interface DispatchResult {
  readonly ok: boolean;
  readonly state: GameState;
  readonly error: ValidationResult | null;
}
