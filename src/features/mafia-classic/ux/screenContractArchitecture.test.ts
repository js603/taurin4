import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("M2 screen contract architecture", () => {
  it("depends on PlayerView, not authoritative GameState or React", () => {
    const source = readFileSync(new URL("./screenContract.ts", import.meta.url), "utf8");

    expect(source).toContain('from "../core/playerView.js"');
    expect(source).not.toMatch(/\bGameState\b/);
    expect(source).not.toContain("../core/gameState");
    expect(source).not.toContain("../core/engine");
    expect(source).not.toMatch(/from ["']react["']/);
  });
});
