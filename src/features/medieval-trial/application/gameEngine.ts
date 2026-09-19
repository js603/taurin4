import { MEDIEVAL_TRIAL_V01, checkWinner, factionOf } from "../domain/rules.js";
import type { RandomSource } from "../domain/seededRandom.js";
import type {
  AccusationResolution,
  GameState,
  NightIntent,
  NightResolution,
  PlayerId,
  PlayerState,
  Role,
  VerdictResolution,
} from "../domain/types.js";

const ROLE_DECK: readonly Role[] = [
  "murderer",
  "murderer",
  "investigator",
  "apothecary",
  "commoner",
  "commoner",
  "commoner",
  "commoner",
];

export function createGame(seed: number, rng: RandomSource): GameState {
  if (!Number.isSafeInteger(seed)) throw new Error("seed must be a safe integer");
  const roles = rng.shuffle(ROLE_DECK);
  const players: PlayerState[] = roles.map((role, seat) => ({
    id: `p${seat + 1}`,
    seat,
    name: `Player ${seat + 1}`,
    role,
    faction: factionOf(role),
    alive: true,
    selfProtectionUsed: false,
    lastProtectedTargetId: null,
  }));

  return {
    gameId: `medieval-trial-${seed}`,
    seed,
    day: 0,
    phase: "prologue-night",
    players,
    nightHistory: [],
    accusationHistory: [],
    verdictHistory: [],
    winner: null,
  };
}

function playerById(state: GameState, id: PlayerId): PlayerState {
  const player = state.players.find((candidate) => candidate.id === id);
  if (!player) throw new Error(`unknown player: ${id}`);
  return player;
}

function requireAliveRole(state: GameState, role: Role): PlayerState {
  const player = state.players.find((candidate) => candidate.alive && candidate.role === role);
  if (!player) throw new Error(`no living ${role}`);
  return player;
}

function assertAliveTarget(state: GameState, id: PlayerId, label: string): PlayerState {
  const player = playerById(state, id);
  if (!player.alive) throw new Error(`${label} must target a living player`);
  return player;
}

function actedLastNight(state: GameState, playerId: PlayerId): boolean {
  const player = playerById(state, playerId);
  return player.role !== "commoner";
}

export function validateProtection(state: GameState, targetId: PlayerId): void {
  const apothecary = requireAliveRole(state, "apothecary");
  const target = assertAliveTarget(state, targetId, "protection");

  if (
    !MEDIEVAL_TRIAL_V01.consecutiveProtectionAllowed &&
    apothecary.lastProtectedTargetId === target.id
  ) {
    throw new Error("cannot protect the same target on consecutive nights");
  }

  if (target.id === apothecary.id && apothecary.selfProtectionUsed) {
    throw new Error("self protection has already been used");
  }
}

export function resolveNight(
  state: GameState,
  intent: NightIntent,
  rng: RandomSource,
): NightResolution {
  void rng; // Baseline v0.2 generates no random witness evidence.
  if (state.phase !== "prologue-night" && state.phase !== "night") {
    throw new Error(`cannot resolve night during phase ${state.phase}`);
  }

  const murderers = state.players.filter((player) => player.alive && player.role === "murderer");
  if (murderers.length === 0) throw new Error("no living murderer");

  const murderTarget = assertAliveTarget(state, intent.murderTargetId, "murder");
  if (murderTarget.role === "murderer")
    throw new Error("murderers cannot murder their own faction");

  const investigator =
    state.players.find((candidate) => candidate.alive && candidate.role === "investigator") ?? null;
  let investigationTarget: PlayerState | null = null;
  if (investigator) {
    if (!intent.investigationTargetId) throw new Error("living investigator requires a target");
    investigationTarget = assertAliveTarget(state, intent.investigationTargetId, "investigation");
    if (investigationTarget.id === investigator.id) {
      throw new Error("investigator cannot investigate self");
    }
  } else if (intent.investigationTargetId) {
    throw new Error("dead investigator cannot act");
  }

  const apothecary =
    state.players.find((candidate) => candidate.alive && candidate.role === "apothecary") ?? null;
  let protectedTarget: PlayerState | null = null;
  if (apothecary) {
    if (!intent.protectionTargetId) throw new Error("living apothecary requires a target");
    validateProtection(state, intent.protectionTargetId);
    protectedTarget = playerById(state, intent.protectionTargetId);

    if (state.phase !== "prologue-night" && protectedTarget.id === apothecary.id) {
      apothecary.selfProtectionUsed = true;
    }
    if (state.phase !== "prologue-night") apothecary.lastProtectedTargetId = protectedTarget.id;
  } else if (intent.protectionTargetId) {
    throw new Error("dead apothecary cannot act");
  }

  const prologue = state.phase === "prologue-night";
  const protectedFromMurder = protectedTarget?.id === murderTarget.id;
  const murderPrevented = prologue || protectedFromMurder;
  const killedPlayerId = murderPrevented ? null : murderTarget.id;

  if (killedPlayerId) {
    murderTarget.alive = false;
  }

  const day = state.day + 1;
  const investigation =
    investigator && investigationTarget
      ? {
          day,
          investigatorId: investigator.id,
          targetId: investigationTarget.id,
          targetActed: actedLastNight(state, investigationTarget.id),
          targetIsMurderer: investigationTarget.role === "murderer",
        }
      : null;

  const resolution: NightResolution = {
    day,
    prologue,
    murderTargetId: murderTarget.id,
    protectedTargetId: protectedTarget?.id ?? null,
    murderPrevented,
    killedPlayerId,
    investigation,
    testimonies: [],
  };

  state.day = day;
  state.nightHistory.push(resolution);
  state.winner = checkWinner(state.players);
  state.phase = state.winner ? "game-over" : "dawn";
  return resolution;
}

