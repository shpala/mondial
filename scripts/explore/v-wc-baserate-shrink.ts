/**
 * wc-baserate-shrink: Tournament-Conditioned Conformal Shrinkage to WC Base Rate.
 *
 * Algorithm:
 *   1. Roll Elo with home=62.5, k=35, scale=300, nu=0.70.
 *   2. For every match: if tournament == 'FIFA World Cup', compute
 *        p_blend = (1-alpha)*davidsonProbs(effHome, effAway, nu, scale) + alpha*[0.421, 0.224, 0.355]
 *      otherwise return raw davidsonProbs.
 *   3. The WC base-rate vector [0.421, 0.224, 0.355] is pre-computed from WC2014+WC2018 matches
 *      (t.tournament === 'FIFA World Cup' and t.date < WC2022_START and inFull(t)).
 *   4. Tune alpha in [0.05, 0.40] (and nu, home) on wc2022 log-loss to minimize it.
 *   5. Report out-of-sample wc2026 and full-corpus scores.
 */

import {
  loadCorpus,
  rollCorpus,
  scoreWindow,
  inFull,
  inWc2022,
  inWc2026,
  FULL_BURN_IN,
  WC2022_START,
  type Tuple,
  type Metrics,
} from "@/scripts/explore/harness";
import { davidsonProbs } from "@/lib/prediction";

const matches = loadCorpus();

// ── Step 1: Compute WC base rates from WC2014 + WC2018 (no leakage) ───────────
// Only matches in the full window (post FULL_BURN_IN = 2018-01-01) and before WC2022.
// WC2014: 2014-06-12 to 2014-07-13, WC2018: 2018-06-14 to 2018-07-15
// We use all FIFA World Cup matches in the corpus that are:
//   - In the "full" window (date >= FULL_BURN_IN)
//   - Before WC2022_START

let wcTotal = 0, wcHome = 0, wcDraw = 0, wcAway = 0;
for (const m of matches) {
  if (m.tournament !== "FIFA World Cup") continue;
  if (m.date < FULL_BURN_IN) continue;      // only count from burn-in
  if (m.date >= WC2022_START) continue;      // exclude WC2022 itself (no leakage)
  wcTotal++;
  if (m.homeGoals > m.awayGoals) wcHome++;
  else if (m.homeGoals === m.awayGoals) wcDraw++;
  else wcAway++;
}

// As per the recipe, pre-computed from WC2014+WC2018 = 76 matches.
// We bake in the constants from the recipe spec to avoid any leakage.
const WC_BASE_RATE = { home: 0.421, draw: 0.224, away: 0.355 };

console.log(`WC base rate computation (WC in full window, excluding WC2022), n=${wcTotal}:`);
console.log(`  Empirical: home=${(wcHome/wcTotal).toFixed(4)} draw=${(wcDraw/wcTotal).toFixed(4)} away=${(wcAway/wcTotal).toFixed(4)}`);
console.log(`  Using baked-in: home=${WC_BASE_RATE.home} draw=${WC_BASE_RATE.draw} away=${WC_BASE_RATE.away}`);

// ── Step 2: Evaluate the shrinkage model ──────────────────────────────────────

function evalWcShrink(
  nu: number,
  home: number,
  k: number,
  scale: number,
  alpha: number,
): { full: Metrics; wc2022: Metrics; wc2026: Metrics } {
  const tuples = rollCorpus(matches, { home, k, scale });

  const predict = (t: Tuple) => {
    const dav = davidsonProbs(t.effHome, t.effAway, nu, scale);
    if (t.tournament === "FIFA World Cup") {
      // Shrink toward WC empirical base rate
      return {
        home: (1 - alpha) * dav.home + alpha * WC_BASE_RATE.home,
        draw: (1 - alpha) * dav.draw + alpha * WC_BASE_RATE.draw,
        away: (1 - alpha) * dav.away + alpha * WC_BASE_RATE.away,
      };
    }
    // Non-WC: use raw Davidson
    return dav;
  };

  return {
    full: scoreWindow(tuples, inFull, predict),
    wc2022: scoreWindow(tuples, inWc2022, predict),
    wc2026: scoreWindow(tuples, inWc2026, predict),
  };
}

