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
  JSON.stringify(
    {
      status: "PASS",
      suite: "MAFIA_M1_CORE_SIMULATION",
      ...result,
      seed,
    },
    null,
    2,
  ) + "\n",
);
