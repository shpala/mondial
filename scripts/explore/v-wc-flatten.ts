/**
 * wc-flatten: Context-flattened Davidson for WC
 *
 * Roll Elo with scale=300 (unchanged). At SCORING time, predict WC matches
 * with a flatter scale scaleWC. This tests the hypothesis that WC fields are
 * strength-compressed so favorites win less often than the global curve implies.
 *
 * Sweep scaleWC in [300..600] minimizing wc2022 log-loss.
 * full uses scale=300 untouched.
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

// Baseline / roll constants (unchanged)
const NU = 0.8;
const HOME = 87.5;
const K = 45;
const SCALE = 300;

const matches = loadCorpus();
const tuples = rollCorpus(matches, { home: HOME, k: K, scale: SCALE });

// Helper: build a predict fn that uses scaleWC for WC matches, SCALE otherwise
function makePredictFn(scaleWC: number) {
  return (t: Tuple) => {
    const isWC = t.tournament === "FIFA World Cup";
    const s = isWC ? scaleWC : SCALE;
    return davidsonProbs(t.effHome, t.effAway, NU, s);
  };
}

// Sweep scaleWC from 300 to 600 in steps of 5
let bestScaleWC = SCALE;
let bestWc2022Loss = Infinity;

for (let sw = 300; sw <= 600; sw += 5) {
  const predict = makePredictFn(sw);
  const wc2022 = scoreWindow(tuples, inWc2022, predict);
  if (wc2022.logLoss < bestWc2022Loss) {
    bestWc2022Loss = wc2022.logLoss;
    bestScaleWC = sw;
  }
}

// Fine-tune around best with step 1
const coarseBase = bestScaleWC;
bestScaleWC = coarseBase;
bestWc2022Loss = Infinity;
for (let sw = Math.max(300, coarseBase - 10); sw <= Math.min(600, coarseBase + 10); sw++) {
  const predict = makePredictFn(sw);
  const wc2022 = scoreWindow(tuples, inWc2022, predict);
  if (wc2022.logLoss < bestWc2022Loss) {
    bestWc2022Loss = wc2022.logLoss;
    bestScaleWC = sw;
  }
}

// Final evaluation with the chosen scaleWC
const bestPredict = makePredictFn(bestScaleWC);

// full uses scale=300 (unchanged, no WC special-casing for the full corpus metric)
// But actually the recipe says "full uses scale=300 untouched" — so for the full
// window we always use scale=300:
const predictFull = (t: Tuple) => davidsonProbs(t.effHome, t.effAway, NU, SCALE);

const full = scoreWindow(tuples, inFull, predictFull);
const wc2022 = scoreWindow(tuples, inWc2022, bestPredict);
const wc2026 = scoreWindow(tuples, inWc2026, bestPredict);

const config = {
  nu: NU,
  home: HOME,
  k: K,
  scale: SCALE,
  scaleWC: bestScaleWC,
};

console.log("=== wc-flatten ===");
console.log(`Chosen scaleWC: ${bestScaleWC}`);
console.log(`full   logLoss=${full.logLoss.toFixed(4)} brier=${full.brier.toFixed(4)} acc=${full.acc.toFixed(4)} n=${full.n}`);
console.log(`wc2022 logLoss=${wc2022.logLoss.toFixed(4)} brier=${wc2022.brier.toFixed(4)} acc=${wc2022.acc.toFixed(4)} n=${wc2022.n}`);
console.log(`wc2026 logLoss=${wc2026.logLoss.toFixed(4)} brier=${wc2026.brier.toFixed(4)} acc=${wc2026.acc.toFixed(4)} n=${wc2026.n}`);

const result = {
  slug: "wc-flatten",
  config,
  full: { logLoss: full.logLoss, brier: full.brier, acc: full.acc },
  wc2022: { logLoss: wc2022.logLoss, brier: wc2022.brier, acc: wc2022.acc },
  wc2026: { logLoss: wc2026.logLoss, brier: wc2026.brier, acc: wc2026.acc },
};

console.log("\nFINAL_JSON:", JSON.stringify(result));
