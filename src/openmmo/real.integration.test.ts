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


type DungeonTestWasmExports = OpenMmoWasmExports & {
  dungeon_layout(entranceId: string): unknown;
  dungeon_constants(): unknown;
  dungeon_add_passability(
    entranceId: string,
    x: number,
    y: number,
    z: number,
  ): void;
  dungeon_remove_passability(entranceId: string): void;
  dungeon_interior_doors(entranceId: string, depth: number): unknown;
  dungeon_rebuild_floor(
    entranceId: string,
    depth: number,
    broken: Uint32Array,
    openDoorIds: Uint32Array,
  ): void;
  dungeon_floor_level_for_passability(floor: number): number;
  dungeon_floor_height_at(
    entranceId: string,
    depth: number,
    x: number,
    z: number,
  ): number;
  dungeon_entrance_ramp_height_at(
    entranceId: string,
    x: number,
    z: number,
  ): number;
  passability_find_path_budget(
    startX: number,
    startZ: number,
    startFloor: number,
    goalX: number,
    goalZ: number,
    goalFloor: number,
    maxNodes: number,
  ): unknown;
};

type DungeonConstants = {
  grid: number;
  floorHeight: number;
  floorIndexBase: number;
  shaftLen: number;
  pathMaxNodes: number;
};

type DungeonShaft = {
  x: number;
  z: number;
  alongZ: boolean;
  reversed: boolean;
};

type DungeonLayout = {
  depth: number;
  upShaft: DungeonShaft;
  spawns: Array<{
    x: number;
    z: number;
    monsterType: string;
    isBoss: boolean;
    aggressive: boolean;
  }>;
};

type DungeonDoor = {
  wall: number;
  lat0: number;
  len: number;
  wallLine: number;
  doorId: number;
  locked: boolean;
};

type PathResult = {
  found: boolean;
  waypoints: Array<{ x: number; z: number; floor: number }>;
};

const OLD_CRYPT = {
  id: "old_crypt",
  x: -1450,
  y: 0.7,
  z: 4720,
} as const;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function flattenWireMessage(message: unknown): unknown[] {
  const flattened = [message];
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return flattened;
  }

  const update = (message as Record<string, unknown>).WorldUpdate;
  if (!update || typeof update !== "object" || Array.isArray(update)) {
    return flattened;
  }

  const events = (update as { events?: unknown }).events;
  if (!Array.isArray(events)) return flattened;

  for (const event of events) {
    if (!event || typeof event !== "object" || Array.isArray(event)) continue;
    const messages = (event as { messages?: unknown }).messages;
    if (!Array.isArray(messages)) continue;
    for (const nested of messages) {
      flattened.push(...flattenWireMessage(nested));
    }
  }
  return flattened;
}

function wirePayload<T>(message: unknown, variant: string): T | null {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return null;
  }
  const record = message as Record<string, unknown>;
  return Object.prototype.hasOwnProperty.call(record, variant)
    ? (record[variant] as T)
    : null;
}

async function waitForObserved<T>(
  observed: readonly unknown[],
  variant: string,
  predicate: (payload: T) => boolean,
  options: { startIndex?: number; timeoutMs?: number } = {},
): Promise<T> {
  const startIndex = options.startIndex ?? 0;
  const timeoutMs = options.timeoutMs ?? 8_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for (let index = startIndex; index < observed.length; index += 1) {
      const payload = wirePayload<T>(observed[index], variant);
      if (payload && predicate(payload)) return payload;
    }
    await delay(20);
  }

  throw new Error(
    "Timed out waiting for " +
      variant +
      " after observing " +
      observed.length +
      " flattened messages",
  );
}

function dungeonOrigin(constants: DungeonConstants) {
  return {
    x: Math.floor(OLD_CRYPT.x) - constants.grid / 2,
    z: Math.floor(OLD_CRYPT.z) - constants.grid / 2,
  };
}

function shaftCell(
  shaft: DungeonShaft,
  constants: DungeonConstants,
  step: number,
) {
  const run = shaft.reversed
    ? constants.shaftLen - 1 - step
    : step;
  return shaft.alongZ
    ? { x: shaft.x, z: shaft.z + run }
    : { x: shaft.x + run, z: shaft.z };
}

function cellCenter(
  constants: DungeonConstants,
  cell: { x: number; z: number },
) {
  const origin = dungeonOrigin(constants);
  return {
    x: origin.x + cell.x + 0.5,
    z: origin.z + cell.z + 0.5,
  };
}

