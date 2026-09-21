import { Mulberry32 } from "../core/random.js";
import { dispatchOriginalAction } from "./engine.js";
import { createOriginalLobby } from "./gameState.js";
import { buildOriginalPlayerView } from "./playerView.js";
import {
  originalBotAccusationTarget,
  originalBotChat,
  originalBotGuiltyVote,
  originalBotNightNote,
  originalBotNightProposalVote,
} from "./botPolicy.js";
import type {
  OriginalAction,
  OriginalGameState,
  OriginalPhase,
} from "./types.js";

const NAMES = ["JS", "MINHO", "SOYOUNG", "JUN", "HANA", "DOYUN", "YUNA", "TAEHO"] as const;

function assertOriginalInvariants(state: OriginalGameState): void {
  const ids = state.players.map((player) => player.id);
  if (new Set(ids).size !== ids.length) throw new Error("INVARIANT_DUPLICATE_PLAYER");
  if (state.phase === "GAME_OVER" && !state.winner) throw new Error("INVARIANT_GAME_OVER_NO_WINNER");
  if (state.winner && state.phase !== "GAME_OVER") throw new Error("INVARIANT_WINNER_BEFORE_GAME_OVER");

  for (const player of state.players) {
    if (player.alive && (player.deathCause !== null || player.deathDay !== null)) {
      throw new Error("INVARIANT_LIVING_HAS_DEATH");
    }
    if (!player.alive && (player.deathCause === null || player.deathDay === null)) {
      throw new Error("INVARIANT_DEAD_MISSING_DEATH");
    }
  }
}

function assertOriginalViews(state: OriginalGameState): void {
  for (const player of state.players) {
    const view = buildOriginalPlayerView(state, player.id);

    if (state.phase !== "GAME_OVER") {
      for (const other of view.players) {
        if (other.publicRole !== null) {
          throw new Error("SECRET_LEAK: role exposed before GAME_OVER");
        }
      }
    } else if (view.players.some((candidate) => candidate.publicRole === null)) {
      throw new Error("SECRET_LEAK: role missing at GAME_OVER");
    }

    if (player.role !== "MAFIA" && view.mafiaMembers !== null) {
      throw new Error("SECRET_LEAK: mafia members exposed to Honest");
    }

    if (player.alive && state.phase !== "GAME_OVER") {
      if (view.chat.some((entry) => entry.channel === "DEAD")) {
        throw new Error("DEAD_LIVING_LEAK: dead chat exposed to living player");
      }
    }

    if (!player.alive && state.phase !== "GAME_OVER") {
      if (!view.writableChatChannels.includes("DEAD")) {
        throw new Error("CHAT_POLICY_VIOLATION: dead player lost dead chat");
      }
      if (view.writableChatChannels.includes("PUBLIC")) {
        throw new Error("CHAT_POLICY_VIOLATION: dead player can write public chat");
      }
    }
  }
}

function hasSystemAfter(
  state: OriginalGameState,
  previousChatLength: number,
  codes: readonly string[],
): boolean {
  return state.chat
    .slice(previousChatLength)
    .some((entry) => entry.system && codes.includes(entry.system.code));
}

function expectedSystemCodes(
  before: OriginalGameState,
  action: OriginalAction,
  after: OriginalGameState,
): readonly string[] {
  switch (action.type) {
    case "START_GAME":
      return ["GAME_STARTED"];
    case "CONFIRM_ROLE":
      return before.phase === "ROLE_REVEAL" && after.phase === "SUNRISE"
        ? ["SUNRISE_STARTED"]
        : [];
    case "CONFIRM_SUNRISE":
      return before.phase === "SUNRISE" && after.phase === "DAY_DISCUSSION"
        ? ["DAY_STARTED"]
        : [];
    case "ACCUSE_PLAYER":
      return ["PLAYER_ACCUSED"];
    case "CALL_GUILTY_VOTE":
      return ["GUILTY_VOTE_OPENED"];
    case "CAST_GUILTY_VOTE":
      return before.phase === "GUILTY_VOTE" && after.phase !== "GUILTY_VOTE"
        ? ["GUILTY_VOTE_PASSED", "GUILTY_VOTE_FAILED"]
        : [];
    case "PROPOSE_MAFIA_NIGHT":
      return ["NIGHT_PROPOSED"];
    case "CAST_NIGHT_PROPOSAL_VOTE":
      return before.phase === "NIGHT_PROPOSAL_VOTE" &&
        after.phase !== "NIGHT_PROPOSAL_VOTE"
        ? ["NIGHT_PROPOSAL_PASSED", "NIGHT_PROPOSAL_FAILED"]
        : [];
    case "SUBMIT_NIGHT_NOTE":
      return before.phase === "MAFIA_NIGHT" && after.phase !== "MAFIA_NIGHT"
        ? ["NIGHT_NOTES_REVEALED"]
        : [];
    default:
      return [];
  }
}

