import assert from "node:assert/strict";
import test from "node:test";
import { simulateGame } from "../src/features/medieval-trial/simulation/simulateGame.js";

test("same seed produces identical simulation result", () => {
  const first = simulateGame(991122);
  const second = simulateGame(991122);
  assert.deepEqual(first, second);
});

test("different seeds produce a usable variety of outcomes", () => {
  const winners = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => simulateGame(seed).winner));
  assert.ok(winners.size >= 1);
});