function doorWorldPosition(
  constants: DungeonConstants,
  door: DungeonDoor,
) {
  const origin = dungeonOrigin(constants);
  const spansX = door.wall === 0 || door.wall === 2;
  const localX = spansX ? door.lat0 + door.len / 2 : door.wallLine;
  const localZ = spansX ? door.wallLine : door.lat0 + door.len / 2;
  return { x: origin.x + localX, z: origin.z + localZ };
}

function pathResult(value: unknown): PathResult {
  return value as PathResult;
}

async function queueDungeonPath(
  adapter: OpenMmoAdapter,
  session: OpenMmoGameSession,
  wasm: DungeonTestWasmExports,
  path: PathResult,
  timeoutMs = 30_000,
) {
  if (path.waypoints.length === 0) {
    throw new Error("Dungeon path contains no waypoints");
  }

  let fallbackY = session.getSnapshot().player.position?.y ?? OLD_CRYPT.y;

  path.waypoints.forEach((waypoint, index) => {
    const wireFloor = wasm.dungeon_floor_level_for_passability(waypoint.floor);
    let y = fallbackY;
    if (wireFloor < 0) {
      y = wasm.dungeon_floor_height_at(
        OLD_CRYPT.id,
        Math.abs(wireFloor),
        waypoint.x,
        waypoint.z,
      );
    } else {
      const rampY = wasm.dungeon_entrance_ramp_height_at(
        OLD_CRYPT.id,
        waypoint.x,
        waypoint.z,
      );
      if (Number.isFinite(rampY)) y = rampY;
    }
    if (!Number.isFinite(y)) {
      throw new Error("Pinned WASM returned a non-finite dungeon waypoint Y");
    }
    fallbackY = y;

    expect(
      adapter.sendMove(
        { x: waypoint.x, y, z: waypoint.z },
        0,
        wireFloor,
        { append: index > 0, sprinting: true },
      ),
    ).toBe(true);
  });

  const last = path.waypoints.at(-1);
  if (!last) throw new Error("Dungeon path lost its final waypoint");
  const finalWireFloor = wasm.dungeon_floor_level_for_passability(last.floor);

  await waitForSession(
    session,
    () => {
      const snapshot = session.getSnapshot();
      const position = snapshot.player.position;
      return Boolean(
        position &&
          snapshot.player.floorLevel === finalWireFloor &&
          Math.hypot(position.x - last.x, position.z - last.z) < 0.8,
      );
    },
    timeoutMs,
  );
}

