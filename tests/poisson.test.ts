import { describe, expect, it } from "vitest";
import { goalRates, poissonOutcome, poissonPmf, poissonJoint } from "@/lib/backtest/poisson";

describe("independent-Poisson goal model", () => {
  it("even ratings give symmetric lambdas and equal home/away outcome", () => {
    const { lambdaHome, lambdaAway } = goalRates(1700, 1700, 1.3, 500);
    expect(lambdaHome).toBeCloseTo(lambdaAway, 12);
    expect(lambdaHome).toBeCloseTo(1.3, 12); // gap 0 => base

    const o = poissonOutcome(lambdaHome, lambdaAway);
    expect(o.home).toBeCloseTo(o.away, 12);
  });

  it("outcome probabilities sum to 1", () => {
    for (const [lh, la] of [
      [1.3, 1.3],
      [2.1, 0.7],
      [0.4, 3.0],
    ] as const) {
      const o = poissonOutcome(lh, la);
      expect(o.home + o.draw + o.away).toBeCloseTo(1, 9);
      expect(o.home).toBeGreaterThanOrEqual(0);
      expect(o.draw).toBeGreaterThanOrEqual(0);
      expect(o.away).toBeGreaterThanOrEqual(0);
    }
  });

  it("a stronger side gets a higher goal rate and win probability", () => {
    const { lambdaHome, lambdaAway } = goalRates(1900, 1600, 1.3, 500);
    expect(lambdaHome).toBeGreaterThan(lambdaAway);
    const o = poissonOutcome(lambdaHome, lambdaAway);
    expect(o.home).toBeGreaterThan(o.away);
  });

  it("poissonPmf matches the closed form and the joint grid normalizes to 1", () => {
    expect(poissonPmf(2, 0)).toBeCloseTo(Math.exp(-2), 12);
    expect(poissonPmf(2, 1)).toBeCloseTo(2 * Math.exp(-2), 12);

    const grid = poissonJoint(1.4, 1.1);
    let total = 0;
    for (const row of grid) for (const p of row) total += p;
    expect(total).toBeCloseTo(1, 9);
  });
});
