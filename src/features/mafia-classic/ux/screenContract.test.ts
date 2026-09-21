import { describe, expect, it } from "vitest";
import type { PlayerView } from "../core/playerView";
import type { GameAction, GamePhase, Role } from "../core/types";
import {
  assertScreenContract,
  buildScreenContract,
  type ScreenId,
} from "./screenContract";

const ALL_ACTIONS: readonly GameAction["type"][] = [
  "SET_READY",
  "START_GAME",
  "CONFIRM_ROLE",
  "SELECT_NIGHT_TARGET",
  "CONFIRM_NIGHT_ACTION",
  "CONFIRM_RESULT",
  "END_DISCUSSION",
  "NOMINATE_PLAYER",
  "END_NOMINATION",
  "SELECT_VOTE",
  "CONFIRM_VOTE",
] as const;

function makeView(
  phase: GamePhase,
  options: {
    role?: Role | null;
    alive?: boolean;
    actions?: readonly GameAction["type"][];
    winner?: PlayerView["winner"];
  } = {},
): PlayerView {
  const role = options.role ?? "CITIZEN";
  return {
    gameId: "m2-contract-test",
    revision: 1,
    phase,
    day: 2,
    night: 2,
    winner: options.winner ?? null,
    self: {
      id: "p1",
      name: "Tester",
      alive: options.alive ?? true,
      ready: true,
      role,
      alignment: role === "MAFIA" ? "MAFIA" : role ? "TOWN" : null,
      roleConfirmed: phase !== "ROLE_REVEAL" || !(options.actions ?? []).includes("CONFIRM_ROLE"),
    },
    players: [
      {
        id: "p1",
        name: "Tester",
        alive: options.alive ?? true,
        ready: true,
        connected: true,
        publicRole: phase === "GAME_OVER" ? role : null,
        deathCause: options.alive === false ? "EXECUTION" : null,
        deathDay: options.alive === false ? 1 : null,
      },
      {
        id: "p2",
        name: "Other",
        alive: true,
        ready: true,
        connected: true,
        publicRole: phase === "GAME_OVER" ? "CITIZEN" : null,
        deathCause: null,
        deathDay: null,
      },
    ],
    mafiaMembers:
      role === "MAFIA"
        ? [
            { id: "p1", name: "Tester" },
            { id: "p3", name: "Partner" },
          ]
        : null,
    detectiveHistory: role === "DETECTIVE" ? [] : null,
    doctorLastProtectedTargetId: role === "DOCTOR" ? "p2" : null,
    ownNightTargetId: null,
    mafiaNightProgress: role === "MAFIA" ? { confirmed: 0, total: 2 } : null,
    nominations: ["p2"],
    ownNominationTargetId: null,
    ownVoteTargetId: null,
    voteProgress: phase === "DAY_VOTE" ? { confirmed: 0, total: 2 } : null,
    voteResult:
      phase === "VOTE_RESULT" || phase === "EXECUTION" || phase === "GAME_OVER"
        ? { tally: { p2: 2 }, executionTargetId: "p2" }
        : null,
    publicEvents: [],
    availableActions: options.actions ?? [],
  };
}

function assertComplete(view: PlayerView, expectedId: ScreenId): void {
  const contract = buildScreenContract(view);
  expect(contract.id).toBe(expectedId);
  expect(() => assertScreenContract(view, contract)).not.toThrow();

  const allowed = [...contract.primaryActions, ...contract.secondaryActions];
  expect(new Set(allowed).size).toBe(allowed.length);
  expect(allowed.length + contract.forbiddenActions.length).toBe(ALL_ACTIONS.length);

  for (const action of ALL_ACTIONS) {
    expect(allowed.includes(action) || contract.forbiddenActions.includes(action)).toBe(true);
  }
}

