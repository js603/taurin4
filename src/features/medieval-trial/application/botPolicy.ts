// Shared policy for interactive sessions and offline balance simulation.
import type { RandomSource } from "../domain/seededRandom.js";
import type { GameState, NightIntent, PlayerId, PlayerState } from "../domain/types.js";

export interface BotPolicyConfig {
  readonly investigatorShareProbability: number;
  readonly investigatorActedWeight: number;
  readonly investigatorQuietWeight: number;
  readonly residentTestimonyShareProbability: number;
  readonly murdererTestimonyShareProbability: number;
  readonly testimonyWeakWeight: number;
  readonly testimonyMediumWeight: number;
  readonly testimonyStrongWeight: number;
  readonly murdererMisdirectionBonus: number;
  readonly voteNoise: number;
  readonly murdererPowerRoleTargetProbability: number;
}

export const BOT_PROFILES = {
  lowInfo: {
    investigatorShareProbability: 0.68,
    investigatorActedWeight: 0.72,
    investigatorQuietWeight: -0.12,
    residentTestimonyShareProbability: 0.64,
    murdererTestimonyShareProbability: 0.4,
    testimonyWeakWeight: 0.04,
    testimonyMediumWeight: 0.2,
    testimonyStrongWeight: 0.4,
    murdererMisdirectionBonus: 0.32,
    voteNoise: 0.38,
    murdererPowerRoleTargetProbability: 0.38,
  },
  baseline: {
    investigatorShareProbability: 0.9,
    investigatorActedWeight: 1.15,
    investigatorQuietWeight: -0.2,
    residentTestimonyShareProbability: 0.82,
    murdererTestimonyShareProbability: 0.3,
    testimonyWeakWeight: 0.05,
    testimonyMediumWeight: 0.4,
    testimonyStrongWeight: 0.78,
    murdererMisdirectionBonus: 0.16,
    voteNoise: 0.28,
    murdererPowerRoleTargetProbability: 0.34,
  },
  highInfo: {
    investigatorShareProbability: 0.97,
    investigatorActedWeight: 1.5,
    investigatorQuietWeight: -0.3,
    residentTestimonyShareProbability: 0.94,
    murdererTestimonyShareProbability: 0.2,
    testimonyWeakWeight: 0.08,
    testimonyMediumWeight: 0.58,
    testimonyStrongWeight: 1.0,
    murdererMisdirectionBonus: 0.08,
    voteNoise: 0.2,
    murdererPowerRoleTargetProbability: 0.3,
  },
} as const satisfies Record<string, BotPolicyConfig>;

export type BotProfileName = keyof typeof BOT_PROFILES;

export interface SuspicionLedger {
  readonly score: Map<PlayerId, number>;
  readonly privateScores: Map<PlayerId, Map<PlayerId, number>>;
  readonly processedDays: Set<number>;
  readonly disclosedTestimonyIds: Set<string>;
  readonly disclosedInvestigations: Set<number>;
  readonly publicInvestigators: Set<PlayerId>;
}

export function createSuspicionLedger(state: GameState, rng: RandomSource): SuspicionLedger {
  const score = new Map<PlayerId, number>();
  for (const player of state.players) {
    score.set(player.id, rng.next() * 0.12);
  }
  return {
    score,
    privateScores: new Map(),
    processedDays: new Set(),
    disclosedTestimonyIds: new Set(),
    disclosedInvestigations: new Set(),
    publicInvestigators: new Set(),
  };
}

function alive(state: GameState): PlayerState[] {
  return state.players.filter((player) => player.alive);
}

export function chooseNightIntent(
  state: GameState,
  rng: RandomSource,
  config: BotPolicyConfig,
  ledger?: SuspicionLedger,
): NightIntent {
  const living = alive(state);
  const murderer = living.find((player) => player.role === "murderer");
  const investigator = living.find((player) => player.role === "investigator") ?? null;
  const apothecary = living.find((player) => player.role === "apothecary") ?? null;
  if (!murderer) throw new Error("night intent requires a living murderer");

  const murderCandidates = living.filter((player) => player.role !== "murderer");
  // Only public claims identify a power role. Never inspect an enemy's secret role.
  const priority = murderCandidates.filter((player) => ledger?.publicInvestigators.has(player.id));
  const murderTarget =
    priority.length > 0 && rng.next() < config.murdererPowerRoleTargetProbability
      ? rng.pick(priority)
      : rng.pick(murderCandidates);

  const investigated = new Set(
    state.nightHistory.flatMap((night) =>
      night.investigation && night.investigation.investigatorId === investigator?.id
        ? [night.investigation.targetId]
        : [],
    ),
  );
  const investigationChoices = living.filter((player) => player.id !== investigator?.id);
  const freshChoices = investigationChoices.filter((player) => !investigated.has(player.id));
  const investigationTarget = investigator
    ? rng.pick(freshChoices.length ? freshChoices : investigationChoices)
    : null;

  const protectionCandidates = apothecary
    ? living.filter((player) => {
        if (player.id === apothecary.lastProtectedTargetId) return false;
        if (player.id === apothecary.id && apothecary.selfProtectionUsed) return false;
        return true;
      })
    : [];
  const knownAllies = protectionCandidates.filter((player) =>
    ledger?.publicInvestigators.has(player.id),
  );
  const protectionTarget = apothecary
    ? rng.pick(knownAllies.length ? knownAllies : protectionCandidates)
    : null;

  return {
    murderTargetId: murderTarget.id,
    investigationTargetId: investigationTarget?.id ?? null,
    protectionTargetId: protectionTarget?.id ?? null,
  };
}

