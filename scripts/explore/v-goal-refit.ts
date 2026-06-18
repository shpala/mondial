// Goal model (base/gamma/rho) refit — scoreline NLL track
//
// SEPARATE METRIC: exact-scoreline NLL (Variant A), not 1X2.
// Refit base/gamma on pre-2022 train set (per-side Poisson NLL),
// then rho on the same train set (Variant-A scoreline NLL), exactly as
// lib/backtest/wc2022.ts does.
//
// QUESTION: does base=1.2/gamma=450/rho=-0.03 still win over the refitted values,
// and does the refitted config generalize out-of-sample to wc2026?
//
// Also report 1X2 log-loss / brier / acc for all windows.
//
//   npx tsx scripts/explore/v-goal-refit.ts

import {
  loadCorpus,
  rollCorpus,
  scoreWindow,
  inFull,
  inWc2022,
  inWc2026,
  actualOf,
  type Tuple,
} from "@/scripts/explore/harness";
import { davidsonProbs } from "@/lib/prediction";
import {
  goalRates,
  poissonPmf,
  poissonJoint,
  GOAL_BASE,
  GOAL_GAMMA,
  GOAL_RHO,
} from "@/lib/scoreline";

const NU = 0.8;
const HOME = 87.5;
const K = 45;
const SCALE = 300;

// Training cut-off: matches before this date form the train set (same as wc2022.ts)
const TRAIN_CUTOFF = "2022-11-20";

// WC2026 cut-off: matches before this form the train set for wc2026
const WC2026_START = "2026-06-01";

const MAX = 10; // goal grid cap

// ---- helpers ----------------------------------------------------------------

type Region = "home" | "draw" | "away";

function regionMassOf(grid: number[][], region: Region): number {
  let m = 0;
  for (let i = 0; i <= MAX; i++)
    for (let j = 0; j <= MAX; j++) {
      const r: Region = i > j ? "home" : i < j ? "away" : "draw";
      if (r === region) m += grid[i][j];
    }
  return m;
}

/** Per-side Poisson NLL over tuples (used to fit base/gamma). */
function perSideNLL(tuples: Tuple[], base: number, gamma: number): number {
  let nll = 0;
  for (const t of tuples) {
    const { lambdaHome, lambdaAway } = goalRates(t.effHome, t.effAway, base, gamma);
    const ph = poissonPmf(lambdaHome, t.hg);
    const pa = poissonPmf(lambdaAway, t.ag);
    nll += -Math.log(Math.max(ph, 1e-15)) - Math.log(Math.max(pa, 1e-15));
  }
  return nll;
}

/** Variant-A exact-scoreline NLL over tuples (used to fit rho and to evaluate). */
function scorelineNLL(tuples: Tuple[], base: number, gamma: number, rho: number): number {
  let nll = 0;
  for (const t of tuples) {
    const A = davidsonProbs(t.effHome, t.effAway, NU, SCALE);
    const { lambdaHome, lambdaAway } = goalRates(t.effHome, t.effAway, base, gamma);
    const joint = poissonJoint(lambdaHome, lambdaAway, rho);
    const i = Math.min(t.hg, MAX);
    const j = Math.min(t.ag, MAX);
    const region: Region = i > j ? "home" : i < j ? "away" : "draw";
    const mass = regionMassOf(joint, region);
    const pAij = mass > 0 ? (A[region] * joint[i][j]) / mass : 1e-15;
    nll += -Math.log(Math.max(pAij, 1e-15));
  }
  return nll / tuples.length;
}

/** Fit base and gamma on train tuples by minimizing per-side Poisson NLL. */
function fitBaseGamma(train: Tuple[]): { base: number; gamma: number } {
  let bestBase = 1.0;
  let bestGamma = 150;
  let bestNLL = Infinity;
  for (let base = 0.8; base <= 2.0 + 1e-9; base += 0.05) {
    const b = Math.round(base * 100) / 100;
    for (let gamma = 100; gamma <= 1200 + 1e-9; gamma += 25) {
      const nll = perSideNLL(train, b, gamma);
      if (nll < bestNLL) {
        bestNLL = nll;
        bestBase = b;
        bestGamma = gamma;
      }
    }
  }
  return { base: bestBase, gamma: bestGamma };
}

/** Fit rho on train tuples (given base/gamma) by minimizing Variant-A scoreline NLL. */
function fitRho(train: Tuple[], base: number, gamma: number): number {
  let bestRho = 0;
  let bestNLL = Infinity;
  for (let r = -0.5; r <= 0.1 + 1e-9; r += 0.01) {
    const rho = Math.round(r * 100) / 100;
    const nll = scorelineNLL(train, base, gamma, rho);
    if (nll < bestNLL) {
      bestNLL = nll;
      bestRho = rho;
    }
  }
  return bestRho;
}

/** Predict 1X2 probabilities using Davidson model. */
function predict1X2(t: Tuple): { home: number; draw: number; away: number } {
  return davidsonProbs(t.effHome, t.effAway, NU, SCALE);
}

// ---- main -------------------------------------------------------------------

const matches = loadCorpus();
const tuples = rollCorpus(matches, { home: HOME, k: K, scale: SCALE });

// --- FIT on PRE-WC2022 TRAIN SET ---
const trainWc2022 = tuples.filter((t) => t.date < TRAIN_CUTOFF);
console.log(`Train (pre-wc2022) size: ${trainWc2022.length} matches`);

const { base: fittedBase, gamma: fittedGamma } = fitBaseGamma(trainWc2022);
const fittedRho = fitRho(trainWc2022, fittedBase, fittedGamma);

