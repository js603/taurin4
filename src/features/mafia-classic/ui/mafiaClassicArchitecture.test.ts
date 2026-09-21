import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("M3 UI architecture", () => {
  it("renders LocalMafiaSnapshot instead of authoritative GameState", () => {
    const source = readFileSync(new URL("./MafiaClassicPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("../application/localMafiaRuntime");
    expect(source).not.toContain("../application/soloSession");
    expect(source).not.toContain("../core/engine");
    expect(source).not.toMatch(/\bGameState\b/);
    expect(source).not.toContain("dispatchAction(");
    expect(source).toContain("const { view, contract } = snapshot");
    expect(source).toContain("contract.visibleFields.includes");
  });
});