function sortedCandidatesByVotes(
  state: GameState,
  votes: Readonly<Record<PlayerId, PlayerId>>,
): PlayerId[] {
  const alive = state.players.filter((player) => player.alive);
  validateVoters(state, votes);
  const counts = new Map<PlayerId, number>();
  for (const voter of alive) {
    const targetId = votes[voter.id];
    if (!targetId) throw new Error(`missing vote from ${voter.id}`);
    const target = assertAliveTarget(state, targetId, "vote");
    if (target.id === voter.id) throw new Error("self vote is not allowed");
    counts.set(target.id, (counts.get(target.id) ?? 0) + 1);
  }

  return alive
    .filter((player) => (counts.get(player.id) ?? 0) > 0)
    .sort((left, right) => {
      const difference = (counts.get(right.id) ?? 0) - (counts.get(left.id) ?? 0);
      const offset = (state.seed + state.day) % state.players.length;
      const rank = (player: PlayerState) =>
        (player.seat - offset + state.players.length) % state.players.length;
      return difference !== 0 ? difference : rank(left) - rank(right);
    })
    .map((player) => player.id);
}

export function resolveAccusation(
  state: GameState,
  votes: Readonly<Record<PlayerId, PlayerId>>,
): AccusationResolution {
  if (state.phase !== "accusation") {
    throw new Error(`cannot resolve accusation during phase ${state.phase}`);
  }

  const ranked = sortedCandidatesByVotes(state, votes);
  if (ranked.length < 2) {
    throw new Error("accusation must produce two finalists");
  }

  const finalists = [ranked[0]!, ranked[1]!] as const;
  const resolution: AccusationResolution = {
    day: state.day,
    votes: { ...votes },
    finalists,
  };
  state.accusationHistory.push(resolution);
  state.phase = "defense";
  return resolution;
}

export function beginAccusation(state: GameState): void {
  if (state.phase !== "dawn" && state.phase !== "discussion") {
    throw new Error(`cannot begin accusation during phase ${state.phase}`);
  }
  state.phase = "accusation";
}

export function beginVerdict(state: GameState): void {
  if (state.phase !== "defense") {
    throw new Error(`cannot begin verdict during phase ${state.phase}`);
  }
  state.phase = "verdict";
}

export function resolveVerdict(
  state: GameState,
  finalists: readonly [PlayerId, PlayerId],
  votes: Readonly<Record<PlayerId, PlayerId>>,
): VerdictResolution {
  if (state.phase !== "verdict") {
    throw new Error(`cannot resolve verdict during phase ${state.phase}`);
  }

  const [first, second] = finalists;
  const nomination = state.accusationHistory.at(-1);
  if (
    first === second ||
    nomination?.day !== state.day ||
    !nomination.finalists.every((id) => finalists.includes(id))
  ) {
    throw new Error("verdict finalists must match today's accusation");
  }
  validateVoters(state, votes);
  assertAliveTarget(state, first, "verdict");
  assertAliveTarget(state, second, "verdict");

  let firstVotes = 0;
  let secondVotes = 0;
  for (const voter of state.players.filter((player) => player.alive)) {
    const targetId = votes[voter.id];
    if (targetId === first) firstVotes += 1;
    else if (targetId === second) secondVotes += 1;
    else if (targetId !== "pardon")
      throw new Error(`verdict vote from ${voter.id} must target a finalist or pardon`);
  }

  const tied = firstVotes === secondVotes;
  const majority = Math.floor(state.players.filter((p) => p.alive).length / 2) + 1;
  const eliminatedPlayerId =
    Math.max(firstVotes, secondVotes) < majority ? null : firstVotes > secondVotes ? first : second;
  if (eliminatedPlayerId) {
    playerById(state, eliminatedPlayerId).alive = false;
  }

  const resolution: VerdictResolution = {
    day: state.day,
    votes: { ...votes },
    finalists: [first, second],
    eliminatedPlayerId,
    tied,
  };
  state.verdictHistory.push(resolution);
  state.winner = checkWinner(state.players);
  state.phase = state.winner ? "game-over" : "night";
  return resolution;
}

function validateVoters(state: GameState, votes: Readonly<Record<PlayerId, PlayerId>>): void {
  const ids = state.players.filter((player) => player.alive).map((player) => player.id);
  if (
    Object.keys(votes).length !== ids.length ||
    Object.keys(votes).some((id) => !ids.includes(id))
  ) {
    throw new Error("votes must contain exactly the living players");
  }
}
