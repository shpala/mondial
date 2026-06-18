/**
 * Temperature-scaled Davidson
 *
 * Strategy: roll Elo with shipped constants (nu=0.8, home=87.5, k=45, scale=300).
 * Build Davidson probs, then apply temperature T:
 *   p_i ^= (1/T) then renormalize.
 * T < 1 sharpens (more confident), T > 1 flattens (more uncertain).
 * Fit T to minimize wc2022 log-loss in [0.6..1.6].
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

// Shipped constants — do NOT change these (we only tune T)
const NU = 0.8;
const HOME = 87.5;
const K = 45;
const SCALE = 300;

function applyTemperature(probs: { home: number; draw: number; away: number }, T: number) {
  if (T === 1.0) return probs;
  const invT = 1 / T;
  const h = Math.pow(probs.home, invT);
  const d = Math.pow(probs.draw, invT);
  const a = Math.pow(probs.away, invT);
  const z = h + d + a;
  return { home: h / z, draw: d / z, away: a / z };
}

function makePredictFn(T: number) {
  return (t: Tuple) => {
    const base = davidsonProbs(t.effHome, t.effAway, NU, SCALE);
    return applyTemperature(base, T);
  };
}

const matches = loadCorpus();
const tuples = rollCorpus(matches, { home: HOME, k: K, scale: SCALE });

// Grid search T in [0.6..1.6] with step 0.01
let bestT = 1.0;
let bestWc2022Loss = Infinity;

const Tmin = 0.6;
const Tmax = 1.6;
const step = 0.01;
const steps = Math.round((Tmax - Tmin) / step);

console.log("Sweeping T from", Tmin, "to", Tmax, "...");

for (let i = 0; i <= steps; i++) {
  const T = Tmin + i * step;
  const m22 = scoreWindow(tuples, inWc2022, makePredictFn(T));
  if (m22.logLoss < bestWc2022Loss) {
    bestWc2022Loss = m22.logLoss;
    bestT = T;
  }
}

console.log(`Best T (minimizing wc2022 log-loss): ${bestT.toFixed(2)}`);

// Finer search around bestT
const fineMin = bestT - step;
const fineMax = bestT + step;
const fineStep = 0.001;
const fineSteps = Math.round((fineMax - fineMin) / fineStep);

for (let i = 0; i <= fineSteps; i++) {
  const T = fineMin + i * fineStep;
  const m22 = scoreWindow(tuples, inWc2022, makePredictFn(T));
  if (m22.logLoss < bestWc2022Loss) {
    bestWc2022Loss = m22.logLoss;
    bestT = T;
  }
}

console.log(`Fine-tuned T: ${bestT.toFixed(3)}`);

// Evaluate final config on all windows
const predictFn = makePredictFn(bestT);
const fullMetrics = scoreWindow(tuples, inFull, predictFn);
const wc2022Metrics = scoreWindow(tuples, inWc2022, predictFn);
const wc2026Metrics = scoreWindow(tuples, inWc2026, predictFn);

// Also print baseline for comparison
const baseline = (t: Tuple) => davidsonProbs(t.effHome, t.effAway, NU, SCALE);
const baselineFull = scoreWindow(tuples, inFull, baseline);
const baselineWc2022 = scoreWindow(tuples, inWc2022, baseline);
const baselineWc2026 = scoreWindow(tuples, inWc2026, baseline);

console.log("\n=== BASELINE (T=1.0) ===");
console.log(`full   logLoss=${baselineFull.logLoss.toFixed(4)} brier=${baselineFull.brier.toFixed(4)} acc=${baselineFull.acc.toFixed(4)} n=${baselineFull.n}`);
console.log(`wc2022 logLoss=${baselineWc2022.logLoss.toFixed(4)} brier=${baselineWc2022.brier.toFixed(4)} acc=${baselineWc2022.acc.toFixed(4)} n=${baselineWc2022.n}`);
console.log(`wc2026 logLoss=${baselineWc2026.logLoss.toFixed(4)} brier=${baselineWc2026.brier.toFixed(4)} acc=${baselineWc2026.acc.toFixed(4)} n=${baselineWc2026.n}`);

console.log(`\n=== TEMP-SCALED (T=${bestT.toFixed(3)}) ===`);
console.log(`full   logLoss=${fullMetrics.logLoss.toFixed(4)} brier=${fullMetrics.brier.toFixed(4)} acc=${fullMetrics.acc.toFixed(4)} n=${fullMetrics.n}`);
console.log(`wc2022 logLoss=${wc2022Metrics.logLoss.toFixed(4)} brier=${wc2022Metrics.brier.toFixed(4)} acc=${wc2022Metrics.acc.toFixed(4)} n=${wc2022Metrics.n}`);
console.log(`wc2026 logLoss=${wc2026Metrics.logLoss.toFixed(4)} brier=${wc2026Metrics.brier.toFixed(4)} acc=${wc2026Metrics.acc.toFixed(4)} n=${wc2026Metrics.n}`);

const result = {
  algorithm: "temp-scale",
  config: { nu: NU, home: HOME, k: K, scale: SCALE, T: parseFloat(bestT.toFixed(3)) },
  full: { logLoss: parseFloat(fullMetrics.logLoss.toFixed(4)), brier: parseFloat(fullMetrics.brier.toFixed(4)), acc: parseFloat(fullMetrics.acc.toFixed(4)) },
  wc2022: { logLoss: parseFloat(wc2022Metrics.logLoss.toFixed(4)), brier: parseFloat(wc2022Metrics.brier.toFixed(4)), acc: parseFloat(wc2022Metrics.acc.toFixed(4)) },
  wc2026: { logLoss: parseFloat(wc2026Metrics.logLoss.toFixed(4)), brier: parseFloat(wc2026Metrics.brier.toFixed(4)), acc: parseFloat(wc2026Metrics.acc.toFixed(4)) },
};

console.log("\nFINAL JSON:");
console.log(JSON.stringify(result, null, 2));
