// Regression guard for the World Cup prediction-flattening (WC_PREDICTION_SCALE),
// the algorithm-bakeoff winner (docs/algo-bakeoff.md). Tuned on the 2022 World Cup,
// it must keep generalising to the played 2026 games: a flatter displayed spread
// beats the rating-system scale on BOTH World Cup holdouts, out-of-sample. Pins the
// documented improvement so a future constant change can't silently undo it — while
// leaving the rating system (the Elo roll) untouched.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runWcFlattenBacktest } from "@/lib/backtest/wcflatten";
import { LOGISTIC_SCALE, WC_PREDICTION_SCALE } from "@/lib/model/constants";

const csv = readFileSync(new URL("../data/intl_results.csv", import.meta.url), "utf8");
const r = runWcFlattenBacktest(csv);
const r4 = (x: number) => Number(x.toFixed(4));

describe("WC prediction-flattening backtest (docs/algo-bakeoff.md)", () => {
  it("uses a flatter prediction scale than the rating scale", () => {
    expect(r.ratingScale).toBe(LOGISTIC_SCALE);
    expect(r.predictionScale).toBe(WC_PREDICTION_SCALE);
    expect(r.predictionScale).toBeGreaterThan(r.ratingScale);
  });

  it("holds out the two World Cups (64 in 2022, the played 2026 games)", () => {
    expect(r.wc2022.n).toBe(64);
    expect(r.wc2026.n).toBeGreaterThanOrEqual(12);
  });

  it("the baseline (rating-scale) 1X2 log-loss matches the documented WC2022 figure", () => {
    // Cross-check against the independent WC2022 backtest (variant A = 1.0666): the
    // same held-out 64 matches scored with Davidson at the rating-system scale.
    expect(r4(r.wc2022.baselineLogLoss)).toBe(1.0666);
  });

  it("flattening improves the 2022 tuning holdout (in-sample target)", () => {
    expect(r.wc2022.shippedLogLoss).toBeLessThan(r.wc2022.baselineLogLoss);
    expect(r4(r.wc2022.shippedLogLoss)).toBe(1.0557);
  });

  it("flattening GENERALISES to the played 2026 games (out-of-sample)", () => {
    // The whole point: a spread tuned on 2022 also predicts the current games better.
    expect(r.wc2026.shippedLogLoss).toBeLessThan(r.wc2026.baselineLogLoss);
    // Below the ln3 ≈ 1.0986 uniform-forecast floor, and a clear gain vs baseline.
    expect(r.wc2026.shippedLogLoss).toBeLessThan(Math.log(3));
    expect(r.wc2026.baselineLogLoss - r.wc2026.shippedLogLoss).toBeGreaterThan(0.02);
  });
});
