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
              return session.advanceOpeningNight(state.legalNightTargets[0]);
            case "dawn":
              return session.beginDiscussion();
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

    expect(session.advanceOpeningNight(session.getState().legalNightTargets[0]).state.phase).toBe(
      "dawn",
    );
    expect(session.beginDiscussion().state.phase).toBe("debate");
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
      session.advanceOpeningNight(session.getState().legalNightTargets[0]);
      session.beginDiscussion();
      session.beginAccusation();
      const accusation = session.submitAccusation("p1");
      session.beginVerdict();
      return session.submitVerdict(accusation.state.defendants[0]!).state;
    }

    expect(firstDay(91)).toEqual(firstDay(91));
  });

  it("keeps human investigations private until an explicit, irreversible daily claim", () => {
    let session = new TrialSession(0);
    for (let seed = 1; session.getState().playerRole !== "investigator"; seed++)
      session = new TrialSession(seed);
    const target = session.getState().legalNightTargets[0]!;
    expect(session.advanceOpeningNight().error).not.toBeNull();
    const dawn = session.advanceOpeningNight(target).state;
    expect(dawn.privateNotes).toHaveLength(1);
    expect(dawn.testimonies.some((t) => t.speakerId === dawn.playerId)).toBe(false);
    session.beginDiscussion();
    expect(session.claimInvestigation(target, true).error).toBeNull();
    const before = session.getState();
    expect(session.claimInvestigation(target, false).error).not.toBeNull();
    expect(session.getState()).toEqual(before);
    expect(before.testimonies.find((t) => t.speakerId === before.playerId)?.text).toContain(
      "사칭 가능",
    );
  });

  it("publishes frozen accusations and complete ballots, and permits pardon", () => {
    const session = new TrialSession(7, "새이름");
    expect(session.getState().players.find((p) => p.isHuman)?.name).toBe("새이름");
    expect(session.getState().openingAttack.targetId).toBe("");
    session.advanceOpeningNight(session.getState().legalNightTargets[0]);
    session.beginDiscussion();
    const announced = session.beginAccusation().state;
    expect(announced.accusations).toHaveLength(7);
    expect(session.getState()).toEqual(announced);
    const result = session.submitAccusation("p1").state;
    expect(result.ballotRecords).toHaveLength(8);
    expect(result.defenses[result.defendants[0]!]).toContain("표를 받았습니다");
    session.beginVerdict();
    const verdict = session.submitVerdict("pardon");
    expect(verdict.error).toBeNull();
    expect(verdict.state.ballotRecords).toHaveLength(16);
    expect(verdict.state.ballotRecords.some((line) => line.includes("새이름 → 처형 보류"))).toBe(
      true,
    );
  });
});
