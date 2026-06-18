// v-bivpois-1x2.ts — Bivariate-Poisson 1X2 model
//
// Bivariate Poisson with shared component lam3:
//   P(X=i, Y=j) = exp(-(lam1+lam2+lam3)) * sum_{k=0}^{min(i,j)} C(i,k)*C(j,k)*k! * (lam1^(i-k)/fact(i-k)) * (lam2^(j-k)/fact(j-k)) * (lam3^k/fact(k))
//               = exp(-(lam1+lam2+lam3)) * sum_k [pois(lam1,i-k) * pois(lam2,j-k) * pois(lam3,k)]
//   where lam1 = lambdaH - lam3, lam2 = lambdaA - lam3
//
// The shared lam3 induces positive correlation between home and away goals.
// We use lam3 as an additive correlation parameter fitted on wc2022.
// lambdaH and lambdaA come from the Elo-based goalRates() function.

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
import { goalRates, poissonPmf, MAX_GOALS } from "@/lib/scoreline";

// Bivariate Poisson joint grid P(i,j) with shared component lam3.
// lam1 = lambdaH - lam3, lam2 = lambdaA - lam3; lam3 >= 0 and <= min(lam1, lam2).
function bivPoissonJoint(
  lambdaH: number,
  lambdaA: number,
  lam3: number,
): number[][] {
  const lam1 = lambdaH - lam3;
  const lam2 = lambdaA - lam3;

  // Precompute Poisson pmfs
  const p1: number[] = [];
  const p2: number[] = [];
  const p3: number[] = [];
  for (let k = 0; k <= MAX_GOALS; k++) {
    p1.push(lam1 > 0 ? poissonPmf(lam1, k) : k === 0 ? 1 : 0);
    p2.push(lam2 > 0 ? poissonPmf(lam2, k) : k === 0 ? 1 : 0);
    p3.push(lam3 > 0 ? poissonPmf(lam3, k) : k === 0 ? 1 : 0);
  }

  const grid: number[][] = [];
  let z = 0;
  for (let i = 0; i <= MAX_GOALS; i++) {
    const row: number[] = [];
    for (let j = 0; j <= MAX_GOALS; j++) {
      // P(X=i,Y=j) = sum_{k=0}^{min(i,j)} p1[i-k] * p2[j-k] * p3[k]
      let pij = 0;
      const kMax = Math.min(i, j);
      for (let k = 0; k <= kMax; k++) {
        pij += p1[i - k] * p2[j - k] * p3[k];
      }
      row.push(pij);
      z += pij;
    }
    grid.push(row);
  }
  // Normalize (truncation at MAX_GOALS)
  if (z > 0) {
    for (let i = 0; i <= MAX_GOALS; i++)
      for (let j = 0; j <= MAX_GOALS; j++) grid[i][j] /= z;
  }
  return grid;
}

// Sum grid into 1X2 outcome probabilities
function gridTo1x2(grid: number[][]): { home: number; draw: number; away: number } {
  let home = 0, draw = 0, away = 0;
  for (let i = 0; i < grid.length; i++)
    for (let j = 0; j < grid[i].length; j++) {
      if (i > j) home += grid[i][j];
      else if (i === j) draw += grid[i][j];
      else away += grid[i][j];
    }
  return { home, draw, away };
}

// Evaluate bivariate Poisson on all three windows
function evalBivPois(
  tuples: Tuple[],
  params: { base: number; gamma: number; lam3: number },
): { full: Metrics; wc2022: Metrics; wc2026: Metrics } {
  const predict = (t: Tuple) => {
    const { lambdaHome, lambdaAway } = goalRates(t.effHome, t.effAway, params.base, params.gamma);
    // Clamp lam3 to be valid
    const lam3 = Math.min(params.lam3, lambdaHome * 0.99, lambdaAway * 0.99);
    const grid = bivPoissonJoint(lambdaHome, lambdaAway, lam3);
    return gridTo1x2(grid);
  };
  return {
    full: scoreWindow(tuples, inFull, predict),
    wc2022: scoreWindow(tuples, inWc2022, predict),
    wc2026: scoreWindow(tuples, inWc2026, predict),
  };
}

// Load corpus
const matches = loadCorpus();

console.error("Corpus loaded. Starting grid search...");

// Grid search over lam3, base, gamma + Elo home/k/scale
// Tune all hyperparameters to minimize wc2022 log-loss
const baseVals = [1.0, 1.1, 1.2, 1.3, 1.4];
const gammaVals = [350, 400, 450, 500, 550, 600];
const lam3Vals: number[] = [];
for (let v = 0; v <= 0.25; v += 0.05) lam3Vals.push(parseFloat(v.toFixed(4)));
// Also sweep Elo constants
const homeVals = [50, 75, 87.5, 100, 125];
const kVals = [35, 40, 45, 50, 55];
const scaleVals = [250, 275, 300, 325, 350];

interface BestEntry {
  logLoss: number;
  eloParams: { home: number; k: number; scale: number };
  modelParams: { base: number; gamma: number; lam3: number };
  result: ReturnType<typeof evalBivPois>;
}

let best: BestEntry | null = null;

let count = 0;
const total = homeVals.length * kVals.length * scaleVals.length * baseVals.length * gammaVals.length * lam3Vals.length;
console.error(`Total configs: ${total}`);

for (const home of homeVals) {
  for (const k of kVals) {
    for (const scale of scaleVals) {
      const eloParams = { home, k, scale };
      const tupleSet = rollCorpus(matches, eloParams);
      for (const base of baseVals) {
        for (const gamma of gammaVals) {
          for (const lam3 of lam3Vals) {
            const modelParams = { base, gamma, lam3 };
            const result = evalBivPois(tupleSet, modelParams);
            const wc2022LL = result.wc2022.logLoss;
            if (!best || wc2022LL < best.logLoss) {
              best = { logLoss: wc2022LL, eloParams, modelParams, result };
            }
            count++;
            if (count % 500 === 0) console.error(`  ${count}/${total} evaluated...`);
          }
        }
      }
    }
  }
}

console.error(`\nDone. Best wc2022 logLoss: ${best!.logLoss.toFixed(4)}`);
console.error("Best eloParams:", best!.eloParams);
console.error("Best modelParams:", best!.modelParams);
console.error("full  :", best!.result.full);
console.error("wc2022:", best!.result.wc2022);
console.error("wc2026:", best!.result.wc2026);

const out = {
  slug: "bivpois-1x2",
  chosenConfig: { ...best!.eloParams, ...best!.modelParams },
  full: {
    logLoss: best!.result.full.logLoss,
    brier: best!.result.full.brier,
    acc: best!.result.full.acc,
  },
  wc2022: {
    logLoss: best!.result.wc2022.logLoss,
    brier: best!.result.wc2022.brier,
    acc: best!.result.wc2022.acc,
  },
  wc2026: {
    logLoss: best!.result.wc2026.logLoss,
    brier: best!.result.wc2026.brier,
    acc: best!.result.wc2026.acc,
  },
};
console.log(JSON.stringify(out, null, 2));
