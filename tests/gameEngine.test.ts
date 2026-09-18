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

function setup(seed = 1) {
  const rng = new Mulberry32(seed);
  return { rng, state: createGame(seed, rng) };
}

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
  const protection = state.players.find((p) => p.id !== target.id && p.id !== apothecary.lastProtectedTargetId)!;

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
  const investigator = state.players.find((p) => p.role === "investigator")!;
  const target = state.players.find((p) => p.role === "commoner")!;
  const murderTarget = state.players.find((p) => p.role !== "murderer" && p.id !== target.id)!;
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

test("tied verdict eliminates nobody", () => {
  const { state, rng } = setup(44);
  const investigator = state.players.find((p) => p.role === "investigator")!;
  const apothecary = state.players.find((p) => p.role === "apothecary")!;
  const murderTarget = state.players.find((p) => p.role === "commoner")!;
  const protectTarget = state.players.find((p) => p.id !== murderTarget.id)!;
  const investigationTarget = state.players.find((p) => p.id !== investigator.id)!;

  resolveNight(state, {
    murderTargetId: murderTarget.id,
    investigationTargetId: investigationTarget.id,
    protectionTargetId: protectTarget.id === apothecary.lastProtectedTargetId ? apothecary.id : protectTarget.id,
  }, rng);
  state.phase = "discussion";
  beginAccusation(state);

  const living = state.players.filter((p) => p.alive);
  const first = living[0]!;
  const second = living[1]!;
  const accusationVotes = Object.fromEntries(living.map((p, i) => [p.id, i % 2 === 0 ? first.id : second.id]));
  if (accusationVotes[first.id] === first.id) accusationVotes[first.id] = second.id;
  if (accusationVotes[second.id] === second.id) accusationVotes[second.id] = first.id;
  const accusation = resolveAccusation(state, accusationVotes);
  beginVerdict(state);

  const finalists = accusation.finalists;
  const verdictVotes: Record<string, string> = {};
  living.forEach((p, index) => { verdictVotes[p.id] = index < living.length / 2 ? finalists[0] : finalists[1]; });
  const result = resolveVerdict(state, finalists, verdictVotes);
  assert.equal(result.tied, true);
  assert.equal(result.eliminatedPlayerId, null);
});