// ── Step 3: Grid search minimizing wc2022 log-loss ────────────────────────────

// Per recipe: home ∈ [55, 87.5], nu ∈ [0.6, 0.85], alpha ∈ [0.05, 0.40]
const nuVals    = [0.60, 0.65, 0.70, 0.75, 0.80, 0.85];
const homeVals  = [55, 62.5, 70, 75, 80, 87.5];
const kVals     = [30, 35, 40, 45];
const scaleVals = [275, 300, 325];
const alphaVals = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40];

interface BestResult {
  nu: number;
  home: number;
  k: number;
  scale: number;
  alpha: number;
  wc2022: Metrics;
  wc2026: Metrics;
  full: Metrics;
}

// Baseline full log-loss for guardrail
const baselineFullLogLoss = 0.8959;
const GUARDRAIL = 0.003;

let best: BestResult = {
  nu: 0.70, home: 62.5, k: 35, scale: 300, alpha: 0.20,
  wc2022: { logLoss: Infinity, brier: 0, acc: 0, n: 0, drawObs: 0, drawPred: 0 },
  wc2026: { logLoss: 0, brier: 0, acc: 0, n: 0, drawObs: 0, drawPred: 0 },
  full: { logLoss: 0, brier: 0, acc: 0, n: 0, drawObs: 0, drawPred: 0 },
};

// Also track unconstrained best (ignoring guardrail) for reporting
let bestUnconstrained: BestResult = { ...best };

console.log("\nRunning grid search (nu × home × k × scale × alpha), enforcing full-corpus guardrail...");
let iterations = 0;

for (const nu of nuVals) {
  for (const home of homeVals) {
    for (const k of kVals) {
      for (const scale of scaleVals) {
        for (const alpha of alphaVals) {
          iterations++;
          const r = evalWcShrink(nu, home, k, scale, alpha);
          // Unconstrained best
          if (r.wc2022.logLoss < bestUnconstrained.wc2022.logLoss) {
            bestUnconstrained = { nu, home, k, scale, alpha, wc2022: r.wc2022, wc2026: r.wc2026, full: r.full };
          }
          // Guardrail-constrained best: full must not regress > +0.003
          const fullDelta = r.full.logLoss - baselineFullLogLoss;
          if (fullDelta <= GUARDRAIL && r.wc2022.logLoss < best.wc2022.logLoss) {
            best = { nu, home, k, scale, alpha, wc2022: r.wc2022, wc2026: r.wc2026, full: r.full };
          }
        }
      }
    }
  }
}

console.log(`Grid search complete (${iterations} combinations).`);
const unconstFullDelta = bestUnconstrained.full.logLoss - baselineFullLogLoss;
console.log(`\n=== UNCONSTRAINED BEST (ignoring guardrail) ===`);
console.log(`  nu=${bestUnconstrained.nu} home=${bestUnconstrained.home} k=${bestUnconstrained.k} scale=${bestUnconstrained.scale} alpha=${bestUnconstrained.alpha}`);
console.log(`  wc2022: logLoss=${bestUnconstrained.wc2022.logLoss.toFixed(4)} brier=${bestUnconstrained.wc2022.brier.toFixed(4)} acc=${bestUnconstrained.wc2022.acc.toFixed(4)}`);
console.log(`  full Δ=${unconstFullDelta.toFixed(4)} (guardrail: ${unconstFullDelta <= GUARDRAIL ? "PASS" : "FAIL"})`);

// ── Step 4: Report results ────────────────────────────────────────────────────

const BASELINE = { nu: 0.8, home: 87.5, k: 45, scale: 300 };
const baselineResult = evalWcShrink(BASELINE.nu, BASELINE.home, BASELINE.k, BASELINE.scale, 0);

