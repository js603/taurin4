import {
  beginAccusation,
  beginVerdict,
  createGame,
  resolveAccusation,
  resolveNight,
  resolveVerdict,
} from "../application/gameEngine.js";
import { Mulberry32 } from "../domain/seededRandom.js";
import type { Faction, Role } from "../domain/types.js";
import {
  BOT_PROFILES,
  absorbNightInformation,
  chooseAccusationVotes,
  chooseNightIntent,
  chooseVerdictVotes,
  createSuspicionLedger,
  type BotPolicyConfig,
  type BotProfileName,
} from "./botPolicy.js";

export interface SimulationResult {
  readonly seed: number;
  readonly winner: Faction;
  readonly days: number;
  readonly firstEliminatedRole: Role | null;
  readonly protectionAttempts: number;
  readonly protectionSuccesses: number;
  readonly investigations: number;
  readonly investigationsOnMurderers: number;
  readonly tiedVerdicts: number;
}

export interface SimulationOptions {
  readonly profile?: BotProfileName;
  readonly config?: BotPolicyConfig;
  readonly maxDays?: number;
}

export function simulateGame(seed: number, options: SimulationOptions = {}): SimulationResult {
  const rng = new Mulberry32(seed);
  const state = createGame(seed, rng);
  const ledger = createSuspicionLedger(state, rng);
  const config = options.config ?? BOT_PROFILES[options.profile ?? "baseline"];
  const maxDays = options.maxDays ?? 12;

  let firstEliminatedRole: Role | null = null;
  let protectionAttempts = 0;
  let protectionSuccesses = 0;
  let investigations = 0;
  let investigationsOnMurderers = 0;
  let tiedVerdicts = 0;

  while (!state.winner && state.day < maxDays) {
    const intent = chooseNightIntent(state, rng, config);
    const night = resolveNight(state, intent, rng);
    if (night.protectedTargetId) {
      protectionAttempts += 1;
      if (
        !night.prologue &&
        night.murderPrevented &&
        night.protectedTargetId === night.murderTargetId
      ) {
        protectionSuccesses += 1;
      }
    }
    if (night.investigation) {
      investigations += 1;
      const targetRole = state.players.find(
        (player) => player.id === night.investigation!.targetId,
      )?.role;
      if (targetRole === "murderer") investigationsOnMurderers += 1;
    }

    if (state.winner) break;

    absorbNightInformation(state, ledger, rng, config);
    state.phase = "discussion";
    beginAccusation(state);
    const accusation = resolveAccusation(
      state,
      chooseAccusationVotes(state, ledger, rng, config),
    );
    beginVerdict(state);
    const verdict = resolveVerdict(
      state,
      accusation.finalists,
      chooseVerdictVotes(state, ledger, accusation.finalists, rng, config),
    );

    if (verdict.tied) tiedVerdicts += 1;
    if (firstEliminatedRole === null && verdict.eliminatedPlayerId) {
      firstEliminatedRole =
        state.players.find((player) => player.id === verdict.eliminatedPlayerId)?.role ?? null;
    }
  }

  if (!state.winner) state.winner = "murderers";

  return {
    seed,
    winner: state.winner,
    days: state.day,
    firstEliminatedRole,
    protectionAttempts,
    protectionSuccesses,
    investigations,
    investigationsOnMurderers,
    tiedVerdicts,
  };
}
