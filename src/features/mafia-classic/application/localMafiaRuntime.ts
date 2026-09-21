import { Mulberry32, type RandomSource } from "../core/random.js";
import {
  originalBotAccusationTarget,
  originalBotChat,
  originalBotGuiltyVote,
  originalBotNightNote,
  originalBotNightProposalVote,
} from "../original/botPolicy.js";
import { dispatchOriginalAction } from "../original/engine.js";
import { createOriginalLobby } from "../original/gameState.js";
import {
  buildOriginalPlayerView,
  type OriginalPlayerView,
} from "../original/playerView.js";
import {
  buildOriginalScreenContract,
  type OriginalScreenContract,
} from "../original/screenContract.js";
import type {
  NightNote,
  OriginalAction,
  OriginalGameState,
  PlayerId,
} from "../original/types.js";

const BOT_NAMES = ["민석", "서연", "태호", "유나", "도윤", "하나", "준"] as const;

export type HumanActionIntent =
  | { readonly type: "SET_READY"; readonly ready: boolean }
  | { readonly type: "START_GAME" }
  | { readonly type: "CONFIRM_ROLE" }
  | { readonly type: "CONFIRM_SUNRISE" }
  | { readonly type: "SEND_CHAT"; readonly channel: "PUBLIC" | "DEAD"; readonly text: string }
  | { readonly type: "ACCUSE_PLAYER"; readonly targetId: PlayerId }
  | { readonly type: "CALL_GUILTY_VOTE" }
  | { readonly type: "CAST_GUILTY_VOTE"; readonly guilty: boolean }
  | { readonly type: "PROPOSE_MAFIA_NIGHT" }
  | { readonly type: "CAST_NIGHT_PROPOSAL_VOTE"; readonly agree: boolean }
  | { readonly type: "SUBMIT_NIGHT_NOTE"; readonly note: NightNote };

export interface LocalMafiaSnapshot {
  readonly view: OriginalPlayerView;
  readonly contract: OriginalScreenContract;
}

export interface LocalMafiaActionResult {
  readonly ok: boolean;
  readonly snapshot: LocalMafiaSnapshot;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
}

function withPlayer(playerId: PlayerId, intent: HumanActionIntent): OriginalAction {
  return { ...intent, playerId } as OriginalAction;
}

export class LocalMafiaRuntime {
  private state: OriginalGameState;
  private readonly humanId: PlayerId;
  private readonly engineRng: RandomSource;
  private readonly botRng: RandomSource;
  private readonly openedDays = new Set<number>();
  private readonly accusationBotReplies = new Set<number>();

  constructor(humanName: string, seed = Date.now() >>> 0) {
    const name = humanName.trim() || "당신";
    this.engineRng = new Mulberry32(seed ^ 0x51f15e);
    this.botRng = new Mulberry32(seed ^ 0xa11ce);
    this.state = createOriginalLobby([name, ...BOT_NAMES], 0, "original-local-" + seed);
    this.humanId = this.state.players[0]!.id;

    for (const bot of this.state.players.slice(1)) {
      this.dispatchBot({ type: "SET_READY", playerId: bot.id, ready: true });
    }
  }

  snapshot(): LocalMafiaSnapshot {
    const view = buildOriginalPlayerView(this.state, this.humanId);
    return {
      view,
      contract: buildOriginalScreenContract(view),
    };
  }

