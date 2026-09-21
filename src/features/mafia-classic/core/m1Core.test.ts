import { describe, expect, it } from "vitest";
import { dispatchAction } from "./engine";
import { createLobbyGame } from "./gameState";
import { buildPlayerView } from "./playerView";
import { Mulberry32 } from "./random";
import { calculateWinner, resolveExecution, resolveVote, resolveWinCheck } from "./resolvers";
import type { GameAction, GameState, PlayerState } from "./types";
import { simulateMany } from "../simulation/simulate";

function send(state: GameState, action: GameAction, rng: Mulberry32): GameState {
  const result = dispatchAction(state, action, rng);
  if (!result.ok) throw new Error(result.error?.code + ": " + result.error?.message);
  return result.state;
}

function startEight(seed = 1): { state: GameState; rng: Mulberry32 } {
  const rng = new Mulberry32(seed);
  let state = createLobbyGame(["A", "B", "C", "D", "E", "F", "G", "H"]);
  for (const player of state.players) {
    state = send(state, { type: "SET_READY", playerId: player.id, ready: true }, rng);
  }
  state = send(state, { type: "START_GAME", playerId: state.hostId }, rng);
  return { state, rng };
}

function confirmRoles(state: GameState, rng: Mulberry32): GameState {
  let next = state;
  for (const player of state.players) {
    next = send(next, { type: "CONFIRM_ROLE", playerId: player.id }, rng);
  }
  return next;
}

function role(state: GameState, roleName: PlayerState["role"]): PlayerState {
  return state.players.find((player) => player.role === roleName)!;
}

function livingRole(state: GameState, roleName: PlayerState["role"]): PlayerState | null {
  return state.players.find((player) => player.alive && player.role === roleName) ?? null;
}

function completeNightWithTargets(
  state: GameState,
  rng: Mulberry32,
  mafiaTargetId: string,
  doctorTargetId: string,
  detectiveTargetId: string,
): GameState {
  let next = state;
  for (const mafia of next.players.filter((player) => player.alive && player.role === "MAFIA")) {
    next = send(
      next,
      { type: "SELECT_NIGHT_TARGET", playerId: mafia.id, targetId: mafiaTargetId },
      rng,
    );
    next = send(next, { type: "CONFIRM_NIGHT_ACTION", playerId: mafia.id }, rng);
  }

  const doctor = livingRole(next, "DOCTOR");
  if (doctor && next.phase === "NIGHT_ACTION") {
    next = send(
      next,
      { type: "SELECT_NIGHT_TARGET", playerId: doctor.id, targetId: doctorTargetId },
      rng,
    );
    next = send(next, { type: "CONFIRM_NIGHT_ACTION", playerId: doctor.id }, rng);
  }

  const detective = livingRole(next, "DETECTIVE");
  if (detective && next.phase === "NIGHT_ACTION") {
    next = send(
      next,
      { type: "SELECT_NIGHT_TARGET", playerId: detective.id, targetId: detectiveTargetId },
      rng,
    );
    next = send(next, { type: "CONFIRM_NIGHT_ACTION", playerId: detective.id }, rng);
  }
  return next;
}

function confirmPublicResult(state: GameState, rng: Mulberry32): GameState {
  let next = state;
  const phase = next.phase;
  for (const player of next.players.filter((candidate) => candidate.alive)) {
    if (next.phase !== phase) break;
    next = send(next, { type: "CONFIRM_RESULT", playerId: player.id }, rng);
  }
  return next;
}

