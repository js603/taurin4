import assert from "node:assert/strict";
import test from "node:test";
import {
  createGame,
  resolveNight,
  beginAccusation,
  resolveAccusation,
  beginVerdict,
  resolveVerdict,
} from "../src/features/medieval-trial/application/gameEngine.js";
import { Mulberry32 } from "../src/features/medieval-trial/domain/seededRandom.js";
import {
  BOT_PROFILES,
  createSuspicionLedger,
  chooseNightIntent,
  absorbNightInformation,
  chooseAccusationVotes,
} from "../src/features/medieval-trial/simulation/botPolicy.js";
import { simulateGame } from "../src/features/medieval-trial/simulation/simulateGame.js";

test("murder target does not peek at secret resident roles", () => {
  for (let seed = 0; seed < 200; seed++) {
    const state = createGame(seed, new Mulberry32(seed));
    const investigator = state.players.find((p) => p.role === "investigator")!;
    const commoner = state.players.find((p) => p.role === "commoner")!;
    const altered = {
      ...state,
      players: state.players.map((p) => ({
        ...p,
        role:
          p.id === investigator.id
            ? commoner.role
            : p.id === commoner.id
              ? investigator.role
              : p.role,
      })),
    };
    assert.equal(
      chooseNightIntent(state, new Mulberry32(seed + 1), BOT_PROFILES.baseline).murderTargetId,
      chooseNightIntent(altered, new Mulberry32(seed + 1), BOT_PROFILES.baseline).murderTargetId,
    );
  }
});

test("night bots act on disclosed information and legal constraints", () => {
  const state = createGame(81, new Mulberry32(81));
  const investigator = state.players.find((player) => player.role === "investigator")!;
  const apothecary = state.players.find((player) => player.role === "apothecary")!;
  const ledger = createSuspicionLedger(state, new Mulberry32(82));
  ledger.publicInvestigators.add(investigator.id);
  const intent = chooseNightIntent(
    state,
    new Mulberry32(83),
    { ...BOT_PROFILES.baseline, murdererPowerRoleTargetProbability: 1 },
    ledger,
  );

  assert.equal(intent.murderTargetId, investigator.id);
  assert.equal(intent.protectionTargetId, investigator.id);
  assert.notEqual(intent.investigationTargetId, investigator.id);

  apothecary.lastProtectedTargetId = investigator.id;
  const next = chooseNightIntent(
    state,
    new Mulberry32(83),
    { ...BOT_PROFILES.baseline, murdererPowerRoleTargetProbability: 1 },
    ledger,
  );
  assert.notEqual(next.protectionTargetId, investigator.id);
});

test("evidence is absorbed once and withheld clues stay private", () => {
  const rng = new Mulberry32(10);
  const state = createGame(10, rng);
  const ledger = createSuspicionLedger(state, rng);
  resolveNight(state, chooseNightIntent(state, rng, BOT_PROFILES.baseline), rng);
  const before = new Map(ledger.score);
  const privateConfig = {
    ...BOT_PROFILES.baseline,
    investigatorShareProbability: 0,
    residentTestimonyShareProbability: 0,
    murdererTestimonyShareProbability: 0,
  };
  absorbNightInformation(state, ledger, rng, privateConfig);
  assert.deepEqual(ledger.score, before);
  assert.ok(ledger.privateScores.size > 0);
  const snapshot = structuredClone(ledger);
  absorbNightInformation(state, ledger, rng, privateConfig);
  assert.deepEqual(ledger, snapshot);
});

test("rejects injected voters and forged finalists without state mutation", () => {
  const rng = new Mulberry32(23);
  const state = createGame(23, rng);
  const ledger = createSuspicionLedger(state, rng);
  resolveNight(state, chooseNightIntent(state, rng, BOT_PROFILES.baseline), rng);
  beginAccusation(state);
  const votes = chooseAccusationVotes(state, ledger, rng, BOT_PROFILES.baseline);
  const before = structuredClone(state);
  assert.throws(() => resolveAccusation(state, { ...votes, ghost: "p1" }));
  assert.deepEqual(state, before);
  const result = resolveAccusation(state, votes);
  votes.p1 = "tampered";
  assert.notEqual(state.accusationHistory[0]!.votes.p1, "tampered");
  beginVerdict(state);
  const verdictBefore = structuredClone(state);
  assert.throws(() => resolveVerdict(state, [result.finalists[0], result.finalists[0]], votes));
  assert.deepEqual(state, verdictBefore);
});

test("invalid seeds and simulation limits never fabricate wins", () => {
  assert.throws(() => createGame(NaN, new Mulberry32(0)));
  assert.throws(() => simulateGame(1, { maxDays: 0 }), /no winner fabricated/);
});