console.log(`\nFitted on pre-wc2022 train:`);
console.log(`  base=${fittedBase}  gamma=${fittedGamma}  rho=${fittedRho}`);
console.log(`\nShipped values: base=${GOAL_BASE}  gamma=${GOAL_GAMMA}  rho=${GOAL_RHO}`);

// --- SCORELINE NLL on WC2022 TEST (out-of-sample for this fit) ---
const testWc2022 = tuples.filter(
  (t) =>
    t.tournament === "FIFA World Cup" &&
    t.date >= "2022-11-20" &&
    t.date <= "2022-12-18",
);
console.log(`\nWC2022 test size: ${testWc2022.length} matches`);

const wc2022_fitted_scoreNLL = scorelineNLL(testWc2022, fittedBase, fittedGamma, fittedRho);
const wc2022_shipped_scoreNLL = scorelineNLL(testWc2022, GOAL_BASE, GOAL_GAMMA, GOAL_RHO);
console.log(`\nWC2022 exact-scoreline NLL:`);
console.log(`  fitted  (base=${fittedBase} gamma=${fittedGamma} rho=${fittedRho}): ${wc2022_fitted_scoreNLL.toFixed(4)}`);
console.log(`  shipped (base=${GOAL_BASE}  gamma=${GOAL_GAMMA}  rho=${GOAL_RHO}):  ${wc2022_shipped_scoreNLL.toFixed(4)}`);

// --- SCORELINE NLL on WC2026 (out-of-sample for BOTH fits) ---
const testWc2026 = tuples.filter(
  (t) =>
    t.tournament === "FIFA World Cup" &&
    t.date >= WC2026_START,
);
console.log(`\nWC2026 test size: ${testWc2026.length} matches`);

const wc2026_fitted_scoreNLL = testWc2026.length > 0
  ? scorelineNLL(testWc2026, fittedBase, fittedGamma, fittedRho)
  : NaN;
const wc2026_shipped_scoreNLL = testWc2026.length > 0
  ? scorelineNLL(testWc2026, GOAL_BASE, GOAL_GAMMA, GOAL_RHO)
  : NaN;
console.log(`\nWC2026 exact-scoreline NLL:`);
console.log(`  fitted  (base=${fittedBase} gamma=${fittedGamma} rho=${fittedRho}): ${wc2026_fitted_scoreNLL.toFixed(4)}`);
console.log(`  shipped (base=${GOAL_BASE}  gamma=${GOAL_GAMMA}  rho=${GOAL_RHO}):  ${wc2026_shipped_scoreNLL.toFixed(4)}`);

// --- 1X2 metrics on all three windows ---
const wc2022_1x2 = scoreWindow(tuples, inWc2022, predict1X2);
const wc2026_1x2 = scoreWindow(tuples, inWc2026, predict1X2);
const full_1x2 = scoreWindow(tuples, inFull, predict1X2);

console.log(`\n1X2 metrics (Davidson, same as baseline):`);
const f4 = (x: number) => x.toFixed(4);
console.log(`  full   : ll=${f4(full_1x2.logLoss)} brier=${f4(full_1x2.brier)} acc=${f4(full_1x2.acc)} n=${full_1x2.n}`);
console.log(`  wc2022 : ll=${f4(wc2022_1x2.logLoss)} brier=${f4(wc2022_1x2.brier)} acc=${f4(wc2022_1x2.acc)} n=${wc2022_1x2.n}`);
console.log(`  wc2026 : ll=${f4(wc2026_1x2.logLoss)} brier=${f4(wc2026_1x2.brier)} acc=${f4(wc2026_1x2.acc)} n=${wc2026_1x2.n}`);

// --- Also compare which config wins on wc2022 scoreline NLL ---
// Grid search over a few candidate configs including shipped
const candidates = [
  { base: GOAL_BASE, gamma: GOAL_GAMMA, rho: GOAL_RHO, label: "shipped" },
  { base: fittedBase, gamma: fittedGamma, rho: fittedRho, label: "refitted-pre2022" },
];

console.log(`\nComparison on WC2022 scoreline NLL (the tuning target):`);
for (const c of candidates) {
  const nll = scorelineNLL(testWc2022, c.base, c.gamma, c.rho);
  const nll26 = scorelineNLL(testWc2026, c.base, c.gamma, c.rho);
  console.log(`  ${c.label}: wc2022_scoreNLL=${nll.toFixed(4)}  wc2026_scoreNLL=${nll26.toFixed(4)}`);
}

// --- Final JSON output ---
const result = {
  slug: "goal-refit",
  shipped: { base: GOAL_BASE, gamma: GOAL_GAMMA, rho: GOAL_RHO },
  refitted: { base: fittedBase, gamma: fittedGamma, rho: fittedRho },
  scorelineNLL: {
    fitted: {
      wc2022: wc2022_fitted_scoreNLL,
      wc2026: wc2026_fitted_scoreNLL,
    },
    shipped: {
      wc2022: wc2022_shipped_scoreNLL,
      wc2026: wc2026_shipped_scoreNLL,
    },
  },
  onex2_1x2: {
    full: { logLoss: full_1x2.logLoss, brier: full_1x2.brier, acc: full_1x2.acc, n: full_1x2.n },
    wc2022: { logLoss: wc2022_1x2.logLoss, brier: wc2022_1x2.brier, acc: wc2022_1x2.acc, n: wc2022_1x2.n },
    wc2026: { logLoss: wc2026_1x2.logLoss, brier: wc2026_1x2.brier, acc: wc2026_1x2.acc, n: wc2026_1x2.n },
  },
};

console.log("\n--- FINAL JSON ---");
console.log(JSON.stringify(result, null, 2));
