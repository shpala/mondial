import { describe, expect, it } from "vitest";
import {
  GOAL_BASE,
  GOAL_GAMMA,
  GOAL_RHO,
  MAX_GOALS,
  bttsProb,
  conditionScorelineGrid,
  dixonColesTau,
  goalRates,
  overProb,
  poissonJoint,
  poissonOutcome,
  samplePoisson,
  sampleScoreline,
  topScorelines,
  type Outcome,
} from "@/lib/scoreline";
import { mulberry32 } from "@/lib/rng";

function gridSum(grid: number[][]): number {
  let total = 0;
  for (const row of grid) for (const p of row) total += p;
  return total;
}

function regionMass(grid: number[][]): { home: number; draw: number; away: number } {
  let home = 0;
  let draw = 0;
  let away = 0;
  for (let i = 0; i < grid.length; i++)
    for (let j = 0; j < grid[i].length; j++) {
      if (i > j) home += grid[i][j];
      else if (i === j) draw += grid[i][j];
      else away += grid[i][j];
    }
  return { home, draw, away };
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

describe("poissonJoint", () => {
  it("is an 11x11 grid that normalizes to 1 (default rho and rho=0)", () => {
    const grid = poissonJoint(1.4, 1.1);
    expect(grid).toHaveLength(MAX_GOALS + 1);
    expect(grid[0]).toHaveLength(MAX_GOALS + 1);
    expect(gridSum(grid)).toBeCloseTo(1, 9);
    expect(gridSum(poissonJoint(1.4, 1.1, 0))).toBeCloseTo(1, 9);
  });

  it("every cell is a valid probability", () => {
    const grid = poissonJoint(2.1, 0.7);
    for (const row of grid) for (const p of row) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it("defaults to the plain independent model (rho = 0) — preserves the backtest baseline", () => {
    const def = poissonJoint(1.4, 1.1);
    expect(def[0][0]).toBeCloseTo(poissonJoint(1.4, 1.1, 0)[0][0], 12);
    expect(def[0][0]).toBeCloseTo(0.0821, 4);
    // ...and the calibrated correction genuinely moves that cell, so the default matters
    expect(def[0][0]).not.toBeCloseTo(poissonJoint(1.4, 1.1, GOAL_RHO)[0][0], 5);
  });
});

describe("Dixon-Coles low-score correction (Tier 2)", () => {
  it("is calibrated to a negative rho (lifts draws)", () => {
    expect(GOAL_RHO).toBeLessThan(0);
  });

  it("leaves cells outside the 0/1 corner untouched (tau = 1)", () => {
    expect(dixonColesTau(2, 1, 1.4, 1.1, -0.1)).toBe(1);
    expect(dixonColesTau(0, 2, 1.4, 1.1, -0.1)).toBe(1);
    expect(dixonColesTau(3, 3, 1.4, 1.1, -0.1)).toBe(1);
  });

  it("with negative rho boosts 0-0 and 1-1 and trims 1-0 and 0-1", () => {
    const rho = -0.1;
    expect(dixonColesTau(0, 0, 1.4, 1.1, rho)).toBeGreaterThan(1);
    expect(dixonColesTau(1, 1, 1.4, 1.1, rho)).toBeGreaterThan(1);
    expect(dixonColesTau(1, 0, 1.4, 1.1, rho)).toBeLessThan(1);
    expect(dixonColesTau(0, 1, 1.4, 1.1, rho)).toBeLessThan(1);
  });

  it("matches the exact closed forms (pins the home/away mapping, not just the sign)", () => {
    const lh = 1.4;
    const la = 1.1;
    const rho = -0.1;
    expect(dixonColesTau(0, 0, lh, la, rho)).toBeCloseTo(1 - lh * la * rho, 12);
    expect(dixonColesTau(0, 1, lh, la, rho)).toBeCloseTo(1 + lh * rho, 12);
    expect(dixonColesTau(1, 0, lh, la, rho)).toBeCloseTo(1 + la * rho, 12);
    expect(dixonColesTau(1, 1, lh, la, rho)).toBeCloseTo(1 - rho, 12);
  });

  it("rho=0 collapses to plain independent Poisson (tau = 1 everywhere)", () => {
    for (const [hg, ag] of [[0, 0], [1, 1], [1, 0], [0, 1]] as const) {
      expect(dixonColesTau(hg, ag, 1.4, 1.1, 0)).toBe(1);
    }
  });

  it("raises total draw probability vs the independent model", () => {
    const indep = poissonOutcome(1.4, 1.2, 0);
    const corrected = poissonOutcome(1.4, 1.2, -0.1);
    expect(corrected.draw).toBeGreaterThan(indep.draw);
    // and the corner cell itself is heavier
    expect(poissonJoint(1.4, 1.2, -0.1)[0][0]).toBeGreaterThan(
      poissonJoint(1.4, 1.2, 0)[0][0],
    );
  });
});

describe("poissonOutcome", () => {
  it("sums to 1 and is symmetric at equal lambdas", () => {
    const o = poissonOutcome(1.3, 1.3);
    expect(o.home + o.draw + o.away).toBeCloseTo(1, 9);
    expect(o.home).toBeCloseTo(o.away, 9);
  });

  it("gives the stronger side the larger win share", () => {
    const { lambdaHome, lambdaAway } = goalRates(1900, 1600);
    const o = poissonOutcome(lambdaHome, lambdaAway);
    expect(o.home).toBeGreaterThan(o.away);
  });
});

describe("topScorelines", () => {
  it("returns n cells sorted by descending probability, headed by the modal cell", () => {
    const grid = poissonJoint(...Object.values(goalRates(1950, 1600)) as [number, number]);
    const top = topScorelines(grid, 3);
    expect(top).toHaveLength(3);
    expect(top[0].p).toBeGreaterThanOrEqual(top[1].p);
    expect(top[1].p).toBeGreaterThanOrEqual(top[2].p);
    // top[0] is the global maximum over the whole grid
    let max = 0;
    for (const row of grid) for (const p of row) max = Math.max(max, p);
    expect(top[0].p).toBeCloseTo(max, 12);
  });
});

describe("conditionScorelineGrid (Variant A)", () => {
  it("rescales the grid so its region masses equal the given outcome", () => {
    const raw = poissonJoint(1.6, 1.0);
    const outcome = { home: 0.55, draw: 0.25, away: 0.2 };
    const conditioned = conditionScorelineGrid(raw, outcome);
    expect(gridSum(conditioned)).toBeCloseTo(1, 9);
    const m = regionMass(conditioned);
    expect(m.home).toBeCloseTo(outcome.home, 9);
    expect(m.draw).toBeCloseTo(outcome.draw, 9);
    expect(m.away).toBeCloseTo(outcome.away, 9);
  });

  it("preserves the relative shape within a result region", () => {
    const raw = poissonJoint(1.6, 1.0);
    const outcome = { home: 0.55, draw: 0.25, away: 0.2 };
    const conditioned = conditionScorelineGrid(raw, outcome);
    // within the home region, the 2-1/1-0 ratio is unchanged by a flat rescale
    expect(conditioned[2][1] / conditioned[1][0]).toBeCloseTo(raw[2][1] / raw[1][0], 9);
  });

  it("guards against a region with no mass (scale 0, no NaN)", () => {
    // degenerate grid: only the two draw cells carry mass, no home/away cells
    const g = [
      [0.5, 0],
      [0, 0.5],
    ];
    const conditioned = conditionScorelineGrid(g, { home: 0.3, draw: 0.4, away: 0.3 });
    expect(conditioned[1][0]).toBe(0); // home region had no mass -> stays 0
    expect(conditioned[0][1]).toBe(0); // away region had no mass -> stays 0
    expect(Number.isNaN(conditioned[0][0])).toBe(false);
  });
});

describe("derived markets", () => {
  it("overProb(grid, -1) is the whole distribution", () => {
    expect(overProb(poissonJoint(1.4, 1.1), -1)).toBeCloseTo(1, 9);
  });

  it("a higher-scoring game has more Over 2.5 mass", () => {
    const lowScoring = poissonJoint(0.8, 0.7);
    const highScoring = poissonJoint(2.4, 2.0);
    expect(overProb(highScoring, 2.5)).toBeGreaterThan(overProb(lowScoring, 2.5));
  });

  it("bttsProb is a probability and rises with both goal rates", () => {
    const btts = bttsProb(poissonJoint(1.6, 1.3));
    expect(btts).toBeGreaterThan(0);
    expect(btts).toBeLessThan(1);
    expect(bttsProb(poissonJoint(2.2, 1.9))).toBeGreaterThan(
      bttsProb(poissonJoint(0.6, 0.5)),
    );
  });

  it("overProb is invariant between an integer line and the next half-line (no off-by-one)", () => {
    const grid = poissonJoint(1.6, 1.3);
    // totals are integers, so 'over 2' and 'over 2.5' must select the same cells
    expect(overProb(grid, 2)).toBeCloseTo(overProb(grid, 2.5), 12);
  });

  it("bttsProb equals the inclusion-exclusion identity 1 − P(home blank) − P(away blank) + P(0-0)", () => {
    const grid = poissonJoint(1.6, 1.3);
    let homeBlank = 0;
    let awayBlank = 0;
    for (let j = 0; j < grid.length; j++) homeBlank += grid[0][j];
    for (let i = 0; i < grid.length; i++) awayBlank += grid[i][0];
    expect(bttsProb(grid)).toBeCloseTo(1 - homeBlank - awayBlank + grid[0][0], 12);
  });
});
