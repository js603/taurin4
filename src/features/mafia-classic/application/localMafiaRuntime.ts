import { dispatchAction } from "../core/engine.js";
import { createLobbyGame } from "../core/gameState.js";
import { buildPlayerView, type PlayerView } from "../core/playerView.js";
import { Mulberry32, type RandomSource } from "../core/random.js";
import type { DispatchResult, GameAction, GameState, PlayerId } from "../core/types.js";
import {
  chooseBotNightTarget,
  chooseBotNomination,
  chooseBotVote,
} from "../simulation/botPolicy.js";
import {
  buildScreenContract,
  type ScreenContract,
} from "../ux/screenContract.js";

const BOT_NAMES = ["민석", "서연", "태호", "유나", "도윤", "하나", "준"] as const;

export type HumanActionIntent =
  | { readonly type: "SET_READY"; readonly ready: boolean }
  | { readonly type: "START_GAME" }
  | { readonly type: "CONFIRM_ROLE" }
  | { readonly type: "SELECT_NIGHT_TARGET"; readonly targetId: PlayerId }
  | { readonly type: "CONFIRM_NIGHT_ACTION" }
  | { readonly type: "CONFIRM_RESULT" }
  | { readonly type: "END_DISCUSSION" }
  | { readonly type: "NOMINATE_PLAYER"; readonly targetId: PlayerId }
  | { readonly type: "END_NOMINATION" }
  | { readonly type: "SELECT_VOTE"; readonly targetId: PlayerId | null }
  | { readonly type: "CONFIRM_VOTE" };

export interface LocalMafiaSnapshot {
  readonly view: PlayerView;
  readonly contract: ScreenContract;
}

export interface LocalMafiaActionResult {
  readonly ok: boolean;
  readonly snapshot: LocalMafiaSnapshot;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
}

function humanAction(playerId: PlayerId, intent: HumanActionIntent): GameAction {
  return { ...intent, playerId } as GameAction;
}

export class LocalMafiaRuntime {
  private state: GameState;
  private readonly humanId: PlayerId;
  private readonly engineRng: RandomSource;
  private readonly botRng: RandomSource;

  constructor(humanName: string, seed = Date.now() >>> 0) {
    const name = humanName.trim() || "당신";
    this.engineRng = new Mulberry32(seed ^ 0x51f15e);
    this.botRng = new Mulberry32(seed ^ 0xa11ce);
    this.state = createLobbyGame([name, ...BOT_NAMES], 0, "local-m3-" + seed);
    this.humanId = this.state.players[0]!.id;

    for (const bot of this.state.players.slice(1)) {
      this.dispatchBot({ type: "SET_READY", playerId: bot.id, ready: true });
    }
  }

  snapshot(): LocalMafiaSnapshot {
    const view = buildPlayerView(this.state, this.humanId);
    return {
      view,
      contract: buildScreenContract(view),
    };
  }

  act(intent: HumanActionIntent): LocalMafiaActionResult {
    const result = dispatchAction(
      this.state,
      humanAction(this.humanId, intent),
      this.engineRng,
    );

    if (!result.ok) {
      return {
        ok: false,
        snapshot: this.snapshot(),
        errorCode: result.error?.code ?? "UNKNOWN",
        errorMessage: result.error?.message ?? "Action을 실행하지 못했습니다.",
      };
    }

    this.state = result.state;
    this.pumpBots();

    return {
      ok: true,
      snapshot: this.snapshot(),
      errorCode: null,
      errorMessage: null,
    };
  }

  private dispatchBot(action: GameAction): DispatchResult {
    const result = dispatchAction(this.state, action, this.engineRng);
    if (!result.ok) {
      throw new Error(
        "LOCAL_BOT_ILLEGAL_ACTION: " +
          action.type +
          " " +
          (result.error?.code ?? "UNKNOWN") +
          " " +
          (result.error?.message ?? ""),
      );
    }
    this.state = result.state;
    return result;
  }

