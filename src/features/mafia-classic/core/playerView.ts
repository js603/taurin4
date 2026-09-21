import { findPlayer, livingPlayers } from "./gameState.js";
import { publicRoleOf } from "./resolvers.js";
import type {
  GameAction,
  GamePhase,
  GameState,
  InvestigationResult,
  PlayerId,
  Role,
  Winner,
} from "./types.js";

export interface PublicPlayerView {
  readonly id: PlayerId;
  readonly name: string;
  readonly alive: boolean;
  readonly ready: boolean;
  readonly connected: boolean;
  readonly publicRole: Role | null;
  readonly deathCause: "MAFIA" | "EXECUTION" | "FORCED" | null;
  readonly deathDay: number | null;
}

export interface PlayerView {
  readonly gameId: string;
  readonly revision: number;
  readonly phase: GamePhase;
  readonly day: number;
  readonly night: number;
  readonly winner: Winner;
  readonly self: {
    readonly id: PlayerId;
    readonly name: string;
    readonly alive: boolean;
    readonly ready: boolean;
    readonly role: Role | null;
    readonly alignment: "TOWN" | "MAFIA" | null;
    readonly roleConfirmed: boolean;
  };
  readonly players: readonly PublicPlayerView[];
  readonly mafiaMembers: readonly { readonly id: PlayerId; readonly name: string }[] | null;
  readonly detectiveHistory: readonly InvestigationResult[] | null;
  readonly doctorLastProtectedTargetId: PlayerId | null;
  readonly ownNightTargetId: PlayerId | null;
  readonly mafiaNightProgress:
    | {
        readonly confirmed: number;
        readonly total: number;
      }
    | null;
  readonly nominations: readonly PlayerId[];
  readonly ownNominationTargetId: PlayerId | null;
  readonly ownVoteTargetId: PlayerId | null;
  readonly voteProgress:
    | {
        readonly confirmed: number;
        readonly total: number;
      }
    | null;
  readonly voteResult:
    | {
        readonly tally: Readonly<Record<string, number>>;
        readonly executionTargetId: PlayerId | null;
      }
    | null;
  readonly publicEvents: GameState["publicEvents"];
  readonly availableActions: readonly GameAction["type"][];
}

function availableActionTypes(state: GameState, playerId: PlayerId): GameAction["type"][] {
  const player = findPlayer(state, playerId);
  if (!player || !player.connected || state.phase === "GAME_OVER") return [];

  switch (state.phase) {
    case "LOBBY": {
      const actions: GameAction["type"][] = ["SET_READY"];
      const canStart =
        player.id === state.hostId &&
        state.players.length === 8 &&
        state.players.every((candidate) => candidate.connected && candidate.ready);
      if (canStart) actions.push("START_GAME");
      return actions;
    }
    case "ROLE_REVEAL":
      return player.roleConfirmed ? [] : ["CONFIRM_ROLE"];
    case "NIGHT_ACTION":
      if (!player.alive) return [];
      if (player.role === "MAFIA") {
        const choice = state.nightActions.mafiaVotes[player.id];
        if (choice?.confirmed) return [];
        return choice?.targetId
          ? ["SELECT_NIGHT_TARGET", "CONFIRM_NIGHT_ACTION"]
          : ["SELECT_NIGHT_TARGET"];
      }
      if (player.role === "DOCTOR") {
        if (state.nightActions.doctor.confirmed) return [];
        return state.nightActions.doctor.targetId
          ? ["SELECT_NIGHT_TARGET", "CONFIRM_NIGHT_ACTION"]
          : ["SELECT_NIGHT_TARGET"];
      }
      if (player.role === "DETECTIVE") {
        if (state.nightActions.detective.confirmed) return [];
        return state.nightActions.detective.targetId
          ? ["SELECT_NIGHT_TARGET", "CONFIRM_NIGHT_ACTION"]
          : ["SELECT_NIGHT_TARGET"];
      }
      return [];
    case "DAWN":
    case "VOTE_RESULT":
    case "EXECUTION":
      if (!player.alive) return [];
      return state.phaseConfirmations.includes(player.id) ? [] : ["CONFIRM_RESULT"];
    case "DAY_DISCUSSION":
      return player.id === state.hostId ? ["END_DISCUSSION"] : [];
    case "NOMINATION": {
      const actions: GameAction["type"][] = player.alive ? ["NOMINATE_PLAYER"] : [];
      if (player.id === state.hostId) actions.push("END_NOMINATION");
      return actions;
    }
    case "DAY_VOTE": {
      if (!player.alive || state.votes[player.id]?.confirmed) return [];
      const hasSelection = Object.prototype.hasOwnProperty.call(state.votes, player.id);
      return hasSelection ? ["SELECT_VOTE", "CONFIRM_VOTE"] : ["SELECT_VOTE"];
    }
    default:
      return [];
  }
}

