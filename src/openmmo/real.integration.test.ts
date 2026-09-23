import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { OpenMmoAdapter } from "./adapter";
import {
  createOpenMmoWasmCodec,
  type OpenMmoWasmExports,
} from "./codec";
import { OpenMmoGameSession } from "./session";
import { WebSocketOpenMmoTransport } from "./transport";

const wasmModulePath = process.env.OPENMMO_WASM_MODULE;
const serverUrl = process.env.OPENMMO_SERVER_URL;
const npcToken = process.env.OPENMMO_NPC_TOKEN;
const enabled = Boolean(wasmModulePath && serverUrl && npcToken);

function waitForConnected(adapter: OpenMmoAdapter, timeoutMs = 5_000) {
  if (adapter.getSnapshot().phase === "connected") {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(
        new Error(
          "OpenMMO adapter did not connect: " +
            JSON.stringify(adapter.getSnapshot()),
        ),
      );
    }, timeoutMs);

    const unsubscribe = adapter.subscribe(() => {
      const phase = adapter.getSnapshot().phase;
      if (phase === "connected") {
        clearTimeout(timer);
        unsubscribe();
        resolve();
      } else if (phase === "error") {
        clearTimeout(timer);
        unsubscribe();
        reject(new Error(adapter.getSnapshot().lastError ?? "connection error"));
      }
    });
  });
}

function waitForSession(
  session: OpenMmoGameSession,
  predicate: () => boolean,
  timeoutMs = 5_000,
) {
  if (predicate()) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(
        new Error(
          "OpenMMO session condition timed out: " +
            JSON.stringify(session.getSnapshot()),
        ),
      );
    }, timeoutMs);

    const unsubscribe = session.subscribe(() => {
      if (!predicate()) return;
      clearTimeout(timer);
      unsubscribe();
      resolve();
    });
  });
}

function equipped(
  session: OpenMmoGameSession,
  itemDefId: string,
  slot?: string,
) {
  return session
    .getSnapshot()
    .inventory?.equipped.find(
      (item) =>
        item.itemDefId === itemDefId &&
        (slot === undefined || item.equippedSlot === slot),
    );
}

function bagItem(session: OpenMmoGameSession, itemDefId: string) {
  return session
    .getSnapshot()
    .inventory?.bag.find((item) => item.itemDefId === itemDefId);
}

function lootDestination(session: OpenMmoGameSession, itemDefId: string) {
  const label = itemDefId.replaceAll("_", " ");
  return session
    .getSnapshot()
    .semanticDestinations?.find(
      (item) => item.kind === "loot" && item.label === label,
    );
}

async function connectAndAuthenticate(
  codec: ReturnType<typeof createOpenMmoWasmCodec>,
  accountName: string,
) {
  if (!serverUrl || !npcToken) {
    throw new Error("real OpenMMO integration environment is incomplete");
  }

  const adapter = new OpenMmoAdapter({
    codec,
    transport: new WebSocketOpenMmoTransport(),
    clientVersion: "idea2-m2-real-integration",
    requestTimeoutMs: 10_000,
  });
  const session = new OpenMmoGameSession(adapter);
  session.start();

  adapter.connect(serverUrl);
  await waitForConnected(adapter);

  const auth = await adapter.authenticateNpc(accountName, npcToken);
  expect(auth.ok).toBe(true);
  if (!auth.ok) throw new Error(auth.message);

  return { adapter, session, auth };
}

