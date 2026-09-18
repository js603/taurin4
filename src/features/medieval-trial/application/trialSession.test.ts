import { describe, expect, it } from "vitest";
import { TrialSession } from "./trialSession";

describe("TrialSession", () => {
  it("keeps the opening attack deterministic and non-lethal", () => {
    const first = new TrialSession(20260918).getState();
    const second = new TrialSession(20260918).getState();

    expect(first.openingAttack).toEqual(second.openingAttack);
    expect(first.players).toEqual(second.players);
    expect(first.players.every((player) => player.living)).toBe(true);
  });

  it("moves through debate, accusation, defendants, and verdict", () => {
    const session = new TrialSession(7);

    expect(session.advanceOpeningNight().state.phase).toBe("debate");
    expect(session.beginAccusation().state.phase).toBe("accusation");
    const accusation = session.submitAccusation("p1");
    expect(accusation.error).toBeNull();
    expect(accusation.state.phase).toBe("defendants");
    expect(accusation.state.defendants).toHaveLength(2);

    expect(session.beginVerdict().state.phase).toBe("verdict");
    const verdict = session.submitVerdict(accusation.state.defendants[0]!);
    expect(verdict.error).toBeNull();
    expect(verdict.state.phase).toBe("resolution");
    expect(verdict.state.resolution).not.toBeNull();
  });

  it("rejects out-of-order intents without changing the phase", () => {
    const session = new TrialSession(11);
    const result = session.submitAccusation("p1");

    expect(result.error).toContain("고발");
    expect(result.state.phase).toBe("opening-night");
  });

  it("reproduces the complete first-day result for the same seed", () => {
    function firstDay(seed: number) {
      const session = new TrialSession(seed);
      session.advanceOpeningNight();
      session.beginAccusation();
      const accusation = session.submitAccusation("p1");
      session.beginVerdict();
      return session.submitVerdict(accusation.state.defendants[0]!).state;
    }

    expect(firstDay(91)).toEqual(firstDay(91));
  });
});
