// Out-of-sample Qatar 2022 World Cup backtest, as a pure function so the offline
// script (scripts/wc2022-backtest.ts) and the regression test share one
// implementation and can't drift.
//
// No leakage: ratings that score any match come only from strictly-earlier
// matches. We roll Elo over ALL matches in date order, recording the PRE-match
// rating tuple before applying that match's update. The Poisson goal model's
// base/gamma are fit on the pre-2022-11-20 tuples; the Dixon-Coles low-score
// weight rho is then fit (given base/gamma) on the same train set by minimizing
// the Variant-A scoreline NLL — the exact quantity the shipped predictScoreline
// optimizes. The 64 Qatar 2022 matches are held out and scored.

import { parseResults } from "@/lib/backtest/parse";
import { davidsonProbs } from "@/lib/prediction";
import { eloUpdate } from "@/lib/ratings";
import { goalRates, poissonPmf, poissonOutcome, poissonJoint } from "@/lib/scoreline";
import { mulberry32 } from "@/lib/rng";

const INIT = 1500;
const NU = 0.8;
const SCALE = 300;
const HOME_BUMP = 87.5;
const K = 45;
const TRAIN_CUTOFF = "2022-11-20";
const TEST_START = "2022-11-20";
const TEST_END = "2022-12-18";
const MAX = 10; // goal grid cap per side

export type Region = "home" | "draw" | "away";

interface Tuple {
  date: string;
  home: string;
  away: string;
  effHome: number;
  effAway: number;
  neutral: boolean;
  hg: number;
  ag: number;
  tournament: string;
}

export interface Wc2022Pred {
  date: string;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  outcome: Region;
  A: { home: number; draw: number; away: number };
  B: { home: number; draw: number; away: number };
}

export interface Wc2022Result {
  trainCutoff: string;
  testStart: string;
  testEnd: string;
  fittedBase: number;
  fittedGamma: number;
  fittedRho: number;
  trainNLL: number;
  trainTuples: number;
  testMatches: number;
  variantA: { logLoss: number; brier: number };
  variantB: { logLoss: number; brier: number };
  logLossAdvantageAoverB: { mean: number; lo: number; hi: number; ciExcludesZero: boolean };
  /** Exact-scoreline log-loss. `aIndependent` = Variant A with rho=0, for the
   *  Dixon-Coles before/after comparison. */
  scorelineLogLoss: { A: number; B: number; aIndependent: number };
  preds: Wc2022Pred[];
  sanity: {
    evenDavidsonHomeEqAway: boolean;
    evenPoissonLambdasEqual: boolean;
    evenPoissonHomeEqAway: boolean;
    aProbsSumTo1: boolean;
    bProbsSumTo1: boolean;
    avgGoalsPerSide: number;
  };
}

const actualOf = (hg: number, ag: number): Region =>
  hg > ag ? "home" : hg < ag ? "away" : "draw";

function regionMassOf(grid: number[][], region: Region): number {
  let m = 0;
  for (let x = 0; x <= MAX; x++)
    for (let y = 0; y <= MAX; y++) {
      const r: Region = x > y ? "home" : x < y ? "away" : "draw";
      if (r === region) m += grid[x][y];
    }
  return m;
}

/** Variant A exact-scoreline NLL over a tuple set: the Davidson 1X2 region masses
 *  with the Poisson scoreline shape (and Dixon-Coles `rho`) within each region —
 *  the same construction predictScoreline ships. */
function variantAScorelineNLL(rows: Tuple[], base: number, gamma: number, rho: number): number {
  let nll = 0;
  for (const t of rows) {
    const A = davidsonProbs(t.effHome, t.effAway, NU, SCALE);
    const { lambdaHome, lambdaAway } = goalRates(t.effHome, t.effAway, base, gamma);
    const joint = poissonJoint(lambdaHome, lambdaAway, rho);
    const i = Math.min(t.hg, MAX);
    const j = Math.min(t.ag, MAX);
    const region: Region = i > j ? "home" : i < j ? "away" : "draw";
    const pAij = (A[region] * joint[i][j]) / regionMassOf(joint, region);
    nll += -Math.log(pAij);
  }
  return nll;
}

