import { describe, expect, it } from "vitest";
import {
  acknowledgeRole,
  accusePlayer,
  beginVerdictVote,
  completeSunrise,
  continueAfterNight,
  continueAfterVerdict,
  createSoloMafiaSession,
  humanIsAlive,
  humanStatement,
  legalHumanNightTargets,
  letBotAccuse,
  proposeNight,
  resolveNightProposal,
  resolveVerdictVote,
  submitHumanDefense,
  submitNightNote,
  type SoloMafiaSession,
} from "./soloSession";

function toDiscussion(seed = 20260921): SoloMafiaSession {
  return completeSunrise(acknowledgeRole(createSoloMafiaSession("테스터", 6, seed)));
}

describe("solo Mafia session", () => {
  it("boots into a playable discussion with AI dialogue", () => {
    const state = toDiscussion();
    expect(state.phase).toBe("discussion");
    expect(state.talk.length).toBeGreaterThanOrEqual(4);
    expect(state.core.players).toHaveLength(6);
    expect(state.core.players.filter((player) => player.alive)).toHaveLength(6);
  });

  it("lets the human speak and creates bot reactions", () => {
    const state = toDiscussion();
    const target = state.core.players.find((player) => player.id !== state.humanId)!;
    const next = humanStatement(state, target.id, "suspect");
    expect(next.talk.length).toBeGreaterThan(state.talk.length);
    expect(next.publicSuspicion[target.id]).toBeGreaterThan(state.publicSuspicion[target.id] ?? 0);
  });

  it("has an explicit accusation -> defense -> vote -> verdict flow", () => {
    const state = toDiscussion();
    const target = state.core.players.find((player) => player.id !== state.humanId)!;
    const accused = accusePlayer(state, target.id);
    expect(accused.phase).toBe("defense");
    expect(accused.pendingAccusedId).toBe(target.id);

    const vote = beginVerdictVote(accused);
    expect(vote.phase).toBe("vote");

    const verdict = resolveVerdictVote(vote, false);
    expect(["verdict", "ended"]).toContain(verdict.phase);
    expect(verdict.lastVote?.accusedId).toBe(target.id);
    expect(verdict.lastVote?.eligibleVotes).toBe(5);
  });

  it("supports a bot accusation against the human and excludes the accused from voting", () => {
    let state = toDiscussion(17);

    for (let attempt = 0; attempt < 20 && state.pendingAccusedId !== state.humanId; attempt += 1) {
      state = letBotAccuse({ ...state, phase: "discussion" });
      if (state.pendingAccusedId !== state.humanId) {
        state = { ...state, phase: "discussion", pendingAccuserId: null, pendingAccusedId: null };
      }
    }

    if (state.pendingAccusedId === state.humanId) {
      const defended = submitHumanDefense(state, "deny");
      const vote = beginVerdictVote(defended);
      const verdict = resolveVerdictVote(vote, null);
      expect(verdict.lastVote?.eligibleVotes).toBe(5);
    } else {
      expect(state.phase).toBe("discussion");
    }
  });

  it("can resolve a passed Mafia Night and return to discussion when the game continues", () => {
    const state = toDiscussion(31);
    const proposed = proposeNight(state);
    const forcedPass: SoloMafiaSession = {
      ...proposed,
      pendingBotNightVotes: Object.fromEntries(
        proposed.core.players
          .filter((player) => player.alive && player.id !== proposed.humanId)
          .map((player) => [player.id, true]),
      ),
    };

    const night = resolveNightProposal(forcedPass, true);
    expect(night.phase).toBe("night-note");

    const target =
      legalHumanNightTargets(night)[0]?.id ??
      night.core.players.find((player) => player.alive && player.id !== night.humanId)?.id ??
      null;
    const result = submitNightNote(night, target);

    expect(["night-result", "ended"]).toContain(result.phase);
    expect(result.lastNight).not.toBeNull();

    if (result.phase === "night-result") {
      const nextDay = continueAfterNight(result);
      expect(nextDay.phase).toBe("discussion");
      expect(nextDay.core.day).toBeGreaterThanOrEqual(2);
    }
  });

  it("allows a dead human to keep observing bot-driven play", () => {
    let state = toDiscussion(73);
    const human = state.core.players.find((player) => player.id === state.humanId)!;
    state = {
      ...state,
      core: {
        ...state.core,
        players: state.core.players.map((player) =>
          player.id === human.id ? { ...player, alive: false } : player,
        ),
      },
    };

    expect(humanIsAlive(state)).toBe(false);
    const accusation = letBotAccuse(state);
    expect(accusation.phase).toBe("defense");
  });

  it("can continue after a non-terminal verdict", () => {
    const state = toDiscussion(91);
    const target = state.core.players.find((player) => player.id !== state.humanId)!;
    const accused = accusePlayer(state, target.id);
    const vote = beginVerdictVote(accused);
    const verdict = resolveVerdictVote(vote, false);

    if (verdict.phase === "verdict") {
      const next = continueAfterVerdict(verdict);
      expect(next.phase).toBe("discussion");
      expect(next.pendingAccusedId).toBeNull();
    }
  });
});
