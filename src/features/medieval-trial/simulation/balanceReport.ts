import type { Role } from "../domain/types.js";
import type { SimulationResult } from "./simulateGame.js";

export interface BalanceReport {
  readonly games: number;
  readonly residentWins: number;
  readonly murdererWins: number;
  readonly residentWinRate: number;
  readonly murdererWinRate: number;
  readonly averageDays: number;
  readonly firstEliminationByRole: Readonly<Record<Role | "none", number>>;
  readonly protectionSuccessRate: number;
  readonly investigationsOnMurdererRate: number;
  readonly averageTiedVerdicts: number;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function createBalanceReport(results: readonly SimulationResult[]): BalanceReport {
  const games = results.length;
  if (games === 0) throw new Error("at least one simulation is required");

  const residentWins = results.filter((result) => result.winner === "residents").length;
  const murdererWins = games - residentWins;
  const firstEliminationByRole: Record<Role | "none", number> = {
    murderer: 0,
    investigator: 0,
    apothecary: 0,
    commoner: 0,
    none: 0,
  };

  let totalDays = 0;
  let protectionAttempts = 0;
  let protectionSuccesses = 0;
  let investigations = 0;
  let investigationsOnMurderers = 0;
  let tiedVerdicts = 0;

  for (const result of results) {
    totalDays += result.days;
    firstEliminationByRole[result.firstEliminatedRole ?? "none"] += 1;
    protectionAttempts += result.protectionAttempts;
    protectionSuccesses += result.protectionSuccesses;
    investigations += result.investigations;
    investigationsOnMurderers += result.investigationsOnMurderers;
    tiedVerdicts += result.tiedVerdicts;
  }

  return {
    games,
    residentWins,
    murdererWins,
    residentWinRate: round4(residentWins / games),
    murdererWinRate: round4(murdererWins / games),
    averageDays: round4(totalDays / games),
    firstEliminationByRole,
    protectionSuccessRate: round4(
      protectionAttempts === 0 ? 0 : protectionSuccesses / protectionAttempts,
    ),
    investigationsOnMurdererRate: round4(
      investigations === 0 ? 0 : investigationsOnMurderers / investigations,
    ),
    averageTiedVerdicts: round4(tiedVerdicts / games),
  };
}

export function formatBalanceReport(report: BalanceReport): string {
  const pct = (value: number) => `${(value * 100).toFixed(2)}%`;
  return [
    "중세재판 v0.2 — Balance Simulation (all bots, not human play)",
    `Games: ${report.games.toLocaleString()}`,
    `Residents: ${pct(report.residentWinRate)}`,
    `Murderers: ${pct(report.murdererWinRate)}`,
    `Average days: ${report.averageDays.toFixed(2)}`,
    `Protection success: ${pct(report.protectionSuccessRate)}`,
    `Investigations hitting murderer: ${pct(report.investigationsOnMurdererRate)}`,
    `Average tied verdicts: ${report.averageTiedVerdicts.toFixed(3)}`,
    `First elimination: ${JSON.stringify(report.firstEliminationByRole)}`,
  ].join("\n");
}
