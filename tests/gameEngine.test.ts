import assert from "node:assert/strict";
import test from "node:test";
import {
  beginAccusation,
  beginVerdict,
  createGame,
  resolveAccusation,
  resolveNight,
  resolveVerdict,
  validateProtection,
} from "../src/features/medieval-trial/application/gameEngine.js";
import { Mulberry32 } from "../src/features/medieval-trial/domain/seededRandom.js";
import { checkWinner } from "../src/features/medieval-trial/domain/rules.js";

function setup(seed = 1) {
  const rng = new Mulberry32(seed);
  return { rng, state: createGame(seed, rng) };
}

test("victory requires zero murderers or murderer parity", () => {
  const { state } = setup(3);
  assert.equal(checkWinner(state.players), null);
  const residentsWin = state.players.map((p) => ({ ...p, alive: p.role !== "murderer" }));
  assert.equal(checkWinner(residentsWin), "residents");
  let residents = 0;
  const parity = state.players.map((p) => ({
    ...p,
    alive: p.role === "murderer" || residents++ < 2,
  }));
  assert.equal(checkWinner(parity), "murderers");
});

test("self protection is usable only once even after an intervening night", () => {
  const { state } = setup(5);
  const apothecary = state.players.find((p) => p.role === "apothecary")!;
  validateProtection(state, apothecary.id);
  apothecary.selfProtectionUsed = true;
  apothecary.lastProtectedTargetId = state.players.find((p) => p.id !== apothecary.id)!.id;
  assert.throws(() => validateProtection(state, apothecary.id), /already been used/);
});

test("v0.1 distributes 2/1/1/4 roles", () => {
  const { state } = setup(3);
  const counts = new Map<string, number>();
  for (const player of state.players) counts.set(player.role, (counts.get(player.role) ?? 0) + 1);
  assert.equal(counts.get("murderer"), 2);
  assert.equal(counts.get("investigator"), 1);
  assert.equal(counts.get("apothecary"), 1);
  assert.equal(counts.get("commoner"), 4);
});

test("prologue attack never kills", () => {
  const { state, rng } = setup(10);
  const murderer = state.players.find((p) => p.role === "murderer")!;
  const apothecary = state.players.find((p) => p.role === "apothecary")!;
  const target = state.players.find((p) => p.role !== "murderer" && p.id !== apothecary.id)!;
  const protection = state.players.find(
    (p) => p.id !== target.id && p.id !== apothecary.lastProtectedTargetId,
  )!;

  const result = resolveNight(
    state,
    {
      murderTargetId: target.id,
      investigationTargetId: murderer.id,
      protectionTargetId: protection.id,
    },
    rng,
  );

  assert.equal(result.prologue, true);
  assert.equal(result.killedPlayerId, null);
  assert.equal(target.alive, true);
});

test("apothecary blocks a normal night murder", () => {
  const { state, rng } = setup(15);
  const investigator = state.players.find((p) => p.role === "investigator")!;
  const apothecary = state.players.find((p) => p.role === "apothecary")!;
  const target = state.players.find((p) => p.role === "commoner")!;
  const other = state.players.find((p) => p.role === "commoner" && p.id !== target.id)!;

  resolveNight(
    state,
    {
      murderTargetId: target.id,
      investigationTargetId: other.id,
      protectionTargetId: other.id,
    },
    rng,
  );
  state.phase = "night";

  const result = resolveNight(
    state,
    {
      murderTargetId: target.id,
      investigationTargetId: target.id === investigator.id ? other.id : target.id,
      protectionTargetId: target.id,
    },
    rng,
  );

  assert.equal(result.murderPrevented, true);
  assert.equal(result.killedPlayerId, null);
  assert.equal(target.alive, true);
  void apothecary;
});

test("same target cannot be protected on consecutive nights", () => {
  const { state, rng } = setup(22);
  state.phase = "night";
  const investigator = state.players.find((p) => p.role === "investigator")!;
  const target = state.players.find((p) => p.role === "commoner")!;
  const murderTarget = state.players.find((p) => p.role === "commoner" && p.id !== target.id)!;
  resolveNight(
    state,
    {
      murderTargetId: murderTarget.id,
      investigationTargetId: target.id === investigator.id ? murderTarget.id : target.id,
      protectionTargetId: target.id,
    },
    rng,
  );
  state.phase = "night";
  assert.throws(() => validateProtection(state, target.id), /consecutive/);
});

test("preparation night preserves protection resources and gives binary faction information", () => {
  const { state, rng } = setup(17);
  const apothecary = state.players.find((p) => p.role === "apothecary")!;
  const murderer = state.players.find((p) => p.role === "murderer")!;
  const result = resolveNight(
    state,
    {
      murderTargetId: apothecary.id,
      investigationTargetId: murderer.id,
      protectionTargetId: apothecary.id,
    },
    rng,
  );
  assert.equal(apothecary.selfProtectionUsed, false);
  assert.equal(apothecary.lastProtectedTargetId, null);
  assert.equal(result.investigation?.targetIsMurderer, true);
  assert.deepEqual(result.testimonies, []);
});

test("a plurality without a living majority cannot execute", () => {
  const { state } = setup(19);
  state.phase = "accusation";
  const accused = resolveAccusation(
    state,
    Object.fromEntries(state.players.map((p, i) => [p.id, i === 0 ? "p2" : "p1"])),
  );
  beginVerdict(state);
  const votes = Object.fromEntries(
    state.players.map((p, i) => [p.id, i < 4 ? accused.finalists[0] : "pardon"]),
  );
  const result = resolveVerdict(state, accused.finalists, votes);
  assert.equal(result.tied, false);
  assert.equal(result.eliminatedPlayerId, null);
  assert.equal(state.players.filter((p) => p.alive).length, 8);
});

test("tied verdict eliminates nobody", () => {
  const { state, rng } = setup(44);
  const investigator = state.players.find((p) => p.role === "investigator")!;
  const apothecary = state.players.find((p) => p.role === "apothecary")!;
  const murderTarget = state.players.find((p) => p.role === "commoner")!;
  const protectTarget = state.players.find((p) => p.id !== murderTarget.id)!;
  const investigationTarget = state.players.find((p) => p.id !== investigator.id)!;

  resolveNight(
    state,
    {
      murderTargetId: murderTarget.id,
      investigationTargetId: investigationTarget.id,
      protectionTargetId:
        protectTarget.id === apothecary.lastProtectedTargetId ? apothecary.id : protectTarget.id,
    },
    rng,
  );
  state.phase = "discussion";
  beginAccusation(state);

  const living = state.players.filter((p) => p.alive);
  const first = living[0]!;
  const second = living[1]!;
  const accusationVotes = Object.fromEntries(
    living.map((p, i) => [p.id, i % 2 === 0 ? first.id : second.id]),
  );
  if (accusationVotes[first.id] === first.id) accusationVotes[first.id] = second.id;
  if (accusationVotes[second.id] === second.id) accusationVotes[second.id] = first.id;
  const accusation = resolveAccusation(state, accusationVotes);
  beginVerdict(state);

  const finalists = accusation.finalists;
  const verdictVotes: Record<string, string> = {};
  living.forEach((p, index) => {
    verdictVotes[p.id] = index < living.length / 2 ? finalists[0] : finalists[1];
  });
  const result = resolveVerdict(state, finalists, verdictVotes);
  assert.equal(result.tied, true);
  assert.equal(result.eliminatedPlayerId, null);
});
