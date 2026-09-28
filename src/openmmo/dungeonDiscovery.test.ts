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

describe("OpenMMO authoritative dungeon discovery projection", () => {
  it("turns a server discovery into a durable playable destination card", () => {
    const adapter = new FakeAdapter();
    const session = new OpenMmoGameSession(adapter);
    session.start();

    adapter.emit({
      JoinSuccess: {
        player: {
          id: 11,
          name: "CardMira",
          health: 30,
          max_health: 30,
          position: { x: -1440, y: 0.7, z: 4720 },
          rotation: 0,
          floor_level: 0,
        },
      },
    });

    adapter.emit({
      DungeonDiscoveries: { entrance_ids: ["old_crypt"] },
    });

    expect(session.getSnapshot().semanticDestinations).toEqual([
      expect.objectContaining({
        id: "dungeon:old_crypt",
        kind: "dungeon",
        label: "Old Crypt",
        position: { x: -1450, y: 0.7, z: 4720 },
        floorLevel: 0,
        distanceMeters: 10,
      }),
    ]);
    expect(session.getSnapshot().logs.at(-1)?.text).toBe(
      "던전 발견: Old Crypt",
    );

    adapter.emit({
      WorldUpdate: {
        world_epoch: "epoch-a",
        generation: 1,
        sequence: 1,
        position: { x: -1440, y: 0.7, z: 4720 },
        floor_level: 0,
        reset: true,
        ready: true,
        events: [],
      },
    });

    expect(
      session
        .getSnapshot()
        .semanticDestinations?.some(
          (destination) => destination.id === "dungeon:old_crypt",
        ),
    ).toBe(true);

    session.command({
      type: "TRAVEL_TO_DESTINATION",
      destinationId: "dungeon:old_crypt",
    });

    expect(adapter.sendMove).toHaveBeenCalledWith(
      { x: -1450, y: 0.7, z: 4720 },
      -Math.PI / 2,
      0,
      { sprinting: false },
    );
    expect(session.getSnapshot().semanticTravel).toEqual({
      destinationId: "dungeon:old_crypt",
      label: "Old Crypt",
    });
  });

  it("never invents a card for a dungeon id absent from pinned OpenMMO data", () => {
    const adapter = new FakeAdapter();
    const session = new OpenMmoGameSession(adapter);
    session.start();

    adapter.emit({
      DungeonDiscoveries: { entrance_ids: ["unknown_future_dungeon"] },
    });

    expect(session.getSnapshot().semanticDestinations).toEqual([]);
  });
});