describe("M2 Screen Contracts", () => {
  it("covers role reveal action and waiting variants", () => {
    assertComplete(makeView("ROLE_REVEAL", { actions: ["CONFIRM_ROLE"] }), "ROLE_REVEAL");

    const waiting = buildScreenContract(makeView("ROLE_REVEAL"));
    expect(waiting.id).toBe("ROLE_REVEAL");
    expect(waiting.mode).toBe("WAITING");
    expect(waiting.waiting.kind).toBe("OTHER_PLAYERS");
  });

  it.each([
    ["CITIZEN", [], "NIGHT_CITIZEN_WAIT"],
    ["DOCTOR", ["SELECT_NIGHT_TARGET", "CONFIRM_NIGHT_ACTION"], "NIGHT_DOCTOR"],
    ["DETECTIVE", ["SELECT_NIGHT_TARGET", "CONFIRM_NIGHT_ACTION"], "NIGHT_DETECTIVE"],
    ["MAFIA", ["SELECT_NIGHT_TARGET", "CONFIRM_NIGHT_ACTION"], "NIGHT_MAFIA"],
  ] as const)("maps NIGHT_ACTION %s to its role contract", (role, actions, id) => {
    assertComplete(makeView("NIGHT_ACTION", { role, actions }), id);
  });

  it.each(["DOCTOR", "DETECTIVE", "MAFIA"] as const)(
    "turns confirmed %s night action into waiting",
    (role) => {
      const contract = buildScreenContract(makeView("NIGHT_ACTION", { role, actions: [] }));
      expect(contract.mode).toBe("WAITING");
      expect(contract.waiting.kind).toBe("OTHER_PLAYERS");
      expect(contract.primaryActions).toEqual([]);
    },
  );

  it("defines DAWN as a public result acknowledgement screen", () => {
    const active = buildScreenContract(makeView("DAWN", { actions: ["CONFIRM_RESULT"] }));
    expect(active.id).toBe("DAWN");
    expect(active.mode).toBe("RESULT");
    expect(active.primaryActions).toEqual(["CONFIRM_RESULT"]);

    const waiting = buildScreenContract(makeView("DAWN"));
    expect(waiting.waiting.active).toBe(true);
  });

  it("gives only the host-style view an END_DISCUSSION action", () => {
    assertComplete(
      makeView("DAY_DISCUSSION", { actions: ["END_DISCUSSION"] }),
      "DAY_DISCUSSION",
    );
    const waiting = buildScreenContract(makeView("DAY_DISCUSSION"));
    expect(waiting.mode).toBe("WAITING");
    expect(waiting.waiting.kind).toBe("HOST");
  });

  it("supports nomination selection and host close as separate contract actions", () => {
    const participant = buildScreenContract(
      makeView("NOMINATION", { actions: ["NOMINATE_PLAYER"] }),
    );
    expect(participant.primaryActions).toEqual(["NOMINATE_PLAYER"]);
    expect(participant.secondaryActions).toEqual([]);

    const host = buildScreenContract(
      makeView("NOMINATION", {
        actions: ["NOMINATE_PLAYER", "END_NOMINATION"],
      }),
    );
    expect(host.primaryActions).toEqual(["NOMINATE_PLAYER"]);
    expect(host.secondaryActions).toEqual(["END_NOMINATION"]);
    expect(host.targetPolicy).toBe("ALIVE_PLAYER");
  });

  it("supports vote selection/change/confirm and then becomes waiting", () => {
    const voting = buildScreenContract(
      makeView("DAY_VOTE", {
        actions: ["SELECT_VOTE", "CONFIRM_VOTE"],
      }),
    );
    expect(voting.id).toBe("DAY_VOTE");
    expect(voting.targetPolicy).toBe("NOMINEE_OR_NO_EXECUTION");
    expect(voting.primaryActions).toEqual(["SELECT_VOTE", "CONFIRM_VOTE"]);

    const confirmed = buildScreenContract(makeView("DAY_VOTE"));
    expect(confirmed.mode).toBe("WAITING");
    expect(confirmed.waiting.kind).toBe("OTHER_PLAYERS");
  });

  it.each([
    ["VOTE_RESULT", "VOTE_RESULT"],
    ["EXECUTION", "EXECUTION"],
  ] as const)("defines %s as a result contract", (phase, id) => {
    assertComplete(makeView(phase, { actions: ["CONFIRM_RESULT"] }), id);
  });

  it("makes every dead player a passive spectator before GAME_OVER", () => {
    const phases: GamePhase[] = [
      "NIGHT_ACTION",
      "DAWN",
      "DAY_DISCUSSION",
      "NOMINATION",
      "DAY_VOTE",
      "VOTE_RESULT",
      "EXECUTION",
    ];

    for (const phase of phases) {
      const view = makeView(phase, { alive: false, actions: [] });
      const contract = buildScreenContract(view);
      expect(contract.id).toBe("DEAD_PLAYER");
      expect(contract.primaryActions).toEqual([]);
      expect(contract.secondaryActions).toEqual([]);
      expect(contract.waiting.kind).toBe("SPECTATING");
      expect(() => assertScreenContract(view, contract)).not.toThrow();
    }
  });

  it("defines automatic engine phases without user actions", () => {
    const phases: GamePhase[] = [
      "ROLE_ASSIGNMENT",
      "NIGHT_START",
      "NIGHT_RESOLVE",
      "WIN_CHECK",
    ];

    for (const phase of phases) {
      const contract = buildScreenContract(makeView(phase));
      expect(contract.id).toBe("ENGINE_TRANSITION");
      expect(contract.mode).toBe("ENGINE");
      expect(contract.primaryActions).toEqual([]);
      expect(contract.secondaryActions).toEqual([]);
    }
  });

  it("defines GAME_OVER as terminal with all game actions forbidden", () => {
    const view = makeView("GAME_OVER", { winner: "TOWN" });
    const contract = buildScreenContract(view);
    expect(contract.id).toBe("GAME_OVER");
    expect(contract.mode).toBe("TERMINAL");
    expect(contract.forbiddenActions).toEqual(ALL_ACTIONS);
    expect(contract.waiting.kind).toBe("GAME_OVER");
  });

  it("rejects an unexpected action exposed by PlayerView", () => {
    const invalid = makeView("NIGHT_ACTION", {
      role: "CITIZEN",
      actions: ["CONFIRM_VOTE"],
    });
    expect(() => buildScreenContract(invalid)).toThrow(/SCREEN_CONTRACT_UNEXPECTED_ACTION/);
  });

  it("is total for all user-visible stable phases", () => {
    const matrix: readonly [GamePhase, Role, readonly GameAction["type"][]][] = [
      ["LOBBY", "CITIZEN", ["SET_READY"]],
      ["ROLE_REVEAL", "CITIZEN", ["CONFIRM_ROLE"]],
      ["NIGHT_ACTION", "CITIZEN", []],
      ["NIGHT_ACTION", "DOCTOR", ["SELECT_NIGHT_TARGET", "CONFIRM_NIGHT_ACTION"]],
      ["NIGHT_ACTION", "DETECTIVE", ["SELECT_NIGHT_TARGET", "CONFIRM_NIGHT_ACTION"]],
      ["NIGHT_ACTION", "MAFIA", ["SELECT_NIGHT_TARGET", "CONFIRM_NIGHT_ACTION"]],
      ["DAWN", "CITIZEN", ["CONFIRM_RESULT"]],
      ["DAY_DISCUSSION", "CITIZEN", []],
      ["NOMINATION", "CITIZEN", ["NOMINATE_PLAYER"]],
      ["DAY_VOTE", "CITIZEN", ["SELECT_VOTE", "CONFIRM_VOTE"]],
      ["VOTE_RESULT", "CITIZEN", ["CONFIRM_RESULT"]],
      ["EXECUTION", "CITIZEN", ["CONFIRM_RESULT"]],
      ["GAME_OVER", "CITIZEN", []],
    ];

    for (const [phase, role, actions] of matrix) {
      const view = makeView(phase, {
        role,
        actions,
        winner: phase === "GAME_OVER" ? "TOWN" : null,
      });
      expect(() => assertScreenContract(view, buildScreenContract(view))).not.toThrow();
    }
  });
});
