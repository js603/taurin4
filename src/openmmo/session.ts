import type { GameCommand, GameState } from "../game/model";
import { createInitialGameState } from "../game/simulation";
import type { GameSession } from "../game/session";
import type { OpenMmoAdapter } from "./adapter";
import type {
  OpenMmoAbilityId,
  OpenMmoEquipSlot,
  OpenMmoInventory,
  OpenMmoServerMessage,
} from "./types";

export interface OpenMmoSessionAdapter {
  subscribeMessages(
    listener: (message: OpenMmoServerMessage) => void,
  ): () => void;
  sendAttack(monsterId: string): boolean;
  useAbility(
    ability: OpenMmoAbilityId,
    options?: { monsterId?: string; targetPlayerId?: number },
  ): boolean;
  pickupItem(instanceId: number): boolean;
  dropItem(instanceId: number): boolean;
  equipItem(instanceId: number): boolean;
  unequipItem(slot: OpenMmoEquipSlot): boolean;
  sendMove(
    position: { x: number; y: number; z: number },
    rotation: number,
    floorLevel: number,
    options?: { append?: boolean; sprinting?: boolean },
  ): boolean;
  requestRespawn(): boolean;
}

type PlayerWire = {
  id: number;
  name: string;
  health: number;
  max_health: number;
  position?: { x: number; y: number; z: number };
  rotation?: number;
  floor_level?: number;
  is_official_npc?: boolean;
};

type MonsterWire = {
  id: string;
  monster_type: string;
  health: number;
  max_health: number;
  position?: { x: number; y: number; z: number };
  floor_level?: number;
  aggressive?: boolean;
};

type WorldUpdateWire = {
  world_epoch: string;
  generation: number;
  sequence: number;
  position: { x: number; y: number; z: number };
  floor_level: number;
  reset: boolean;
  ready: boolean;
  events: Array<{
    subject: string;
    revision: number;
    change: "Enter" | "Update" | "Leave" | "Delete";
    messages: unknown[];
  }>;
};

function variantOf(message: OpenMmoServerMessage): string {
  if (typeof message === "string") return message;
  if (!message || typeof message !== "object") return "Unknown";
  return Object.keys(message)[0] ?? "Unknown";
}

function payloadOf<T>(message: OpenMmoServerMessage, variant: string): T {
  return (message as Record<string, unknown>)[variant] as T;
}

const OPENMMO_ABILITIES: readonly OpenMmoAbilityId[] = [
  "guardian_ward",
  "radiance",
  "bow_mark",
  "dagger_double_slash",
  "auscultation",
];

function normalizeInventory(inventory: OpenMmoInventory) {
  const equipped = Object.entries(inventory.equipped ?? {}).flatMap(
    ([slot, item]) =>
      item
        ? [
            {
              instanceId: item.instance_id,
              itemDefId: item.item_def_id,
              quantity: item.quantity,
              enchant: item.enchant ?? 0,
              locked: item.locked ?? false,
              equippedSlot: slot,
            },
          ]
        : [],
  );
  return {
    bag: inventory.bag.map((item) => ({
      instanceId: item.instance_id,
      itemDefId: item.item_def_id,
      quantity: item.quantity,
      enchant: item.enchant ?? 0,
      locked: item.locked ?? false,
    })),
    equipped,
    activeAmmo: inventory.active_ammo ?? null,
  };
}