console.log("\n=== BASELINE (alpha=0, nu=0.8, home=87.5, k=45, scale=300) ===");
console.log(`  wc2022: logLoss=${baselineResult.wc2022.logLoss.toFixed(4)} brier=${baselineResult.wc2022.brier.toFixed(4)} acc=${baselineResult.wc2022.acc.toFixed(4)}`);
console.log(`  wc2026: logLoss=${baselineResult.wc2026.logLoss.toFixed(4)} brier=${baselineResult.wc2026.brier.toFixed(4)} acc=${baselineResult.wc2026.acc.toFixed(4)}`);
console.log(`  full:   logLoss=${baselineResult.full.logLoss.toFixed(4)} brier=${baselineResult.full.brier.toFixed(4)} acc=${baselineResult.full.acc.toFixed(4)}`);

console.log("\n=== BEST CONFIG (minimizes wc2022 log-loss) ===");
console.log(`  nu=${best.nu} home=${best.home} k=${best.k} scale=${best.scale} alpha=${best.alpha}`);
console.log(`  wc2022: logLoss=${best.wc2022.logLoss.toFixed(4)} brier=${best.wc2022.brier.toFixed(4)} acc=${best.wc2022.acc.toFixed(4)}`);
console.log(`  wc2026: logLoss=${best.wc2026.logLoss.toFixed(4)} brier=${best.wc2026.brier.toFixed(4)} acc=${best.wc2026.acc.toFixed(4)}`);
console.log(`  full:   logLoss=${best.full.logLoss.toFixed(4)} brier=${best.full.brier.toFixed(4)} acc=${best.full.acc.toFixed(4)}`);

// Compute deltas vs baseline
const wc2022Delta = best.wc2022.logLoss - baselineResult.wc2022.logLoss;
const wc2026Delta = best.wc2026.logLoss - baselineResult.wc2026.logLoss;
const fullDelta = best.full.logLoss - baselineResult.full.logLoss;
console.log(`\n  Deltas vs baseline:`);
console.log(`    wc2022 Δ=${wc2022Delta.toFixed(4)} wc2026 Δ=${wc2026Delta.toFixed(4)} full Δ=${fullDelta.toFixed(4)}`);
console.log(`    full guardrail (+0.003): ${fullDelta <= 0.003 ? "PASS" : "FAIL"}`);

// Also check the recipe-suggested alpha=0.20 with recipe params
const recipeResult = evalWcShrink(0.70, 62.5, 35, 300, 0.20);
console.log("\n=== RECIPE PARAMS (nu=0.70, home=62.5, k=35, scale=300, alpha=0.20) ===");
console.log(`  wc2022: logLoss=${recipeResult.wc2022.logLoss.toFixed(4)} brier=${recipeResult.wc2022.brier.toFixed(4)} acc=${recipeResult.wc2022.acc.toFixed(4)}`);
console.log(`  wc2026: logLoss=${recipeResult.wc2026.logLoss.toFixed(4)} brier=${recipeResult.wc2026.brier.toFixed(4)} acc=${recipeResult.wc2026.acc.toFixed(4)}`);
console.log(`  full:   logLoss=${recipeResult.full.logLoss.toFixed(4)} brier=${recipeResult.full.brier.toFixed(4)} acc=${recipeResult.full.acc.toFixed(4)}`);

// Print final JSON for machine parsing
const result = {
  slug: "wc-baserate-shrink",
  chosenConfig: {
    nu: best.nu,
    home: best.home,
    k: best.k,
    scale: best.scale,
    alpha: best.alpha,
    wcBaseRate: WC_BASE_RATE,
  },
  full: { logLoss: best.full.logLoss, brier: best.full.brier, acc: best.full.acc },
  wc2022: { logLoss: best.wc2022.logLoss, brier: best.wc2022.brier, acc: best.wc2022.acc },
  wc2026: { logLoss: best.wc2026.logLoss, brier: best.wc2026.brier, acc: best.wc2026.acc },
  generalizes: best.wc2026.logLoss < 1.0929,
  overfitRisk: (wc2022Delta < -0.02 && wc2026Delta > 0) ? "high" : (fullDelta > 0.002 ? "medium" : "low"),
};

console.log("\nFINAL_JSON=" + JSON.stringify(result));
