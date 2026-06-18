/**
 * shrink-baserate: Base-rate-shrunk (regularized) Davidson model.
 *
 * Algorithm:
 *   1. Compute empirical home/draw/away base rates on the full window.
 *   2. Blend Davidson predictions with those base rates:
 *        p_blended = (1-w)*davidson + w*baserate
 *   3. Sweep the blending weight w in [0..0.3] (and also re-tune nu, home, k, scale)
 *      minimizing wc2022 log-loss.
 *   4. Report the best config on wc2022, wc2026 (out-of-sample), and full corpus.
 */

import {
  loadCorpus,
  rollCorpus,
  scoreWindow,
  inFull,
  inWc2022,
  inWc2026,
  type Tuple,
  type Metrics,
} from "@/scripts/explore/harness";
import { davidsonProbs } from "@/lib/prediction";

const matches = loadCorpus();

// ── Step 1: Roll Elo once with baseline constants, compute base rates ──────────

// First pass: roll once to get tuples for base-rate measurement.
// We'll re-roll for each hyperparameter set, but base rates are computed from
// empirical outcomes (independent of Elo params).

// Compute empirical base rates from the full window (burn-in: 2018+).
// This is purely outcome-based, no model needed.
const FULL_BURN_IN = "2018-01-01";

// Count outcomes from the matches themselves to get base rates.
let totalFull = 0, homeWins = 0, draws = 0, awayWins = 0;
for (const m of matches) {
  if (m.date < FULL_BURN_IN) continue;
  totalFull++;
  if (m.homeGoals > m.awayGoals) homeWins++;
  else if (m.homeGoals === m.awayGoals) draws++;
  else awayWins++;
}
const baseRate = {
  home: homeWins / totalFull,
  draw: draws / totalFull,
  away: awayWins / totalFull,
};

console.log(`Base rates (full window, n=${totalFull}): home=${baseRate.home.toFixed(4)} draw=${baseRate.draw.toFixed(4)} away=${baseRate.away.toFixed(4)}`);

// ── Step 2: Evaluate shrinkage model with given params ─────────────────────────

function evalShrink(
  nu: number,
  home: number,
  k: number,
  scale: number,
  w: number,
): { full: Metrics; wc2022: Metrics; wc2026: Metrics } {
  const tuples = rollCorpus(matches, { home, k, scale });

  const predict = (t: Tuple) => {
    const dav = davidsonProbs(t.effHome, t.effAway, nu, scale);
    return {
      home: (1 - w) * dav.home + w * baseRate.home,
      draw: (1 - w) * dav.draw + w * baseRate.draw,
      away: (1 - w) * dav.away + w * baseRate.away,
    };
  };

  return {
    full: scoreWindow(tuples, inFull, predict),
    wc2022: scoreWindow(tuples, inWc2022, predict),
    wc2026: scoreWindow(tuples, inWc2026, predict),
  };
}

// ── Step 3: Grid search to minimize wc2022 log-loss ───────────────────────────

// First sweep w alone with baseline params to understand the shrinkage axis.
const BASELINE = { nu: 0.8, home: 87.5, k: 45, scale: 300 };

console.log("\nSweeping w (shrinkage weight) with baseline Davidson params:");
console.log("  w      wc2022.logLoss  wc2026.logLoss  full.logLoss");

let bestW = 0;
let bestWc2022Loss = Infinity;
for (let wi = 0; wi <= 30; wi++) {
  const w = wi / 100;
  const r = evalShrink(BASELINE.nu, BASELINE.home, BASELINE.k, BASELINE.scale, w);
  if (r.wc2022.logLoss < bestWc2022Loss) {
    bestWc2022Loss = r.wc2022.logLoss;
    bestW = w;
  }
  if (wi % 3 === 0) {
    console.log(`  w=${w.toFixed(2)}  ${r.wc2022.logLoss.toFixed(4)}  ${r.wc2026.logLoss.toFixed(4)}  ${r.full.logLoss.toFixed(4)}`);
  }
}

