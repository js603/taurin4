import { describe, expect, it } from "vitest";
import {
  LocalMafiaRuntime,
  type HumanActionIntent,
  type LocalMafiaSnapshot,
} from "./localMafiaRuntime";

function firstLivingOther(snapshot: LocalMafiaSnapshot): string {
  return snapshot.view.players.find(
    (player) => player.alive && player.id !== snapshot.view.self.id,
  )!.id;
}

function firstNightTarget(snapshot: LocalMafiaSnapshot): string {
  const mafiaIds = new Set(snapshot.view.mafiaMembers?.map((member) => member.id) ?? []);
  return snapshot.view.players.find(
    (player) => player.alive && !mafiaIds.has(player.id),
  )!.id;
}

function nextHumanAction(snapshot: LocalMafiaSnapshot): HumanActionIntent | null {
  const { view } = snapshot;
  const actions = view.availableActions;

  if (actions.includes("START_GAME")) return { type: "START_GAME" };
  if (actions.includes("SET_READY") && !view.self.ready) {
    return { type: "SET_READY", ready: true };
  }
  if (actions.includes("CONFIRM_ROLE")) return { type: "CONFIRM_ROLE" };
  if (actions.includes("CONFIRM_SUNRISE")) return { type: "CONFIRM_SUNRISE" };

  if (actions.includes("CALL_GUILTY_VOTE")) {
    return { type: "CALL_GUILTY_VOTE" };
  }
  if (actions.includes("CAST_GUILTY_VOTE")) {
    return { type: "CAST_GUILTY_VOTE", guilty: true };
  }
  if (actions.includes("CAST_NIGHT_PROPOSAL_VOTE")) {
    return { type: "CAST_NIGHT_PROPOSAL_VOTE", agree: true };
  }
  if (actions.includes("SUBMIT_NIGHT_NOTE")) {
    return view.self.role === "MAFIA"
      ? {
          type: "SUBMIT_NIGHT_NOTE",
          note: { kind: "TARGET", targetId: firstNightTarget(snapshot) },
        }
      : { type: "SUBMIT_NIGHT_NOTE", note: { kind: "HONEST" } };
  }

  if (view.phase === "DAY_DISCUSSION" && actions.includes("SEND_CHAT")) {
    if (view.day % 2 === 1 && actions.includes("PROPOSE_MAFIA_NIGHT")) {
      return { type: "PROPOSE_MAFIA_NIGHT" };
    }
    if (actions.includes("ACCUSE_PLAYER")) {
      return { type: "ACCUSE_PLAYER", targetId: firstLivingOther(snapshot) };
    }
  }

  if (view.phase === "ACCUSATION" && actions.includes("SEND_CHAT")) {
    return {
      type: "SEND_CHAT",
      channel: "PUBLIC",
      text: "고발 근거와 반론을 게임 안에서 확인합니다.",
    };
  }

  if (!view.self.alive && actions.includes("SEND_CHAT")) {
    return {
      type: "SEND_CHAT",
      channel: "DEAD",
      text: "사망자 채팅 테스트",
    };
  }

  return null;
}

describe("Original LocalMafiaRuntime", () => {
  it("keeps authoritative state behind Original PlayerView + ScreenContract", () => {
    const runtime = new LocalMafiaRuntime("테스터", 20260921);
    const snapshot = runtime.snapshot();

    expect(snapshot.view.phase).toBe("LOBBY");
    expect(snapshot.contract.id).toBe("LOBBY");
    expect(Object.prototype.hasOwnProperty.call(snapshot, "state")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(snapshot.view, "nightNotes")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(snapshot.view, "replay")).toBe(false);
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

  it("moves from role reveal through SUNRISE into authoritative DAY chat", () => {
    const runtime = new LocalMafiaRuntime("테스터", 111);
    let snapshot = runtime.snapshot();

    snapshot = runtime.act({ type: "SET_READY", ready: true }).snapshot;
    snapshot = runtime.act({ type: "START_GAME" }).snapshot;
    expect(snapshot.view.phase).toBe("ROLE_REVEAL");

    snapshot = runtime.act({ type: "CONFIRM_ROLE" }).snapshot;
    expect(snapshot.view.phase).toBe("SUNRISE");
    expect(snapshot.contract.id).toBe("SUNRISE");

    snapshot = runtime.act({ type: "CONFIRM_SUNRISE" }).snapshot;
    expect(snapshot.view.phase).toBe("DAY_DISCUSSION");
    expect(snapshot.contract.id).toBe("DAY_CHAT");
    expect(snapshot.view.availableActions).toContain("SEND_CHAT");

    const result = runtime.act({
      type: "SEND_CHAT",
      channel: "PUBLIC",
      text: "게임 내부 채팅으로 의심을 이야기합니다.",
    });
    expect(result.ok).toBe(true);
    expect(result.snapshot.view.chat.some((entry) => entry.text?.includes("게임 내부 채팅"))).toBe(true);
  });

  it("finishes 20 local Original sessions without offline intervention", () => {
    for (let game = 0; game < 20; game += 1) {
      const runtime = new LocalMafiaRuntime("테스터", 1000 + game * 97);
      let snapshot = runtime.snapshot();
      let lastDayActionKey = "";

      for (let step = 0; step < 500; step += 1) {
        if (snapshot.view.phase === "GAME_OVER") break;

        let intent = nextHumanAction(snapshot);

        if (
          snapshot.view.phase === "ACCUSATION" &&
          snapshot.view.accusation?.accuserId === snapshot.view.self.id &&
          snapshot.view.availableActions.includes("CALL_GUILTY_VOTE")
        ) {
          intent = { type: "CALL_GUILTY_VOTE" };
        }

        if (
          snapshot.view.phase === "DAY_DISCUSSION" &&
          snapshot.view.self.alive &&
          snapshot.view.availableActions.includes("PROPOSE_MAFIA_NIGHT")
        ) {
          const key = snapshot.view.day + ":" + snapshot.view.revision;
          if (lastDayActionKey !== key) {
            intent = { type: "PROPOSE_MAFIA_NIGHT" };
            lastDayActionKey = key;
          }
        }

        if (!intent) {
          throw new Error(
            "ORIGINAL_LOCAL_STALL: " +
              snapshot.view.phase +
              " / " +
              snapshot.contract.id +
              " / actions=" +
              snapshot.view.availableActions.join(","),
          );
        }

        const result = runtime.act(intent);
        expect(result.ok, result.errorCode ?? result.errorMessage ?? "action failed").toBe(true);
        snapshot = result.snapshot;
      }

      expect(snapshot.view.phase).toBe("GAME_OVER");
      expect(snapshot.view.winner === "HONEST" || snapshot.view.winner === "MAFIA").toBe(true);
      expect(snapshot.contract.id).toBe("GAME_OVER");
      expect(snapshot.view.availableActions).toEqual([]);
    }
  });
});