describe("M1 Core Engine", () => {
  it("assigns the exact v1 8-player role composition", () => {
    const { state } = startEight(10);
    expect(state.phase).toBe("ROLE_REVEAL");
    const roles = state.players.map((player) => player.role);
    expect(roles.filter((value) => value === "MAFIA")).toHaveLength(2);
    expect(roles.filter((value) => value === "DETECTIVE")).toHaveLength(1);
    expect(roles.filter((value) => value === "DOCTOR")).toHaveLength(1);
    expect(roles.filter((value) => value === "CITIZEN")).toHaveLength(4);
  });

  it("rejects non-8-player start until a role distribution is specified", () => {
    const rng = new Mulberry32(3);
    let state = createLobbyGame(["A", "B", "C", "D", "E"]);
    for (const player of state.players) {
      state = send(state, { type: "SET_READY", playerId: player.id, ready: true }, rng);
    }
    const result = dispatchAction(state, { type: "START_GAME", playerId: state.hostId }, rng);
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("UNSUPPORTED_PLAYER_COUNT");
  });

  it("starts with Night 1 after all roles are confirmed", () => {
    const { state, rng } = startEight(12);
    const night = confirmRoles(state, rng);
    expect(night.phase).toBe("NIGHT_ACTION");
    expect(night.night).toBe(1);
    expect(night.day).toBe(0);
  });

  it("rejects Mafia attacking self or another Mafia", () => {
    const started = startEight(15);
    const state = confirmRoles(started.state, started.rng);
    const mafia = state.players.filter((player) => player.role === "MAFIA");
    const result = dispatchAction(
      state,
      {
        type: "SELECT_NIGHT_TARGET",
        playerId: mafia[0]!.id,
        targetId: mafia[1]!.id,
      },
      started.rng,
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("INVALID_TARGET");
  });

  it("applies Doctor protection and keeps the reason secret from Citizen PlayerView", () => {
    const started = startEight(21);
    let state = confirmRoles(started.state, started.rng);
    const mafiaTarget = state.players.find((player) => player.role === "CITIZEN")!;
    const detective = role(state, "DETECTIVE");
    const detectiveTarget = state.players.find(
      (player) => player.alive && player.id !== detective.id,
    )!;

    state = completeNightWithTargets(
      state,
      started.rng,
      mafiaTarget.id,
      mafiaTarget.id,
      detectiveTarget.id,
    );

    expect(state.phase).toBe("DAWN");
    expect(state.players.find((player) => player.id === mafiaTarget.id)?.alive).toBe(true);

    const citizen = state.players.find((player) => player.role === "CITIZEN")!;
    const view = buildPlayerView(state, citizen.id);
    expect(view.doctorLastProtectedTargetId).toBeNull();
    expect(view.detectiveHistory).toBeNull();
  });

  it("gives Detective only MAFIA / NOT_MAFIA and hides it from other players", () => {
    const started = startEight(29);
    let state = confirmRoles(started.state, started.rng);
    const mafia = role(state, "MAFIA");
    const doctor = role(state, "DOCTOR");
    const detective = role(state, "DETECTIVE");
    const attackTarget = state.players.find(
      (player) => player.alive && player.alignment === "TOWN" && player.id !== doctor.id,
    )!;
    const doctorTarget = state.players.find(
      (player) => player.alive && player.id !== attackTarget.id,
    )!;

    state = completeNightWithTargets(
      state,
      started.rng,
      attackTarget.id,
      doctorTarget.id,
      mafia.id,
    );

    const detectiveView = buildPlayerView(state, detective.id);
    expect(detectiveView.detectiveHistory?.at(-1)?.result).toBe("MAFIA");

    const citizen = state.players.find((player) => player.role === "CITIZEN")!;
    const citizenView = buildPlayerView(state, citizen.id);
    expect(citizenView.detectiveHistory).toBeNull();
  });

  it("prevents Doctor from protecting the same player on consecutive nights", () => {
    const started = startEight(37);
    let state = confirmRoles(started.state, started.rng);
    const detective = role(state, "DETECTIVE");
    const protectedTarget = state.players.find(
      (player) => player.alive && player.id !== detective.id,
    )!;
    const mafiaTarget = state.players.find(
      (player) =>
        player.alive &&
        player.alignment === "TOWN" &&
        player.id !== protectedTarget.id &&
        player.id !== detective.id,
    )!;

    state = completeNightWithTargets(
      state,
      started.rng,
      mafiaTarget.id,
      protectedTarget.id,
      mafiaTarget.id,
    );

    if (state.phase === "GAME_OVER") throw new Error("unexpected early game over");
    state = confirmPublicResult(state, started.rng);
    state = send(state, { type: "END_DISCUSSION", playerId: state.hostId }, started.rng);
    state = send(state, { type: "END_NOMINATION", playerId: state.hostId }, started.rng);

    expect(state.phase).toBe("NIGHT_ACTION");
    const currentDoctor = livingRole(state, "DOCTOR");
    if (!currentDoctor) return;

    const result = dispatchAction(
      state,
      {
        type: "SELECT_NIGHT_TARGET",
        playerId: currentDoctor.id,
        targetId: protectedTarget.id,
      },
      started.rng,
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("INVALID_TARGET");
  });

  it("allows self-voting when the voter is a nominated candidate", () => {
    const started = startEight(43);
    let state = confirmRoles(started.state, started.rng);
    const mafia = role(state, "MAFIA");
    const doctor = role(state, "DOCTOR");
    const townTarget = state.players.find(
      (player) => player.role === "CITIZEN",
    )!;

    state = completeNightWithTargets(
      state,
      started.rng,
      townTarget.id,
      doctor.id,
      mafia.id,
    );
    if (state.phase === "GAME_OVER") throw new Error("unexpected early game over");
    state = confirmPublicResult(state, started.rng);
    state = send(state, { type: "END_DISCUSSION", playerId: state.hostId }, started.rng);

    const candidate = state.players.find((player) => player.alive)!;
    state = send(
      state,
      { type: "NOMINATE_PLAYER", playerId: candidate.id, targetId: candidate.id },
      started.rng,
    );
    state = send(state, { type: "END_NOMINATION", playerId: state.hostId }, started.rng);
    expect(state.phase).toBe("DAY_VOTE");

    const selected = dispatchAction(
      state,
      { type: "SELECT_VOTE", playerId: candidate.id, targetId: candidate.id },
      started.rng,
    );
    expect(selected.ok).toBe(true);
  });

  it("does not leak Mafia members through a Town PlayerView", () => {
    const started = startEight(53);
    const state = started.state;
    const town = state.players.find((player) => player.alignment === "TOWN")!;
    const view = buildPlayerView(state, town.id);

    expect(view.mafiaMembers).toBeNull();
    expect(view.players.every((player) => player.publicRole === null)).toBe(true);
    for (const other of view.players.filter((player) => player.id !== town.id)) {
      expect(Object.prototype.hasOwnProperty.call(other, "role")).toBe(false);
    }
  });

  it("rejects a dead player's vote", () => {
    const started = startEight(61);
    let state = confirmRoles(started.state, started.rng);
    const dead = state.players.find((player) => player.role === "CITIZEN")!;
    state = {
      ...state,
      phase: "DAY_VOTE",
      players: state.players.map((player) =>
        player.id === dead.id
          ? { ...player, alive: false, deathCause: "FORCED" as const, deathDay: 1 }
          : player,
      ),
      nominations: { [state.hostId]: state.hostId },
    };

    const result = dispatchAction(
      state,
      { type: "SELECT_VOTE", playerId: dead.id, targetId: state.hostId },
      started.rng,
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("ILLEGAL_ACTION_DEAD_PLAYER");
  });

  it("rejects a dead player's public-result confirmation", () => {
    const started = startEight(67);
    const dead = started.state.players[1]!;
    const state: GameState = {
      ...started.state,
      phase: "DAWN",
      players: started.state.players.map((player) =>
        player.id === dead.id
          ? { ...player, alive: false, deathCause: "FORCED" as const, deathDay: 1 }
          : player,
      ),
    };

    const result = dispatchAction(
      state,
      { type: "CONFIRM_RESULT", playerId: dead.id },
      started.rng,
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("ILLEGAL_ACTION_DEAD_PLAYER");
  });

  it("transfers phase-control host when the current host dies", () => {
    const started = startEight(69);
    const originalHost = started.state.hostId;
    const expectedSuccessor = started.state.players.find(
      (player) => player.id !== originalHost,
    )!.id;

    const executed = resolveExecution({
      ...started.state,
      phase: "EXECUTION",
      pendingExecutionId: originalHost,
      day: 1,
    });

    expect(executed.players.find((player) => player.id === originalHost)?.alive).toBe(false);
    expect(executed.hostId).toBe(expectedSuccessor);
  });

  it("blocks every Action after GAME_OVER", () => {
    const started = startEight(71);
    const state: GameState = {
      ...started.state,
      phase: "GAME_OVER",
      winner: "TOWN",
    };
    const result = dispatchAction(
      state,
      { type: "CONFIRM_ROLE", playerId: state.players[0]!.id },
      started.rng,
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("GAME_OVER");
  });

  it("resolves a tied final day vote as no execution", () => {
    const started = startEight(81);
    const players = started.state.players;
    const votes = Object.fromEntries(
      players.map((player, index) => [
        player.id,
        {
          targetId: index < 4 ? players[0]!.id : players[1]!.id,
          confirmed: true,
        },
      ]),
    );
    const result = resolveVote({
      ...started.state,
      phase: "VOTE_RESULT",
      nominations: {
        [players[2]!.id]: players[0]!.id,
        [players[3]!.id]: players[1]!.id,
      },
      votes,
    });
    expect(result.voteResult?.executionTargetId).toBeNull();
  });

  it("uses the v1 win conditions: no Mafia => Town, Mafia parity => Mafia", () => {
    const started = startEight(83);
    const townWinState: GameState = {
      ...started.state,
      players: started.state.players.map((player) =>
        player.alignment === "MAFIA"
          ? { ...player, alive: false, deathCause: "FORCED" as const, deathDay: 1 }
          : player,
      ),
    };
    expect(calculateWinner(townWinState)).toBe("TOWN");

    const mafia = started.state.players.filter((player) => player.alignment === "MAFIA");
    const town = started.state.players.filter((player) => player.alignment === "TOWN");
    const parityState: GameState = {
      ...started.state,
      players: started.state.players.map((player) => {
        const survives =
          mafia.some((candidate) => candidate.id === player.id) ||
          town.slice(0, 2).some((candidate) => candidate.id === player.id);
        return survives
          ? player
          : { ...player, alive: false, deathCause: "FORCED" as const, deathDay: 1 };
      }),
    };
    expect(calculateWinner(parityState)).toBe("MAFIA");
  });

  it("requires Mafia revote on first tie and fails the attack on a second tie", () => {
    const started = startEight(89);
    let state = confirmRoles(started.state, started.rng);
    const mafia = state.players.filter((player) => player.role === "MAFIA");
    const town = state.players.filter((player) => player.alignment === "TOWN");
    const doctor = role(state, "DOCTOR");
    const detective = role(state, "DETECTIVE");
    const detectiveTarget = town.find((player) => player.id !== detective.id)!;
    const doctorTarget = town.find(
      (player) => player.id !== town[0]!.id && player.id !== town[1]!.id,
    )!;

    state = send(
      state,
      { type: "SELECT_NIGHT_TARGET", playerId: mafia[0]!.id, targetId: town[0]!.id },
      started.rng,
    );
    state = send(state, { type: "CONFIRM_NIGHT_ACTION", playerId: mafia[0]!.id }, started.rng);
    state = send(
      state,
      { type: "SELECT_NIGHT_TARGET", playerId: mafia[1]!.id, targetId: town[1]!.id },
      started.rng,
    );
    state = send(state, { type: "CONFIRM_NIGHT_ACTION", playerId: mafia[1]!.id }, started.rng);
    state = send(
      state,
      { type: "SELECT_NIGHT_TARGET", playerId: doctor.id, targetId: doctorTarget.id },
      started.rng,
    );
    state = send(state, { type: "CONFIRM_NIGHT_ACTION", playerId: doctor.id }, started.rng);
    state = send(
      state,
      { type: "SELECT_NIGHT_TARGET", playerId: detective.id, targetId: detectiveTarget.id },
      started.rng,
    );
    state = send(state, { type: "CONFIRM_NIGHT_ACTION", playerId: detective.id }, started.rng);

    expect(state.phase).toBe("NIGHT_ACTION");
    expect(state.nightActions.mafiaRevoteRound).toBe(1);

    state = send(
      state,
      { type: "SELECT_NIGHT_TARGET", playerId: mafia[0]!.id, targetId: town[0]!.id },
      started.rng,
    );
    state = send(state, { type: "CONFIRM_NIGHT_ACTION", playerId: mafia[0]!.id }, started.rng);
    state = send(
      state,
      { type: "SELECT_NIGHT_TARGET", playerId: mafia[1]!.id, targetId: town[1]!.id },
      started.rng,
    );
    state = send(state, { type: "CONFIRM_NIGHT_ACTION", playerId: mafia[1]!.id }, started.rng);

    expect(state.phase).toBe("DAWN");
    expect(state.nightActions.mafiaTarget).toBeNull();
    expect(state.players.filter((player) => !player.alive)).toHaveLength(0);
  });

  it("skips DAY_VOTE when nomination closes with no candidates", () => {
    const started = startEight(97);
    let state = confirmRoles(started.state, started.rng);
    const mafia = role(state, "MAFIA");
    const detective = role(state, "DETECTIVE");
    const protectedTarget = state.players.find(
      (player) => player.alive && player.alignment === "TOWN" && player.id !== detective.id,
    )!;

    state = completeNightWithTargets(
      state,
      started.rng,
      protectedTarget.id,
      protectedTarget.id,
      mafia.id,
    );
    state = confirmPublicResult(state, started.rng);
    expect(state.phase).toBe("DAY_DISCUSSION");

    state = send(state, { type: "END_DISCUSSION", playerId: state.hostId }, started.rng);
    expect(state.phase).toBe("NOMINATION");

    state = send(state, { type: "END_NOMINATION", playerId: state.hostId }, started.rng);
    expect(state.phase).toBe("NIGHT_ACTION");
    expect(state.night).toBe(2);
  });

  it("reveals every role through PlayerView after GAME_OVER", () => {
    const started = startEight(101);
    let state = started.state;
    state = {
      ...state,
      phase: "WIN_CHECK",
      players: state.players.map((player) =>
        player.alignment === "MAFIA"
          ? { ...player, alive: false, deathCause: "FORCED" as const, deathDay: 1 }
          : player,
      ),
    };

    state = resolveWinCheck(state, "DAWN");
    expect(state.phase).toBe("GAME_OVER");
    expect(state.winner).toBe("TOWN");

    for (const viewer of state.players) {
      const view = buildPlayerView(state, viewer.id);
      expect(view.players.every((player) => player.publicRole !== null)).toBe(true);
    }
  });

  it("reports Gate Mafia-B metrics with zero engine failures", () => {
    const result = simulateMany(50, 20260921);
    expect(result.games).toBe(50);
    expect(result.completed).toBe(50);
    expect(result.stalled).toBe(0);
    expect(result.illegalActions).toBe(0);
    expect(result.invalidTransitions).toBe(0);
    expect(result.secretLeaks).toBe(0);
    expect(result.screenContractViolations).toBe(0);
    expect(result.infiniteLoops).toBe(0);
    expect(result.otherFailures).toBe(0);
    expect(result.townWins + result.mafiaWins).toBe(50);
    expect(result.maxActions).toBeLessThan(5000);
    expect(result.passed).toBe(true);
  });
});