console.log(`\nBest w from w-only sweep: ${bestW.toFixed(2)} (wc2022 logLoss=${bestWc2022Loss.toFixed(4)})`);

// Now do a joint grid search over nu, home, k, scale, and w.
const nuVals     = [0.7, 0.75, 0.8, 0.85, 0.9];
const homeVals   = [75, 87.5, 100, 112.5];
const kVals      = [35, 40, 45, 50, 55];
const scaleVals  = [250, 275, 300, 325, 350];
const wVals      = [0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30];

let best = {
  nu: BASELINE.nu,
  home: BASELINE.home,
  k: BASELINE.k,
  scale: BASELINE.scale,
  w: bestW,
  wc2022: { logLoss: Infinity, brier: 0, acc: 0 },
  wc2026: { logLoss: 0, brier: 0, acc: 0 },
  full: { logLoss: 0, brier: 0, acc: 0 },
};

console.log("\nRunning joint grid search (nu × home × k × scale × w)...");
let iterations = 0;

for (const nu of nuVals) {
  for (const home of homeVals) {
    for (const k of kVals) {
      for (const scale of scaleVals) {
        for (const w of wVals) {
          iterations++;
          const r = evalShrink(nu, home, k, scale, w);
          if (r.wc2022.logLoss < best.wc2022.logLoss) {
            best = { nu, home, k, scale, w, wc2022: r.wc2022, wc2026: r.wc2026, full: r.full };
          }
        }
      }
    }
  }
}

console.log(`\nGrid search complete (${iterations} combinations).`);
console.log("\n=== BEST CONFIG (minimizes wc2022 log-loss) ===");
console.log(`  nu=${best.nu} home=${best.home} k=${best.k} scale=${best.scale} w=${best.w}`);
console.log(`  wc2022: logLoss=${best.wc2022.logLoss.toFixed(4)} brier=${best.wc2022.brier.toFixed(4)} acc=${best.wc2022.acc.toFixed(4)}`);
console.log(`  wc2026: logLoss=${best.wc2026.logLoss.toFixed(4)} brier=${best.wc2026.brier.toFixed(4)} acc=${best.wc2026.acc.toFixed(4)}`);
console.log(`  full:   logLoss=${best.full.logLoss.toFixed(4)} brier=${best.full.brier.toFixed(4)} acc=${best.full.acc.toFixed(4)}`);

// Baseline numbers for comparison.
const baseline = evalShrink(BASELINE.nu, BASELINE.home, BASELINE.k, BASELINE.scale, 0);
console.log("\n=== BASELINE (w=0, nu=0.8, home=87.5, k=45, scale=300) ===");
console.log(`  wc2022: logLoss=${baseline.wc2022.logLoss.toFixed(4)} brier=${baseline.wc2022.brier.toFixed(4)} acc=${baseline.wc2022.acc.toFixed(4)}`);
console.log(`  wc2026: logLoss=${baseline.wc2026.logLoss.toFixed(4)} brier=${baseline.wc2026.brier.toFixed(4)} acc=${baseline.wc2026.acc.toFixed(4)}`);
console.log(`  full:   logLoss=${baseline.full.logLoss.toFixed(4)} brier=${baseline.full.brier.toFixed(4)} acc=${baseline.full.acc.toFixed(4)}`);

// Print final JSON for machine parsing.
const result = {
  slug: "shrink-baserate",
  chosenConfig: { nu: best.nu, home: best.home, k: best.k, scale: best.scale, w: best.w },
  full: { logLoss: best.full.logLoss, brier: best.full.brier, acc: best.full.acc },
  wc2022: { logLoss: best.wc2022.logLoss, brier: best.wc2022.brier, acc: best.wc2022.acc },
  wc2026: { logLoss: best.wc2026.logLoss, brier: best.wc2026.brier, acc: best.wc2026.acc },
  generalizes: best.wc2026.logLoss < 1.0929,
};

console.log("\nFINAL_JSON=" + JSON.stringify(result));
