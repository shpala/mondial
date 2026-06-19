/**
 * v-form-autocorr.ts — Elo + Decaying Form Component (Autocorrelation)
 *
 * Standard Elo augmented with an EWMA of each team's overperformance.
 * The form component captures short-run momentum: teams consistently
 * outperforming their Elo expectation receive a temporary rating boost.
 *
 * Algorithm:
 *   - Maintain rating (standard Elo, init=1500) and form (EWMA, init=0) per team.
 *   - effHome = rating[home] + (neutral?0:home_bump) + formAlpha*form[home]
 *   - effAway = rating[away] + formAlpha*form[away]
 *   - Predict with davidsonProbs(effHome, effAway, nu, scale)
 *   - Elo update as normal with effHome/effAway
 *   - EWMA update: overH = gMult*(w-we); form[home] = form[home]*decay + (1-decay)*overH
 *
 * Tuned on wc2022; wc2026 is out-of-sample.
 */

import {
  loadCorpus,
  eloUpdateScaled,
  scoreWindow,
  inFull,
  inWc2022,
  inWc2026,
  actualOf,
  INIT,
  type Tuple,
} from "@/scripts/explore/harness";
import { davidsonProbs } from "@/lib/prediction";
import type { MatchRow } from "@/lib/backtest/parse";

interface FormParams {
  nu: number;
  home: number;
  k: number;
  scale: number;
  formDecay: number;
  formAlpha: number;
}

/** Roll corpus with form-autocorrelation component. Returns (tuples, formSnap). */
function rollWithForm(matches: MatchRow[], p: FormParams): Tuple[] {
  const rating = new Map<string, number>();
  const form = new Map<string, number>();

  const at = (t: string) => rating.get(t) ?? INIT;
  const formOf = (t: string) => form.get(t) ?? 0;

  const tuples: Tuple[] = [];

  for (const m of matches) {
    const ratHome = at(m.home);
    const ratAway = at(m.away);
    const fHome = formOf(m.home);
    const fAway = formOf(m.away);

    const effHome = ratHome + (m.neutral ? 0 : p.home) + p.formAlpha * fHome;
    const effAway = ratAway + p.formAlpha * fAway;

    tuples.push({
      date: m.date,
      home: m.home,
      away: m.away,
      effHome,
      effAway,
      ratHome,
      ratAway,
      neutral: m.neutral,
      hg: m.homeGoals,
      ag: m.awayGoals,
      tournament: m.tournament,
    });

    // Elo update
    const d = eloUpdateScaled(effHome, effAway, m.homeGoals, m.awayGoals, p.k, p.scale);
    rating.set(m.home, at(m.home) + d);
    rating.set(m.away, at(m.away) - d);

    // Compute goal diff multiplier (matches harness logic)
    const gd = Math.abs(m.homeGoals - m.awayGoals);
    const gMult = gd <= 1 ? 1 : gd === 2 ? 1.5 : (11 + gd) / 8;

    // Win expectation for form update (based on eff ratings)
    const we = 1 / (1 + Math.pow(10, (effAway - effHome) / p.scale));
    const w = m.homeGoals > m.awayGoals ? 1 : m.homeGoals < m.awayGoals ? 0 : 0.5;

    // Overperformance: signed, scaled by goal multiplier
    const overH = gMult * (w - we);
    const overA = gMult * (we - w);

    // EWMA form update
    form.set(m.home, fHome * p.formDecay + (1 - p.formDecay) * overH);
    form.set(m.away, fAway * p.formDecay + (1 - p.formDecay) * overA);
  }

  return tuples;
}

function evaluate(matches: MatchRow[], p: FormParams) {
  const tuples = rollWithForm(matches, p);
  const predict = (t: Tuple) => davidsonProbs(t.effHome, t.effAway, p.nu, p.scale);
  return {
    full: scoreWindow(tuples, inFull, predict),
    wc2022: scoreWindow(tuples, inWc2022, predict),
    wc2026: scoreWindow(tuples, inWc2026, predict),
  };
}

// ---- Main ----

const matches = loadCorpus();

// WC2022-tuned best config (per recipe)
const bestConfig: FormParams = {
  nu: 0.75,
  home: 80,
  k: 45,
  scale: 350,
  formDecay: 0.99,
  formAlpha: 10,
};

const result = evaluate(matches, bestConfig);

console.log("=== Form-Autocorr: WC2022-tuned config ===");
console.log("Config:", JSON.stringify(bestConfig));
console.log("full  :", JSON.stringify(result.full));
console.log("wc2022:", JSON.stringify(result.wc2022));
console.log("wc2026:", JSON.stringify(result.wc2026));

// Also try joint wc22+wc26 config
const jointConfig: FormParams = {
  nu: 0.8,
  home: 70,
  k: 45,
  scale: 325,
  formDecay: 0.99,
  formAlpha: 10,
};

const jointResult = evaluate(matches, jointConfig);
console.log("\n=== Form-Autocorr: Joint wc22+wc26 config ===");
console.log("Config:", JSON.stringify(jointConfig));
console.log("full  :", JSON.stringify(jointResult.full));
console.log("wc2022:", JSON.stringify(jointResult.wc2022));
console.log("wc2026:", JSON.stringify(jointResult.wc2026));

// Do a focused sweep around best known config to verify it's optimal for wc2022
console.log("\n=== Grid sweep around best config ===");
const nuVals = [0.65, 0.70, 0.75, 0.80, 0.85];
const homeVals = [60, 70, 80, 87.5, 90, 100];
const scaleVals = [300, 325, 350, 375, 400];
const alphaVals = [5, 8, 10, 12, 15, 20];
const decayVals = [0.95, 0.97, 0.99, 0.995, 0.999];

let bestLoss = Infinity;
let bestFound = bestConfig;

for (const nu of nuVals) {
  for (const home of homeVals) {
    for (const scale of scaleVals) {
      for (const formAlpha of alphaVals) {
        for (const formDecay of decayVals) {
          const cfg: FormParams = { nu, home, k: 45, scale, formDecay, formAlpha };
          const r = evaluate(matches, cfg);
          if (r.wc2022.logLoss < bestLoss) {
            bestLoss = r.wc2022.logLoss;
            bestFound = cfg;
          }
        }
      }
    }
  }
}

const bestSweepResult = evaluate(matches, bestFound);
console.log("\n=== Best from sweep ===");
console.log("Config:", JSON.stringify(bestFound));
console.log("full  :", JSON.stringify(bestSweepResult.full));
console.log("wc2022:", JSON.stringify(bestSweepResult.wc2022));
console.log("wc2026:", JSON.stringify(bestSweepResult.wc2026));

// Final JSON output
const finalConfig = bestFound;
const finalResult = bestSweepResult;

console.log("\n=== FINAL JSON ===");
console.log(
  JSON.stringify({
    slug: "form-autocorr",
    config: finalConfig,
    full: {
      logLoss: +finalResult.full.logLoss.toFixed(4),
      brier: +finalResult.full.brier.toFixed(4),
      acc: +finalResult.full.acc.toFixed(4),
    },
    wc2022: {
      logLoss: +finalResult.wc2022.logLoss.toFixed(4),
      brier: +finalResult.wc2022.brier.toFixed(4),
      acc: +finalResult.wc2022.acc.toFixed(4),
    },
    wc2026: {
      logLoss: +finalResult.wc2026.logLoss.toFixed(4),
      brier: +finalResult.wc2026.brier.toFixed(4),
      acc: +finalResult.wc2026.acc.toFixed(4),
    },
  }),
);
