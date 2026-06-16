import { describe, expect, it } from "vitest";
import type { MatchRow } from "@/lib/backtest/parse";
import { baseline, CURRENT, refineGrid, rollAndScore, sweep } from "@/lib/backtest/run";

function m(
  date: string,
  home: string,
  away: string,
  hg: number,
  ag: number,
  neutral = true,
): MatchRow {
  return { date, home, away, homeGoals: hg, awayGoals: ag, tournament: "Friendly", neutral };
}

// Score everything (no burn-in) for deterministic assertions.
const ALL = "2000-01-01";

describe("rollAndScore", () => {
  it("computes log-loss for a single even neutral match", () => {
    // 1500 vs 1500, nu=0.63: p_home = 10^(1500/400) / (2 + 0.63) share = 0.38023.
    const r = rollAndScore([m("2020-01-01", "A", "B", 1, 0)], { nu: 0.63, home: 0, k: 60 }, ALL);
    expect(r.n).toBe(1);
    expect(r.logLoss).toBeCloseTo(-Math.log(0.38023), 4);
  });

  it("predicts more draws as nu rises", () => {
    const games = [m("2020-01-01", "A", "B", 0, 0), m("2020-02-01", "A", "B", 1, 1)];
    const lo = rollAndScore(games, { nu: 0.3, home: 0, k: 60 }, ALL).drawPredicted;
    const hi = rollAndScore(games, { nu: 0.9, home: 0, k: 60 }, ALL).drawPredicted;
    expect(hi).toBeGreaterThan(lo);
  });

  it("respects the burn-in cutoff when scoring", () => {
    const games = [m("2015-01-01", "A", "B", 1, 0), m("2019-01-01", "A", "B", 1, 0)];
    expect(rollAndScore(games, CURRENT, "2018-01-01").n).toBe(1);
  });
});

describe("sweep", () => {
  it("returns a best result minimizing log-loss over a small grid", () => {
    const games = [
      m("2020-01-01", "A", "B", 2, 0),
      m("2020-02-01", "C", "D", 1, 1),
      m("2020-03-01", "B", "C", 0, 1),
    ];
    const { best, all } = sweep(games, { nu: [0.4, 0.6], home: [0, 100], k: [40, 60] });
    expect(all).toHaveLength(8); // 2 × 2 × 2
    for (const r of all) expect(best.logLoss).toBeLessThanOrEqual(r.logLoss);
  });
});

describe("refineGrid", () => {
  it("brackets the centre and drops non-positive values", () => {
    const g = refineGrid({ nu: 0.05, home: 0, k: 5 });
    expect(g.nu).toEqual([0.05, 0.1]); // 0 dropped (nu must be > 0)
    expect(g.home).toEqual([0, 12.5]); // negative dropped (home >= 0)
    expect(g.k).toEqual([5, 10]); // 0 dropped (k must be > 0)
  });
});

describe("baseline", () => {
  it("scores the empirical base rates (log-loss = outcome entropy)", () => {
    // One home win, one draw → p_home = p_draw = 0.5, p_away = 0.
    // log-loss = -(0.5 ln0.5 + 0.5 ln0.5) = ln 2.
    const games = [m("2020-01-01", "A", "B", 1, 0), m("2020-02-01", "C", "D", 1, 1)];
    const b = baseline(games, "2000-01-01");
    expect(b.n).toBe(2);
    expect(b.logLoss).toBeCloseTo(Math.log(2), 9);
    expect(b.drawRate).toBeCloseTo(0.5, 9);
  });
});