function currentDungeonMonster(session: OpenMmoGameSession, id?: string) {
  return session
    .getSnapshot()
    .semanticDestinations?.filter(
      (destination) =>
        destination.kind === "monster" && destination.floorLevel === -1,
    )
    .find((destination) => id === undefined || destination.id === id);
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

      expect(adapter.sendAttack("idea2-missing-monster")).toBe(true);
      await waitForSession(
        session,
        () =>
          session
            .getSnapshot()
            .logs.some((entry) => entry.text.includes("공격 거부")),
        5_000,
      );
      expect(session.getSnapshot().logs.at(-1)?.text).toContain("대상이 사라졌다");

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

  it(
    "enters old_crypt and kills a real server-spawned kobold",
    async () => {
      if (!wasmModulePath || !serverUrl || !npcToken) {
        throw new Error("real OpenMMO integration environment is incomplete");
      }

      const imported = (await import(
        pathToFileURL(wasmModulePath).href
      )) as {
        default?: DungeonTestWasmExports;
      } & Partial<DungeonTestWasmExports>;
      const wasm = (imported.default ?? imported) as DungeonTestWasmExports;
      const codec = createOpenMmoWasmCodec(wasm);
      expect(codec.protocolVersion()).toBe(95);

      const { adapter, session, auth } = await connectAndAuthenticate(
        codec,
        "npc_idea2_dungeon",
      );
      const observed: unknown[] = [];
      const unsubscribeProbe = adapter.subscribeMessages((message) => {
        observed.push(...flattenWireMessage(message));
      });

      wasm.dungeon_add_passability(
        OLD_CRYPT.id,
        OLD_CRYPT.x,
        OLD_CRYPT.y,
        OLD_CRYPT.z,
      );

      try {
        let character = auth.characters.find(
          (item) => item.name === "CryptMira",
        );

        if (!character) {
          const roll = await adapter.rollCharacterStats(
            "barbarian",
            "male",
          );
          expect(roll.ok).toBe(true);
          if (!roll.ok) throw new Error(roll.message);

          const created = await adapter.createCharacter(
            "CryptMira",
            "barbarian",
            "male",
          );
          expect(created.ok).toBe(true);
          if (!created.ok) throw new Error(created.message);
          character = created.character;
        }

        const entered = await adapter.enterGame(character.id);
        expect(entered).toEqual({ ok: true });

        await waitForSession(
          session,
          () =>
            Boolean(
              session.getSnapshot().player.position &&
                equipped(session, "worn_iron_sword", "main_hand"),
            ),
          8_000,
        );

        const constants = wasm.dungeon_constants() as DungeonConstants;
        const layouts = wasm.dungeon_layout(OLD_CRYPT.id) as DungeonLayout[];
        const firstFloor = layouts[0];
        expect(firstFloor).toBeDefined();
        if (!firstFloor) throw new Error("old_crypt has no first floor");

        const current = session.getSnapshot().player.position;
        expect(current).toBeDefined();
        if (!current) throw new Error("Dungeon character has no world position");

        const exitCell = shaftCell(
          firstFloor.upShaft,
          constants,
          constants.shaftLen - 1,
        );
        const exit = cellCenter(constants, exitCell);
        const entryPath = pathResult(
          wasm.passability_find_path_budget(
            current.x,
            current.z,
            0,
            exit.x,
            exit.z,
            constants.floorIndexBase,
            constants.pathMaxNodes,
          ),
        );
        expect(entryPath.found).toBe(true);

        await queueDungeonPath(
          adapter,
          session,
          wasm,
          entryPath,
          35_000,
        );

        expect(session.getSnapshot().player.floorLevel).toBe(-1);

        await waitForSession(
          session,
          () => Boolean(currentDungeonMonster(session)),
          10_000,
        );

        const initialTarget = currentDungeonMonster(session);
        expect(initialTarget).toBeDefined();
        if (!initialTarget) throw new Error("No real dungeon monster entered AOI");

        const targetSemanticId = initialTarget.id;
        const targetId = targetSemanticId.startsWith("monster:")
          ? targetSemanticId.slice("monster:".length)
          : targetSemanticId;
        const openDoorIds = new Set<number>();

        const stateStart = observed.length;
        expect(adapter.requestDungeonDoors(OLD_CRYPT.id)).toBe(true);
        const doorState = await waitForObserved<{
          entrance_id: string;
          doors: Array<[number, number]>;
        }>(
          observed,
          "DungeonDoorsState",
          (payload) => payload.entrance_id === OLD_CRYPT.id,
          { startIndex: stateStart, timeoutMs: 5_000 },
        );
        for (const [depth, doorId] of doorState.doors) {
          if (depth === 1) openDoorIds.add(doorId);
        }
        wasm.dungeon_rebuild_floor(
          OLD_CRYPT.id,
          1,
          new Uint32Array(),
          new Uint32Array([...openDoorIds]),
        );

        const doors = wasm.dungeon_interior_doors(
          OLD_CRYPT.id,
          1,
        ) as DungeonDoor[];

        const findMonsterPath = () => {
          const position = session.getSnapshot().player.position;
          const target = currentDungeonMonster(session, targetSemanticId);
          if (!position || !target) return null;
          return pathResult(
            wasm.passability_find_path_budget(
              position.x,
              position.z,
              constants.floorIndexBase,
              target.position.x,
              target.position.z,
              constants.floorIndexBase,
              constants.pathMaxNodes,
            ),
          );
        };

        for (let doorPass = 0; doorPass <= doors.length; doorPass += 1) {
          const target = currentDungeonMonster(session, targetSemanticId);
          if (!target) break;
          if (target.distanceMeters <= 1.8) break;

          const direct = findMonsterPath();
          if (direct?.found && direct.waypoints.length > 0) {
            await queueDungeonPath(adapter, session, wasm, direct, 25_000);
            break;
          }

          const position = session.getSnapshot().player.position;
          if (!position) throw new Error("Lost player position inside dungeon");

          let opened = false;
          for (const door of doors) {
            if (door.locked || openDoorIds.has(door.doorId)) continue;
            const point = doorWorldPosition(constants, door);
            const toDoor = pathResult(
              wasm.passability_find_path_budget(
                position.x,
                position.z,
                constants.floorIndexBase,
                point.x,
                point.z,
                constants.floorIndexBase,
                constants.pathMaxNodes,
              ),
            );
            const last = toDoor.waypoints.at(-1);
            const endpoint = last ?? position;
            const reach = 2.5 + door.len / 2;
            if (
              Math.hypot(endpoint.x - point.x, endpoint.z - point.z) >
              reach + 0.5
            ) {
              continue;
            }

            if (toDoor.waypoints.length > 0) {
              await queueDungeonPath(adapter, session, wasm, toDoor, 20_000);
            }

            const toggledFrom = observed.length;
            expect(
              adapter.toggleDungeonDoor(
                OLD_CRYPT.id,
                1,
                door.doorId,
              ),
            ).toBe(true);
            await waitForObserved<{
              entrance_id: string;
              depth: number;
              door_id: number;
              is_open: boolean;
            }>(
              observed,
              "DungeonDoorToggled",
              (payload) =>
                payload.entrance_id === OLD_CRYPT.id &&
                payload.depth === 1 &&
                payload.door_id === door.doorId &&
                payload.is_open,
              { startIndex: toggledFrom, timeoutMs: 5_000 },
            );

            openDoorIds.add(door.doorId);
            wasm.dungeon_rebuild_floor(
              OLD_CRYPT.id,
              1,
              new Uint32Array(),
              new Uint32Array([...openDoorIds]),
            );
            opened = true;
            break;
          }

          if (!opened) {
            throw new Error(
              "No reachable interior door could open a path to the kobold",
            );
          }
        }

        for (let approach = 0; approach < 3; approach += 1) {
          const target = currentDungeonMonster(session, targetSemanticId);
          if (!target || target.distanceMeters <= 1.8) break;
          const path = findMonsterPath();
          if (!path?.found || path.waypoints.length === 0) {
            throw new Error("Kobold remained unreachable after opening doors");
          }
          await queueDungeonPath(adapter, session, wasm, path, 20_000);
          await delay(200);
        }

        const inRange = currentDungeonMonster(session, targetSemanticId);
        expect(inRange).toBeDefined();
        if (!inRange) throw new Error("Kobold disappeared before combat");
        expect(inRange.distanceMeters).toBeLessThanOrEqual(2.2);

        const combatStart = observed.length;
        let killed = false;

        for (let attack = 0; attack < 10; attack += 1) {
          if (
            observed
              .slice(combatStart)
              .some((message) => {
                const dead = wirePayload<{ monster_id: string }>(
                  message,
                  "MonsterDead",
                );
                return dead?.monster_id === targetId;
              })
          ) {
            killed = true;
            break;
          }

          if (session.getSnapshot().player.hp <= 0) {
            throw new Error("Dungeon test character died before killing kobold");
          }

          expect(adapter.sendAttack(targetId)).toBe(true);
          await delay(1_500);
        }

        if (!killed) {
          killed = observed
            .slice(combatStart)
            .some((message) => {
              const dead = wirePayload<{ monster_id: string }>(
                message,
                "MonsterDead",
              );
              return dead?.monster_id === targetId;
            });
        }
        expect(killed).toBe(true);

        const attacks = observed
          .slice(combatStart)
          .map((message) =>
            wirePayload<{
              player_id: number;
              monster_id: string;
              hit: boolean;
              damage: number;
            }>(message, "PlayerAttacked"),
          )
          .filter(
            (
              payload,
            ): payload is {
              player_id: number;
              monster_id: string;
              hit: boolean;
              damage: number;
            } => Boolean(payload?.monster_id === targetId),
          );
        expect(attacks.length).toBeGreaterThan(0);
        expect(attacks.some((attack) => attack.hit && attack.damage > 0)).toBe(
          true,
        );

        const xp = await waitForObserved<{
          xp_amount: number;
          monster_id?: string | null;
        }>(
          observed,
          "XpGained",
          (payload) =>
            payload.monster_id === targetId && payload.xp_amount > 0,
          { startIndex: combatStart, timeoutMs: 5_000 },
        );
        expect(xp.xp_amount).toBeGreaterThan(0);

        // Kobold item drops are probabilistic (weapon 10%, apple 1% plus
        // world-drop rolls). Their presence is observed but never required,
        // keeping this authoritative kill Gate deterministic.
        await delay(700);
        const optionalLoot = session
          .getSnapshot()
          .semanticDestinations?.filter(
            (destination) =>
              destination.kind === "loot" &&
              destination.floorLevel === -1,
          );
        expect(optionalLoot).toBeDefined();
      } finally {
        wasm.dungeon_remove_passability(OLD_CRYPT.id);
        unsubscribeProbe();
        session.stop();
        adapter.disconnect();
      }
    },
    90_000,
  );

});
