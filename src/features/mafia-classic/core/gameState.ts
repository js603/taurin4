import type {
  Alignment,
  ConfirmableTarget,
  GameState,
  NightActions,
  PlayerState,
  Role,
} from "./types.js";
import type { RandomSource } from "./random.js";

const EMPTY_TARGET: ConfirmableTarget = { targetId: null, confirmed: false };

export function roleAlignment(role: Role): Alignment {
  return role === "MAFIA" ? "MAFIA" : "TOWN";
}

export function emptyNightActions(): NightActions {
  return {
    mafiaVotes: {},
    mafiaTarget: null,
    mafiaRevoteRound: 0,
    doctor: EMPTY_TARGET,
    detective: EMPTY_TARGET,
  };
}

export function createLobbyGame(
  names: readonly string[],
  hostIndex = 0,
  gameId = "mafia-v1",
): GameState {
  if (names.length < 5) throw new Error("Mafia v1 requires at least 5 players.");
  const cleaned = names.map((name) => name.trim());
  if (cleaned.some((name) => !name)) throw new Error("Player names must not be empty.");
  if (new Set(cleaned.map((name) => name.toLocaleLowerCase())).size !== cleaned.length) {
    throw new Error("Player names must be unique.");
  }
  if (hostIndex < 0 || hostIndex >= cleaned.length) throw new Error("Invalid hostIndex.");

  const players: PlayerState[] = cleaned.map((name, index) => ({
    id: "p" + (index + 1),
    name,
    role: null,
    alignment: null,
    alive: true,
    ready: false,
    connected: true,
    roleConfirmed: false,
    deathCause: null,
    deathDay: null,
  }));

  return {
    gameId,
    hostId: players[hostIndex]!.id,
    phase: "LOBBY",
    day: 0,
    night: 0,
    players,
    nightActions: emptyNightActions(),
    nominations: {},
    votes: {},
    voteResult: null,
    pendingExecutionId: null,
    phaseConfirmations: [],
    investigationResults: {},
    publicEvents: [],
    winner: null,
    revision: 0,
    replay: [],
  };
}

export function assignClassicRoles(state: GameState, rng: RandomSource): GameState {
  if (state.players.length !== 8) {
    throw new Error(
      "M1 role assignment is locked to the v1 base game: exactly 8 players (2 Mafia, Detective, Doctor, 4 Citizens).",
    );
  }

  const deck: Role[] = [
    "MAFIA",
    "MAFIA",
    "DETECTIVE",
    "DOCTOR",
    "CITIZEN",
    "CITIZEN",
    "CITIZEN",
    "CITIZEN",
  ];
  const shuffled = rng.shuffle(deck);

  return {
    ...state,
    players: state.players.map((player, index) => {
      const role = shuffled[index]!;
      return {
        ...player,
        role,
        alignment: roleAlignment(role),
        roleConfirmed: false,
      };
    }),
  };
}

export function livingPlayers(state: GameState): PlayerState[] {
  return state.players.filter((player) => player.alive);
}

export function livingByAlignment(state: GameState, alignment: Alignment): PlayerState[] {
  return state.players.filter((player) => player.alive && player.alignment === alignment);
}

export function findPlayer(state: GameState, playerId: string): PlayerState | null {
  return state.players.find((player) => player.id === playerId) ?? null;
}

export function playerByRole(state: GameState, role: Role): PlayerState | null {
  return state.players.find((player) => player.alive && player.role === role) ?? null;
}

export function lastDoctorTarget(state: GameState): string | null {
  const doctor = state.players.find((player) => player.role === "DOCTOR");
  if (!doctor) return null;

  for (let index = state.replay.length - 1; index >= 0; index -= 1) {
    const entry = state.replay[index]!;
    if (
      entry.action.type === "SELECT_NIGHT_TARGET" &&
      entry.action.playerId === doctor.id &&
      entry.revisionBefore < state.revision
    ) {
      return entry.action.targetId;
    }
  }
  return null;
}
