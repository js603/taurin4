import {
  readableChatChannels,
  writableChatChannels,
} from "./chatPolicy.js";
import {
  livingOriginalPlayers,
  originalPlayer,
} from "./gameState.js";
import type {
  ChatChannel,
  ChatEntry,
  OriginalAction,
  OriginalGameState,
  OriginalRole,
  OriginalWinner,
  PlayerId,
} from "./types.js";

export interface OriginalPublicPlayerView {
  readonly id: PlayerId;
  readonly name: string;
  readonly alive: boolean;
  readonly ready: boolean;
  readonly connected: boolean;
  readonly publicRole: OriginalRole | null;
}

export interface OriginalPlayerView {
  readonly gameId: string;
  readonly revision: number;
  readonly phase: OriginalGameState["phase"];
  readonly day: number;
  readonly winner: OriginalWinner;
  readonly self: {
    readonly id: PlayerId;
    readonly name: string;
    readonly alive: boolean;
    readonly ready: boolean;
    readonly role: OriginalRole | null;
    readonly roleConfirmed: boolean;
    readonly sunriseConfirmed: boolean;
  };
  readonly players: readonly OriginalPublicPlayerView[];
  readonly mafiaMembers: readonly { readonly id: PlayerId; readonly name: string }[] | null;
  readonly publicMafiaCount: number | null;
  readonly chat: readonly ChatEntry[];
  readonly writableChatChannels: readonly Exclude<ChatChannel, "SYSTEM">[];
  readonly accusation: {
    readonly accuserId: PlayerId;
    readonly accusedId: PlayerId;
  } | null;
  readonly guiltyVote: {
    readonly required: number;
    readonly submitted: number;
    readonly eligible: number;
    readonly ownVote: boolean | null;
  } | null;
  readonly nightProposal: {
    readonly proposerId: PlayerId;
    readonly required: number;
    readonly submitted: number;
    readonly eligible: number;
    readonly ownVote: boolean | null;
  } | null;
  readonly nightNote: {
    readonly submitted: boolean;
    readonly ownTargetId: PlayerId | null;
    readonly honest: boolean;
  } | null;
  readonly availableActions: readonly OriginalAction["type"][];
}

function ownBooleanVote(
  votes: Readonly<Record<PlayerId, boolean>>,
  playerId: PlayerId,
): boolean | null {
  return Object.prototype.hasOwnProperty.call(votes, playerId)
    ? votes[playerId]!
    : null;
}

function availableOriginalActions(
  state: OriginalGameState,
  playerId: PlayerId,
): OriginalAction["type"][] {
  const player = originalPlayer(state, playerId);
  if (!player?.connected || state.phase === "GAME_OVER") return [];

  const chatWritable = writableChatChannels(state, playerId).length > 0;
  const actions: OriginalAction["type"][] = [];

  if (state.phase === "LOBBY") {
    actions.push("SET_READY");
    if (
      player.id === state.hostId &&
      state.players.every((candidate) => candidate.connected && candidate.ready)
    ) {
      actions.push("START_GAME");
    }
    return actions;
  }

  if (state.phase === "ROLE_REVEAL") {
    if (!player.roleConfirmed) actions.push("CONFIRM_ROLE");
    return actions;
  }

  if (state.phase === "SUNRISE") {
    if (!player.sunriseConfirmed) actions.push("CONFIRM_SUNRISE");
    return actions;
  }

  if (chatWritable) actions.push("SEND_CHAT");
  if (!player.alive) return actions;

  if (state.phase === "DAY_DISCUSSION") {
    actions.push("ACCUSE_PLAYER", "PROPOSE_MAFIA_NIGHT");
    return actions;
  }

  if (state.phase === "ACCUSATION") {
    if (state.accusation?.accuserId === player.id) actions.push("CALL_GUILTY_VOTE");
    return actions;
  }

  if (state.phase === "GUILTY_VOTE") {
    if (
      state.accusation?.accusedId !== player.id &&
      state.guiltyVote &&
      !Object.prototype.hasOwnProperty.call(state.guiltyVote.votes, player.id)
    ) {
      actions.push("CAST_GUILTY_VOTE");
    }
    return actions;
  }

  if (state.phase === "NIGHT_PROPOSAL_VOTE") {
    if (
      state.nightProposal &&
      !Object.prototype.hasOwnProperty.call(state.nightProposal.vote.votes, player.id)
    ) {
      actions.push("CAST_NIGHT_PROPOSAL_VOTE");
    }
    return actions;
  }

  if (state.phase === "MAFIA_NIGHT") {
    if (!Object.prototype.hasOwnProperty.call(state.nightNotes, player.id)) {
      actions.push("SUBMIT_NIGHT_NOTE");
    }
    return actions;
  }

  return actions;
}

export function buildOriginalPlayerView(
  state: OriginalGameState,
  playerId: PlayerId,
): OriginalPlayerView {
  const viewer = originalPlayer(state, playerId);
  if (!viewer) throw new Error("ORIGINAL_VIEW_UNKNOWN_PLAYER");

  const readable = new Set(readableChatChannels(state, playerId));
  const visibleChat = state.chat.filter((entry) => readable.has(entry.channel));
  const revealAll = state.phase === "GAME_OVER";
  const sunriseReached =
    state.phase !== "LOBBY" && state.phase !== "ROLE_REVEAL";

  const ownNightNote = state.nightNotes[viewer.id];

  return {
    gameId: state.gameId,
    revision: state.revision,
    phase: state.phase,
    day: state.day,
    winner: state.winner,
    self: {
      id: viewer.id,
      name: viewer.name,
      alive: viewer.alive,
      ready: viewer.ready,
      role: viewer.role,
      roleConfirmed: viewer.roleConfirmed,
      sunriseConfirmed: viewer.sunriseConfirmed,
    },
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      alive: player.alive,
      ready: player.ready,
      connected: player.connected,
      publicRole: revealAll ? player.role : null,
    })),
    mafiaMembers:
      viewer.role === "MAFIA" && sunriseReached
        ? state.players
            .filter((player) => player.role === "MAFIA")
            .map((player) => ({ id: player.id, name: player.name }))
        : null,
    publicMafiaCount: state.publicMafiaCount,
    chat: visibleChat,
    writableChatChannels: writableChatChannels(state, viewer.id),
    accusation: state.accusation,
    guiltyVote: state.guiltyVote
      ? {
          required: state.guiltyVote.required,
          submitted: Object.keys(state.guiltyVote.votes).length,
          eligible: livingOriginalPlayers(state).filter(
            (player) => player.id !== state.accusation?.accusedId,
          ).length,
          ownVote: ownBooleanVote(state.guiltyVote.votes, viewer.id),
        }
      : null,
    nightProposal: state.nightProposal
      ? {
          proposerId: state.nightProposal.proposerId,
          required: state.nightProposal.vote.required,
          submitted: Object.keys(state.nightProposal.vote.votes).length,
          eligible: livingOriginalPlayers(state).length,
          ownVote: ownBooleanVote(state.nightProposal.vote.votes, viewer.id),
        }
      : null,
    nightNote:
      state.phase === "MAFIA_NIGHT"
        ? {
            submitted: Boolean(ownNightNote),
            ownTargetId:
              ownNightNote?.kind === "TARGET" ? ownNightNote.targetId : null,
            honest: ownNightNote?.kind === "HONEST",
          }
        : null,
    availableActions: availableOriginalActions(state, viewer.id),
  };
}
