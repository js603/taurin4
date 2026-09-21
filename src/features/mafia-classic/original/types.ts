export type PlayerId = string;
export type OriginalRole = "HONEST" | "MAFIA";
export type OriginalWinner = OriginalRole | null;

export type OriginalPhase =
  | "LOBBY"
  | "ROLE_REVEAL"
  | "SUNRISE"
  | "DAY_DISCUSSION"
  | "ACCUSATION"
  | "GUILTY_VOTE"
  | "NIGHT_PROPOSAL_VOTE"
  | "MAFIA_NIGHT"
  | "NIGHT_RESOLVE"
  | "GAME_OVER";

export type ChatChannel = "PUBLIC" | "DEAD" | "SYSTEM";

export type SystemCode =
  | "GAME_STARTED"
  | "SUNRISE_STARTED"
  | "DAY_STARTED"
  | "PLAYER_ACCUSED"
  | "GUILTY_VOTE_OPENED"
  | "GUILTY_VOTE_PASSED"
  | "GUILTY_VOTE_FAILED"
  | "PLAYER_EXECUTED"
  | "NIGHT_PROPOSED"
  | "NIGHT_PROPOSAL_PASSED"
  | "NIGHT_PROPOSAL_FAILED"
  | "NIGHT_STARTED"
  | "NIGHT_NOTES_REVEALED"
  | "NIGHT_MURDER"
  | "NIGHT_NO_MURDER"
  | "GAME_WON";

export interface SystemPayload {
  readonly code: SystemCode;
  readonly actorId?: PlayerId;
  readonly targetId?: PlayerId;
  readonly guilty?: number;
  readonly notGuilty?: number;
  readonly agree?: number;
  readonly disagree?: number;
  readonly required?: number;
  readonly mafiaCount?: number;
  readonly targetIds?: readonly PlayerId[];
  readonly winner?: Exclude<OriginalWinner, null>;
}

export interface ChatEntry {
  readonly seq: number;
  readonly day: number;
  readonly phase: OriginalPhase;
  readonly channel: ChatChannel;
  readonly kind: "PLAYER" | "SYSTEM";
  readonly senderId: PlayerId | null;
  readonly text: string | null;
  readonly system: SystemPayload | null;
}

export interface OriginalPlayerState {
  readonly id: PlayerId;
  readonly name: string;
  readonly role: OriginalRole | null;
  readonly alive: boolean;
  readonly ready: boolean;
  readonly connected: boolean;
  readonly roleConfirmed: boolean;
  readonly sunriseConfirmed: boolean;
  readonly deathDay: number | null;
  readonly deathCause: "EXECUTION" | "MAFIA" | null;
}

export interface AccusationState {
  readonly accuserId: PlayerId;
  readonly accusedId: PlayerId;
}

export interface OriginalVoteState {
  readonly votes: Readonly<Record<PlayerId, boolean>>;
  readonly required: number;
}

export type NightNote =
  | { readonly kind: "HONEST" }
  | { readonly kind: "TARGET"; readonly targetId: PlayerId };

export interface OriginalGameState {
  readonly gameId: string;
  readonly hostId: PlayerId;
  readonly phase: OriginalPhase;
  readonly day: number;
  readonly players: readonly OriginalPlayerState[];
  readonly accusation: AccusationState | null;
  readonly guiltyVote: OriginalVoteState | null;
  readonly nightProposal: {
    readonly proposerId: PlayerId;
    readonly vote: OriginalVoteState;
  } | null;
  readonly nightNotes: Readonly<Record<PlayerId, NightNote>>;
  readonly publicMafiaCount: number | null;
  readonly chat: readonly ChatEntry[];
  readonly winner: OriginalWinner;
  readonly revision: number;
  readonly replay: readonly OriginalReplayEntry[];
}

export type OriginalAction =
  | { readonly type: "SET_READY"; readonly playerId: PlayerId; readonly ready: boolean }
  | { readonly type: "START_GAME"; readonly playerId: PlayerId }
  | { readonly type: "CONFIRM_ROLE"; readonly playerId: PlayerId }
  | { readonly type: "CONFIRM_SUNRISE"; readonly playerId: PlayerId }
  | {
      readonly type: "SEND_CHAT";
      readonly playerId: PlayerId;
      readonly channel: "PUBLIC" | "DEAD";
      readonly text: string;
    }
  | { readonly type: "ACCUSE_PLAYER"; readonly playerId: PlayerId; readonly targetId: PlayerId }
  | { readonly type: "CALL_GUILTY_VOTE"; readonly playerId: PlayerId }
  | { readonly type: "CAST_GUILTY_VOTE"; readonly playerId: PlayerId; readonly guilty: boolean }
  | { readonly type: "PROPOSE_MAFIA_NIGHT"; readonly playerId: PlayerId }
  | {
      readonly type: "CAST_NIGHT_PROPOSAL_VOTE";
      readonly playerId: PlayerId;
      readonly agree: boolean;
    }
  | { readonly type: "SUBMIT_NIGHT_NOTE"; readonly playerId: PlayerId; readonly note: NightNote };

export type OriginalActionError =
  | "GAME_OVER"
  | "UNKNOWN_PLAYER"
  | "PLAYER_DISCONNECTED"
  | "INVALID_PHASE"
  | "PLAYER_DEAD"
  | "PLAYER_ALIVE"
  | "HOST_ONLY"
  | "START_CONDITIONS_NOT_MET"
  | "INVALID_TARGET"
  | "SELF_ACCUSATION"
  | "NOT_ACCUSER"
  | "ACCUSED_CANNOT_VOTE"
  | "ALREADY_VOTED"
  | "ALREADY_CONFIRMED"
  | "INVALID_CHAT_CHANNEL"
  | "CHAT_CLOSED"
  | "EMPTY_CHAT"
  | "CHAT_TOO_LONG"
  | "INVALID_NIGHT_NOTE"
  | "ALREADY_SUBMITTED";

export interface OriginalValidationResult {
  readonly ok: boolean;
  readonly code: OriginalActionError | null;
  readonly message: string | null;
}

export interface OriginalDispatchResult {
  readonly ok: boolean;
  readonly state: OriginalGameState;
  readonly error: OriginalValidationResult | null;
}

export interface OriginalReplayEntry {
  readonly seq: number;
  readonly revisionBefore: number;
  readonly actorId: PlayerId;
  readonly action: OriginalAction;
}
