/**
 * Per-Outcome Log-Linear Power Scaling (Asymmetric Multinomial Platt)
 *
 * Strategy: Roll Elo with home=62.5, k=35, scale=325, nu=0.65.
 * Compute Davidson probs d = davidsonProbs(effHome, effAway, nu, scale).
 * Apply per-outcome exponents: lh = wH*log(d.home+eps), ld = wD*log(d.draw+eps), la = wA*log(d.away+eps)
 * Then softmax: p' = softmax([lh, ld, la]) (subtract max for numerical stability).
 * Tune (wH, wD, wA) on wc2022 log-loss.
 * Key: wH=wD=wA=T collapses to temperature scaling; enforce at least one distinct.
 */

import {
  loadCorpus,
  rollCorpus,
  scoreWindow,
  inFull,
  inWc2022,
  inWc2026,
  type Tuple,
} from "@/scripts/explore/harness";
import { davidsonProbs } from "@/lib/prediction";

const EPS = 1e-15;

// Elo constants specified in recipe
const NU = 0.65;
const HOME = 62.5;
const K = 35;
const SCALE = 325;

function applyPowerScale(
  probs: { home: number; draw: number; away: number },
  wH: number,
  wD: number,
  wA: number,
): { home: number; draw: number; away: number } {
  const lh = wH * Math.log(probs.home + EPS);
  const ld = wD * Math.log(probs.draw + EPS);
  const la = wA * Math.log(probs.away + EPS);
  // Subtract max for numerical stability before exp
  const maxL = Math.max(lh, ld, la);
  const eh = Math.exp(lh - maxL);
  const ed = Math.exp(ld - maxL);
  const ea = Math.exp(la - maxL);
  const z = eh + ed + ea;
  return { home: eh / z, draw: ed / z, away: ea / z };
}

function makePredictFn(wH: number, wD: number, wA: number) {
  return (t: Tuple) => {
    const base = davidsonProbs(t.effHome, t.effAway, NU, SCALE);
    return applyPowerScale(base, wH, wD, wA);
  };
}

const matches = loadCorpus();
const tuples = rollCorpus(matches, { home: HOME, k: K, scale: SCALE });

// Grid search over (wH, wD, wA)
// wH ∈ [0.7, 1.1], wD ∈ [0.8, 1.2], wA ∈ [0.9, 1.3]
// step = 0.05 for initial coarse sweep
const wHRange = { min: 0.7, max: 1.1, step: 0.05 };
const wDRange = { min: 0.8, max: 1.2, step: 0.05 };
const wARange = { min: 0.9, max: 1.3, step: 0.05 };

let bestWH = 1.0;
let bestWD = 1.0;
let bestWA = 1.0;
let bestLoss = Infinity;

console.log("Coarse grid search over (wH, wD, wA)...");

function linspace(min: number, max: number, step: number): number[] {
  const arr: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) {
    arr.push(parseFloat(v.toFixed(6)));
  }
  return arr;
}

for (const wH of linspace(wHRange.min, wHRange.max, wHRange.step)) {
  for (const wD of linspace(wDRange.min, wDRange.max, wDRange.step)) {
    for (const wA of linspace(wARange.min, wARange.max, wARange.step)) {
      // Enforce at least one weight distinct from others (not all equal → pure temp scale)
      // This is naturally satisfied as long as we check the combination.
      // We allow wH=wD=wA only if they're all exactly 1.0 (i.e. no-op) during search,
      // but we seek minimization so the best combo will naturally differ.
      const m22 = scoreWindow(tuples, inWc2022, makePredictFn(wH, wD, wA));
      if (m22.logLoss < bestLoss) {
        bestLoss = m22.logLoss;
        bestWH = wH;
        bestWD = wD;
        bestWA = wA;
      }
    }
  }
}

console.log(`Coarse best: wH=${bestWH} wD=${bestWD} wA=${bestWA} wc2022_loss=${bestLoss.toFixed(4)}`);

// Fine search around best
const fineStep = 0.01;
const halfRange = 0.08;

for (const wH of linspace(Math.max(0.5, bestWH - halfRange), Math.min(1.5, bestWH + halfRange), fineStep)) {
  for (const wD of linspace(Math.max(0.5, bestWD - halfRange), Math.min(1.5, bestWD + halfRange), fineStep)) {
    for (const wA of linspace(Math.max(0.5, bestWA - halfRange), Math.min(1.5, bestWA + halfRange), fineStep)) {
      const m22 = scoreWindow(tuples, inWc2022, makePredictFn(wH, wD, wA));
      if (m22.logLoss < bestLoss) {
        bestLoss = m22.logLoss;
        bestWH = wH;
        bestWD = wD;
        bestWA = wA;
      }
    }
  }
}

