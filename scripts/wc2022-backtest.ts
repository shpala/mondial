// Self-contained out-of-sample backtest of the Qatar 2022 World Cup.
//
// Run:  npx tsx scripts/wc2022-backtest.ts
//
// No leakage: ratings used to score any match come only from strictly-earlier
// matches. We roll Elo over ALL matches in date order, recording the PRE-match
// rating tuple before applying that match's update. base/gamma for the Poisson
// goal model are fit on the pre-2022-11-20 tuples only; the 64 Qatar 2022 World
// Cup matches are held out and scored.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseResults } from "@/lib/backtest/parse";
import { davidsonProbs } from "@/lib/prediction";
import { eloUpdate } from "@/lib/ratings";
import { goalRates, poissonPmf, poissonOutcome, poissonJoint } from "@/lib/backtest/poisson";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// --- Constants (per spec) -------------------------------------------------
const INIT = 1500;
const NU = 0.7;
const SCALE = 400;
const HOME_BUMP = 100;
const K = 60;
const TRAIN_CUTOFF = "2022-11-20";
const TEST_START = "2022-11-20";
const TEST_END = "2022-12-18";
const MAX_GOALS = 10;

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

// --- STEP 1: roll Elo with no leakage ------------------------------------
const csv = readFileSync(resolve(ROOT, "data/intl_results.csv"), "utf8");
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
  // THEN update (post-match), so it never feeds this match's own prediction.
  const d = eloUpdate(effHome, effAway, m.homeGoals, m.awayGoals, K);
  rating.set(m.home, at(m.home) + d);
  rating.set(m.away, at(m.away) - d);
}

const train = tuples.filter((t) => t.date < TRAIN_CUTOFF);
const test = tuples.filter(
  (t) =>
    t.tournament === "FIFA World Cup" &&
    t.date >= TEST_START &&
    t.date <= TEST_END,
);

// --- STEP 3: fit base, gamma on TRAIN by scoreline NLL -------------------
function scorelineNLL(base: number, gamma: number): number {
  let nll = 0;
  for (const t of train) {
    const { lambdaHome, lambdaAway } = goalRates(t.effHome, t.effAway, base, gamma);
    const pH = poissonPmf(lambdaHome, t.hg);
    const pA = poissonPmf(lambdaAway, t.ag);
    nll += -Math.log(pH) - Math.log(pA);
  }
  return nll;
}

let bestBase = 1.0;
let bestGamma = 150;
let bestNLL = Infinity;
for (let base = 1.0; base <= 1.7 + 1e-9; base += 0.05) {
  const b = Math.round(base * 100) / 100;
  for (let gamma = 150; gamma <= 900 + 1e-9; gamma += 25) {
    const nll = scorelineNLL(b, gamma);
    if (nll < bestNLL) {
      bestNLL = nll;
      bestBase = b;
      bestGamma = gamma;
    }
  }
}

// --- STEP 4: score the 64 TEST matches -----------------------------------
type Region = "home" | "draw" | "away";
const actualOf = (hg: number, ag: number): Region =>
  hg > ag ? "home" : hg < ag ? "away" : "draw";

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

const aRows: { p: { home: number; draw: number; away: number }; actual: Region }[] = [];
const bRows: { p: { home: number; draw: number; away: number }; actual: Region }[] = [];

// Scoreline log-loss accumulators
let aScoreLL = 0;
let bScoreLL = 0;

interface Pred {
  date: string;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  outcome: Region;
  A: { home: number; draw: number; away: number };
  B: { home: number; draw: number; away: number };
}
const preds: Pred[] = [];