  act(intent: HumanActionIntent): LocalMafiaActionResult {
    const result = dispatchOriginalAction(
      this.state,
      withPlayer(this.humanId, intent),
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
    this.reactToHuman(intent);
    this.pumpBots();

    return {
      ok: true,
      snapshot: this.snapshot(),
      errorCode: null,
      errorMessage: null,
    };
  }

  private dispatchBot(action: OriginalAction): void {
    const result = dispatchOriginalAction(this.state, action, this.engineRng);
    if (!result.ok) {
      throw new Error(
        "LOCAL_ORIGINAL_BOT_ILLEGAL: " +
          this.state.phase +
          " " +
          action.type +
          " " +
          (result.error?.code ?? "UNKNOWN"),
      );
    }
    this.state = result.state;
  }

  private reactToHuman(intent: HumanActionIntent): void {
    if (
      intent.type === "SEND_CHAT" &&
      intent.channel === "PUBLIC" &&
      (this.state.phase === "DAY_DISCUSSION" || this.state.phase === "ACCUSATION")
    ) {
      const bots = this.livingBots();
      for (const bot of this.botRng.shuffle(bots).slice(0, Math.min(2, bots.length))) {
        if (this.state.phase !== "DAY_DISCUSSION" && this.state.phase !== "ACCUSATION") break;
        const view = buildOriginalPlayerView(this.state, bot.id);
        if (!view.availableActions.includes("SEND_CHAT")) continue;
        this.dispatchBot({
          type: "SEND_CHAT",
          playerId: bot.id,
          channel: "PUBLIC",
          text: originalBotChat(view, this.botRng),
        });
      }
    }
  }

  private pumpBots(): void {
    for (let guard = 0; guard < 1000; guard += 1) {
      if (this.state.phase === "GAME_OVER") return;

      const phase = this.state.phase;
      let progressed = false;

      if (phase === "LOBBY") return;

      if (phase === "ROLE_REVEAL") {
        for (const bot of this.livingOrDeadBots()) {
          if (this.state.phase !== "ROLE_REVEAL") break;
          const view = buildOriginalPlayerView(this.state, bot.id);
          if (view.availableActions.includes("CONFIRM_ROLE")) {
            this.dispatchBot({ type: "CONFIRM_ROLE", playerId: bot.id });
            progressed = true;
          }
        }
      } else if (phase === "SUNRISE") {
        for (const bot of this.livingOrDeadBots()) {
          if (this.state.phase !== "SUNRISE") break;
          const view = buildOriginalPlayerView(this.state, bot.id);
          if (view.availableActions.includes("CONFIRM_SUNRISE")) {
            this.dispatchBot({ type: "CONFIRM_SUNRISE", playerId: bot.id });
            progressed = true;
          }
        }
      } else if (phase === "DAY_DISCUSSION") {
        progressed = this.openDayConversation() || progressed;

        const human = buildOriginalPlayerView(this.state, this.humanId);
        if (!human.self.alive) {
          const actor = this.botRng.pick(this.livingBots());
          if (this.botRng.next() < 0.58) {
            const view = buildOriginalPlayerView(this.state, actor.id);
            this.dispatchBot({
              type: "ACCUSE_PLAYER",
              playerId: actor.id,
              targetId: originalBotAccusationTarget(view, this.botRng),
            });
          } else {
            this.dispatchBot({ type: "PROPOSE_MAFIA_NIGHT", playerId: actor.id });
          }
          progressed = true;
        } else {
          return;
        }
      } else if (phase === "ACCUSATION") {
        progressed = this.runAccusationConversation() || progressed;

        const accusation = this.state.accusation;
        if (!accusation) throw new Error("LOCAL_ORIGINAL_ACCUSATION_MISSING");
        if (accusation.accuserId !== this.humanId) {
          this.dispatchBot({
            type: "CALL_GUILTY_VOTE",
            playerId: accusation.accuserId,
          });
          progressed = true;
        } else {
          return;
        }
      } else if (phase === "GUILTY_VOTE") {
        for (const bot of this.livingBots()) {
          if (this.state.phase !== "GUILTY_VOTE") break;
          const view = buildOriginalPlayerView(this.state, bot.id);
          if (!view.availableActions.includes("CAST_GUILTY_VOTE")) continue;
          this.dispatchBot({
            type: "CAST_GUILTY_VOTE",
            playerId: bot.id,
            guilty: originalBotGuiltyVote(view, this.botRng),
          });
          progressed = true;
        }

        if (this.state.phase === "GUILTY_VOTE") {
          const human = buildOriginalPlayerView(this.state, this.humanId);
          if (human.availableActions.includes("CAST_GUILTY_VOTE")) return;
        }
      } else if (phase === "NIGHT_PROPOSAL_VOTE") {
        for (const bot of this.livingBots()) {
          if (this.state.phase !== "NIGHT_PROPOSAL_VOTE") break;
          const view = buildOriginalPlayerView(this.state, bot.id);
          if (!view.availableActions.includes("CAST_NIGHT_PROPOSAL_VOTE")) continue;
          this.dispatchBot({
            type: "CAST_NIGHT_PROPOSAL_VOTE",
            playerId: bot.id,
            agree: originalBotNightProposalVote(view, this.botRng),
          });
          progressed = true;
        }

        if (this.state.phase === "NIGHT_PROPOSAL_VOTE") {
          const human = buildOriginalPlayerView(this.state, this.humanId);
          if (human.availableActions.includes("CAST_NIGHT_PROPOSAL_VOTE")) return;
        }
      } else if (phase === "MAFIA_NIGHT") {
        for (const bot of this.livingBots()) {
          if (this.state.phase !== "MAFIA_NIGHT") break;
          const view = buildOriginalPlayerView(this.state, bot.id);
          if (!view.availableActions.includes("SUBMIT_NIGHT_NOTE")) continue;
          this.dispatchBot({
            type: "SUBMIT_NIGHT_NOTE",
            playerId: bot.id,
            note: originalBotNightNote(view, this.botRng),
          });
          progressed = true;
        }

        if (this.state.phase === "MAFIA_NIGHT") {
          const human = buildOriginalPlayerView(this.state, this.humanId);
          if (human.availableActions.includes("SUBMIT_NIGHT_NOTE")) return;
        }
      } else if (phase === "NIGHT_RESOLVE") {
        throw new Error("LOCAL_ORIGINAL_AUTOMATIC_PHASE_LEAK");
      }

      if (!progressed) return;
    }

    throw new Error("LOCAL_ORIGINAL_STALLED");
  }

  private openDayConversation(): boolean {
    if (this.openedDays.has(this.state.day)) return false;
    this.openedDays.add(this.state.day);

    let progressed = false;
    for (const bot of this.botRng.shuffle(this.livingBots()).slice(0, 3)) {
      if (this.state.phase !== "DAY_DISCUSSION") break;
      const view = buildOriginalPlayerView(this.state, bot.id);
      if (!view.availableActions.includes("SEND_CHAT")) continue;
      this.dispatchBot({
        type: "SEND_CHAT",
        playerId: bot.id,
        channel: "PUBLIC",
        text: originalBotChat(view, this.botRng),
      });
      progressed = true;
    }
    return progressed;
  }

  private runAccusationConversation(): boolean {
    const accusation = this.state.accusation;
    if (!accusation) return false;
    const marker = this.state.chat
      .filter((entry) => entry.system?.code === "PLAYER_ACCUSED")
      .at(-1)?.seq;
    if (!marker || this.accusationBotReplies.has(marker)) return false;
    this.accusationBotReplies.add(marker);

    let progressed = false;
    for (const playerId of [accusation.accusedId, accusation.accuserId]) {
      if (playerId === this.humanId) continue;
      const view = buildOriginalPlayerView(this.state, playerId);
      if (!view.availableActions.includes("SEND_CHAT")) continue;
      this.dispatchBot({
        type: "SEND_CHAT",
        playerId,
        channel: "PUBLIC",
        text:
          playerId === accusation.accusedId
            ? "나는 마피아가 아니야. 내 발언 중 어떤 부분이 문제였는지 말해줘."
            : "내가 본 흐름에서는 이 사람이 가장 설명이 필요해 보여.",
      });
      progressed = true;
    }

    return progressed;
  }

  private livingBots() {
    return this.state.players.filter(
      (player) => player.id !== this.humanId && player.alive,
    );
  }

  private livingOrDeadBots() {
    return this.state.players.filter((player) => player.id !== this.humanId);
  }
}
