// Replay the corpus once per candidate (nu, home, K), scoring predictions
// out-of-sample against real outcomes. Pure: no I/O, no Date/Math.random.

import { davidsonProbs } from "@/lib/prediction";
import { eloUpdate } from "@/lib/ratings";
import type { MatchRow } from "@/lib/backtest/parse";

export interface Constants {
  nu: number;
  home: number;
  k: number;
  /** Logistic spread (the Elo "400"). Optional; defaults to 400 when scoring. */
  scale?: number;
}

const DEFAULT_SCALE = 400;

export interface Report {
  constants: Constants;
  n: number; // matches actually scored (post burn-in)
  logLoss: number;
  brier: number;
  drawObserved: number;
  drawPredicted: number;
  reliability: { bucket: number; predicted: number; observed: number; count: number }[];
}

export interface SweepResult {
  best: Report;
  all: Report[];
}

/** The constants the app currently ships (montecarlo ν, host bump, Elo K, scale). */
export const CURRENT: Constants = { nu: 0.7, home: 100, k: 60, scale: 400 };

const INIT = 1500; // flat starting rating for every team
const BURN_IN = "2018-01-01"; // only score matches on/after this date

type Outcome = "home" | "draw" | "away";

function outcomeOf(r: MatchRow): Outcome {
  return r.homeGoals > r.awayGoals ? "home" : r.homeGoals < r.awayGoals ? "away" : "draw";
}

export function rollAndScore(
  matches: MatchRow[],
  c: Constants,
  burnIn: string = BURN_IN,
): Report {
  const rating = new Map<string, number>();
  const at = (t: string) => rating.get(t) ?? INIT;

  let ll = 0;
  let brier = 0;
  let n = 0;
  let drawObs = 0;
  let drawPred = 0;
  // Reliability pooled over the three outcome probabilities, 10 buckets.
  const relP = new Array(10).fill(0);
  const relH = new Array(10).fill(0);
  const relN = new Array(10).fill(0);

  const scale = c.scale ?? DEFAULT_SCALE;
  for (const mtch of matches) {
    const effHome = at(mtch.home) + (mtch.neutral ? 0 : c.home);
    const effAway = at(mtch.away);
    const p = davidsonProbs(effHome, effAway, c.nu, scale);

    if (mtch.date >= burnIn) {
      const o = outcomeOf(mtch);
      ll += -Math.log(Math.max(p[o], 1e-15));
      for (const key of ["home", "draw", "away"] as Outcome[]) {
        const y = o === key ? 1 : 0;
        brier += (p[key] - y) ** 2;
        const b = Math.min(9, Math.floor(p[key] * 10));
        relP[b] += p[key];
        relH[b] += y;
        relN[b] += 1;
      }
      drawObs += o === "draw" ? 1 : 0;
      drawPred += p.draw;
      n++;
    }

    // Roll ratings forward with the same gain the live model uses.
    const d = eloUpdate(effHome, effAway, mtch.homeGoals, mtch.awayGoals, c.k);
    rating.set(mtch.home, at(mtch.home) + d);
    rating.set(mtch.away, at(mtch.away) - d);
  }

  const reliability = relN
    .map((cnt, i) => ({
      bucket: i,
      predicted: cnt ? relP[i] / cnt : 0,
      observed: cnt ? relH[i] / cnt : 0,
      count: cnt,
    }))
    .filter((r) => r.count > 0);

  return {
    constants: c,
    n,
    logLoss: n ? ll / n : 0,
    brier: n ? brier / n : 0,
    drawObserved: n ? drawObs / n : 0,
    drawPredicted: n ? drawPred / n : 0,
    reliability,
  };
}

/**
 * No-skill baseline: predict the empirical home/draw/away base rates (measured
 * over the scored window) for every match. Its log-loss is the outcome entropy —
 * the bar any real model must beat. Uses the same burn-in as `rollAndScore`.
 */
export function baseline(
  matches: MatchRow[],
  burnIn: string = BURN_IN,
): { n: number; logLoss: number; brier: number; drawRate: number } {
  const scored = matches.filter((mtch) => mtch.date >= burnIn);
  const n = scored.length;
  if (n === 0) return { n: 0, logLoss: 0, brier: 0, drawRate: 0 };

  let h = 0;
  let d = 0;
  for (const mtch of scored) {
    const o = outcomeOf(mtch);
    if (o === "home") h++;
    else if (o === "draw") d++;
  }
  const p = { home: h / n, draw: d / n, away: (n - h - d) / n };

  let ll = 0;
  let brier = 0;
  for (const mtch of scored) {
    const o = outcomeOf(mtch);
    ll += -Math.log(Math.max(p[o], 1e-15));
    for (const key of ["home", "draw", "away"] as Outcome[]) {
      const y = o === key ? 1 : 0;
      brier += (p[key] - y) ** 2;
    }
  }
  return { n, logLoss: ll / n, brier: brier / n, drawRate: p.draw };
}

const COARSE = {
  nu: [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
  home: [0, 25, 50, 75, 100, 125, 150],
  k: [20, 30, 40, 50, 60, 70, 80],
  scale: [250, 300, 350, 400, 450, 500, 600],
};

type Grid = { nu: number[]; home: number[]; k: number[]; scale?: number[] };

export function sweep(matches: MatchRow[], grid: Grid = COARSE): SweepResult {
  let best: Report | null = null;
  const all: Report[] = [];
  const scales = grid.scale ?? [DEFAULT_SCALE];
  for (const nu of grid.nu) {
    for (const home of grid.home) {
      for (const k of grid.k) {
        for (const scale of scales) {
          const r = rollAndScore(matches, { nu, home, k, scale });
          all.push(r);
          if (!best || r.logLoss < best.logLoss) best = r;
        }
      }
    }
  }
  return { best: best!, all };
}

/** A finer grid bracketing a coarse winner, with non-positive values dropped. */
export function refineGrid(c: Constants): Grid {
  const s = c.scale ?? DEFAULT_SCALE;
  return {
    nu: [c.nu - 0.05, c.nu, c.nu + 0.05].filter((x) => x > 0),
    home: [c.home - 12.5, c.home, c.home + 12.5].filter((x) => x >= 0),
    k: [c.k - 5, c.k, c.k + 5].filter((x) => x > 0),
    scale: [s - 25, s, s + 25].filter((x) => x > 0),
  };
}
