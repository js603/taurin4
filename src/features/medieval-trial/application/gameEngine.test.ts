import { describe, expect, it } from "vitest";
import { GameEngine } from "./gameEngine";

describe("GameEngine", () => {
  it("keeps the opening attack deterministic and non-lethal", () => {
    const first = new GameEngine(20260918).getState();
    const second = new GameEngine(20260918).getState();

    expect(first.openingAttack).toEqual(second.openingAttack);
    expect(first.players).toEqual(second.players);
    expect(first.players.every((player) => player.living)).toBe(true);
  });

  it("moves through debate, accusation, defendants, and verdict", () => {
    const engine = new GameEngine(7);

    expect(engine.advanceOpeningNight().state.phase).toBe("debate");
    expect(engine.beginAccusation().state.phase).toBe("accusation");
    const accusation = engine.submitAccusation("rowan");
    expect(accusation.error).toBeNull();
    expect(accusation.state.phase).toBe("defendants");
    expect(accusation.state.defendants).toHaveLength(2);

    expect(engine.beginVerdict().state.phase).toBe("verdict");
    const verdict = engine.submitVerdict(accusation.state.defendants[0]!);
    expect(verdict.error).toBeNull();
    expect(verdict.state.phase).toBe("resolution");
    expect(verdict.state.resolution).not.toBeNull();
  });

  it("rejects out-of-order intents without changing the phase", () => {
    const engine = new GameEngine(11);

    const result = engine.submitAccusation("rowan");

    expect(result.error).toContain("고발");
    expect(result.state.phase).toBe("opening-night");
  });

  it("uses the same seed to reproduce the full first-day result", () => {
    function firstDay(seed: number) {
      const engine = new GameEngine(seed);
      engine.advanceOpeningNight();
      engine.beginAccusation();
      const accusation = engine.submitAccusation("rowan");
      engine.beginVerdict();
      return engine.submitVerdict(accusation.state.defendants[0]!).state;
    }

    expect(firstDay(91)).toEqual(firstDay(91));
  });
});
