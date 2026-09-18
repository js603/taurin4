import { describe, expect, it } from "vitest";
import { TrialSession } from "./trialSession";

describe("TrialSession", () => {
  it("finishes 300 seeded sessions through legal night actions and spectator votes", () => {
    const roles = new Set<string>();
    let observed = 0;
    let nights = 0;
    for (let seed = 0; seed < 300; seed++) {
      const session = new TrialSession(seed);
      roles.add(session.getState().playerRole);
      for (let step = 0; step < 200; step++) {
        const state = session.getState();
        if (state.phase === "ended") break;
        const target = state.players.find((p) => p.living && !p.isHuman)!.id;
        const result = (() => {
          switch (state.phase) {
            case "opening-night":
              return session.advanceOpeningNight();
            case "debate":
              return session.beginAccusation();
            case "accusation":
              if (state.observing) {
                observed++;
                return session.observeVote();
              }
              return session.submitAccusation(target);
            case "defendants":
              return session.beginVerdict();
            case "verdict":
              return state.observing
                ? session.observeVote()
                : session.submitVerdict(state.defendants[0]!);
            case "resolution":
              return session.continueAfterVerdict();
            case "night": {
              nights++;
              const before = session.getState();
              expect(session.submitNightAction("invalid").error).not.toBeNull();
              expect(session.getState()).toEqual(before);
              return session.submitNightAction(state.legalNightTargets[0]!);
            }
          }
        })();
        expect(result.error).toBeNull();
      }
      expect(session.getState().phase).toBe("ended");
      expect(session.getState().winner).not.toBeNull();
    }
    expect(roles.size).toBe(4);
    expect(observed).toBeGreaterThan(0);
    expect(nights).toBeGreaterThan(0);
  });

  it("returns isolated snapshots without secret enemy roles", () => {
    const session = new TrialSession(12);
    const state = session.getState();
    expect(state.players.every((player) => !("role" in player))).toBe(true);
    (state.chronicle as string[]).push("tampered");
    expect(session.getState().chronicle).not.toContain("tampered");
  });
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
