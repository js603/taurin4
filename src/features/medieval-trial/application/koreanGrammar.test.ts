import { describe, expect, it } from "vitest";
import { joinKoreanAnd, withParticle } from "./koreanGrammar";

describe("Korean grammar helpers", () => {
  it("selects particles from the final consonant", () => {
    expect(withParticle("마르타", "은", "는")).toBe("마르타는");
    expect(withParticle("로언", "은", "는")).toBe("로언은");
    expect(joinKoreanAnd("로언", "마르타")).toBe("로언과 마르타");
    expect(joinKoreanAnd("마르타", "로언")).toBe("마르타와 로언");
  });
});
