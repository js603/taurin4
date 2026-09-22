import { describe, expect, it } from "vitest";
import { createInitialGameState, reduceGame } from "./simulation";

describe("idea2 game simulation", () => {
  it("compresses travel and interrupts it with an encounter", () => {
    let state = createInitialGameState();
    state = reduceGame(state, {
      type: "START_TRAVEL",
      destinationId: "abandoned-camp",
    });

    state = reduceGame(state, { type: "TICK", elapsedMs: 1_700 });

    expect(state.phase).toBe("encounter");
    expect(state.travel?.encounterTriggered).toBe(true);
  });

  it("creates a telegraph after three rapid attacks", () => {
    let state = createInitialGameState();
    state = reduceGame(state, {
      type: "START_TRAVEL",
      destinationId: "old-hunt-trail",
    });
    state = reduceGame(state, { type: "TICK", elapsedMs: 1_700 });
    state = reduceGame(state, { type: "INVESTIGATE_ENCOUNTER" });

    state = reduceGame(state, { type: "ATTACK" });
    state = reduceGame(state, { type: "ATTACK" });
    state = reduceGame(state, { type: "ATTACK" });

    expect(state.phase).toBe("combat");
    expect(state.combat?.telegraphRemainingMs).toBe(1_800);
  });

  it("rewards a perfect evade with a counter opportunity", () => {
    let state = createInitialGameState();
    state = reduceGame(state, {
      type: "START_TRAVEL",
      destinationId: "old-hunt-trail",
    });
    state = reduceGame(state, { type: "TICK", elapsedMs: 1_700 });
    state = reduceGame(state, { type: "INVESTIGATE_ENCOUNTER" });
    state = reduceGame(state, { type: "ATTACK" });
    state = reduceGame(state, { type: "ATTACK" });
    state = reduceGame(state, { type: "ATTACK" });
    state = reduceGame(state, { type: "DODGE" });

    expect(state.combat?.vulnerable).toBe(true);

    state = reduceGame(state, { type: "COUNTER" });

    expect(state.phase).toBe("reward");
    expect(state.reward?.items.length).toBeGreaterThan(0);
  });
});
