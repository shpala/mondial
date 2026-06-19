/**
 * v-season-regress.ts — Seasonal regression-to-mean Elo
 *
 * Every Jan 1, pull each rating toward 1500:
 *   rating = 1500 + (rating - 1500) * retain
 *
 * Sweep retain in [0.6..0.97] to find the config that minimizes wc2022 log-loss.
 * Then freeze and report wc2026 (out-of-sample) and full corpus.
 *
 * Baseline (shipped model): nu=0.8 home=87.5 k=45 scale=300
 *   full   logLoss=0.8959 brier=0.5277 acc=0.5905 n=8105
 *   wc2022 logLoss=1.0666 brier=0.6309 acc=0.4531 n=64
 *   wc2026 logLoss=1.0929 brier=0.6879 acc=0.3333 n=12
 */

import {
  loadCorpus,
  eloUpdateScaled,
  scoreWindow,
  inFull,
  inWc2022,
  inWc2026,
  INIT,
  type Tuple,
  type RollParams,
} from "@/scripts/explore/harness";
import { davidsonProbs } from "@/lib/prediction";
import type { MatchRow } from "@/lib/backtest/parse";

// Fixed Davidson + Elo constants (baseline)
const NU = 0.8;
const HOME = 87.5;
const K = 45;
const SCALE = 300;

/**
 * Custom roll with seasonal regression-to-mean.
 * Every Jan 1, each team's rating is pulled toward INIT (1500) by factor `retain`.
 */
function rollWithSeasonRegress(matches: MatchRow[], retain: number): Tuple[] {
  const rating = new Map<string, number>();
  const at = (t: string) => rating.get(t) ?? INIT;
  const tuples: Tuple[] = [];

  let lastYear: number | null = null;

  for (const m of matches) {
    const matchYear = parseInt(m.date.slice(0, 4), 10);

    // Apply seasonal regression on year boundary (Jan 1)
    if (lastYear !== null && matchYear > lastYear) {
      // Apply for each year that has passed (handles multi-year gaps)
      for (let yr = lastYear + 1; yr <= matchYear; yr++) {
        for (const [team, r] of rating.entries()) {
          rating.set(team, INIT + (r - INIT) * retain);
        }
      }
    }
    lastYear = matchYear;

    const ratHome = at(m.home);
    const ratAway = at(m.away);
    const effHome = ratHome + (m.neutral ? 0 : HOME);
    const effAway = ratAway;

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

    const d = eloUpdateScaled(effHome, effAway, m.homeGoals, m.awayGoals, K, SCALE);
    rating.set(m.home, at(m.home) + d);
    rating.set(m.away, at(m.away) - d);
  }

  return tuples;
}

const predict = (t: Tuple) => davidsonProbs(t.effHome, t.effAway, NU, SCALE);

// Load corpus
const matches = loadCorpus();

// Sweep retain values
const retainValues: number[] = [];
for (let r = 60; r <= 97; r++) {
  retainValues.push(r / 100);
}

let bestRetain = 0.9;
let bestWc2022Loss = Infinity;
const results: Array<{ retain: number; wc2022: number; wc2026: number; full: number }> = [];

for (const retain of retainValues) {
  const tuples = rollWithSeasonRegress(matches, retain);
  const wc2022 = scoreWindow(tuples, inWc2022, predict);
  const wc2026 = scoreWindow(tuples, inWc2026, predict);
  const full = scoreWindow(tuples, inFull, predict);

  results.push({
    retain,
    wc2022: wc2022.logLoss,
    wc2026: wc2026.logLoss,
    full: full.logLoss,
  });

  if (wc2022.logLoss < bestWc2022Loss) {
    bestWc2022Loss = wc2022.logLoss;
    bestRetain = retain;
  }
}

// Print sweep summary
console.log("retain\twc2022_ll\twc2026_ll\tfull_ll");
for (const r of results) {
  console.log(`${r.retain.toFixed(2)}\t${r.wc2022.toFixed(4)}\t${r.wc2026.toFixed(4)}\t${r.full.toFixed(4)}`);
}

// Final evaluation with best retain
const bestTuples = rollWithSeasonRegress(matches, bestRetain);
const bestFull = scoreWindow(bestTuples, inFull, predict);
const bestWc2022 = scoreWindow(bestTuples, inWc2022, predict);
const bestWc2026 = scoreWindow(bestTuples, inWc2026, predict);

console.log("\n=== BEST CONFIG ===");
console.log(`retain=${bestRetain}`);
console.log(`full   logLoss=${bestFull.logLoss.toFixed(4)} brier=${bestFull.brier.toFixed(4)} acc=${bestFull.acc.toFixed(4)} n=${bestFull.n}`);
console.log(`wc2022 logLoss=${bestWc2022.logLoss.toFixed(4)} brier=${bestWc2022.brier.toFixed(4)} acc=${bestWc2022.acc.toFixed(4)} n=${bestWc2022.n}`);
console.log(`wc2026 logLoss=${bestWc2026.logLoss.toFixed(4)} brier=${bestWc2026.brier.toFixed(4)} acc=${bestWc2026.acc.toFixed(4)} n=${bestWc2026.n}`);

console.log("\n=== FINAL JSON ===");
console.log(JSON.stringify({
  algorithm: "season-regress",
  chosenConfig: { retain: bestRetain, nu: NU, home: HOME, k: K, scale: SCALE },
  full: { logLoss: bestFull.logLoss, brier: bestFull.brier, acc: bestFull.acc },
  wc2022: { logLoss: bestWc2022.logLoss, brier: bestWc2022.brier, acc: bestWc2022.acc },
  wc2026: { logLoss: bestWc2026.logLoss, brier: bestWc2026.brier, acc: bestWc2026.acc },
}, null, 2));
