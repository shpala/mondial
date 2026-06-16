import { describe, expect, it } from "vitest";
import { eloUpdate } from "@/lib/ratings";

describe("eloUpdate", () => {
  it("rewards the home winner with a positive delta", () => {
    expect(eloUpdate(1800, 1800, 2, 0)).toBeGreaterThan(0);
  });

  it("gives a bigger swing for a larger goal margin", () => {
    const small = eloUpdate(1800, 1800, 1, 0);
    const big = eloUpdate(1800, 1800, 4, 0);
    expect(big).toBeGreaterThan(small);
  });

  it("scales linearly with k", () => {
    expect(eloUpdate(1800, 1800, 2, 0, 30)).toBeCloseTo(
      eloUpdate(1800, 1800, 2, 0, 60) / 2,
      9,
    );
  });

  it("defaults k to the World Cup weight of 60", () => {
    // 1800 vs 1800, 2-goal win: 60 * 1.5 * (1 - 0.5) = 45
    expect(eloUpdate(1800, 1800, 2, 0)).toBeCloseTo(45, 9);
  });
});
