// PR validation probe: verifies the same GameScreen app-surface Gate.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { GameState } from "../../../game/model";
import type { GameSession } from "../../../game/session";
import { GameScreen } from "./GameScreen";

function staticSession(state: GameState): GameSession {
  return {
    getSnapshot: () => state,
    subscribe: () => () => undefined,
    command: () => undefined,
    start: () => undefined,
    stop: () => undefined,
  };
}

describe("GameScreen OpenMMO app surface", () => {
  it("renders an authoritative monster encounter through the actual Text/Card UI", () => {
    const state: GameState = {
      phase: "encounter",
      source: "openmmo",
      worldMinutes: 60,
      currentLocationId: "forest-gate",
      nearbyOpen: false,
      player: {
        hp: 20,
        maxHp: 20,
        mp: 10,
        maxMp: 10,
        position: { x: -1450, y: 0.7, z: 4720 },
        floorLevel: -1,
      },
      encounter: {
        kind: "monster",
        entityId: "m1",
        name: "Kobold",
        hp: 5,
        maxHp: 5,
        aggressive: true,
      },
      travel: null,
      combat: null,
      reward: null,
      semanticDestinations: [
        {
          id: "monster:m1",
          kind: "monster",
          label: "Kobold",
          position: { x: -1448.5, y: 0.7, z: 4720 },
          floorLevel: -1,
          distanceMeters: 1.5,
          detail: "공격적 개체",
        },
      ],
      semanticTravel: null,
      abilities: [],
      inventory: {
        bag: [],
        equipped: [],
      },
      logs: [],
      nextLogId: 1,
    };

    const html = renderToStaticMarkup(
      <GameScreen session={staticSession(state)} />,
    );

    expect(html).toContain("OPENMMO · AUTHORITATIVE WORLD");
    expect(html).toContain('aria-label="OpenMMO 주변 대상"');
    expect(html).toContain("semantic-destination-card");
    expect(html).toContain("MONSTER");
    expect(html).toContain("Kobold");
    expect(html).toContain("WORLD ENCOUNTER");
    expect(html).toContain("살펴본다");
    expect(html).toContain('role="dialog"');
  });
});