function logLossAndBrier(
  rows: { p: { home: number; draw: number; away: number }; actual: Region }[],
): { logLoss: number; brier: number } {
  let ll = 0;
  let brier = 0;
  for (const r of rows) {
    ll += -Math.log(r.p[r.actual]);
    for (const cls of ["home", "draw", "away"] as Region[]) {
      const y = r.actual === cls ? 1 : 0;
      brier += (r.p[cls] - y) ** 2;
    }
  }
  return { logLoss: ll / rows.length, brier: brier / rows.length };
}

function bootstrapMeanCI(xs: number[], iters: number) {
  const n = xs.length;
  const rng = mulberry32(20221218); // fixed seed → reproducible CI
  const means: number[] = [];
  for (let k = 0; k < iters; k++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += xs[Math.floor(rng() * n)];
    means.push(s / n);
  }
  means.sort((x, y) => x - y);
  return {
    mean: xs.reduce((s, v) => s + v, 0) / n,
    lo: means[Math.floor(0.025 * iters)],
    hi: means[Math.floor(0.975 * iters)],
  };
}

export function runWc2022Backtest(csv: string): Wc2022Result {
  // --- STEP 1: roll Elo with no leakage ---
  const matches = parseResults(csv); // already sorted by date ascending
  const rating = new Map<string, number>();
  const at = (t: string) => rating.get(t) ?? INIT;

  const tuples: Tuple[] = [];
  for (const m of matches) {
    const effHome = at(m.home) + (m.neutral ? 0 : HOME_BUMP);
    const effAway = at(m.away);
    tuples.push({
      date: m.date,
      home: m.home,
      away: m.away,
      effHome,
      effAway,
      neutral: m.neutral,
      hg: m.homeGoals,
      ag: m.awayGoals,
      tournament: m.tournament,
    });
    const d = eloUpdate(effHome, effAway, m.homeGoals, m.awayGoals, K);
    rating.set(m.home, at(m.home) + d);
    rating.set(m.away, at(m.away) - d);
  }

  const train = tuples.filter((t) => t.date < TRAIN_CUTOFF);
  const test = tuples.filter(
    (t) =>
      t.tournament === "FIFA World Cup" && t.date >= TEST_START && t.date <= TEST_END,
  );

  // --- STEP 2: fit base, gamma on TRAIN by per-side scoreline NLL ---
  function perSideNLL(base: number, gamma: number): number {
    let nll = 0;
    for (const t of train) {
      const { lambdaHome, lambdaAway } = goalRates(t.effHome, t.effAway, base, gamma);
      nll += -Math.log(poissonPmf(lambdaHome, t.hg)) - Math.log(poissonPmf(lambdaAway, t.ag));
    }
    return nll;
  }

  let bestBase = 1.0;
  let bestGamma = 150;
  let bestNLL = Infinity;
  for (let base = 1.0; base <= 1.7 + 1e-9; base += 0.05) {
    const b = Math.round(base * 100) / 100;
    for (let gamma = 150; gamma <= 900 + 1e-9; gamma += 25) {
      const nll = perSideNLL(b, gamma);
      if (nll < bestNLL) {
        bestNLL = nll;
        bestBase = b;
        bestGamma = gamma;
      }
    }
  }

  // --- STEP 3: fit Dixon-Coles rho on TRAIN (given base/gamma) by Variant-A NLL ---
  let bestRho = 0;
  let bestRhoNLL = Infinity;
  for (let r = -0.3; r <= 0.05 + 1e-9; r += 0.01) {
    const rho = Math.round(r * 100) / 100;
    const nll = variantAScorelineNLL(train, bestBase, bestGamma, rho);
    if (nll < bestRhoNLL) {
      bestRhoNLL = nll;
      bestRho = rho;
    }
  }

  // --- STEP 4: score the held-out test matches ---
  const aRows: { p: { home: number; draw: number; away: number }; actual: Region }[] = [];
  const bRows: { p: { home: number; draw: number; away: number }; actual: Region }[] = [];
  let aScoreLL = 0;
  let bScoreLL = 0;
  let aScoreLLIndep = 0; // Variant A with rho=0 (Dixon-Coles "before")
  const preds: Wc2022Pred[] = [];

  for (const t of test) {
    const actual = actualOf(t.hg, t.ag);
    const A = davidsonProbs(t.effHome, t.effAway, NU, SCALE);
    const { lambdaHome, lambdaAway } = goalRates(t.effHome, t.effAway, bestBase, bestGamma);
    const B = poissonOutcome(lambdaHome, lambdaAway); // raw independent (rho=0)

    aRows.push({ p: A, actual });
    bRows.push({ p: B, actual });

    const i = Math.min(t.hg, MAX);
    const j = Math.min(t.ag, MAX);
    const region: Region = i > j ? "home" : i < j ? "away" : "draw";

    // B: raw normalized independent-Poisson joint.
    const jointB = poissonJoint(lambdaHome, lambdaAway, 0);
    bScoreLL += -Math.log(jointB[i][j]);
    aScoreLLIndep += -Math.log((A[region] * jointB[i][j]) / regionMassOf(jointB, region));

    // A: Davidson region masses with the Dixon-Coles-corrected scoreline shape.
    const jointA = poissonJoint(lambdaHome, lambdaAway, bestRho);
    aScoreLL += -Math.log((A[region] * jointA[i][j]) / regionMassOf(jointA, region));

    preds.push({
      date: t.date,
      home: t.home,
      away: t.away,
      homeGoals: t.hg,
      awayGoals: t.ag,
      outcome: actual,
      A,
      B,
    });
  }

  const a = logLossAndBrier(aRows);
  const b = logLossAndBrier(bRows);
  aScoreLL /= test.length;
  bScoreLL /= test.length;
  aScoreLLIndep /= test.length;

  // --- Paired bootstrap on the 1X2 log-loss advantage of A over B ---
  const llA = aRows.map((r) => -Math.log(r.p[r.actual]));
  const llB = bRows.map((r) => -Math.log(r.p[r.actual]));
  const llDiff = llB.map((v, i) => v - llA[i]);
  const llCI = bootstrapMeanCI(llDiff, 5000);
  const ciExcludesZero = llCI.lo > 0 || llCI.hi < 0;

  // --- Sanity: even-ratings symmetry ---
  const symA = davidsonProbs(1700, 1700, NU, SCALE);
  const symRates = goalRates(1700, 1700, bestBase, bestGamma);
  const symB = poissonOutcome(symRates.lambdaHome, symRates.lambdaAway);
  const avgGoals = test.reduce((s, t) => s + t.hg + t.ag, 0) / test.length / 2;

  return {
    trainCutoff: TRAIN_CUTOFF,
    testStart: TEST_START,
    testEnd: TEST_END,
    fittedBase: bestBase,
    fittedGamma: bestGamma,
    fittedRho: bestRho,
    trainNLL: bestNLL,
    trainTuples: train.length,
    testMatches: test.length,
    variantA: a,
    variantB: b,
    logLossAdvantageAoverB: { ...llCI, ciExcludesZero },
    scorelineLogLoss: { A: aScoreLL, B: bScoreLL, aIndependent: aScoreLLIndep },
    preds,
    sanity: {
      evenDavidsonHomeEqAway: Math.abs(symA.home - symA.away) < 1e-12,
      evenPoissonLambdasEqual: Math.abs(symRates.lambdaHome - symRates.lambdaAway) < 1e-12,
      evenPoissonHomeEqAway: Math.abs(symB.home - symB.away) < 1e-12,
      aProbsSumTo1: aRows.every((r) => Math.abs(r.p.home + r.p.draw + r.p.away - 1) < 1e-9),
      bProbsSumTo1: bRows.every((r) => Math.abs(r.p.home + r.p.draw + r.p.away - 1) < 1e-9),
      avgGoalsPerSide: avgGoals,
    },
  };
}
