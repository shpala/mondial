import { describe, expect, it } from "vitest";
import { outcomeOf } from "@/lib/outcome";

describe("outcomeOf", () => {
  it("classifies the result from the home side's perspective", () => {
    expect(outcomeOf(2, 1)).toBe("home");
    expect(outcomeOf(0, 3)).toBe("away");
    expect(outcomeOf(1, 1)).toBe("draw");
    expect(outcomeOf(0, 0)).toBe("draw");
  });
});
