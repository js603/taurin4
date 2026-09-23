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

describe.skipIf(!enabled)("OpenMmoAdapter real pinned integration", () => {
  it(
    "uses the real WASM codec against the real server through EnterGame",
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

      const auth = await adapter.authenticateNpc("npc_idea2_m2", npcToken);
      expect(auth.ok).toBe(true);
      if (!auth.ok) throw new Error(auth.message);

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

      const initialPosition = session.getSnapshot().player.position;
      expect(initialPosition).toBeDefined();
      if (!initialPosition) throw new Error("JoinSuccess did not provide player position");

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
              Math.abs(current.x - initialPosition.x) > 0.01,
          );
        },
        8_000,
      );

      const authoritativePosition = session.getSnapshot().player.position;
      expect(authoritativePosition).toBeDefined();
      expect(authoritativePosition?.x).not.toBe(initialPosition.x);

      expect(adapter.sendChat("idea2 M2 integration online")).toBe(true);
      expect(adapter.requestRespawn()).toBe(true);

      session.stop();
      adapter.disconnect();
    },
    30_000,
  );
});
