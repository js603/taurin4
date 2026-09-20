import { dispatchAction } from "../core/engine.js";
import { createLobbyGame } from "../core/gameState.js";
import { buildPlayerView } from "../core/playerView.js";
import { Mulberry32 } from "../core/random.js";
import type { GameAction, GamePhase, GameState, Winner } from "../core/types.js";
import {
  chooseBotNightTarget,
  chooseBotNomination,
  chooseBotVote,
} from "./botPolicy.js";

export interface SimulationResult {
  readonly seed: number;
  readonly winner: Exclude<Winner, null>;
  readonly actions: number;
  readonly nights: number;
  readonly days: number;
  readonly visitedPhases: readonly GamePhase[];
  readonly replayLength: number;
}

const NAMES = ["JS", "MINHO", "SOYOUNG", "JUN", "HANA", "DOYUN", "YUNA", "TAEHO"] as const;

function assertCoreInvariants(state: GameState): void {
  const ids = state.players.map((player) => player.id);
  if (new Set(ids).size !== ids.length) throw new Error("duplicate player id");
  if (state.winner && state.phase !== "GAME_OVER") throw new Error("winner outside GAME_OVER");
  if (state.phase === "GAME_OVER" && !state.winner) throw new Error("GAME_OVER without winner");

  for (const player of state.players) {
    if (!player.alive && player.deathCause === null) throw new Error("dead player without cause");
    if (player.alive && player.deathCause !== null) throw new Error("living player with death cause");
  }

  for (const [voterId, vote] of Object.entries(state.votes)) {
    const voter = state.players.find((player) => player.id === voterId);
    if (!voter) throw new Error("vote from unknown player");
    if (vote.confirmed && !voter.alive) throw new Error("dead player confirmed a day vote");
  }
}

export function simulateBotGame(seed: number, maxActions = 5000): SimulationResult {
  const engineRng = new Mulberry32(seed ^ 0x51f15e);
  const policyRng = new Mulberry32(seed ^ 0xa11ce);
  let state = createLobbyGame(NAMES, 0, "sim-" + seed);
  let actions = 0;
  const phases = new Set<GamePhase>([state.phase]);

  const send = (action: GameAction): void => {
    const result = dispatchAction(state, action, engineRng);
    if (!result.ok) {
      throw new Error(
        "Bot dispatched illegal action at " +
          state.phase +
          ": " +
          JSON.stringify(action) +
          " -> " +
          result.error?.code +
          " " +
          result.error?.message,
      );
    }
    state = result.state;
    actions += 1;
    phases.add(state.phase);
    assertCoreInvariants(state);
    if (actions > maxActions) throw new Error("simulation exceeded maxActions");
  };

  while (state.phase !== "GAME_OVER") {
    switch (state.phase) {
      case "LOBBY":
        for (const player of state.players) {
          send({ type: "SET_READY", playerId: player.id, ready: true });
        }
        send({ type: "START_GAME", playerId: state.hostId });
        break;

      case "ROLE_REVEAL":
        for (const player of state.players) {
          if (!state.players.find((candidate) => candidate.id === player.id)?.roleConfirmed) {
            send({ type: "CONFIRM_ROLE", playerId: player.id });
          }
          if (state.phase !== "ROLE_REVEAL") break;
        }
        break;

      case "NIGHT_ACTION": {
        let progressed = false;
        for (const playerId of state.players.map((player) => player.id)) {
          if (state.phase !== "NIGHT_ACTION") break;
          const view = buildPlayerView(state, playerId);
          if (!view.availableActions.includes("SELECT_NIGHT_TARGET")) continue;

          const targetId = chooseBotNightTarget(view, policyRng);
          send({ type: "SELECT_NIGHT_TARGET", playerId, targetId });
          send({ type: "CONFIRM_NIGHT_ACTION", playerId });
          progressed = true;
        }
        if (!progressed && state.phase === "NIGHT_ACTION") {
          throw new Error("NIGHT_ACTION has no legal bot actor");
        }
        break;
      }

      case "DAWN":
      case "VOTE_RESULT":
      case "EXECUTION": {
        const phase = state.phase;
        for (const playerId of state.players.map((player) => player.id)) {
          if (state.phase !== phase) break;
          const view = buildPlayerView(state, playerId);
          if (view.availableActions.includes("CONFIRM_RESULT")) {
            send({ type: "CONFIRM_RESULT", playerId });
          }
        }
        break;
      }

      case "DAY_DISCUSSION":
        send({ type: "END_DISCUSSION", playerId: state.hostId });
        break;

      case "NOMINATION":
        for (const playerId of state.players.filter((player) => player.alive).map((player) => player.id)) {
          const view = buildPlayerView(state, playerId);
          const targetId = chooseBotNomination(view, policyRng);
          send({ type: "NOMINATE_PLAYER", playerId, targetId });
        }
        send({ type: "END_NOMINATION", playerId: state.hostId });
        break;

      case "DAY_VOTE":
        for (const playerId of state.players.filter((player) => player.alive).map((player) => player.id)) {
          if (state.phase !== "DAY_VOTE") break;
          const view = buildPlayerView(state, playerId);
          const targetId = chooseBotVote(view, policyRng);
          send({ type: "SELECT_VOTE", playerId, targetId });
          send({ type: "CONFIRM_VOTE", playerId });
        }
        break;

      case "ROLE_ASSIGNMENT":
      case "NIGHT_START":
      case "NIGHT_RESOLVE":
      case "WIN_CHECK":
        throw new Error("automatic phase leaked out of dispatch: " + state.phase);

      case "GAME_OVER":
        break;
    }
  }

  if (!state.winner) throw new Error("simulation ended without winner");
  if (actions !== state.replay.length) {
    throw new Error("every successful bot Action must be recorded in replay");
  }

  return {
    seed,
    winner: state.winner,
    actions,
    nights: state.night,
    days: state.day,
    visitedPhases: [...phases],
    replayLength: state.replay.length,
  };
}

export interface SimulationBatchResult {
  readonly games: number;
  readonly townWins: number;
  readonly mafiaWins: number;
  readonly maxActions: number;
  readonly maxNights: number;
  readonly averageActions: number;
}

export function simulateMany(games: number, seed: number): SimulationBatchResult {
  if (!Number.isInteger(games) || games <= 0) throw new Error("games must be a positive integer");

  let townWins = 0;
  let mafiaWins = 0;
  let maxActions = 0;
  let maxNights = 0;
  let totalActions = 0;

  for (let index = 0; index < games; index += 1) {
    const result = simulateBotGame((seed + index * 7919) >>> 0);
    if (result.winner === "TOWN") townWins += 1;
    else mafiaWins += 1;
    maxActions = Math.max(maxActions, result.actions);
    maxNights = Math.max(maxNights, result.nights);
    totalActions += result.actions;
  }

  return {
    games,
    townWins,
    mafiaWins,
    maxActions,
    maxNights,
    averageActions: totalActions / games,
  };
}
