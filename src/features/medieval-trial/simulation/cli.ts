import { BOT_PROFILES, type BotProfileName } from "./botPolicy.js";
import { createBalanceReport, formatBalanceReport } from "./balanceReport.js";
import { simulateGame } from "./simulateGame.js";

function readNumberArg(name: string, fallback: number): number {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const raw = process.argv[index + 1];
  const parsed = Number(raw);
  if (!raw || !Number.isFinite(parsed)) throw new Error(`invalid ${name}`);
  return parsed;
}

function readProfile(): BotProfileName {
  const index = process.argv.indexOf("--profile");
  if (index === -1) return "baseline";
  const raw = process.argv[index + 1] as BotProfileName | undefined;
  if (!raw || !(raw in BOT_PROFILES)) {
    throw new Error(`invalid --profile; use ${Object.keys(BOT_PROFILES).join(", ")}`);
  }
  return raw;
}

const games = Math.max(1, Math.floor(readNumberArg("--games", 10000)));
const baseSeed = Math.floor(readNumberArg("--seed", 20260918));
const profile = readProfile();

const results = Array.from({ length: games }, (_, index) =>
  simulateGame(baseSeed + index, { profile }),
);
const report = createBalanceReport(results);
console.log(`Profile: ${profile}`);
console.log(formatBalanceReport(report));
console.log("\nJSON");
console.log(JSON.stringify({ profile, ...report }, null, 2));