function monsterName(monsterType: string) {
  return monsterType
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

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
    semanticDestinations: [],
    semanticTravel: null,
    abilities: OPENMMO_ABILITIES.map((id) => ({ id, remainingMs: 0 })),
    inventory: { bag: [], equipped: [], activeAmmo: null },
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
  private readonly recentlyDeadMonsters = new Map<string, string>();
  private worldEpoch = "";
  private worldGeneration = 0;
  private worldSequence = 0;

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
            "후퇴는 semantic destination 정책이 확정될 때 서버 이동으로 연결한다.",
            "log",
          ),
        );
        return;

      case "MOVE_TO":
        if (
          this.adapter.sendMove(
            command.position,
            command.rotation,
            command.floorLevel,
            {
              append: command.append,
              sprinting: command.sprinting,
            },
          )
        ) {
          this.setState(
            addLog(
              this.state,
              "이동 요청을 서버에 보냈다. 권위 위치 응답을 기다린다.",
              "floating",
            ),
          );
        }
        return;

      case "TRAVEL_TO_DESTINATION": {
        const destination = this.state.semanticDestinations?.find(
          (item) => item.id === command.destinationId,
        );
        const current = this.state.player.position;
        if (!destination || !current) return;

        const dx = destination.position.x - current.x;
        const dz = destination.position.z - current.z;
        const distance = Math.hypot(dx, dz);
        const stopDistance = this.arrivalRadius(destination.kind);

        if (distance <= stopDistance) {
          this.setState(
            addLog(
              {
                ...this.state,
                semanticTravel: null,
              },
              destination.label + " 근처에 이미 도착해 있다.",
              "floating",
            ),
          );
          return;
        }

        const ratio = Math.max(0, (distance - stopDistance) / distance);
        const target = {
          x: current.x + dx * ratio,
          y: destination.position.y,
          z: current.z + dz * ratio,
        };
        const rotation = Math.atan2(dx, dz);

        if (
          this.adapter.sendMove(
            target,
            rotation,
            destination.floorLevel,
            { sprinting: command.sprinting ?? false },
          )
        ) {
          this.setState(
            addLog(
              {
                ...this.state,
                semanticTravel: {
                  destinationId: destination.id,
                  label: destination.label,
                },
              },
              destination.label + " 쪽으로 이동을 시작했다.",
              "floating",
            ),
          );
        }
        return;
      }

      case "USE_ABILITY": {
        const monsterId = command.monsterId ?? this.state.combat?.enemy.id;
        if (
          this.adapter.useAbility(command.ability, {
            monsterId,
            targetPlayerId: command.targetPlayerId,
          })
        ) {
          this.setState(
            addLog(
              this.state,
              "능력 사용 요청: " + command.ability.replaceAll("_", " "),
              "floating",
            ),
          );
        }
        return;
      }

      case "PICKUP_ITEM":
        if (this.adapter.pickupItem(command.instanceId)) {
          this.setState(
            addLog(this.state, "전리품 획득을 서버에 요청했다.", "floating"),
          );
        }
        return;

      case "DROP_ITEM":
        if (this.adapter.dropItem(command.instanceId)) {
          this.setState(
            addLog(this.state, "아이템 드롭을 서버에 요청했다.", "floating"),
          );
        }
        return;

      case "EQUIP_ITEM":
        if (this.adapter.equipItem(command.instanceId)) {
          this.setState(addLog(this.state, "장착 요청을 서버에 보냈다."));
        }
        return;

      case "UNEQUIP_ITEM":
        if (this.adapter.unequipItem(command.slot as OpenMmoEquipSlot)) {
          this.setState(addLog(this.state, "장착 해제 요청을 서버에 보냈다."));
        }
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
      case "WorldUpdate": {
        const update = payloadOf<WorldUpdateWire>(message, variant);
        if (!this.acceptWorldUpdate(update)) return;

        let next: GameState = {
          ...this.state,
          player: {
            ...this.state.player,
            position: update.position,
            floorLevel: update.floor_level,
          },
        };
        if (update.reset) {
          next = {
            ...next,
            semanticDestinations: [],
            semanticTravel: null,
          };
        }
        this.setState(this.withDestinationDistances(next));

        for (const event of update.events) {
          for (const nested of event.messages) {
            this.applyServerMessage(nested as OpenMmoServerMessage);
          }
        }

        this.checkSemanticArrival();
        return;
      }
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
                position: player.position ?? this.state.player.position,
                rotation: player.rotation ?? this.state.player.rotation,
                floorLevel: player.floor_level ?? this.state.player.floorLevel,
              },
            },
            player.name + " 캐릭터로 OpenMMO 월드에 입장했다.",
            "focus",
          ),
        );
        return;
      }

      case "PlayerMoved":
      case "PlayerTeleported": {
        const payload = payloadOf<{
          player_id: number;
          position: { x: number; y: number; z: number };
          rotation: number;
          floor_level: number;
          sprinting?: boolean;
        }>(message, variant);
        if (payload.player_id !== this.currentPlayerId) {
          this.updateDestinationPosition(
            "player:" + payload.player_id,
            payload.position,
            payload.floor_level,
          );
          return;
        }

        this.setState(
          this.withDestinationDistances({
            ...this.state,
            player: {
              ...this.state.player,
              position: payload.position,
              rotation: payload.rotation,
              floorLevel: payload.floor_level,
              sprinting: payload.sprinting ?? false,
            },
          }),
        );
        this.checkSemanticArrival();
        return;
      }

      case "InventoryState":
      case "InventoryUpdated": {
        const payload = payloadOf<{ inventory: OpenMmoInventory }>(message, variant);
        const inventory = normalizeInventory(payload.inventory);
        this.setState({
          ...this.state,
          inventory,
        });
        return;
      }

      case "AbilityCooldowns": {
        const payload = payloadOf<{
          cooldowns: Array<{
            ability: OpenMmoAbilityId;
            remaining_ms: number;
          }>;
        }>(message, variant);
        const remaining = new Map(
          payload.cooldowns.map((timer) => [timer.ability, timer.remaining_ms]),
        );
        this.setState({
          ...this.state,
          abilities: OPENMMO_ABILITIES.map((id) => ({
            id,
            remainingMs: remaining.get(id) ?? 0,
          })),
        });
        return;
      }

      case "AbilityRejected": {
        const payload = payloadOf<{
          ability: OpenMmoAbilityId;
          reason: string;
        }>(message, variant);
        this.setState(
          addLog(
            this.state,
            payload.ability.replaceAll("_", " ") +
              " 사용 거부: " +
              payload.reason.replaceAll("_", " "),
            "floating",
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
        if (monster.position) {
          this.upsertDestination({
            id: "monster:" + monster.id,
            kind: "monster",
            label: name,
            position: monster.position,
            floorLevel: monster.floor_level ?? 0,
            distanceMeters: 0,
            detail: monster.aggressive ? "선공 가능" : "몬스터",
          });
        }
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

      case "MonsterMoved": {
        const payload = payloadOf<{
          monster_id: string;
          position: { x: number; y: number; z: number };
          floor_level?: number;
        }>(message, variant);
        this.updateDestinationPosition(
          "monster:" + payload.monster_id,
          payload.position,
          payload.floor_level,
        );
        return;
      }

      case "MonsterRemoved": {
        const payload = payloadOf<{ monster_id: string }>(message, variant);
        this.removeDestination("monster:" + payload.monster_id);
        return;
      }

      case "PlayerAppeared":
      case "PlayerJoined": {
        const player = payloadOf<{ player: PlayerWire }>(message, variant).player;
        if (player.id !== this.currentPlayerId && player.position) {
          this.upsertDestination({
            id: "player:" + player.id,
            kind: player.is_official_npc ? "npc" : "player",
            label: player.name,
            position: player.position,
            floorLevel: player.floor_level ?? 0,
            distanceMeters: 0,
            detail: player.is_official_npc ? "NPC / Agent" : "다른 플레이어",
          });
        }
        return;
      }

      case "PlayerDisappeared":
      case "PlayerLeft": {
        const payload = payloadOf<{ player_id: number }>(message, variant);
        this.removeDestination("player:" + payload.player_id);
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

      case "PlayerAttackRejected": {
        const payload = payloadOf<{
          monster_id: string;
          reason: string;
        }>(message, variant);

        const reasonText: Record<string, string> = {
          invalid_target: "대상이 사라졌다.",
          out_of_range: "공격 거리를 벗어났다.",
          attacker_dead: "쓰러진 상태에서는 공격할 수 없다.",
          out_of_ammo: "사용 가능한 탄약이 없다.",
        };

        if (
          payload.reason === "invalid_target" &&
          this.state.combat?.enemy.id === payload.monster_id
        ) {
          this.removeDestination("monster:" + payload.monster_id);
          this.setState({
            ...this.state,
            phase: "exploration",
            encounter: null,
            combat: null,
          });
        }

        this.setState(
          addLog(
            this.state,
            "공격 거부: " +
              (reasonText[payload.reason] ??
                payload.reason.replaceAll("_", " ")),
            "floating",
          ),
        );
        return;
      }

      case "MonsterDead": {
        const payload = payloadOf<{ monster_id: string }>(message, variant);
        const semanticMonster = this.state.semanticDestinations?.find(
          (destination) => destination.id === "monster:" + payload.monster_id,
        );
        const currentEnemy =
          this.state.combat?.enemy.id === payload.monster_id
            ? this.state.combat.enemy
            : null;
        const enemyName =
          currentEnemy?.name ?? semanticMonster?.label ?? payload.monster_id;

        this.recentlyDeadMonsters.set(payload.monster_id, enemyName);
        this.removeDestination("monster:" + payload.monster_id);

        if (!currentEnemy) {
          this.setState(
            addLog(this.state, "주변 몬스터가 쓰러졌다.", "floating"),
          );
          return;
        }

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

      case "GroundItemSpawned":
      case "GroundItemAppeared": {
        const item = payloadOf<{
          item: {
            instance_id: number;
            item_def_id: string;
            position: { x: number; y: number; z: number };
            floor_level: number;
            quantity: number;
            dropped_by?: number | null;
          };
        }>(message, variant).item;
        this.upsertDestination({
          id: "loot:" + item.instance_id,
          kind: "loot",
          label: item.item_def_id.replaceAll("_", " "),
          position: item.position,
          floorLevel: item.floor_level,
          distanceMeters: 0,
          detail: item.quantity > 1 ? "전리품 × " + item.quantity : "전리품",
        });
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

      case "GroundItemQuantityChanged": {
        const payload = payloadOf<{
          instance_id: number;
          quantity: number;
        }>(message, variant);
        const id = "loot:" + payload.instance_id;
        const destination = this.state.semanticDestinations?.find(
          (item) => item.id === id,
        );
        if (destination) {
          this.upsertDestination({
            ...destination,
            detail: "전리품 × " + payload.quantity,
          });
        }
        return;
      }

      case "GroundItemRemoved": {
        const payload = payloadOf<{ instance_id: number }>(message, variant);
        this.removeDestination("loot:" + payload.instance_id);
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
          monster_id?: string | null;
        }>(message, variant);

        let next = this.state;
        const monsterId = payload.monster_id ?? null;
        if (monsterId) {
          const semanticMonster = next.semanticDestinations?.find(
            (destination) => destination.id === "monster:" + monsterId,
          );
          const currentEnemy =
            next.combat?.enemy.id === monsterId ? next.combat.enemy : null;
          const enemyName =
            this.recentlyDeadMonsters.get(monsterId) ??
            currentEnemy?.name ??
            semanticMonster?.label ??
            monsterId;

          this.recentlyDeadMonsters.delete(monsterId);
          this.removeDestination("monster:" + monsterId);
          next = this.state;

          const alreadyRewardingKill =
            next.phase === "reward" &&
            next.reward?.title === enemyName + " 처치";

          if (!alreadyRewardingKill) {
            next = addLog(
              {
                ...next,
                phase: "reward",
                encounter: null,
                combat: null,
                reward: {
                  title: enemyName + " 처치",
                  items: ["서버 전리품 이벤트 대기 중"],
                },
              },
              enemyName + " 처치가 서버 XP로 확정됐다.",
              "focus",
            );
          }
        }

        this.setState(
          addLog(
            next,
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

  private acceptWorldUpdate(update: WorldUpdateWire) {
    if (update.reset || !this.worldEpoch) {
      this.worldEpoch = update.world_epoch;
      this.worldGeneration = update.generation;
      this.worldSequence = update.sequence;
      return true;
    }

    if (update.world_epoch !== this.worldEpoch) {
      this.worldEpoch = update.world_epoch;
      this.worldGeneration = update.generation;
      this.worldSequence = update.sequence;
      return true;
    }

    if (
      update.generation < this.worldGeneration ||
      (update.generation === this.worldGeneration &&
        update.sequence <= this.worldSequence)
    ) {
      return false;
    }

    this.worldGeneration = update.generation;
    this.worldSequence = update.sequence;
    return true;
  }

  private arrivalRadius(kind: "monster" | "player" | "npc" | "loot") {
    if (kind === "monster") return 2.5;
    if (kind === "player" || kind === "npc") return 1.5;
    return 0.8;
  }

  private withDestinationDistances(state: GameState): GameState {
    const current = state.player.position;
    const destinations = state.semanticDestinations ?? [];
    if (!current) return state;

    return {
      ...state,
      semanticDestinations: destinations
        .map((destination) => ({
          ...destination,
          distanceMeters: Math.hypot(
            destination.position.x - current.x,
            destination.position.z - current.z,
          ),
        }))
        .sort((a, b) => a.distanceMeters - b.distanceMeters),
    };
  }

  private upsertDestination(
    destination: NonNullable<GameState["semanticDestinations"]>[number],
  ) {
    const destinations = this.state.semanticDestinations ?? [];
    this.setState(
      this.withDestinationDistances({
        ...this.state,
        semanticDestinations: [
          ...destinations.filter((item) => item.id !== destination.id),
          destination,
        ],
      }),
    );
  }

  private updateDestinationPosition(
    id: string,
    position: { x: number; y: number; z: number },
    floorLevel?: number,
  ) {
    const destinations = this.state.semanticDestinations ?? [];
    const found = destinations.find((item) => item.id === id);
    if (!found) return;
    this.upsertDestination({
      ...found,
      position,
      floorLevel: floorLevel ?? found.floorLevel,
    });
  }

  private removeDestination(id: string) {
    const destinations = this.state.semanticDestinations ?? [];
    if (!destinations.some((item) => item.id === id)) return;

    const travelling = this.state.semanticTravel?.destinationId === id;
    let next: GameState = {
      ...this.state,
      semanticDestinations: destinations.filter((item) => item.id !== id),
      semanticTravel: travelling ? null : this.state.semanticTravel,
    };
    if (travelling) {
      next = addLog(next, "이동 중이던 대상이 시야에서 사라졌다.", "floating");
    }
    this.setState(next);
  }

  private checkSemanticArrival() {
    const travel = this.state.semanticTravel;
    const current = this.state.player.position;
    if (!travel || !current) return;
    const destination = this.state.semanticDestinations?.find(
      (item) => item.id === travel.destinationId,
    );
    if (!destination) return;

    const distance = Math.hypot(
      destination.position.x - current.x,
      destination.position.z - current.z,
    );
    if (distance > this.arrivalRadius(destination.kind) + 0.35) return;

    this.setState(
      addLog(
        {
          ...this.state,
          semanticTravel: null,
        },
        travel.label + " 근처에 도착했다.",
        "focus",
      ),
    );
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
