// Regression guard for the model's published calibration. The Davidson + Elo
// math is shared with the live model, so a change there could silently move
// these numbers while every shape-checking test still passes. Pin them to the
// values in docs/backtest-report.md so any drift fails loudly.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseResults } from "@/lib/backtest/parse";
import { baseline, CURRENT, rollAndScore } from "@/lib/backtest/run";

const csv = readFileSync(
  new URL("../data/intl_results.csv", import.meta.url),
  "utf8",
);
const matches = parseResults(csv);

const r4 = (x: number) => Number(x.toFixed(4));
const pct1 = (x: number) => Number((x * 100).toFixed(1));

describe("backtest calibration (docs/backtest-report.md)", () => {
  it("parses the full corpus", () => {
    expect(matches.length).toBe(11840);
  });

  it("the shipped constants score exactly the documented numbers", () => {
    const r = rollAndScore(matches, CURRENT);
    expect(r.n).toBe(8105); // scored after the 2018 burn-in
    expect(r4(r.logLoss)).toBe(0.8961);
    expect(r4(r.brier)).toBe(0.5275);
    expect(pct1(r.drawObserved)).toBe(23.1);
    expect(pct1(r.drawPredicted)).toBe(21.9);
  });

  it("the no-skill baseline scores the documented numbers", () => {
    const b = baseline(matches);
    expect(r4(b.logLoss)).toBe(1.0503);
    expect(r4(b.brier)).toBe(0.6333);
    expect(pct1(b.drawRate)).toBe(23.1);
  });

  it("the model still beats the no-skill baseline on log-loss", () => {
    const model = rollAndScore(matches, CURRENT).logLoss;
    const base = baseline(matches).logLoss;
    expect(base - model).toBeGreaterThan(0.15);
  });
});
