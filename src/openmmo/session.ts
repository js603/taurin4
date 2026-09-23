import type { GameCommand, GameState } from "../game/model";
import { createInitialGameState } from "../game/simulation";
import type { GameSession } from "../game/session";
import type { OpenMmoAdapter } from "./adapter";
import type { OpenMmoServerMessage } from "./types";

export interface OpenMmoSessionAdapter {
  subscribeMessages(
    listener: (message: OpenMmoServerMessage) => void,
  ): () => void;
  sendAttack(monsterId: string): boolean;
  requestRespawn(): boolean;
}

type PlayerWire = {
  id: number;
  name: string;
  health: number;
  max_health: number;
};

type MonsterWire = {
  id: string;
  monster_type: string;
  health: number;
  max_health: number;
  aggressive?: boolean;
};

function variantOf(message: OpenMmoServerMessage): string {
  if (typeof message === "string") return message;
  if (!message || typeof message !== "object") return "Unknown";
  return Object.keys(message)[0] ?? "Unknown";
}

function payloadOf<T>(message: OpenMmoServerMessage, variant: string): T {
  return (message as Record<string, unknown>)[variant] as T;
}

function monsterName(monsterType: string) {
  return monsterType
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");


function addLog(
  state: GameState,
  text: string,
  attention: "log" | "floating" | "focus" | "critical" = "log",
): GameState {
  return {
    ...state,
    nextLogId: state.nextLogId + 1,
    logs: [
      ...state.logs.slice(-11),
      {
        id: state.nextLogId,
        worldMinutes: state.worldMinutes,
        text,
        attention,
      },
    ],
  };
}

function createOpenMmoInitialState(): GameState {
  const state = createInitialGameState();
  return {
    ...state,
    source: "openmmo",
    phase: "exploration",
    nearbyOpen: false,
    encounter: null,
    travel: null,
    combat: null,
    reward: null,
    logs: [
      {
        id: 1,
        worldMinutes: state.worldMinutes,
        text: "OpenMMO 서버 이벤트를 기다리고 있다.",
        attention: "log",
      },
    ],
    nextLogId: 2,
  };
}

/**
 * Semantic projection of the authoritative OpenMMO event stream.
 *
 * This class deliberately does not reproduce the original 3D client stores.
 * It converts server facts into the existing idea2 GameSession contract so the
 * Text/Card UI can stay backend-agnostic.
 */
export class OpenMmoGameSession implements GameSession {
  private state = createOpenMmoInitialState();
  private readonly listeners = new Set<() => void>();
  private unsubscribeMessages: (() => void) | null = null;
  private currentPlayerId: number | null = null;

  constructor(private readonly adapter: OpenMmoSessionAdapter) {}

  getSnapshot = () => this.state;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start = () => {
    if (this.unsubscribeMessages) return;
    this.unsubscribeMessages = this.adapter.subscribeMessages((message) => {
      this.applyServerMessage(message);
    });
  };

  stop = () => {
    this.unsubscribeMessages?.();
    this.unsubscribeMessages = null;
  };

  command = (command: GameCommand) => {
    switch (command.type) {
      case "INVESTIGATE_ENCOUNTER": {
        const encounter = this.state.encounter;
        if (!encounter) return;
        this.setState(
          addLog(
            {
              ...this.state,
              phase: "combat",
              encounter: null,
              combat: {
                enemy: {
                  id: encounter.entityId,
                  name: encounter.name,
                  hp: encounter.hp,
                  maxHp: encounter.maxHp,
                  distanceMeters: 0,
                },
                attacks: 0,
                telegraphRemainingMs: null,
                vulnerable: false,
                lastOutcome: "none",
              },
            },
            encounter.name + "에게 주의를 집중했다.",
            "focus",
          ),
        );
        return;
      }

      case "IGNORE_ENCOUNTER":
        this.setState(
          addLog(
            {
              ...this.state,
              phase: "exploration",
              encounter: null,
            },
            "주변 개체를 지나쳤다.",
          ),
        );
        return;

      case "ATTACK":
      case "COUNTER": {
        const monsterId = this.state.combat?.enemy.id;
        if (!monsterId) return;
        if (this.adapter.sendAttack(monsterId)) {
          this.setState(
            addLog(this.state, "공격 요청을 서버에 보냈다.", "floating"),
          );
        }
        return;
      }

      case "RETREAT":
        this.setState(
          addLog(
            this.state,
            "후퇴/이동은 다음 OpenMMO movement mapping 단계에서 연결된다.",
            "log",
          ),
        );
        return;

      case "DODGE":
      case "GUARD":
        this.setState(
          addLog(
            this.state,
            "이 반응 입력은 현재 OpenMMO 전투 규칙에 직접 대응하지 않는다.",
            "log",
          ),
        );
        return;

      case "OPEN_NEARBY":
      case "CLOSE_NEARBY":
      case "START_TRAVEL":
      case "TICK":
      case "COLLECT_REWARD":
        return;
    }
  };

  requestRespawn() {
    return this.adapter.requestRespawn();
  }

  private applyServerMessage(message: OpenMmoServerMessage) {
    const variant = variantOf(message);

    switch (variant) {
      case "JoinSuccess": {
        const player = payloadOf<{ player: PlayerWire }>(
          message,
          variant,
        ).player;
        this.currentPlayerId = player.id;
        this.setState(
          addLog(
            {
              ...this.state,
              phase: "exploration",
              player: {
                ...this.state.player,
                hp: player.health,
                maxHp: player.max_health,
              },
            },
            player.name + " 캐릭터로 OpenMMO 월드에 입장했다.",
            "focus",
          ),
        );
        return;
      }

      case "GameTimeSync": {
        const payload = payloadOf<{
          datetime: {
            hour: number;
            minute: number;
          };
        }>(message, variant);
        this.setState({
          ...this.state,
          worldMinutes: payload.datetime.hour * 60 + payload.datetime.minute,
        });
        return;
      }

      case "ManaUpdate": {
        const payload = payloadOf<{ mana: number; max_mana: number }>(
          message,
          variant,
        );
        this.setState({
          ...this.state,
          player: {
            ...this.state.player,
            mp: payload.mana,
            maxMp: payload.max_mana,
          },
        });
        return;
      }

      case "PlayerHealthUpdate": {
        const payload = payloadOf<{
          player_id: number;
          health: number;
          max_health: number;
        }>(message, variant);
        if (payload.player_id !== this.currentPlayerId) return;
        this.setState({
          ...this.state,
          player: {
            ...this.state.player,
            hp: payload.health,
            maxHp: payload.max_health,
          },
        });
        return;
      }

      case "MonsterSpawned": {
        const monster = payloadOf<{ monster: MonsterWire }>(
          message,
          variant,
        ).monster;
        const name = monsterName(monster.monster_type);
        if (monster.aggressive && this.state.phase === "exploration") {
          this.setState(
            addLog(
              {
                ...this.state,
                phase: "encounter",
                encounter: {
                  kind: "monster",
                  entityId: monster.id,
                  name,
                  hp: monster.health,
                  maxHp: monster.max_health,
                  aggressive: true,
                },
              },
              name + "이(가) 전투 범위에 들어왔다.",
              "focus",
            ),
          );
        } else {
          this.setState(
            addLog(this.state, "주변에 " + name + "이(가) 나타났다."),
          );
        }
        return;
      }

      case "MonsterAttackedPlayer": {
        const payload = payloadOf<{
          monster_id: string;
          player_id: number;
          hit: boolean;
          damage: number;
          current_health: number;
        }>(message, variant);
        if (payload.player_id !== this.currentPlayerId) return;

        const existing = this.state.combat?.enemy;
        const encounter = this.state.encounter;
        const enemy = existing ?? {
          id: payload.monster_id,
          name:
            encounter?.entityId === payload.monster_id
              ? encounter.name
              : payload.monster_id,
          hp:
            encounter?.entityId === payload.monster_id
              ? encounter.hp
              : 1,
          maxHp:
            encounter?.entityId === payload.monster_id
              ? encounter.maxHp
              : 1,
          distanceMeters: 0,
        };

        this.setState(
          addLog(
            {
              ...this.state,
              phase: "combat",
              encounter: null,
              player: {
                ...this.state.player,
                hp: payload.current_health,
              },
              combat: {
                enemy,
                attacks: this.state.combat?.attacks ?? 0,
                telegraphRemainingMs: null,
                vulnerable: false,
                lastOutcome: payload.hit ? "hit" : "none",
              },
            },
            payload.hit
              ? enemy.name + "의 공격. -" + payload.damage + " HP"
              : enemy.name + "의 공격이 빗나갔다.",
            payload.hit ? "critical" : "floating",
          ),
        );
        return;
      }

      case "PlayerAttacked": {
        const payload = payloadOf<{
          player_id: number;
          monster_id: string;
          hit: boolean;
          damage: number;
        }>(message, variant);
        if (payload.player_id !== this.currentPlayerId) return;

        const combat = this.state.combat;
        if (!combat || combat.enemy.id !== payload.monster_id) {
          this.setState(
            addLog(
              this.state,
              payload.hit
                ? "공격 적중. " + payload.damage + " 피해"
                : "공격이 빗나갔다.",
              "floating",
            ),
          );
          return;
        }

        this.setState(
          addLog(
            {
              ...this.state,
              combat: {
                ...combat,
                attacks: combat.attacks + 1,
              },
            },
            payload.hit
              ? combat.enemy.name + "에게 " + payload.damage + " 피해"
              : combat.enemy.name + "에 대한 공격이 빗나갔다.",
            "floating",
          ),
        );
        return;
      }

      case "MonsterDead": {
        const payload = payloadOf<{ monster_id: string }>(message, variant);
        if (this.state.combat?.enemy.id !== payload.monster_id) {
          this.setState(
            addLog(this.state, "주변 몬스터가 쓰러졌다.", "floating"),
          );
          return;
        }

        const enemyName = this.state.combat.enemy.name;
        this.setState(
          addLog(
            {
              ...this.state,
              phase: "reward",
              combat: null,
              reward: {
                title: enemyName + " 처치",
                items: ["서버 전리품 이벤트 대기 중"],
              },
            },
            enemyName + "을(를) 쓰러뜨렸다.",
            "focus",
          ),
        );
        return;
      }

      case "GroundItemSpawned": {
        const item = payloadOf<{
          item: {
            item_def_id: string;
            quantity: number;
            dropped_by?: number | null;
          };
        }>(message, variant).item;
        if (item.dropped_by == null) {
          this.setState(
            addLog(
              this.state,
              "전리품 출현: " +
                item.item_def_id +
                (item.quantity > 1 ? " × " + item.quantity : ""),
              "floating",
            ),
          );
        }
        return;
      }

      case "ChatMessage": {
        const payload = payloadOf<{ message: string }>(message, variant);
        this.setState(addLog(this.state, "채팅: " + payload.message));
        return;
      }

      case "SystemMessage": {
        const payload = payloadOf<{ message: string }>(message, variant);
        this.setState(addLog(this.state, payload.message, "floating"));
        return;
      }

      case "PlayerDead": {
        const payload = payloadOf<{ player_id: number }>(message, variant);
        if (payload.player_id !== this.currentPlayerId) return;
        this.setState(
          addLog(
            {
              ...this.state,
              player: { ...this.state.player, hp: 0 },
            },
            "캐릭터가 쓰러졌다. 부활 요청을 기다린다.",
            "critical",
          ),
        );
        return;
      }

      case "PlayerRespawned": {
        const player = payloadOf<{ player: PlayerWire }>(
          message,
          variant,
        ).player;
        if (player.id !== this.currentPlayerId) return;
        this.setState(
          addLog(
            {
              ...this.state,
              phase: "exploration",
              encounter: null,
              combat: null,
              reward: null,
              player: {
                ...this.state.player,
                hp: player.health,
                maxHp: player.max_health,
              },
            },
            "부활했다.",
            "focus",
          ),
        );
        return;
      }

      case "XpGained": {
        const payload = payloadOf<{
          xp_amount: number;
          new_level: number;
          leveled_up: boolean;
        }>(message, variant);
        this.setState(
          addLog(
            this.state,
            payload.leveled_up
              ? "LEVEL UP → " + payload.new_level
              : "XP +" + payload.xp_amount,
            payload.leveled_up ? "focus" : "floating",
          ),
        );
        return;
      }
    }
  }

  private setState(state: GameState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
}

export function createOpenMmoGameSession(
  adapter: OpenMmoAdapter,
): OpenMmoGameSession {
  return new OpenMmoGameSession(adapter);
}
