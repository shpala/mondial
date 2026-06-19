/**
 * ordered-logit: Cumulative-link (ordered logit) 1X2 model.
 *
 * Latent = (effHome - effAway) / scale
 * Two symmetric thresholds +-c define the draw band:
 *   P(away)  = sigmoid(-latent - c)
 *   P(home)  = sigmoid( latent - c)   ... wait: P(home wins) = P(outcome >= home)
 *
 * More precisely, ordered logit for 3 categories (away < draw < home):
 *   P(away)       = sigmoid(-latent - c)    ... P(Y <= away)
 *   P(draw|away)  = sigmoid(-latent + c)    ... P(Y <= draw)
 *   P(home)       = 1 - sigmoid(-latent + c)
 *   P(draw)       = sigmoid(-latent + c) - sigmoid(-latent - c)
 *
 * Equivalently using symmetric thresholds:
 *   P(home)  = sigmoid(latent - c)    (latent > c  => likely home win)
 *   P(away)  = sigmoid(-latent - c)   (latent < -c => likely away win)
 *   P(draw)  = 1 - P(home) - P(away)  (clamped >= 0)
 *
 * Tune: scale (Elo logistic scale), c (threshold), home bump, k.
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

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

function orderedLogitPredict(
  t: Tuple,
  scale: number,
  c: number,
): { home: number; draw: number; away: number } {
  const latent = (t.effHome - t.effAway) / scale;
  const pHome = sigmoid(latent - c);
  const pAway = sigmoid(-latent - c);
  const pDraw = Math.max(0, 1 - pHome - pAway);
  // Renormalize (small numerical safety)
  const sum = pHome + pDraw + pAway;
  return { home: pHome / sum, draw: pDraw / sum, away: pAway / sum };
}

const matches = loadCorpus();

// Strategy: thorough 4-D grid search, exploring from very small to medium values.
// Prior experiments show the minimum wc2022 logLoss is around home=0-20, k=8-12, predScale=90-120.
// The algorithm tends to minimize log-loss by making more draws (compressed probabilities).
const HOME_VALUES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 50, 60, 75, 87.5];
const K_VALUES = [3, 5, 7, 9, 10, 12, 15, 18, 22, 28, 35, 45];
const ROLL_SCALE = 300;
const PRED_SCALE_VALUES: number[] = [];
for (let s = 60; s <= 180; s += 5) PRED_SCALE_VALUES.push(s);
const C_VALUES: number[] = [];
for (let c = 0.3; c <= 0.9; c = Math.round((c + 0.05) * 100) / 100) C_VALUES.push(c);

let bestConfig = { home: 87.5, k: 45, predScale: 300, c: 0.6 };
let bestWc2022Loss = Infinity;

console.log("Grid searching ordered-logit (comprehensive search)...");
for (const home of HOME_VALUES) {
  for (const k of K_VALUES) {
    const tuples = rollCorpus(matches, { home, k, scale: ROLL_SCALE });
    for (const predScale of PRED_SCALE_VALUES) {
      for (const c of C_VALUES) {
        const predict = (t: Tuple) => orderedLogitPredict(t, predScale, c);
        const wc2022 = scoreWindow(tuples, inWc2022, predict);
        if (wc2022.logLoss < bestWc2022Loss) {
          bestWc2022Loss = wc2022.logLoss;
          bestConfig = { home, k, predScale, c };
        }
      }
    }
  }
}

console.log(`Best config: home=${bestConfig.home} k=${bestConfig.k} predScale=${bestConfig.predScale} c=${bestConfig.c.toFixed(2)}`);
console.log(`Best wc2022 logLoss: ${bestWc2022Loss.toFixed(6)}`);

// Fine-tune with integer precision around the best point
const { home: bHome, k: bK, predScale: bPredScale, c: bC } = bestConfig;
const fineHome = [bHome - 3, bHome - 1, bHome, bHome + 1, bHome + 3].filter(v => v >= 0);
const fineK = [bK - 2, bK - 1, bK, bK + 1, bK + 2].filter(v => v >= 1);
const finePredScale: number[] = [];
for (let s = Math.max(30, bPredScale - 10); s <= bPredScale + 10; s++) finePredScale.push(s);
const fineC: number[] = [];
for (let c = Math.max(0.01, bC - 0.1); c <= bC + 0.1 + 0.001; c = Math.round((c + 0.01) * 100) / 100) fineC.push(c);

for (const home of fineHome) {
  for (const k of fineK) {
    const tuples = rollCorpus(matches, { home, k, scale: ROLL_SCALE });
    for (const predScale of finePredScale) {
      for (const c of fineC) {
        const predict = (t: Tuple) => orderedLogitPredict(t, predScale, c);
        const wc2022 = scoreWindow(tuples, inWc2022, predict);
        if (wc2022.logLoss < bestWc2022Loss) {
          bestWc2022Loss = wc2022.logLoss;
          bestConfig = { home, k, predScale, c };
        }
      }
    }
  }
}

console.log(`Best config (fine): home=${bestConfig.home} k=${bestConfig.k} predScale=${bestConfig.predScale} c=${bestConfig.c.toFixed(3)}`);
console.log(`Best wc2022 logLoss: ${bestWc2022Loss.toFixed(6)}`);

// Final evaluation with the best config (roll with best params)
const finalTuples = rollCorpus(matches, { home: bestConfig.home, k: bestConfig.k, scale: ROLL_SCALE });
const finalPredict = (t: Tuple) => orderedLogitPredict(t, bestConfig.predScale, bestConfig.c);

const fullMetrics = scoreWindow(finalTuples, inFull, finalPredict);
const wc2022Metrics = scoreWindow(finalTuples, inWc2022, finalPredict);
const wc2026Metrics = scoreWindow(finalTuples, inWc2026, finalPredict);

console.log("\n=== FINAL RESULTS (ordered-logit) ===");
console.log(`Config: home=${bestConfig.home} k=${bestConfig.k} rollScale=${ROLL_SCALE} predScale=${bestConfig.predScale} c=${bestConfig.c.toFixed(4)}`);
console.log(`\nBaseline (Davidson): full=0.8959/0.5277/0.5905, wc2022=1.0666/0.6309/0.4531, wc2026=1.0929/0.6879/0.3333`);
console.log(`\nfull   logLoss=${fullMetrics.logLoss.toFixed(6)} brier=${fullMetrics.brier.toFixed(6)} acc=${fullMetrics.acc.toFixed(6)} n=${fullMetrics.n}`);
console.log(`wc2022 logLoss=${wc2022Metrics.logLoss.toFixed(6)} brier=${wc2022Metrics.brier.toFixed(6)} acc=${wc2022Metrics.acc.toFixed(6)} n=${wc2022Metrics.n}`);
console.log(`wc2026 logLoss=${wc2026Metrics.logLoss.toFixed(6)} brier=${wc2026Metrics.brier.toFixed(6)} acc=${wc2026Metrics.acc.toFixed(6)} n=${wc2026Metrics.n}`);

// Compare with Davidson baseline
console.log("\n=== COMPARISON vs DAVIDSON BASELINE ===");
console.log(`full   delta logLoss: ${(fullMetrics.logLoss - 0.8959).toFixed(6)} (${fullMetrics.logLoss < 0.8959 ? "BETTER" : "WORSE"})`);
console.log(`wc2022 delta logLoss: ${(wc2022Metrics.logLoss - 1.0666).toFixed(6)} (${wc2022Metrics.logLoss < 1.0666 ? "BETTER" : "WORSE"})`);
console.log(`wc2026 delta logLoss: ${(wc2026Metrics.logLoss - 1.0929).toFixed(6)} (${wc2026Metrics.logLoss < 1.0929 ? "BETTER" : "WORSE"})`);

const output = {
  algorithm: "ordered-logit",
  chosenConfig: bestConfig,
  full: {
    logLoss: fullMetrics.logLoss,
    brier: fullMetrics.brier,
    acc: fullMetrics.acc,
  },
  wc2022: {
    logLoss: wc2022Metrics.logLoss,
    brier: wc2022Metrics.brier,
    acc: wc2022Metrics.acc,
  },
  wc2026: {
    logLoss: wc2026Metrics.logLoss,
    brier: wc2026Metrics.brier,
    acc: wc2026Metrics.acc,
  },
};

console.log("\nFINAL JSON:");
console.log(JSON.stringify(output, null, 2));
