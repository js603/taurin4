import { describe, expect, it, vi } from "vitest";
import { OpenMmoGameSession } from "./session";
import type { OpenMmoServerMessage } from "./types";

class FakeAdapter {
  private listener: ((message: OpenMmoServerMessage) => void) | null = null;
  sendAttack = vi.fn(() => true);
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