  private pumpBots(): void {
    for (let guard = 0; guard < 2000; guard += 1) {
      if (this.state.phase === "GAME_OVER") return;

      let progressed = false;
      const phase = this.state.phase;

      if (phase === "LOBBY") return;

      if (phase === "ROLE_REVEAL") {
        for (const bot of this.state.players.filter(
          (player) => player.id !== this.humanId && !player.roleConfirmed,
        )) {
          this.dispatchBot({ type: "CONFIRM_ROLE", playerId: bot.id });
          progressed = true;
          if (this.state.phase !== phase) break;
        }
      } else if (phase === "NIGHT_ACTION") {
        for (const botId of this.botIds()) {
          if (this.state.phase !== "NIGHT_ACTION") break;
          const view = buildPlayerView(this.state, botId);

          if (view.availableActions.includes("SELECT_NIGHT_TARGET")) {
            const targetId = chooseBotNightTarget(view, this.botRng);
            this.dispatchBot({ type: "SELECT_NIGHT_TARGET", playerId: botId, targetId });
            progressed = true;
          }

          if (this.state.phase !== "NIGHT_ACTION") break;
          const afterSelect = buildPlayerView(this.state, botId);
          if (afterSelect.availableActions.includes("CONFIRM_NIGHT_ACTION")) {
            this.dispatchBot({ type: "CONFIRM_NIGHT_ACTION", playerId: botId });
            progressed = true;
          }
        }
      } else if (
        phase === "DAWN" ||
        phase === "VOTE_RESULT" ||
        phase === "EXECUTION"
      ) {
        for (const botId of this.botIds()) {
          if (this.state.phase !== phase) break;
          const view = buildPlayerView(this.state, botId);
          if (view.availableActions.includes("CONFIRM_RESULT")) {
            this.dispatchBot({ type: "CONFIRM_RESULT", playerId: botId });
            progressed = true;
          }
        }
      } else if (phase === "DAY_DISCUSSION") {
        if (this.state.hostId !== this.humanId) {
          this.dispatchBot({ type: "END_DISCUSSION", playerId: this.state.hostId });
          progressed = true;
        }
      } else if (phase === "NOMINATION") {
        for (const botId of this.botIds()) {
          if (this.state.phase !== "NOMINATION") break;
          const view = buildPlayerView(this.state, botId);
          if (
            view.availableActions.includes("NOMINATE_PLAYER") &&
            view.ownNominationTargetId === null
          ) {
            const targetId = chooseBotNomination(view, this.botRng);
            this.dispatchBot({ type: "NOMINATE_PLAYER", playerId: botId, targetId });
            progressed = true;
          }
        }

        if (
          this.state.phase === "NOMINATION" &&
          this.state.hostId !== this.humanId
        ) {
          const hostView = buildPlayerView(this.state, this.state.hostId);
          if (hostView.availableActions.includes("END_NOMINATION")) {
            this.dispatchBot({
              type: "END_NOMINATION",
              playerId: this.state.hostId,
            });
            progressed = true;
          }
        }
      } else if (phase === "DAY_VOTE") {
        for (const botId of this.botIds()) {
          if (this.state.phase !== "DAY_VOTE") break;
          let view = buildPlayerView(this.state, botId);

          if (view.availableActions.includes("SELECT_VOTE")) {
            const targetId = chooseBotVote(view, this.botRng);
            this.dispatchBot({ type: "SELECT_VOTE", playerId: botId, targetId });
            progressed = true;
            view = buildPlayerView(this.state, botId);
          }

          if (
            this.state.phase === "DAY_VOTE" &&
            view.availableActions.includes("CONFIRM_VOTE")
          ) {
            this.dispatchBot({ type: "CONFIRM_VOTE", playerId: botId });
            progressed = true;
          }
        }
      } else {
        throw new Error("LOCAL_RUNTIME_AUTOMATIC_PHASE_LEAK: " + phase);
      }

      const humanView = buildPlayerView(this.state, this.humanId);
      if (humanView.availableActions.length > 0) return;

      if (!progressed) {
        if (!humanView.self.alive) continue;
        return;
      }
    }

    throw new Error("LOCAL_RUNTIME_STALLED");
  }

  private botIds(): PlayerId[] {
    return this.state.players
      .filter((player) => player.id !== this.humanId)
      .map((player) => player.id);
  }
}
