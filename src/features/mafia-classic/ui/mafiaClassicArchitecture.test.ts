import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Original chat-first UI architecture", () => {
  it("renders LocalMafiaSnapshot and never reaches authoritative OriginalGameState", () => {
    const source = readFileSync(new URL("./MafiaClassicPage.tsx", import.meta.url), "utf8");

    expect(source).toContain("../application/localMafiaRuntime");
    expect(source).toContain("../original/types");
    expect(source).not.toContain("../application/soloSession");
    expect(source).not.toContain("../core/engine");
    expect(source).not.toContain("../original/engine");
    expect(source).not.toMatch(/\bOriginalGameState\b/);
    expect(source).not.toContain("dispatchOriginalAction(");
    expect(source).toContain("snapshot");
    expect(source).toContain("view.availableActions");
    expect(source).toContain("view.chat");
    expect(source).toContain("contract.objective");
  });
});
