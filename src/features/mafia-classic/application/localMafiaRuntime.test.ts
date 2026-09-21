import { describe, expect, it } from "vitest";
import {
  LocalMafiaRuntime,
  type HumanActionIntent,
  type LocalMafiaSnapshot,
} from "./localMafiaRuntime";

function firstLegalTarget(snapshot: LocalMafiaSnapshot): string {
  const { view, contract } = snapshot;
  const alive = view.players.filter((player) => player.alive);

  switch (contract.targetPolicy) {
    case "ALIVE_PLAYER":
      return alive[0]!.id;
    case "ALIVE_NON_MAFIA": {
      const mafiaIds = new Set(view.mafiaMembers?.map((member) => member.id) ?? []);
      return alive.find((player) => !mafiaIds.has(player.id))!.id;
    }
    case "ALIVE_EXCEPT_SELF":
      return alive.find((player) => player.id !== view.self.id)!.id;
    case "DOCTOR_LEGAL_TARGET":
      return alive.find((player) => player.id !== view.doctorLastProtectedTargetId)!.id;
    case "NOMINEE_OR_NO_EXECUTION":
      return alive.find((player) => view.nominations.includes(player.id))?.id ?? "";
    case "NONE":
      return "";
  }
}

function nextHumanAction(snapshot: LocalMafiaSnapshot): HumanActionIntent | null {
  const actions = snapshot.view.availableActions;

  if (actions.includes("START_GAME")) return { type: "START_GAME" };
  if (actions.includes("SET_READY") && !snapshot.view.self.ready) {
    return { type: "SET_READY", ready: true };
  }
  if (actions.includes("CONFIRM_ROLE")) return { type: "CONFIRM_ROLE" };
  if (actions.includes("CONFIRM_NIGHT_ACTION")) return { type: "CONFIRM_NIGHT_ACTION" };
  if (actions.includes("SELECT_NIGHT_TARGET")) {
    return { type: "SELECT_NIGHT_TARGET", targetId: firstLegalTarget(snapshot) };
  }
  if (actions.includes("CONFIRM_RESULT")) return { type: "CONFIRM_RESULT" };
  if (actions.includes("END_DISCUSSION")) return { type: "END_DISCUSSION" };

  if (actions.includes("END_NOMINATION") && snapshot.view.ownNominationTargetId !== null) {
    return { type: "END_NOMINATION" };
  }
  if (actions.includes("NOMINATE_PLAYER")) {
    return { type: "NOMINATE_PLAYER", targetId: firstLegalTarget(snapshot) };
  }
  if (actions.includes("END_NOMINATION")) return { type: "END_NOMINATION" };

  if (actions.includes("CONFIRM_VOTE")) return { type: "CONFIRM_VOTE" };
  if (actions.includes("SELECT_VOTE")) {
    const targetId = firstLegalTarget(snapshot);
    return { type: "SELECT_VOTE", targetId: targetId || null };
  }

  return null;
}

describe("M3 LocalMafiaRuntime", () => {
  it("keeps GameState behind PlayerView + ScreenContract", () => {
    const runtime = new LocalMafiaRuntime("테스터", 20260921);
    const snapshot = runtime.snapshot();

    expect(snapshot.view.phase).toBe("LOBBY");
    expect(snapshot.contract.id).toBe("LOBBY");
    expect(Object.prototype.hasOwnProperty.call(snapshot, "state")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(snapshot.view, "nightActions")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(snapshot.view, "votes")).toBe(false);
  });

  it("lets bots become ready while the human remains the authoritative starter", () => {
    const runtime = new LocalMafiaRuntime("테스터", 10);
    let snapshot = runtime.snapshot();

    expect(snapshot.view.players.slice(1).every((player) => player.ready)).toBe(true);
    expect(snapshot.view.self.ready).toBe(false);
    expect(snapshot.view.availableActions).toEqual(["SET_READY"]);

    const ready = runtime.act({ type: "SET_READY", ready: true });
    expect(ready.ok).toBe(true);
    snapshot = ready.snapshot;
    expect(snapshot.view.availableActions).toContain("START_GAME");
  });

  it("finishes 20 local M3 sessions using only human intents and bot actions", () => {
    for (let game = 0; game < 20; game += 1) {
      const runtime = new LocalMafiaRuntime("테스터", 1000 + game * 97);
      let snapshot = runtime.snapshot();

      for (let step = 0; step < 200; step += 1) {
        if (snapshot.view.phase === "GAME_OVER") break;

        const intent = nextHumanAction(snapshot);
        if (!intent) {
          throw new Error(
            "M3_LOCAL_STALL: " +
              snapshot.view.phase +
              " / " +
              snapshot.contract.id +
              " / " +
              snapshot.contract.mode,
          );
        }

        const result = runtime.act(intent);
        expect(result.ok, result.errorCode ?? result.errorMessage ?? "action failed").toBe(true);
        snapshot = result.snapshot;
      }

      expect(snapshot.view.phase).toBe("GAME_OVER");
      expect(snapshot.view.winner === "TOWN" || snapshot.view.winner === "MAFIA").toBe(true);
      expect(snapshot.contract.id).toBe("GAME_OVER");
      expect(snapshot.view.availableActions).toEqual([]);
    }
  });
});