export function absorbNightInformation(
  state: GameState,
  ledger: SuspicionLedger,
  rng: RandomSource,
  config: BotPolicyConfig,
): void {
  const night = state.nightHistory.at(-1);
  if (!night || ledger.processedDays.has(night.day)) return;
  ledger.processedDays.add(night.day);

  if (night.investigation) {
    const investigator = state.players.find(
      (player) => player.id === night.investigation!.investigatorId,
    );
    const delta = night.investigation.targetActed
      ? config.investigatorActedWeight
      : config.investigatorQuietWeight;
    const personal =
      ledger.privateScores.get(night.investigation.investigatorId) ?? new Map<PlayerId, number>();
    personal.set(
      night.investigation.targetId,
      (personal.get(night.investigation.targetId) ?? 0) + delta,
    );
    ledger.privateScores.set(night.investigation.investigatorId, personal);
    if (
      investigator?.alive &&
      investigator.faction === "residents" &&
      rng.next() < config.investigatorShareProbability
    ) {
      ledger.disclosedInvestigations.add(night.day);
      personal.set(
        night.investigation.targetId,
        (personal.get(night.investigation.targetId) ?? 0) - delta,
      );
      ledger.publicInvestigators.add(investigator.id);
      ledger.score.set(
        night.investigation.targetId,
        (ledger.score.get(night.investigation.targetId) ?? 0) + delta,
      );
    }
  }

  for (const testimony of night.testimonies) {
    const recipient = state.players.find((player) => player.id === testimony.recipientId);
    if (!recipient?.alive) continue;

    const shares =
      recipient.role === "murderer"
        ? rng.next() < config.murdererTestimonyShareProbability
        : rng.next() < config.residentTestimonyShareProbability;
    const weight =
      testimony.strength === "strong"
        ? config.testimonyStrongWeight
        : testimony.strength === "medium"
          ? config.testimonyMediumWeight
          : config.testimonyWeakWeight;

    const personal = ledger.privateScores.get(recipient.id) ?? new Map<PlayerId, number>();
    if (!shares)
      for (const id of testimony.candidateIds) personal.set(id, (personal.get(id) ?? 0) + weight);
    ledger.privateScores.set(recipient.id, personal);
    // A murderer can withhold evidence, but cannot silently alter a public clue.
    if (!shares) continue;
    ledger.disclosedTestimonyIds.add(testimony.id);

    for (const candidateId of testimony.candidateIds) {
      const candidate = state.players.find((player) => player.id === candidateId);
      if (!candidate?.alive) continue;
      ledger.score.set(candidateId, (ledger.score.get(candidateId) ?? 0) + weight);
    }
  }
}

function candidateScore(
  ledger: SuspicionLedger,
  voter: PlayerState,
  candidate: PlayerState,
  rng: RandomSource,
  config: BotPolicyConfig,
): number {
  let score = ledger.score.get(candidate.id) ?? 0;
  score += ledger.privateScores.get(voter.id)?.get(candidate.id) ?? 0;
  if (candidate.id === voter.id) score -= 100;
  score += rng.next() * config.voteNoise;

  if (voter.role === "murderer") {
    if (candidate.role === "murderer") score -= 4;
    else score += config.murdererMisdirectionBonus;
  }
  return score;
}

function chooseBestCandidate(
  candidates: readonly PlayerState[],
  ledger: SuspicionLedger,
  voter: PlayerState,
  rng: RandomSource,
  config: BotPolicyConfig,
): PlayerState {
  const scored = candidates.map((candidate) => ({
    candidate,
    score: candidateScore(ledger, voter, candidate, rng, config),
  }));
  scored.sort(
    (left, right) => right.score - left.score || left.candidate.seat - right.candidate.seat,
  );
  return scored[0]!.candidate;
}

export function chooseAccusationVotes(
  state: GameState,
  ledger: SuspicionLedger,
  rng: RandomSource,
  config: BotPolicyConfig,
): Record<PlayerId, PlayerId> {
  const votes: Record<PlayerId, PlayerId> = {};
  const living = alive(state);
  for (const voter of living) {
    const candidates = living.filter((candidate) => candidate.id !== voter.id);
    votes[voter.id] = chooseBestCandidate(candidates, ledger, voter, rng, config).id;
  }
  return votes;
}

export function chooseVerdictVotes(
  state: GameState,
  ledger: SuspicionLedger,
  finalists: readonly [PlayerId, PlayerId],
  rng: RandomSource,
  config: BotPolicyConfig,
): Record<PlayerId, PlayerId> {
  const votes: Record<PlayerId, PlayerId> = {};
  const living = alive(state);
  const finalistPlayers = finalists.map((id) => state.players.find((player) => player.id === id)!);

  for (const voter of living) {
    votes[voter.id] = chooseBestCandidate(finalistPlayers, ledger, voter, rng, config).id;
  }
  return votes;
}
