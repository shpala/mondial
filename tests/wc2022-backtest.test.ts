// Regression guard for the out-of-sample WC2022 backtest (docs/wc2022-report.md).
// The scoreline log-loss numbers depend on the shared goal model (goalRates,
// poissonJoint, Dixon-Coles GOAL_RHO) and the Davidson outcome, so a change there
// could silently move the documented baseline while shape-checking tests pass.
// Pin them, and pin that the shipped GOAL_RHO equals the value the backtest fits.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runWc2022Backtest } from "@/lib/backtest/wc2022";
import { GOAL_RHO } from "@/lib/scoreline";

const csv = readFileSync(new URL("../data/intl_results.csv", import.meta.url), "utf8");
const r = runWc2022Backtest(csv);
const r4 = (x: number) => Number(x.toFixed(4));

describe("WC2022 backtest (docs/wc2022-report.md)", () => {
  it("holds out the 64 World Cup matches and fits the documented goal model", () => {
    expect(r.trainTuples).toBe(8131);
    expect(r.testMatches).toBe(64);
    expect(r.fittedBase).toBe(1.2);
    expect(r.fittedGamma).toBe(575);
  });

  it("fits the Dixon-Coles weight, and the shipped GOAL_RHO matches it", () => {
    expect(r.fittedRho).toBeCloseTo(-0.03, 10);
    expect(r.fittedRho).toBeCloseTo(GOAL_RHO, 10); // sync guard: ship what we fit
  });

  it("scores the documented 1X2 metrics", () => {
    expect(r4(r.variantA.logLoss)).toBe(1.0613);
    expect(r4(r.variantA.brier)).toBe(0.6286);
    expect(r4(r.variantB.logLoss)).toBe(1.074);
    expect(r4(r.variantB.brier)).toBe(0.6314);
  });

  it("Davidson's 1X2 edge over Poisson is within sampling noise (CI includes 0)", () => {
    expect(r4(r.logLossAdvantageAoverB.lo)).toBe(-0.0095);
    expect(r4(r.logLossAdvantageAoverB.hi)).toBe(0.0428);
    expect(r.logLossAdvantageAoverB.ciExcludesZero).toBe(false);
  });

  it("pins the exact-scoreline log-loss and confirms Dixon-Coles helps", () => {
    expect(r4(r.scorelineLogLoss.A)).toBe(3.044); // Davidson + Dixon-Coles (shipped)
    expect(r4(r.scorelineLogLoss.aIndependent)).toBe(3.0458); // same, rho = 0
    expect(r4(r.scorelineLogLoss.B)).toBe(3.0585); // raw independent Poisson
    // the low-score correction improves the shipped scoreline log-loss
    expect(r.scorelineLogLoss.A).toBeLessThan(r.scorelineLogLoss.aIndependent);
  });

  it("passes the symmetry / sum-to-one sanity checks", () => {
    expect(r.sanity.evenDavidsonHomeEqAway).toBe(true);
    expect(r.sanity.evenPoissonHomeEqAway).toBe(true);
    expect(r.sanity.aProbsSumTo1).toBe(true);
    expect(r.sanity.bProbsSumTo1).toBe(true);
  });
});
