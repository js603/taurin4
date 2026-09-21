import { describe, expect, it } from "vitest";
import { Mulberry32 } from "../core/random";
import {
  createOriginalLobby,
  livingOriginalMafia,
  originalMafiaCount,
} from "./gameState";
import { dispatchOriginalAction } from "./engine";
import { buildOriginalPlayerView } from "./playerView";
import { simulateOriginalMany } from "./simulation";
import type { OriginalAction, OriginalGameState } from "./types";

function send(
  state: OriginalGameState,
  action: OriginalAction,
  rng: Mulberry32,
): OriginalGameState {
  const result = dispatchOriginalAction(state, action, rng);
  if (!result.ok) throw new Error(result.error?.code + ": " + result.error?.message);
  return result.state;
}

function started(seed = 1): { state: OriginalGameState; rng: Mulberry32 } {
  const rng = new Mulberry32(seed);
  let state = createOriginalLobby(["A", "B", "C", "D", "E", "F", "G", "H"]);
  for (const player of state.players) {
    state = send(state, { type: "SET_READY", playerId: player.id, ready: true }, rng);
  }
  state = send(state, { type: "START_GAME", playerId: state.hostId }, rng);
  return { state, rng };
}

function reachDay(seed = 1): { state: OriginalGameState; rng: Mulberry32 } {
  const setup = started(seed);
  let state = setup.state;
  for (const player of state.players) {
    if (state.phase !== "ROLE_REVEAL") break;
    state = send(state, { type: "CONFIRM_ROLE", playerId: player.id }, setup.rng);
  }
  for (const player of state.players) {
    if (state.phase !== "SUNRISE") break;
    state = send(state, { type: "CONFIRM_SUNRISE", playerId: player.id }, setup.rng);
  }
  return { state, rng: setup.rng };
}

