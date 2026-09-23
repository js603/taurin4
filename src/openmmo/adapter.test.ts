import { describe, expect, it } from "vitest";
import { OpenMmoAdapter } from "./adapter";
import type { OpenMmoCodec } from "./codec";
import type {
  OpenMmoTransport,
  OpenMmoTransportHandlers,
} from "./transport";
import type {
  OpenMmoClientMessage,
  OpenMmoServerMessage,
} from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const codec: OpenMmoCodec = {
  protocolVersion: () => 95,
  stampLayoutVersion: (version) => version + "+layout.test",
  encodeClient: (message) => encoder.encode(JSON.stringify(message)),
  decodeServer: (bytes) =>
    JSON.parse(decoder.decode(bytes)) as OpenMmoServerMessage,
};

class FakeTransport implements OpenMmoTransport {
  handlers: OpenMmoTransportHandlers | null = null;
  sent: OpenMmoClientMessage[] = [];
  open = false;

  connect(_endpoint: string, handlers: OpenMmoTransportHandlers) {
    this.handlers = handlers;
  }

  triggerOpen() {
    this.open = true;
    this.handlers?.onOpen();
  }

  receive(message: OpenMmoServerMessage) {
    this.handlers?.onBinary(encoder.encode(JSON.stringify(message)));
  }

  send(bytes: Uint8Array) {
    if (!this.open) return false;
    this.sent.push(
      JSON.parse(decoder.decode(bytes)) as OpenMmoClientMessage,
    );
    return true;
  }

  close() {
    this.open = false;
  }

  isOpen() {
    return this.open;
  }
}

const character = {
  id: 7,
  name: "M15Audit",
  level: 1,
  xp: 0,
  max_hp: 20,
  attributes: {
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10,
    guard: 10,
  },
  class: "knight" as const,
  gender: "male" as const,
};

describe("OpenMmoAdapter", () => {
  it("always sends ClientInfo before authentication", async () => {
    const transport = new FakeTransport();
    const adapter = new OpenMmoAdapter({
      codec,
      transport,
      clientVersion: "idea2-test",
    });

    adapter.connect("ws://127.0.0.1:10006");
    transport.triggerOpen();

    expect(transport.sent[0]).toEqual({
      ClientInfo: {
        protocol_version: 95,
        client_kind: "web",
        client_version: "idea2-test+layout.test",
      },
    });

    const auth = adapter.authenticateNpc("npc_m15", "secret");
    expect(transport.sent[1]).toEqual({
      AuthenticateNpc: {
        account_name: "npc_m15",
        npc_token: "secret",
      },
    });

    transport.receive({
      AuthSuccess: {
        account_name: "npc_m15",
        characters: [character],
      },
    });

    await expect(auth).resolves.toEqual({
      ok: true,
      accountName: "npc_m15",
      characters: [character],
    });
    expect(adapter.getSnapshot().phase).toBe("authenticated");
  });

  it("runs character roll/create/EnterGame and sends WorldReady", async () => {
    const transport = new FakeTransport();
    const adapter = new OpenMmoAdapter({ codec, transport });
    adapter.connect("ws://127.0.0.1:10006");
    transport.triggerOpen();

    const auth = adapter.authenticateNpc("npc_m15", "secret");
    transport.receive({
      AuthSuccess: { account_name: "npc_m15", characters: [] },
    });
    await auth;

    const roll = adapter.rollCharacterStats("knight", "male");
    expect(transport.sent.at(-1)).toEqual({
      RollCharacterStats: {
        character_class: "knight",
        gender: "male",
      },
    });
    transport.receive({
      CharacterStatsRolled: {
        attributes: character.attributes,
        max_hp: 20,
      },
    });
    await expect(roll).resolves.toMatchObject({ ok: true, maxHp: 20 });

    const create = adapter.createCharacter("M15Audit", "knight", "male");
    transport.receive({ CharacterCreated: { character } });
    await expect(create).resolves.toEqual({ ok: true, character });
    expect(adapter.getSnapshot().characters).toEqual([character]);

    const enter = adapter.enterGame(character.id);
    expect(transport.sent.at(-1)).toEqual({
      EnterGame: { character_id: character.id },
    });

    transport.receive({ JoinSuccess: { player: { id: 1 } } });
    await expect(enter).resolves.toEqual({ ok: true });
    expect(transport.sent.at(-1)).toBe("WorldReady");
    expect(adapter.getSnapshot().phase).toBe("in_game");
  });

  it("serializes authoritative PlayerMove requests", () => {
    const transport = new FakeTransport();
    const adapter = new OpenMmoAdapter({ codec, transport });
    adapter.connect("ws://127.0.0.1:10006");
    transport.triggerOpen();

    expect(
      adapter.sendMove(
        { x: 10, y: 2, z: -4 },
        1.25,
        0,
        { sprinting: true },
      ),
    ).toBe(true);

    expect(transport.sent.at(-1)).toEqual({
      PlayerMove: {
        position: { x: 10, y: 2, z: -4 },
        rotation: 1.25,
        floor_level: 0,
        append: false,
        sprinting: true,
      },
    });
  });

  it("serializes ability loot and equipment commands", () => {
    const transport = new FakeTransport();
    const adapter = new OpenMmoAdapter({ codec, transport });
    adapter.connect("ws://127.0.0.1:10006");
    transport.triggerOpen();

    expect(
      adapter.useAbility("bow_mark", { monsterId: "wolf-7" }),
    ).toBe(true);
    expect(transport.sent.at(-1)).toEqual({
      UseAbility: {
        ability: "bow_mark",
        monster_id: "wolf-7",
        target_player_id: null,
      },
    });

    expect(adapter.pickupItem(77)).toBe(true);
    expect(transport.sent.at(-1)).toEqual({
      PickupItem: { instance_id: 77 },
    });

    expect(adapter.equipItem(41)).toBe(true);
    expect(transport.sent.at(-1)).toEqual({
      EquipItem: { instance_id: 41 },
    });

    expect(adapter.unequipItem("main_hand")).toBe(true);
    expect(transport.sent.at(-1)).toEqual({
      UnequipItem: { slot: "main_hand" },
    });
  });

  it("answers GameTimeSync with Heartbeat", () => {
    const transport = new FakeTransport();
    const adapter = new OpenMmoAdapter({ codec, transport });
    adapter.connect("ws://127.0.0.1:10006");
    transport.triggerOpen();

    transport.receive({ GameTimeSync: { hour: 12, minute: 0 } });
    expect(transport.sent.at(-1)).toBe("Heartbeat");
  });
});