function ownNightTarget(state: GameState, playerId: PlayerId): PlayerId | null {
  const player = findPlayer(state, playerId);
  if (!player) return null;
  if (player.role === "MAFIA") return state.nightActions.mafiaVotes[playerId]?.targetId ?? null;
  if (player.role === "DOCTOR") return state.nightActions.doctor.targetId;
  if (player.role === "DETECTIVE") return state.nightActions.detective.targetId;
  return null;
}

export function buildPlayerView(state: GameState, playerId: PlayerId): PlayerView {
  const viewer = findPlayer(state, playerId);
  if (!viewer) throw new Error("Cannot build PlayerView for an unknown player.");

  const mafiaMembers =
    viewer.role === "MAFIA"
      ? state.players
          .filter((player) => player.alive && player.role === "MAFIA")
          .map((player) => ({ id: player.id, name: player.name }))
      : null;

  const detectiveHistory =
    viewer.role === "DETECTIVE" ? state.investigationResults[viewer.id] ?? [] : null;

  const livingMafia = state.players.filter((player) => player.alive && player.role === "MAFIA");
  const mafiaNightProgress =
    viewer.role === "MAFIA"
      ? {
          confirmed: livingMafia.filter(
            (player) => state.nightActions.mafiaVotes[player.id]?.confirmed === true,
          ).length,
          total: livingMafia.length,
        }
      : null;

  const voteResult =
    state.phase === "VOTE_RESULT" ||
    state.phase === "EXECUTION" ||
    state.phase === "WIN_CHECK" ||
    state.phase === "NIGHT_START" ||
    state.phase === "GAME_OVER"
      ? state.voteResult
      : null;

  return {
    gameId: state.gameId,
    revision: state.revision,
    phase: state.phase,
    day: state.day,
    night: state.night,
    winner: state.winner,
    self: {
      id: viewer.id,
      name: viewer.name,
      alive: viewer.alive,
      ready: viewer.ready,
      role: viewer.role,
      alignment: viewer.alignment,
      roleConfirmed: viewer.roleConfirmed,
    },
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      alive: player.alive,
      ready: player.ready,
      connected: player.connected,
      publicRole: publicRoleOf(state, player.id),
      deathCause: player.deathCause,
      deathDay: player.deathDay,
    })),
    mafiaMembers,
    detectiveHistory,
    doctorLastProtectedTargetId:
      viewer.role === "DOCTOR" ? state.doctorLastProtectedTargetId : null,
    ownNightTargetId: ownNightTarget(state, viewer.id),
    mafiaNightProgress,
    nominations: [...new Set(Object.values(state.nominations))],
    ownNominationTargetId: state.nominations[viewer.id] ?? null,
    ownVoteTargetId: state.votes[viewer.id]?.targetId ?? null,
    voteProgress:
      state.phase === "DAY_VOTE"
        ? {
            confirmed: livingPlayers(state).filter(
              (player) => state.votes[player.id]?.confirmed === true,
            ).length,
            total: livingPlayers(state).length,
          }
        : null,
    voteResult,
    publicEvents: state.publicEvents,
    availableActions: availableActionTypes(state, viewer.id),
  };
}