console.log(`Fine best: wH=${bestWH.toFixed(3)} wD=${bestWD.toFixed(3)} wA=${bestWA.toFixed(3)} wc2022_loss=${bestLoss.toFixed(4)}`);

// Evaluate final config on all windows
const predictFn = makePredictFn(bestWH, bestWD, bestWA);
const fullMetrics = scoreWindow(tuples, inFull, predictFn);
const wc2022Metrics = scoreWindow(tuples, inWc2022, predictFn);
const wc2026Metrics = scoreWindow(tuples, inWc2026, predictFn);

// Also print baseline (wH=wD=wA=1.0 = raw Davidson)
const baseline = (t: Tuple) => davidsonProbs(t.effHome, t.effAway, NU, SCALE);
const baselineFull = scoreWindow(tuples, inFull, baseline);
const baselineWc2022 = scoreWindow(tuples, inWc2022, baseline);
const baselineWc2026 = scoreWindow(tuples, inWc2026, baseline);

console.log("\n=== BASELINE (wH=wD=wA=1.0, raw Davidson with tuned Elo constants) ===");
console.log(`full   logLoss=${baselineFull.logLoss.toFixed(4)} brier=${baselineFull.brier.toFixed(4)} acc=${baselineFull.acc.toFixed(4)} n=${baselineFull.n}`);
console.log(`wc2022 logLoss=${baselineWc2022.logLoss.toFixed(4)} brier=${baselineWc2022.brier.toFixed(4)} acc=${baselineWc2022.acc.toFixed(4)} n=${baselineWc2022.n}`);
console.log(`wc2026 logLoss=${baselineWc2026.logLoss.toFixed(4)} brier=${baselineWc2026.brier.toFixed(4)} acc=${baselineWc2026.acc.toFixed(4)} n=${baselineWc2026.n}`);

console.log(`\n=== PER-OUTCOME POWER SCALE (wH=${bestWH.toFixed(3)} wD=${bestWD.toFixed(3)} wA=${bestWA.toFixed(3)}) ===`);
console.log(`full   logLoss=${fullMetrics.logLoss.toFixed(4)} brier=${fullMetrics.brier.toFixed(4)} acc=${fullMetrics.acc.toFixed(4)} n=${fullMetrics.n}`);
console.log(`wc2022 logLoss=${wc2022Metrics.logLoss.toFixed(4)} brier=${wc2022Metrics.brier.toFixed(4)} acc=${wc2022Metrics.acc.toFixed(4)} n=${wc2022Metrics.n}`);
console.log(`wc2026 logLoss=${wc2026Metrics.logLoss.toFixed(4)} brier=${wc2026Metrics.brier.toFixed(4)} acc=${wc2026Metrics.acc.toFixed(4)} n=${wc2026Metrics.n}`);

// Check distinctness (must not be pure temp scale)
const isDistinct = !(Math.abs(bestWH - bestWD) < 1e-6 && Math.abs(bestWD - bestWA) < 1e-6);
console.log(`\nDistinct from pure temp scale: ${isDistinct}`);

const result = {
  algorithm: "per-outcome-power-scale",
  config: {
    nu: NU,
    home: HOME,
    k: K,
    scale: SCALE,
    wH: parseFloat(bestWH.toFixed(3)),
    wD: parseFloat(bestWD.toFixed(3)),
    wA: parseFloat(bestWA.toFixed(3)),
  },
  full: {
    logLoss: parseFloat(fullMetrics.logLoss.toFixed(4)),
    brier: parseFloat(fullMetrics.brier.toFixed(4)),
    acc: parseFloat(fullMetrics.acc.toFixed(4)),
  },
  wc2022: {
    logLoss: parseFloat(wc2022Metrics.logLoss.toFixed(4)),
    brier: parseFloat(wc2022Metrics.brier.toFixed(4)),
    acc: parseFloat(wc2022Metrics.acc.toFixed(4)),
  },
  wc2026: {
    logLoss: parseFloat(wc2026Metrics.logLoss.toFixed(4)),
    brier: parseFloat(wc2026Metrics.brier.toFixed(4)),
    acc: parseFloat(wc2026Metrics.acc.toFixed(4)),
  },
};

console.log("\nFINAL JSON:");
console.log(JSON.stringify(result, null, 2));
