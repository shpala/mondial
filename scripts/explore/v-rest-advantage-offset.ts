// rest-advantage-offset: Pre-match rest-day differential as an Elo rating offset.
//
// Teams with more rest between matches outperform their Elo ratings because fresh
// legs reduce injury risk and tactical entropy. The rest differential is computed
// from strictly-prior corpus match dates (no leakage).

import {
  loadCorpus,
  rollCorpus,
  scoreWindow,
  inFull,
  inWc2022,
  inWc2026,
  type Tuple,
  type PredictFn,
} from "@/scripts/explore/harness";
import { davidsonProbs } from "@/lib/prediction";

const matches = loadCorpus();

// Build per-team sorted list of match dates (full corpus).
// We only use dates strictly before the current match date (no leakage).
const teamDates = new Map<string, string[]>();
for (const m of matches) {
  if (!teamDates.has(m.home)) teamDates.set(m.home, []);
  if (!teamDates.has(m.away)) teamDates.set(m.away, []);
  teamDates.get(m.home)!.push(m.date);
  teamDates.get(m.away)!.push(m.date);
}
// Already sorted because loadCorpus() returns date-sorted matches.

/** Binary search: last date in sorted array that is strictly < matchDate.
 *  Returns null if no prior date exists. */
function lastPriorDate(dates: string[], matchDate: string): string | null {
  let lo = 0, hi = dates.length - 1;
  let best: string | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (dates[mid] < matchDate) {
      best = dates[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

function daysBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 86400000;
}

/** Build predict function incorporating rest-day differential */
function makePredict(
  tuples: Tuple[],
  nu: number,
  scale: number,
  restWeight: number,
  cap: number,
): PredictFn {
  // Build a lookup from (team, matchDate) -> restDays
  // We reuse the globally-built teamDates (whole corpus, sorted).
  return (t: Tuple) => {
    const homeDates = teamDates.get(t.home);
    const awayDates = teamDates.get(t.away);

    let restHome: number | null = null;
    let restAway: number | null = null;

    if (homeDates) {
      const prior = lastPriorDate(homeDates, t.date);
      if (prior !== null) restHome = daysBetween(prior, t.date);
    }
    if (awayDates) {
      const prior = lastPriorDate(awayDates, t.date);
      if (prior !== null) restAway = daysBetween(prior, t.date);
    }

    let diff = 0;
    if (restHome !== null && restAway !== null) {
      diff = Math.max(-cap, Math.min(cap, restHome - restAway));
    }

    const effH = t.effHome + restWeight * diff;
    return davidsonProbs(effH, t.effAway, nu, scale);
  };
}

// ── Sweep (tune on wc2022) ────────────────────────────────────────────────────
const restWeights = [2, 3, 4, 5, 6, 7];
const caps = [2, 3, 4];
const nus = [0.70, 0.75, 0.80, 0.85];
const homes = [50, 62.5, 75, 87.5];
const scales = [225, 275, 300];

let bestLoss = Infinity;
let bestConfig = { restWeight: 4, cap: 2, nu: 0.75, home: 75, k: 45, scale: 300 };

for (const home of homes) {
  const tuples = rollCorpus(matches, { home, k: 45, scale: 300 });
  for (const nu of nus) {
    for (const scale of scales) {
      for (const restWeight of restWeights) {
        for (const cap of caps) {
          const predict = makePredict(tuples, nu, scale, restWeight, cap);
          const { logLoss } = scoreWindow(tuples, inWc2022, predict);
          if (logLoss < bestLoss) {
            bestLoss = logLoss;
            bestConfig = { restWeight, cap, nu, home, k: 45, scale };
          }
        }
      }
    }
  }
}

// ── Evaluate best config on all windows ──────────────────────────────────────
const tuples = rollCorpus(matches, { home: bestConfig.home, k: bestConfig.k, scale: bestConfig.scale });
const predict = makePredict(tuples, bestConfig.nu, bestConfig.scale, bestConfig.restWeight, bestConfig.cap);

const full = scoreWindow(tuples, inFull, predict);
const wc2022 = scoreWindow(tuples, inWc2022, predict);
const wc2026 = scoreWindow(tuples, inWc2026, predict);

console.log("Best config:", JSON.stringify(bestConfig));
console.log("wc2022 logLoss:", wc2022.logLoss.toFixed(4));
console.log("wc2026 logLoss:", wc2026.logLoss.toFixed(4));
console.log("full   logLoss:", full.logLoss.toFixed(4));
console.log(
  JSON.stringify({
    slug: "rest-advantage-offset",
    config: bestConfig,
    full: { logLoss: full.logLoss, brier: full.brier, acc: full.acc },
    wc2022: { logLoss: wc2022.logLoss, brier: wc2022.brier, acc: wc2022.acc },
    wc2026: { logLoss: wc2026.logLoss, brier: wc2026.brier, acc: wc2026.acc },
  })
);