describe("Original Mafia authoritative core", () => {
  it("uses Davidoff's original Mafia counts", () => {
    expect(originalMafiaCount(6)).toBe(2);
    expect(originalMafiaCount(7)).toBe(2);
    expect(originalMafiaCount(8)).toBe(3);
    expect(originalMafiaCount(10)).toBe(3);
    expect(originalMafiaCount(11)).toBe(4);
    expect(originalMafiaCount(13)).toBe(4);
    expect(originalMafiaCount(14)).toBe(5);
    expect(originalMafiaCount(16)).toBe(5);
  });

  it("assigns only HONEST and MAFIA; 8 players contain 3 Mafia", () => {
    const { state } = started(10);
    expect(livingOriginalMafia(state)).toHaveLength(3);
    expect(new Set(state.players.map((player) => player.role))).toEqual(
      new Set(["HONEST", "MAFIA"]),
    );
  });

  it("reveals Mafia partners only from SUNRISE onward", () => {
    const setup = started(11);
    const mafia = setup.state.players.find((player) => player.role === "MAFIA")!;
    expect(buildOriginalPlayerView(setup.state, mafia.id).mafiaMembers).toBeNull();

    let state = setup.state;
    for (const player of state.players) {
      if (state.phase !== "ROLE_REVEAL") break;
      state = send(state, { type: "CONFIRM_ROLE", playerId: player.id }, setup.rng);
    }

    const sunrise = buildOriginalPlayerView(state, mafia.id);
    expect(sunrise.phase).toBe("SUNRISE");
    expect(sunrise.mafiaMembers).toHaveLength(3);
  });

  it("makes PUBLIC chat an authoritative Day action", () => {
    const { state, rng } = reachDay(20);
    const speaker = state.players[0]!;
    const result = dispatchOriginalAction(
      state,
      {
        type: "SEND_CHAT",
        playerId: speaker.id,
        channel: "PUBLIC",
        text: "나는 4번을 의심합니다.",
      },
      rng,
    );
    expect(result.ok).toBe(true);
    expect(result.state.chat.at(-1)?.text).toBe("나는 4번을 의심합니다.");
  });

  it("allows accusation argument chat and only the accuser can call the guilty vote", () => {
    const setup = reachDay(21);
    let state = setup.state;
    const accuser = state.players[0]!;
    const accused = state.players[1]!;

    state = send(
      state,
      { type: "ACCUSE_PLAYER", playerId: accuser.id, targetId: accused.id },
      setup.rng,
    );
    expect(state.phase).toBe("ACCUSATION");

    state = send(
      state,
      {
        type: "SEND_CHAT",
        playerId: accused.id,
        channel: "PUBLIC",
        text: "반론합니다.",
      },
      setup.rng,
    );

    const wrong = dispatchOriginalAction(
      state,
      { type: "CALL_GUILTY_VOTE", playerId: accused.id },
      setup.rng,
    );
    expect(wrong.ok).toBe(false);
    expect(wrong.error?.code).toBe("NOT_ACCUSER");

    state = send(
      state,
      { type: "CALL_GUILTY_VOTE", playerId: accuser.id },
      setup.rng,
    );
    expect(state.phase).toBe("GUILTY_VOTE");
    expect(state.guiltyVote?.required).toBe(4);
  });

  it("excludes the accused from their own guilty vote and hides executed role", () => {
    const setup = reachDay(22);
    let state = setup.state;
    const accuser = state.players[0]!;
    const accused = state.players[1]!;

    state = send(
      state,
      { type: "ACCUSE_PLAYER", playerId: accuser.id, targetId: accused.id },
      setup.rng,
    );
    state = send(
      state,
      { type: "CALL_GUILTY_VOTE", playerId: accuser.id },
      setup.rng,
    );

    const accusedVote = dispatchOriginalAction(
      state,
      { type: "CAST_GUILTY_VOTE", playerId: accused.id, guilty: false },
      setup.rng,
    );
    expect(accusedVote.ok).toBe(false);
    expect(accusedVote.error?.code).toBe("ACCUSED_CANNOT_VOTE");

    for (const voter of state.players.filter((player) => player.id !== accused.id)) {
      if (state.phase !== "GUILTY_VOTE") break;
      state = send(
        state,
        { type: "CAST_GUILTY_VOTE", playerId: voter.id, guilty: true },
        setup.rng,
      );
    }

    expect(state.phase).toBe("DAY_DISCUSSION");
    expect(state.players.find((player) => player.id === accused.id)?.alive).toBe(false);

    const livingViewer = state.players.find((player) => player.alive)!;
    const view = buildOriginalPlayerView(state, livingViewer.id);
    expect(view.players.find((player) => player.id === accused.id)?.publicRole).toBeNull();
  });

  it("keeps the game running after daytime elimination of the last Mafia", () => {
    const setup = reachDay(23);
    const mafia = setup.state.players.filter((player) => player.role === "MAFIA");
    const state: OriginalGameState = {
      ...setup.state,
      players: setup.state.players.map((player) =>
        mafia.some((candidate) => candidate.id === player.id)
          ? {
              ...player,
              alive: false,
              deathDay: 1,
              deathCause: "EXECUTION" as const,
            }
          : player,
      ),
    };

    expect(state.phase).toBe("DAY_DISCUSSION");
    expect(state.winner).toBeNull();
  });

  it("requires living-player strict majority to enter Mafia Night", () => {
    const setup = reachDay(24);
    let state = send(
      setup.state,
      { type: "PROPOSE_MAFIA_NIGHT", playerId: setup.state.players[0]!.id },
      setup.rng,
    );
    expect(state.nightProposal?.vote.required).toBe(5);

    const living = state.players.filter((player) => player.alive);
    for (let index = 0; index < living.length; index += 1) {
      if (state.phase !== "NIGHT_PROPOSAL_VOTE") break;
      state = send(
        state,
        {
          type: "CAST_NIGHT_PROPOSAL_VOTE",
          playerId: living[index]!.id,
          agree: index < 5,
        },
        setup.rng,
      );
    }
    expect(state.phase).toBe("MAFIA_NIGHT");
  });

  it("requires Honest to submit HONEST and Mafia to submit a living name", () => {
    const setup = reachDay(25);
    let state = send(
      setup.state,
      { type: "PROPOSE_MAFIA_NIGHT", playerId: setup.state.players[0]!.id },
      setup.rng,
    );
    for (const player of state.players.filter((candidate) => candidate.alive)) {
      if (state.phase !== "NIGHT_PROPOSAL_VOTE") break;
      state = send(
        state,
        { type: "CAST_NIGHT_PROPOSAL_VOTE", playerId: player.id, agree: true },
        setup.rng,
      );
    }

    const honest = state.players.find((player) => player.role === "HONEST")!;
    const mafia = state.players.find((player) => player.role === "MAFIA")!;

    const badHonest = dispatchOriginalAction(
      state,
      {
        type: "SUBMIT_NIGHT_NOTE",
        playerId: honest.id,
        note: { kind: "TARGET", targetId: mafia.id },
      },
      setup.rng,
    );
    expect(badHonest.ok).toBe(false);
    expect(badHonest.error?.code).toBe("INVALID_NIGHT_NOTE");

    const badMafia = dispatchOriginalAction(
      state,
      {
        type: "SUBMIT_NIGHT_NOTE",
        playerId: mafia.id,
        note: { kind: "HONEST" },
      },
      setup.rng,
    );
    expect(badMafia.ok).toBe(false);
    expect(badMafia.error?.code).toBe("INVALID_NIGHT_NOTE");
  });

  it("isolates DEAD chat from living PlayerViews", () => {
    const setup = reachDay(26);
    const dead = setup.state.players[0]!;
    const living = setup.state.players[1]!;
    let state: OriginalGameState = {
      ...setup.state,
      players: setup.state.players.map((player) =>
        player.id === dead.id
          ? {
              ...player,
              alive: false,
              deathDay: 1,
              deathCause: "EXECUTION" as const,
            }
          : player,
      ),
    };

    state = send(
      state,
      {
        type: "SEND_CHAT",
        playerId: dead.id,
        channel: "DEAD",
        text: "사망자만 볼 수 있음",
      },
      setup.rng,
    );

    expect(buildOriginalPlayerView(state, dead.id).chat.some((entry) => entry.channel === "DEAD")).toBe(true);
    expect(buildOriginalPlayerView(state, living.id).chat.some((entry) => entry.channel === "DEAD")).toBe(false);
  });

  it("passes a chat-driven simulation sample with no offline intervention", () => {
    const result = simulateOriginalMany(50, 20260921);
    expect(result.completed).toBe(50);
    expect(result.stalled).toBe(0);
    expect(result.illegalActions).toBe(0);
    expect(result.invalidTransitions).toBe(0);
    expect(result.secretLeaks).toBe(0);
    expect(result.chatPolicyViolations).toBe(0);
    expect(result.deadToLivingLeaks).toBe(0);
    expect(result.missingSystemTransitions).toBe(0);
    expect(result.offlineInterventionRequired).toBe(0);
    expect(result.infiniteLoops).toBe(0);
    expect(result.otherFailures).toBe(0);
    expect(result.passed).toBe(true);
  });
});
