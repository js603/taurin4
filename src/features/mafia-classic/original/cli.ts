import { simulateOriginalMany } from "./simulation.js";

const result = simulateOriginalMany(1000, 20260921);

process.stdout.write(
  [
    "Original Mafia + Chat Gate Results",
    "",
    "Games:                         " + result.games,
    "Completed:                     " + result.completed,
    "Stalled:                       " + result.stalled,
    "",
    "Honest Wins:                   " + result.honestWins,
    "Mafia Wins:                    " + result.mafiaWins,
    "",
    "Illegal Actions:               " + result.illegalActions,
    "Invalid Transitions:           " + result.invalidTransitions,
    "Secret Leaks:                  " + result.secretLeaks,
    "Chat Policy Violations:        " + result.chatPolicyViolations,
    "Dead -> Living Leaks:          " + result.deadToLivingLeaks,
    "Missing System Transitions:    " + result.missingSystemTransitions,
    "Offline Intervention Required: " + result.offlineInterventionRequired,
    "Infinite Loops:                " + result.infiniteLoops,
    "Other Failures:                " + result.otherFailures,
    "",
    "Max Actions:                   " + result.maxActions,
    "Max Days:                      " + result.maxDays,
    "Average Actions:               " + result.averageActions.toFixed(3),
    "",
    result.passed ? "PASS" : "FAIL",
    "",
  ].join("\n"),
);

if (!result.passed) process.exitCode = 1;