export interface OriginalSimulationResult {
  readonly winner: "HONEST" | "MAFIA";
  readonly actions: number;
  readonly days: number;
  readonly phases: readonly OriginalPhase[];
}

export function simulateOriginalGame(seed: number, maxActions = 5000): OriginalSimulationResult {
  const engineRng = new Mulberry32(seed ^ 0x0a11ce);
  const policyRng = new Mulberry32(seed ^ 0x51f15e);
  let state = createOriginalLobby(NAMES);
  let actions = 0;
  const phases = new Set<OriginalPhase>([state.phase]);
  const deadChatSent = new Set<string>();

  const send = (action: OriginalAction): void => {
    const before = state;
    const previousChatLength = before.chat.length;
    const result = dispatchOriginalAction(before, action, engineRng);
    if (!result.ok) {
      throw new Error(
        "ILLEGAL_ACTION: " +
          before.phase +
          " " +
          action.type +
          " " +
          (result.error?.code ?? "UNKNOWN"),
      );
    }

    state = result.state;
    actions += 1;
    phases.add(state.phase);

    assertOriginalInvariants(state);
    assertOriginalViews(state);

    const expected = expectedSystemCodes(before, action, state);
    if (expected.length > 0 && !hasSystemAfter(state, previousChatLength, expected)) {
      throw new Error("MISSING_SYSTEM_TRANSITION: " + action.type);
    }

    if (actions > maxActions) throw new Error("INFINITE_LOOP: maxActions exceeded");
  };

  while (state.phase !== "GAME_OVER") {
    for (const dead of state.players.filter((player) => !player.alive)) {
      const key = state.day + ":" + dead.id;
      const view = buildOriginalPlayerView(state, dead.id);
      if (
        !deadChatSent.has(key) &&
        view.availableActions.includes("SEND_CHAT") &&
        view.writableChatChannels.includes("DEAD")
      ) {
        send({
          type: "SEND_CHAT",
          playerId: dead.id,
          channel: "DEAD",
          text: "사망자 채팅 " + key,
        });
        deadChatSent.add(key);
      }
    }

    switch (state.phase) {
      case "LOBBY":
        for (const player of state.players) {
          send({ type: "SET_READY", playerId: player.id, ready: true });
        }
        send({ type: "START_GAME", playerId: state.hostId });
        break;

      case "ROLE_REVEAL":
        for (const player of state.players) {
          if (state.phase !== "ROLE_REVEAL") break;
          send({ type: "CONFIRM_ROLE", playerId: player.id });
        }
        break;

      case "SUNRISE":
        for (const player of state.players) {
          if (state.phase !== "SUNRISE") break;
          send({ type: "CONFIRM_SUNRISE", playerId: player.id });
        }
        break;

      case "DAY_DISCUSSION": {
        const living = state.players.filter((player) => player.alive);
        for (const player of living.slice(0, Math.min(3, living.length))) {
          const view = buildOriginalPlayerView(state, player.id);
          send({
            type: "SEND_CHAT",
            playerId: player.id,
            channel: "PUBLIC",
            text: originalBotChat(view, policyRng),
          });
        }

        const actor = policyRng.pick(living);
        if (policyRng.next() < 0.6) {
          const view = buildOriginalPlayerView(state, actor.id);
          send({
            type: "ACCUSE_PLAYER",
            playerId: actor.id,
            targetId: originalBotAccusationTarget(view, policyRng),
          });
        } else {
          send({ type: "PROPOSE_MAFIA_NIGHT", playerId: actor.id });
        }
        break;
      }

      case "ACCUSATION": {
        if (!state.accusation) throw new Error("STALLED: accusation missing");
        const accuser = state.accusation.accuserId;
        const accused = state.accusation.accusedId;

        send({
          type: "SEND_CHAT",
          playerId: accused,
          channel: "PUBLIC",
          text: "나는 마피아가 아니야. 고발 근거를 다시 확인해줘.",
        });
        if (state.phase === "ACCUSATION") {
          send({
            type: "SEND_CHAT",
            playerId: accuser,
            channel: "PUBLIC",
            text: "내가 본 발언 흐름 때문에 의심하고 있어.",
          });
        }
        if (state.phase === "ACCUSATION") {
          send({ type: "CALL_GUILTY_VOTE", playerId: accuser });
        }
        break;
      }

      case "GUILTY_VOTE":
        if (!state.accusation) throw new Error("STALLED: guilty accusation missing");
        for (const player of state.players.filter(
          (candidate) =>
            candidate.alive && candidate.id !== state.accusation!.accusedId,
        )) {
          if (state.phase !== "GUILTY_VOTE") break;
          const view = buildOriginalPlayerView(state, player.id);
          send({
            type: "CAST_GUILTY_VOTE",
            playerId: player.id,
            guilty: originalBotGuiltyVote(view, policyRng),
          });
        }
        break;

      case "NIGHT_PROPOSAL_VOTE":
        for (const player of state.players.filter((candidate) => candidate.alive)) {
          if (state.phase !== "NIGHT_PROPOSAL_VOTE") break;
          const view = buildOriginalPlayerView(state, player.id);
          send({
            type: "CAST_NIGHT_PROPOSAL_VOTE",
            playerId: player.id,
            agree: originalBotNightProposalVote(view, policyRng),
          });
        }
        break;

      case "MAFIA_NIGHT":
        for (const player of state.players.filter((candidate) => candidate.alive)) {
          if (state.phase !== "MAFIA_NIGHT") break;
          const view = buildOriginalPlayerView(state, player.id);
          send({
            type: "SUBMIT_NIGHT_NOTE",
            playerId: player.id,
            note: originalBotNightNote(view, policyRng),
          });
        }
        break;

      case "NIGHT_RESOLVE":
        throw new Error("OFFLINE_INTERVENTION_REQUIRED: automatic resolver leaked");

    }
  }

  if (!state.winner) throw new Error("STALLED: game over without winner");
  assertOriginalViews(state);

  return {
    winner: state.winner,
    actions,
    days: state.day,
    phases: [...phases],
  };
}

