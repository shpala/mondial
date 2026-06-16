import { describe, expect, it } from "vitest";
import {
  GOAL_BASE,
  GOAL_GAMMA,
  goalRates,
  samplePoisson,
  sampleScoreline,
  type Outcome,
} from "@/lib/scoreline";

/** Deterministic PRNG so the sampling assertions are stable. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("goalRates", () => {
  it("is symmetric at equal ratings and defaults to the calibrated constants", () => {
    const a = goalRates(1700, 1700);
    expect(a.lambdaHome).toBeCloseTo(GOAL_BASE, 9);
    expect(a.lambdaAway).toBeCloseTo(GOAL_BASE, 9);
    expect(a).toEqual(goalRates(1700, 1700, GOAL_BASE, GOAL_GAMMA));
  });

  it("gives the stronger side a higher goal rate", () => {
    const { lambdaHome, lambdaAway } = goalRates(1950, 1650);
    expect(lambdaHome).toBeGreaterThan(lambdaAway);
    // geometric mean stays at the base scoring rate
    expect(Math.sqrt(lambdaHome * lambdaAway)).toBeCloseTo(GOAL_BASE, 9);
  });
});

describe("samplePoisson", () => {
  it("has a sample mean close to lambda over many draws", () => {
    const rng = mulberry32(42);
    let sum = 0;
    const n = 20_000;
    for (let i = 0; i < n; i++) sum += samplePoisson(rng, 1.4);
    expect(sum / n).toBeCloseTo(1.4, 1);
  });
});

describe("sampleScoreline", () => {
  it("always returns a scoreline consistent with the requested outcome", () => {
    const rng = mulberry32(7);
    const outcomes: Outcome[] = ["home", "draw", "away"];
    for (let i = 0; i < 3000; i++) {
      const outcome = outcomes[i % 3];
      const { hg, ag } = sampleScoreline(rng, 1.8, 1.0, outcome);
      if (outcome === "home") expect(hg).toBeGreaterThan(ag);
      else if (outcome === "away") expect(hg).toBeLessThan(ag);
      else expect(hg).toBe(ag);
    }
  });

  it("makes a stronger favourite win by a larger average margin", () => {
    const rng = mulberry32(99);
    const avgMargin = (lh: number, la: number) => {
      let m = 0;
      const n = 5000;
      for (let i = 0; i < n; i++) {
        const { hg, ag } = sampleScoreline(rng, lh, la, "home");
        m += hg - ag;
      }
      return m / n;
    };
    const slight = avgMargin(...Object.values(goalRates(1820, 1780)) as [number, number]);
    const heavy = avgMargin(...Object.values(goalRates(2050, 1550)) as [number, number]);
    expect(heavy).toBeGreaterThan(slight);
  });
});
