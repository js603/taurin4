import { describe, expect, it, vi } from "vitest";
import { OpenMmoGameSession } from "./session";
import type { OpenMmoServerMessage } from "./types";

class FakeAdapter {
  private listener: ((message: OpenMmoServerMessage) => void) | null = null;
  sendAttack = vi.fn(() => true);
  useAbility = vi.fn(() => true);
  pickupItem = vi.fn(() => true);
  dropItem = vi.fn(() => true);
  equipItem = vi.fn(() => true);
  unequipItem = vi.fn(() => true);
  sendMove = vi.fn(() => true);
  requestRespawn = vi.fn(() => true);

  subscribeMessages(listener: (message: OpenMmoServerMessage) => void) {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }

  emit(message: OpenMmoServerMessage) {
    this.listener?.(message);
  }
}

describe("OpenMmoGameSession", () => {
  it("projects join, time and vitals into the shared GameState", () => {
    const adapter = new FakeAdapter();
    const session = new OpenMmoGameSession(adapter);
    session.start();

    adapter.emit({
      JoinSuccess: {
        player: {
          id: 11,
          name: "ScoutMira",
          health: 35,
          max_health: 40,
        },
      },
    });

    adapter.emit({
      GameTimeSync: {
        datetime: { year: 217, month: 3, day: 1, hour: 21, minute: 7 },
        is_night: true,
      },
    });

    adapter.emit({ ManaUpdate: { mana: 8, max_mana: 14 } });

    expect(session.getSnapshot()).toMatchObject({
      source: "openmmo",
      worldMinutes: 21 * 60 + 7,
      player: {
        hp: 35,
        maxHp: 40,
        mp: 8,
        maxMp: 14,
      },
    });
    expect(session.getSnapshot().logs.at(-1)?.text).toContain("ScoutMira");
  });

  it("turns an aggressive spawn into a dynamic encounter and real attack", () => {
    const adapter = new FakeAdapter();
    const session = new OpenMmoGameSession(adapter);
    session.start();

    adapter.emit({
      MonsterSpawned: {
        monster: {
          id: "wolf-7",
          monster_type: "grey_wolf",
          health: 22,
          max_health: 22,
          aggressive: true,
        },
      },
    });

    expect(session.getSnapshot()).toMatchObject({
      phase: "encounter",
      encounter: {
        entityId: "wolf-7",
        name: "Grey Wolf",
        hp: 22,
        aggressive: true,
      },
    });

    session.command({ type: "INVESTIGATE_ENCOUNTER" });
    expect(session.getSnapshot().phase).toBe("combat");

    session.command({ type: "ATTACK" });
    expect(adapter.sendAttack).toHaveBeenCalledWith("wolf-7");
  });

  it("unwraps WorldUpdate into semantic destinations and authoritative position", () => {
    const adapter = new FakeAdapter();
    const session = new OpenMmoGameSession(adapter);
    session.start();

    adapter.emit({
      JoinSuccess: {
        player: {
          id: 11,
          name: "ScoutMira",
          health: 30,
          max_health: 30,
          position: { x: 0, y: 0, z: 0 },
          rotation: 0,
          floor_level: 0,
        },
      },
    });

    adapter.emit({
      WorldUpdate: {
        world_epoch: "epoch-a",
        generation: 1,
        sequence: 1,
        position: { x: 2, y: 0, z: 3 },
        floor_level: 0,
        reset: true,
        ready: true,
        events: [
          {
            subject: "monster:wolf-7",
            revision: 1,
            change: "Enter",
            messages: [
              {
                MonsterSpawned: {
                  monster: {
                    id: "wolf-7",
                    monster_type: "grey_wolf",
                    position: { x: 8, y: 0, z: 3 },
                    floor_level: 0,
                    health: 22,
                    max_health: 22,
                    aggressive: false,
                  },
                },
              },
            ],
          },
        ],
      },
    });

    expect(session.getSnapshot().player.position).toEqual({ x: 2, y: 0, z: 3 });
    expect(session.getSnapshot().semanticDestinations).toEqual([
      expect.objectContaining({
        id: "monster:wolf-7",
        label: "Grey Wolf",
        distanceMeters: 6,
      }),
    ]);
  });

  it("travels to a semantic target and waits for server authority", () => {
    const adapter = new FakeAdapter();
    const session = new OpenMmoGameSession(adapter);
    session.start();

    adapter.emit({
      JoinSuccess: {
        player: {
          id: 11,
          name: "ScoutMira",
          health: 30,
          max_health: 30,
          position: { x: 0, y: 0, z: 0 },
          rotation: 0,
          floor_level: 0,
        },
      },
    });
    adapter.emit({
      MonsterSpawned: {
        monster: {
          id: "wolf-7",
          monster_type: "grey_wolf",
          position: { x: 10, y: 0, z: 0 },
          floor_level: 0,
          health: 22,
          max_health: 22,
          aggressive: false,
        },
      },
    });

    session.command({
      type: "TRAVEL_TO_DESTINATION",
      destinationId: "monster:wolf-7",
    });

    expect(adapter.sendMove).toHaveBeenCalledWith(
      { x: 7.5, y: 0, z: 0 },
      Math.PI / 2,
      0,
      { sprinting: false },
    );
    expect(session.getSnapshot().player.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(session.getSnapshot().semanticTravel?.label).toBe("Grey Wolf");
  });

  it("sends movement requests but updates position only from server authority", () => {
    const adapter = new FakeAdapter();
    const session = new OpenMmoGameSession(adapter);
    session.start();

    adapter.emit({
      JoinSuccess: {
        player: {
          id: 11,
          name: "ScoutMira",
          health: 30,
          max_health: 30,
          position: { x: 1, y: 0, z: 2 },
          rotation: 0,
          floor_level: 0,
        },
      },
    });

    session.command({
      type: "MOVE_TO",
      position: { x: 5, y: 0, z: 7 },
      rotation: 1.5,
      floorLevel: 0,
      sprinting: true,
    });

    expect(adapter.sendMove).toHaveBeenCalledWith(
      { x: 5, y: 0, z: 7 },
      1.5,
      0,
      { append: undefined, sprinting: true },
    );
    expect(session.getSnapshot().player.position).toEqual({ x: 1, y: 0, z: 2 });

    adapter.emit({
      PlayerMoved: {
        player_id: 11,
        position: { x: 5, y: 0, z: 7 },
        rotation: 1.5,
        floor_level: 0,
        sprinting: true,
      },
    });

    expect(session.getSnapshot().player).toMatchObject({
      position: { x: 5, y: 0, z: 7 },
      rotation: 1.5,
      floorLevel: 0,
      sprinting: true,
    });
  });

  it("maps inventory and ability cooldowns and sends gameplay commands", () => {
    const adapter = new FakeAdapter();
    const session = new OpenMmoGameSession(adapter);
    session.start();

    adapter.emit({
      InventoryState: {
        inventory: {
          bag: [
            {
              instance_id: 41,
              item_def_id: "iron_sword",
              quantity: 1,
              enchant: 2,
              locked: false,
            },
          ],
          equipped: {},
          active_ammo: null,
        },
      },
    });
    adapter.emit({
      AbilityCooldowns: {
        cooldowns: [
          { ability: "bow_mark", remaining_ms: 4200 },
        ],
      },
    });

    expect(session.getSnapshot().inventory?.bag[0]).toMatchObject({
      instanceId: 41,
      itemDefId: "iron_sword",
      enchant: 2,
    });
    expect(
      session.getSnapshot().abilities?.find((ability) => ability.id === "bow_mark"),
    ).toEqual({ id: "bow_mark", remainingMs: 4200 });

    session.command({ type: "EQUIP_ITEM", instanceId: 41 });
    expect(adapter.equipItem).toHaveBeenCalledWith(41);

    session.command({
      type: "USE_ABILITY",
      ability: "bow_mark",
      monsterId: "wolf-7",
    });
    expect(adapter.useAbility).toHaveBeenCalledWith("bow_mark", {
      monsterId: "wolf-7",
      targetPlayerId: undefined,
    });

    session.command({ type: "PICKUP_ITEM", instanceId: 77 });
    expect(adapter.pickupItem).toHaveBeenCalledWith(77);

    session.command({ type: "DROP_ITEM", instanceId: 41 });
    expect(adapter.dropItem).toHaveBeenCalledWith(41);
  });

  it("reports authoritative attack rejection and clears an invalid target", () => {
    const adapter = new FakeAdapter();
    const session = new OpenMmoGameSession(adapter);
    session.start();

    adapter.emit({
      MonsterSpawned: {
        monster: {
          id: "wolf-gone",
          monster_type: "grey_wolf",
          health: 20,
          max_health: 20,
          aggressive: true,
        },
      },
    });
    session.command({ type: "INVESTIGATE_ENCOUNTER" });

    adapter.emit({
      PlayerAttackRejected: {
        monster_id: "wolf-gone",
        reason: "invalid_target",
      },
    });

    expect(session.getSnapshot().combat).toBeNull();
    expect(session.getSnapshot().phase).toBe("exploration");
    expect(session.getSnapshot().logs.at(-1)?.text).toContain("대상이 사라졌다");
  });

  it("promotes server-attributed kill XP even after combat target drift", () => {
    const adapter = new FakeAdapter();
    const session = new OpenMmoGameSession(adapter);
    session.start();

    adapter.emit({
      MonsterSpawned: {
        monster: {
          id: "kobold-a",
          monster_type: "kobold",
          position: { x: 1, y: 0, z: 0 },
          floor_level: -1,
          health: 5,
          max_health: 5,
          aggressive: true,
        },
      },
    });
    session.command({ type: "IGNORE_ENCOUNTER" });

    adapter.emit({
      MonsterSpawned: {
        monster: {
          id: "kobold-b",
          monster_type: "kobold",
          position: { x: 2, y: 0, z: 0 },
          floor_level: -1,
          health: 5,
          max_health: 5,
          aggressive: true,
        },
      },
    });
    session.command({ type: "INVESTIGATE_ENCOUNTER" });
    expect(session.getSnapshot().combat?.enemy.id).toBe("kobold-b");

    adapter.emit({ MonsterDead: { monster_id: "kobold-a" } });
    expect(session.getSnapshot().phase).toBe("combat");
    expect(session.getSnapshot().logs.at(-1)?.text).toContain(
      "주변 몬스터가 쓰러졌다",
    );

    adapter.emit({
      XpGained: {
        xp_amount: 2,
        new_level: 1,
        leveled_up: false,
        monster_id: "kobold-a",
      },
    } as OpenMmoServerMessage);

    expect(session.getSnapshot().phase).toBe("reward");
    expect(session.getSnapshot().combat).toBeNull();
    expect(session.getSnapshot().reward?.title).toBe("Kobold 처치");
    expect(session.getSnapshot().logs.at(-1)?.text).toBe("XP +2");
  });

  it("maps authoritative combat, loot, death and respawn events", () => {
    const adapter = new FakeAdapter();
    const session = new OpenMmoGameSession(adapter);
    session.start();

    adapter.emit({
      JoinSuccess: {
        player: {
          id: 11,
          name: "ScoutMira",
          health: 30,
          max_health: 30,
        },
      },
    });

    adapter.emit({
      MonsterAttackedPlayer: {
        monster_id: "boar-1",
        player_id: 11,
        hit: true,
        roll: 17,
        damage: 6,
        current_health: 24,
      },
    });
    expect(session.getSnapshot().player.hp).toBe(24);
    expect(session.getSnapshot().phase).toBe("combat");

    adapter.emit({ MonsterDead: { monster_id: "boar-1" } });
    expect(session.getSnapshot().phase).toBe("reward");

    adapter.emit({
      GroundItemSpawned: {
        item: {
          instance_id: 4,
          item_def_id: "boar_tusk",
          quantity: 2,
          dropped_by: null,
        },
      },
    });
    expect(session.getSnapshot().logs.at(-1)?.text).toContain("boar_tusk");

    adapter.emit({ PlayerDead: { player_id: 11 } });
    expect(session.getSnapshot().player.hp).toBe(0);

    adapter.emit({
      PlayerRespawned: {
        player: {
          id: 11,
          name: "ScoutMira",
          health: 30,
          max_health: 30,
        },
      },
    });
    expect(session.getSnapshot().phase).toBe("exploration");
    expect(session.getSnapshot().player.hp).toBe(30);
  });
});