describe.skipIf(!enabled)("OpenMmoAdapter real pinned integration", () => {
  it(
    "proves movement ability loot inventory equipment and reconnect against the real server",
    async () => {
      if (!wasmModulePath || !serverUrl || !npcToken) {
        throw new Error("real OpenMMO integration environment is incomplete");
      }

      expect(typeof WebSocket).toBe("function");

      const imported = (await import(
        pathToFileURL(wasmModulePath).href
      )) as {
        default?: OpenMmoWasmExports;
      } & Partial<OpenMmoWasmExports>;

      const wasm = (imported.default ?? imported) as OpenMmoWasmExports;
      const codec = createOpenMmoWasmCodec(wasm);
      expect(codec.protocolVersion()).toBe(95);

      const accountName = "npc_idea2_m2";
      const first = await connectAndAuthenticate(codec, accountName);
      const { adapter, session, auth } = first;

      let character = auth.characters.find((item) => item.name === "ScoutMira");

      if (!character) {
        const roll = await adapter.rollCharacterStats("knight", "female");
        expect(roll.ok).toBe(true);
        if (!roll.ok) throw new Error(roll.message);

        const created = await adapter.createCharacter(
          "ScoutMira",
          "knight",
          "female",
        );
        expect(created.ok).toBe(true);
        if (!created.ok) throw new Error(created.message);
        character = created.character;
      }

      const entered = await adapter.enterGame(character.id);
      expect(entered).toEqual({ ok: true });
      expect(adapter.getSnapshot().phase).toBe("in_game");
      expect(adapter.getSnapshot().selectedCharacterId).toBe(character.id);

      await waitForSession(
        session,
        () =>
          Boolean(
            equipped(session, "worn_iron_sword", "main_hand") &&
              bagItem(session, "worn_torch"),
          ),
        8_000,
      );

      const initialPosition = session.getSnapshot().player.position;
      expect(initialPosition).toBeDefined();
      if (!initialPosition) {
        throw new Error("JoinSuccess did not provide player position");
      }

      const initialRotation = session.getSnapshot().player.rotation ?? 0;
      const floorLevel = session.getSnapshot().player.floorLevel ?? 0;
      const target = {
        x: initialPosition.x + 0.5,
        y: initialPosition.y,
        z: initialPosition.z,
      };

      session.command({
        type: "MOVE_TO",
        position: target,
        rotation: initialRotation,
        floorLevel,
      });

      await waitForSession(
        session,
        () => {
          const current = session.getSnapshot().player.position;
          return Boolean(
            current &&
              Math.hypot(
                current.x - target.x,
                current.z - target.z,
              ) < 0.08,
          );
        },
        8_000,
      );

      const authoritativePosition = session.getSnapshot().player.position;
      expect(authoritativePosition).toBeDefined();
      expect(authoritativePosition?.x).not.toBe(initialPosition.x);

      session.command({ type: "USE_ABILITY", ability: "radiance" });
      await waitForSession(
        session,
        () =>
          (session
            .getSnapshot()
            .abilities?.find((ability) => ability.id === "radiance")
            ?.remainingMs ?? 0) > 0,
        5_000,
      );

      session.command({ type: "UNEQUIP_ITEM", slot: "main_hand" });
      await waitForSession(
        session,
        () =>
          !equipped(session, "worn_iron_sword", "main_hand") &&
          Boolean(bagItem(session, "worn_iron_sword")),
        5_000,
      );

      const swordBeforeDrop = bagItem(session, "worn_iron_sword");
      expect(swordBeforeDrop).toBeDefined();
      if (!swordBeforeDrop) throw new Error("sword was not moved to the bag");

      session.command({
        type: "DROP_ITEM",
        instanceId: swordBeforeDrop.instanceId,
      });

      await waitForSession(
        session,
        () =>
          !bagItem(session, "worn_iron_sword") &&
          Boolean(lootDestination(session, "worn_iron_sword")),
        5_000,
      );

      const droppedSword = lootDestination(session, "worn_iron_sword");
      expect(droppedSword).toBeDefined();
      if (!droppedSword) throw new Error("dropped sword did not enter AOI");

      const groundInstanceId = Number(
        droppedSword.id.slice("loot:".length),
      );
      expect(Number.isFinite(groundInstanceId)).toBe(true);

      session.command({
        type: "PICKUP_ITEM",
        instanceId: groundInstanceId,
      });

      await waitForSession(
        session,
        () =>
          Boolean(bagItem(session, "worn_iron_sword")) &&
          !lootDestination(session, "worn_iron_sword"),
        5_000,
      );

      const pickedSword = bagItem(session, "worn_iron_sword");
      expect(pickedSword).toBeDefined();
      if (!pickedSword) throw new Error("picked sword did not enter inventory");

      session.command({
        type: "EQUIP_ITEM",
        instanceId: pickedSword.instanceId,
      });

      await waitForSession(
        session,
        () => Boolean(equipped(session, "worn_iron_sword", "main_hand")),
        5_000,
      );

      const beforeReconnectPosition = session.getSnapshot().player.position;
      expect(beforeReconnectPosition).toBeDefined();

      expect(adapter.sendChat("idea2 M2 full-cycle integration online")).toBe(
        true,
      );

      session.stop();
      adapter.disconnect();

      // The pinned server serializes account-session replacement with
      // persist_and_detach_player. A reconnect therefore becomes the
      // deterministic persistence barrier; no arbitrary sleep is required.
      const second = await connectAndAuthenticate(codec, accountName);
      const persistedCharacter = second.auth.characters.find(
        (item) => item.id === character.id && item.name === character.name,
      );
      expect(persistedCharacter).toBeDefined();
      if (!persistedCharacter) {
        throw new Error("character did not persist across reconnect");
      }

      const reentered = await second.adapter.enterGame(persistedCharacter.id);
      expect(reentered).toEqual({ ok: true });

      await waitForSession(
        second.session,
        () => Boolean(equipped(second.session, "worn_iron_sword", "main_hand")),
        8_000,
      );

      const reconnectedPosition = second.session.getSnapshot().player.position;
      expect(reconnectedPosition).toBeDefined();
      if (beforeReconnectPosition && reconnectedPosition) {
        expect(
          Math.hypot(
            reconnectedPosition.x - beforeReconnectPosition.x,
            reconnectedPosition.z - beforeReconnectPosition.z,
          ),
        ).toBeLessThan(0.25);
      }

      second.session.stop();
      second.adapter.disconnect();
    },
    45_000,
  );
});