export interface OriginalSimulationBatch {
  readonly games: number;
  readonly completed: number;
  readonly stalled: number;
  readonly honestWins: number;
  readonly mafiaWins: number;
  readonly illegalActions: number;
  readonly invalidTransitions: number;
  readonly secretLeaks: number;
  readonly chatPolicyViolations: number;
  readonly deadToLivingLeaks: number;
  readonly missingSystemTransitions: number;
  readonly offlineInterventionRequired: number;
  readonly infiniteLoops: number;
  readonly otherFailures: number;
  readonly maxActions: number;
  readonly maxDays: number;
  readonly averageActions: number;
  readonly passed: boolean;
}

export function simulateOriginalMany(
  games: number,
  seed: number,
): OriginalSimulationBatch {
  let completed = 0;
  let stalled = 0;
  let honestWins = 0;
  let mafiaWins = 0;
  let illegalActions = 0;
  let invalidTransitions = 0;
  let secretLeaks = 0;
  let chatPolicyViolations = 0;
  let deadToLivingLeaks = 0;
  let missingSystemTransitions = 0;
  let offlineInterventionRequired = 0;
  let infiniteLoops = 0;
  let otherFailures = 0;
  let maxActions = 0;
  let maxDays = 0;
  let totalActions = 0;

  for (let index = 0; index < games; index += 1) {
    try {
      const result = simulateOriginalGame((seed + index * 7919) >>> 0);
      completed += 1;
      if (result.winner === "HONEST") honestWins += 1;
      else mafiaWins += 1;
      maxActions = Math.max(maxActions, result.actions);
      maxDays = Math.max(maxDays, result.days);
      totalActions += result.actions;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith("STALLED:")) stalled += 1;
      else if (message.startsWith("ILLEGAL_ACTION:")) illegalActions += 1;
      else if (message.startsWith("ORIGINAL_INVALID_TRANSITION:")) invalidTransitions += 1;
      else if (message.startsWith("SECRET_LEAK:")) secretLeaks += 1;
      else if (message.startsWith("CHAT_POLICY_VIOLATION:")) chatPolicyViolations += 1;
      else if (message.startsWith("DEAD_LIVING_LEAK:")) deadToLivingLeaks += 1;
      else if (message.startsWith("MISSING_SYSTEM_TRANSITION:")) missingSystemTransitions += 1;
      else if (message.startsWith("OFFLINE_INTERVENTION_REQUIRED:")) offlineInterventionRequired += 1;
      else if (message.startsWith("INFINITE_LOOP:")) infiniteLoops += 1;
      else otherFailures += 1;
    }
  }

  const passed =
    completed === games &&
    stalled === 0 &&
    illegalActions === 0 &&
    invalidTransitions === 0 &&
    secretLeaks === 0 &&
    chatPolicyViolations === 0 &&
    deadToLivingLeaks === 0 &&
    missingSystemTransitions === 0 &&
    offlineInterventionRequired === 0 &&
    infiniteLoops === 0 &&
    otherFailures === 0;

  return {
    games,
    completed,
    stalled,
    honestWins,
    mafiaWins,
    illegalActions,
    invalidTransitions,
    secretLeaks,
    chatPolicyViolations,
    deadToLivingLeaks,
    missingSystemTransitions,
    offlineInterventionRequired,
    infiniteLoops,
    otherFailures,
    maxActions,
    maxDays,
    averageActions: completed ? totalActions / completed : 0,
    passed,
  };
}
