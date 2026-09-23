import { describe, expect, it } from "vitest";
import { resolveAppRuntimeMode } from "./runtimeMode";

describe("resolveAppRuntimeMode", () => {
  it("keeps LocalGameSession as the default", () => {
    expect(resolveAppRuntimeMode("")).toBe("local");
    expect(resolveAppRuntimeMode("?runtime=local")).toBe("local");
    expect(resolveAppRuntimeMode("?anything=else")).toBe("local");
  });

  it("enters OpenMMO only when explicitly requested", () => {
    expect(resolveAppRuntimeMode("?runtime=openmmo")).toBe("openmmo");
    expect(
      resolveAppRuntimeMode("?server=ws%3A%2F%2F127.0.0.1%3A10006&runtime=openmmo"),
    ).toBe("openmmo");
  });
});
