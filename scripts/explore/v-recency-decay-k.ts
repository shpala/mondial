// v-recency-decay-k.ts
// Recency-decayed Elo K: stale teams get smaller updates.
// When a team has been idle for many months the evidence from their next match
// is informationally weaker, so we scale K by a decay factor based on the
// calendar gap since each team's previous match.

import {
  loadCorpus,
  eloUpdateScaled,
  scoreWindow,
  inFull,
  inWc2022,
  inWc2026,
  INIT,
  type Tuple,
} from "@/scripts/explore/harness";
import { davidsonProbs } from "@/lib/prediction";

// ── Custom roll with recency-decay ─────────────────────────────────────────

function rollWithRecencyDecay(
  matches: ReturnType<typeof loadCorpus>,
  params: {
    home: number;
    k: number;
    scale: number;
    nu: number;
    halfLife: number; // days
    init?: number;
  },
): Tuple[] {
  const init = params.init ?? INIT;
  const rating = new Map<string, number>();
  const lastDate = new Map<string, number>(); // team -> ms timestamp of last match
  const at = (t: string) => rating.get(t) ?? init;

  const tuples: Tuple[] = [];

  for (const m of matches) {
    const matchMs = new Date(m.date).getTime();

    // Compute gap days for each team; default to 365 if no prior match recorded
    const homeLastMs = lastDate.get(m.home);
    const awayLastMs = lastDate.get(m.away);
    const homeGapDays = homeLastMs !== undefined ? (matchMs - homeLastMs) / 86400000 : 365;
    const awayGapDays = awayLastMs !== undefined ? (matchMs - awayLastMs) / 86400000 : 365;

    // Recency factor: average of individual decay factors (preserves zero-sum)
    const hl = params.halfLife;
    const recencyFactor = (Math.pow(2, -homeGapDays / hl) + Math.pow(2, -awayGapDays / hl)) / 2;

    const ratHome = at(m.home);
    const ratAway = at(m.away);
    const effHome = ratHome + (m.neutral ? 0 : params.home);
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

    // Update ratings with decayed K
    const d = eloUpdateScaled(effHome, effAway, m.homeGoals, m.awayGoals, params.k * recencyFactor, params.scale);
    rating.set(m.home, at(m.home) + d);
    rating.set(m.away, at(m.away) - d);

    // Record last match date for both teams
    lastDate.set(m.home, matchMs);
    lastDate.set(m.away, matchMs);
  }

  return tuples;
}

// ── Evaluate one config ────────────────────────────────────────────────────

function evaluate(
  matches: ReturnType<typeof loadCorpus>,
  params: { home: number; k: number; scale: number; nu: number; halfLife: number },
) {
  const tuples = rollWithRecencyDecay(matches, params);
  const predict = (t: Tuple) => davidsonProbs(t.effHome, t.effAway, params.nu, params.scale);
  return {
    full: scoreWindow(tuples, inFull, predict),
    wc2022: scoreWindow(tuples, inWc2022, predict),
    wc2026: scoreWindow(tuples, inWc2026, predict),
  };
}

// ── Sweep to tune on wc2022 ────────────────────────────────────────────────

const matches = loadCorpus();

const halfLives = [180, 270, 365, 450, 548];
const nus = [0.70, 0.75, 0.80];
const homes = [50, 62.5, 75, 87.5];
const ks = [40, 45, 50];
const scales = [250, 275, 300];

let bestLoss = Infinity;
let bestConfig: { halfLife: number; nu: number; home: number; k: number; scale: number } | null = null;

console.log("Sweeping hyperparameters on wc2022...");

for (const halfLife of halfLives) {
  for (const nu of nus) {
    for (const home of homes) {
      for (const k of ks) {
        for (const scale of scales) {
          const res = evaluate(matches, { halfLife, nu, home, k, scale });
          if (res.wc2022.logLoss < bestLoss) {
            bestLoss = res.wc2022.logLoss;
            bestConfig = { halfLife, nu, home, k, scale };
          }
        }
      }
    }
  }
}

console.log("Best wc2022 logLoss:", bestLoss.toFixed(4));
console.log("Best config:", bestConfig);

// ── Measure final scores with best config ──────────────────────────────────

const finalRes = evaluate(matches, bestConfig!);

const output = {
  config: bestConfig,
  full: {
    logLoss: +finalRes.full.logLoss.toFixed(4),
    brier: +finalRes.full.brier.toFixed(4),
    acc: +finalRes.full.acc.toFixed(4),
    n: finalRes.full.n,
  },
  wc2022: {
    logLoss: +finalRes.wc2022.logLoss.toFixed(4),
    brier: +finalRes.wc2022.brier.toFixed(4),
    acc: +finalRes.wc2022.acc.toFixed(4),
    n: finalRes.wc2022.n,
  },
  wc2026: {
    logLoss: +finalRes.wc2026.logLoss.toFixed(4),
    brier: +finalRes.wc2026.brier.toFixed(4),
    acc: +finalRes.wc2026.acc.toFixed(4),
    n: finalRes.wc2026.n,
  },
};

console.log("\nFINAL_JSON:", JSON.stringify(output));
