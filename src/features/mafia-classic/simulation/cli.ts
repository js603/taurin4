import { simulateMany } from "./simulate.js";

function readNumber(flag: string, fallback: number): number {
  const index = process.argv.indexOf(flag);
  if (index < 0) return fallback;
  const raw = process.argv[index + 1];
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error("Invalid " + flag + " value: " + raw);
  return value;
}

const games = readNumber("--games", 1000);
const seed = readNumber("--seed", 20260921) >>> 0;
const result = simulateMany(games, seed);

process.stdout.write(
  [
    "Simulation Results",
    "",
    "Games:                 " + result.games.toLocaleString("en-US"),
    "Completed:             " + result.completed.toLocaleString("en-US"),
    "Stalled:               " + result.stalled.toLocaleString("en-US"),
    "",
    "Town Wins:             " + result.townWins.toLocaleString("en-US"),
    "Mafia Wins:            " + result.mafiaWins.toLocaleString("en-US"),
    "",
    "Illegal Actions:       " + result.illegalActions.toLocaleString("en-US"),
    "Invalid Transitions:   " + result.invalidTransitions.toLocaleString("en-US"),
    "Secret Leaks:          " + result.secretLeaks.toLocaleString("en-US"),
    "Screen Contract Violations: " +
      result.screenContractViolations.toLocaleString("en-US"),
    "Infinite Loops:        " + result.infiniteLoops.toLocaleString("en-US"),
    "Other Failures:        " + result.otherFailures.toLocaleString("en-US"),
    "",
    "Max Actions:           " + result.maxActions.toLocaleString("en-US"),
    "Max Nights:            " + result.maxNights.toLocaleString("en-US"),
    "Average Actions:       " + result.averageActions.toFixed(3),
    "Seed:                  " + seed,
    "",
    result.passed ? "PASS" : "FAIL",
    "",
  ].join("\n"),
);

if (!result.passed) {
  process.exitCode = 1;
}