for (const t of test) {
  const actual = actualOf(t.hg, t.ag);

  // Variant A: Davidson 1X2
  const A = davidsonProbs(t.effHome, t.effAway, NU, SCALE);
  // Variant B: independent-Poisson 1X2
  const { lambdaHome, lambdaAway } = goalRates(t.effHome, t.effAway, bestBase, bestGamma);
  const B = poissonOutcome(lambdaHome, lambdaAway);

  aRows.push({ p: A, actual });
  bRows.push({ p: B, actual });

  // --- Scoreline log-loss (exact score) ---
  // B: raw normalized independent-Poisson joint.
  const jointB = poissonJoint(lambdaHome, lambdaAway);
  const i = Math.min(t.hg, MAX_GOALS);
  const j = Math.min(t.ag, MAX_GOALS);
  bScoreLL += -Math.log(jointB[i][j]);

  // A: SAME joint, but renormalized within each outcome region so region masses
  // equal Davidson A {home,draw,away}. P_A(i,j) = A[region] * jointB(i,j)/regionMass.
  let mHome = 0;
  let mDraw = 0;
  let mAway = 0;
  for (let x = 0; x <= MAX_GOALS; x++) {
    for (let y = 0; y <= MAX_GOALS; y++) {
      if (x > y) mHome += jointB[x][y];
      else if (x === y) mDraw += jointB[x][y];
      else mAway += jointB[x][y];
    }
  }
  const region: Region = i > j ? "home" : i < j ? "away" : "draw";
  const regionMass = region === "home" ? mHome : region === "draw" ? mDraw : mAway;
  const pAij = (A[region] * jointB[i][j]) / regionMass;
  aScoreLL += -Math.log(pAij);

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

// --- STEP 5: write outputs ------------------------------------------------
const predsPath = resolve(ROOT, "docs/wc2022-predictions.json");
writeFileSync(predsPath, JSON.stringify(preds, null, 2) + "\n");

const r4 = (x: number) => x.toFixed(4);
const reportPath = resolve(ROOT, "docs/wc2022-report.md");
const report = `# Qatar 2022 World Cup — Out-of-Sample Backtest

Held-out test set: the **${test.length}** matches with \`tournament === "FIFA World Cup"\`
and date in [${TEST_START}, ${TEST_END}]. Ratings come only from strictly-earlier
matches (no leakage). The Poisson goal model's \`base\`/\`gamma\` were fit on the
${train.length} pre-${TRAIN_CUTOFF} match tuples by minimizing one-step scoreline NLL.

Fitted Poisson params: **base = ${bestBase}**, **gamma = ${bestGamma}** (train NLL = ${bestNLL.toFixed(2)}).

## Outcome (1X2) metrics — lower is better

| Variant | Model | Log-loss | Brier |
|---|---|---|---|
| A | Davidson (nu=${NU}, scale=${SCALE}) | ${r4(a.logLoss)} | ${r4(a.brier)} |
| B | Independent Poisson | ${r4(b.logLoss)} | ${r4(b.brier)} |

A coin-flip-style baseline (uniform 1/3 each) has log-loss ln 3 ≈ 1.0986.

## Exact-scoreline log-loss (goals 0..10) — lower is better

| Variant | Scoreline log-loss |
|---|---|
| A | ${r4(aScoreLL)} |
| B | ${r4(bScoreLL)} |

Variant A reuses the independent-Poisson joint but renormalizes each outcome
region (home / draw / away) so the region masses match Davidson's 1X2 split.

Per-match predictions: \`docs/wc2022-predictions.json\` (${preds.length} rows).
`;
writeFileSync(reportPath, report);

// --- Sanity: even-ratings symmetry ---------------------------------------
const symA = davidsonProbs(1700, 1700, NU, SCALE);
const symRates = goalRates(1700, 1700, bestBase, bestGamma);
const symB = poissonOutcome(symRates.lambdaHome, symRates.lambdaAway);
const avgGoals =
  test.reduce((s, t) => s + t.hg + t.ag, 0) / test.length / 2;

const summary = {
  built: true,
  files: [
    resolve(ROOT, "lib/backtest/poisson.ts"),
    resolve(ROOT, "scripts/wc2022-backtest.ts"),
    predsPath,
    reportPath,
  ],
  fittedBase: bestBase,
  fittedGamma: bestGamma,
  trainTuples: train.length,
  testMatches: test.length,
  variantA: a,
  variantB: b,
  scorelineLogLoss: { A: aScoreLL, B: bScoreLL },
  predictionsJsonPath: predsPath,
  sanity: {
    evenDavidsonHomeEqAway: Math.abs(symA.home - symA.away) < 1e-12,
    evenPoissonLambdasEqual: Math.abs(symRates.lambdaHome - symRates.lambdaAway) < 1e-12,
    evenPoissonHomeEqAway: Math.abs(symB.home - symB.away) < 1e-12,
    aProbsSumTo1: aRows.every((r) => Math.abs(r.p.home + r.p.draw + r.p.away - 1) < 1e-9),
    bProbsSumTo1: bRows.every((r) => Math.abs(r.p.home + r.p.draw + r.p.away - 1) < 1e-9),
    avgGoalsPerSide: avgGoals,
  },
};

console.log(JSON.stringify(summary, null, 2));
