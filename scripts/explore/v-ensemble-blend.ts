// Ensemble blend: Davidson 1X2 + independent-Poisson 1X2
// p = (1-a)*Davidson + a*Poisson
// Sweep a in [0..1] step .1, minimize wc2022 logLoss, then report wc2026/full.

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
import { goalRates, poissonOutcome } from "@/lib/scoreline";

// Baseline constants (shipped model)
const NU = 0.8;
const HOME = 87.5;
const K = 45;
const SCALE = 300;

const matches = loadCorpus();
const tuples = rollCorpus(matches, { home: HOME, k: K, scale: SCALE });

function blendPredict(a: number) {
  return (t: Tuple) => {
    const dav = davidsonProbs(t.effHome, t.effAway, NU, SCALE);
    const { lambdaHome, lambdaAway } = goalRates(t.effHome, t.effAway);
    const poi = poissonOutcome(lambdaHome, lambdaAway, 0);
    return {
      home: (1 - a) * dav.home + a * poi.home,
      draw: (1 - a) * dav.draw + a * poi.draw,
      away: (1 - a) * dav.away + a * poi.away,
    };
  };
}

// Sweep alpha
const results: Array<{ alpha: number; wc2022: { logLoss: number; brier: number; acc: number } }> = [];

for (let i = 0; i <= 10; i++) {
  const alpha = parseFloat((i * 0.1).toFixed(1));
  const predict = blendPredict(alpha);
  const wc2022 = scoreWindow(tuples, inWc2022, predict);
  results.push({ alpha, wc2022: { logLoss: wc2022.logLoss, brier: wc2022.brier, acc: wc2022.acc } });
  console.log(`alpha=${alpha.toFixed(1)} wc2022.logLoss=${wc2022.logLoss.toFixed(4)}`);
}

// Find best alpha by wc2022 logLoss
const best = results.reduce((a, b) => (a.wc2022.logLoss <= b.wc2022.logLoss ? a : b));
const bestAlpha = best.alpha;

console.log(`\nBest alpha: ${bestAlpha} (wc2022.logLoss=${best.wc2022.logLoss.toFixed(4)})`);

// Score with best alpha
const bestPredict = blendPredict(bestAlpha);
const fullMetrics = scoreWindow(tuples, inFull, bestPredict);
const wc2022Metrics = scoreWindow(tuples, inWc2022, bestPredict);
const wc2026Metrics = scoreWindow(tuples, inWc2026, bestPredict);

const output = {
  config: { alpha: bestAlpha, nu: NU, home: HOME, k: K, scale: SCALE },
  full: { logLoss: fullMetrics.logLoss, brier: fullMetrics.brier, acc: fullMetrics.acc, n: fullMetrics.n },
  wc2022: { logLoss: wc2022Metrics.logLoss, brier: wc2022Metrics.brier, acc: wc2022Metrics.acc, n: wc2022Metrics.n },
  wc2026: { logLoss: wc2026Metrics.logLoss, brier: wc2026Metrics.brier, acc: wc2026Metrics.acc, n: wc2026Metrics.n },
};

console.log("\nFINAL JSON:");
console.log(JSON.stringify(output, null, 2));
