import type { RandomSource } from "../core/random.js";
import type {
  OriginalGameState,
  OriginalPlayerState,
  OriginalRole,
  PlayerId,
} from "./types.js";

export function originalMafiaCount(playerCount: number): number {
  if (playerCount >= 6 && playerCount <= 7) return 2;
  if (playerCount >= 8 && playerCount <= 10) return 3;
  if (playerCount >= 11 && playerCount <= 13) return 4;
  if (playerCount >= 14 && playerCount <= 16) return 5;
  throw new Error("Original Mafia supports 6 to 16 players.");
}

export function createOriginalLobby(
  names: readonly string[],
  hostIndex = 0,
  gameId = "original-mafia",
): OriginalGameState {
  if (names.length < 6 || names.length > 16) {
    throw new Error("Original Mafia requires 6 to 16 players.");
  }

  const cleaned = names.map((name) => name.trim());
  if (cleaned.some((name) => !name)) throw new Error("Player names must not be empty.");
  if (new Set(cleaned.map((name) => name.toLocaleLowerCase())).size !== cleaned.length) {
    throw new Error("Player names must be unique.");
  }
  if (hostIndex < 0 || hostIndex >= cleaned.length) throw new Error("Invalid hostIndex.");

  const players: OriginalPlayerState[] = cleaned.map((name, index) => ({
    id: "p" + (index + 1),
    name,
    role: null,
    alive: true,
    ready: false,
    connected: true,
    roleConfirmed: false,
    sunriseConfirmed: false,
    deathDay: null,
    deathCause: null,
  }));

  return {
    gameId,
    hostId: players[hostIndex]!.id,
    phase: "LOBBY",
    day: 0,
    players,
    accusation: null,
    guiltyVote: null,
    nightProposal: null,
    nightNotes: {},
    publicMafiaCount: null,
    chat: [],
    winner: null,
    revision: 0,
    replay: [],
  };
}

export function assignOriginalRoles(
  state: OriginalGameState,
  rng: RandomSource,
): OriginalGameState {
  const mafiaCount = originalMafiaCount(state.players.length);
  const roles: OriginalRole[] = [
    ...Array.from({ length: mafiaCount }, () => "MAFIA" as const),
    ...Array.from(
      { length: state.players.length - mafiaCount },
      () => "HONEST" as const,
    ),
  ];
  const shuffled = rng.shuffle(roles);

  return {
    ...state,
    players: state.players.map((player, index) => ({
      ...player,
      role: shuffled[index]!,
      roleConfirmed: false,
      sunriseConfirmed: false,
    })),
  };
}

export function originalPlayer(
  state: OriginalGameState,
  playerId: PlayerId,
): OriginalPlayerState | null {
  return state.players.find((player) => player.id === playerId) ?? null;
}

export function livingOriginalPlayers(state: OriginalGameState): OriginalPlayerState[] {
  return state.players.filter((player) => player.alive);
}

export function livingOriginalMafia(state: OriginalGameState): OriginalPlayerState[] {
  return state.players.filter((player) => player.alive && player.role === "MAFIA");
}

export function livingOriginalHonest(state: OriginalGameState): OriginalPlayerState[] {
  return state.players.filter((player) => player.alive && player.role === "HONEST");
}

export function strictMajority(voterCount: number): number {
  return Math.floor(voterCount / 2) + 1;
}
