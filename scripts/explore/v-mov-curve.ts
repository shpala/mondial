/**
 * v-mov-curve.ts — Alternative margin-of-victory (MoV) curve exploration.
 *
 * The standard eloratings g(d) = 1, 1.5, (11+d)/8 multiplier is replaced with
 * three variants:
 *   (a) g = 1           — no MoV scaling at all
 *   (b) g = ln(d+1)+1   — logarithmic; smoothly diminishing returns
 *   (c) g = min((11+d)/8, g_at_d3)   — original curve capped at d=3
 *
 * We roll Elo with each curve variant, then tune a scalar multiplier s on top of
 * the curve (effective K = k * s * g(d)) as well as the Davidson nu, home bump
 * and scale to minimise wc2022 log-loss. Then report full and wc2026.
 */

import {
  loadCorpus,
  rollCorpus,
  scoreWindow,
  inFull,
  inWc2022,
  inWc2026,
  type Tuple,
  type RollParams,
} from "@/scripts/explore/harness";
import { eloUpdate } from "@/lib/ratings";
import { davidsonProbs } from "@/lib/prediction";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// ─── MoV curve variants ───────────────────────────────────────────────────────

type GFn = (gd: number) => number;

/** (a) No MoV scaling — every win counts the same regardless of scoreline. */
const gFlat: GFn = (_d) => 1;

/** (b) Logarithmic: g = ln(d+1)+1 (gives 1 at d=0, grows smoothly, never caps). */
const gLog: GFn = (d) => Math.log(d + 1) + 1;

/** (c) Original eloratings curve capped at d=3 (value at d=3 = (11+3)/8 = 1.75). */
const CAP_D3 = (11 + 3) / 8; // 1.75
const gCap3: GFn = (d) => Math.min(d <= 1 ? 1 : d === 2 ? 1.5 : (11 + d) / 8, CAP_D3);

/** Original eloratings g — baseline for comparison. */
const gOrig: GFn = (d) => (d <= 1 ? 1 : d === 2 ? 1.5 : (11 + d) / 8);

const curves: Record<string, GFn> = {
  flat: gFlat,
  log: gLog,
  cap3: gCap3,
  orig: gOrig,
};

// ─── Custom Elo roll with pluggable g(d) ─────────────────────────────────────

interface CustomRollParams {
  home: number;
  k: number;
  scale: number;
  scalar: number; // additional multiplier on top of g(d)
  gFn: GFn;
  init?: number;
}

import { parseResults } from "@/lib/backtest/parse";
import { resolve as resolvePath } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CSV = resolve(ROOT, "data/intl_results.csv");

function rollWithCurve(matches: ReturnType<typeof loadCorpus>, p: CustomRollParams): Tuple[] {
  const init = p.init ?? 1500;
  const rating = new Map<string, number>();
  const at = (t: string) => rating.get(t) ?? init;
  const tuples: Tuple[] = [];

  for (const m of matches) {
    const ratHome = at(m.home);
    const ratAway = at(m.away);
    const effHome = ratHome + (m.neutral ? 0 : p.home);
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

    // Custom Elo update with pluggable g(d)
    const we = 1 / (1 + Math.pow(10, (effAway - effHome) / p.scale));
    const w = m.homeGoals > m.awayGoals ? 1 : m.homeGoals < m.awayGoals ? 0 : 0.5;
    const gd = Math.abs(m.homeGoals - m.awayGoals);
    const g = p.gFn(gd);
    const delta = p.k * p.scalar * g * (w - we);

    rating.set(m.home, at(m.home) + delta);
    rating.set(m.away, at(m.away) - delta);
  }
  return tuples;
}

// ─── Evaluation helper ────────────────────────────────────────────────────────

function evalConfig(
  matches: ReturnType<typeof loadCorpus>,
  params: CustomRollParams,
  nu: number,
): { full: ReturnType<typeof scoreWindow>; wc2022: ReturnType<typeof scoreWindow>; wc2026: ReturnType<typeof scoreWindow> } {
  const tuples = rollWithCurve(matches, params);
  const predict = (t: Tuple) => davidsonProbs(t.effHome, t.effAway, nu, params.scale);
  return {
    full: scoreWindow(tuples, inFull, predict),
    wc2022: scoreWindow(tuples, inWc2022, predict),
    wc2026: scoreWindow(tuples, inWc2026, predict),
  };
}

// ─── Grid search ──────────────────────────────────────────────────────────────

const matches = loadCorpus();

console.log("=== Margin-of-Victory Curve Exploration ===\n");

// First do a coarse grid to understand each curve's behavior
const kValues = [30, 40, 45, 50, 60];
const scaleValues = [250, 300, 350, 400];
const homeValues = [70, 87.5, 100, 120];
const nuValues = [0.6, 0.7, 0.8, 0.9, 1.0];
const scalarValues = [0.7, 0.85, 1.0, 1.2, 1.5];

type BestResult = {
  curveName: string;
  params: CustomRollParams;
  nu: number;
  wc2022LL: number;
  wc2026LL: number;
  fullLL: number;
  wc2022Brier: number;
  wc2022Acc: number;
  wc2026Brier: number;
  wc2026Acc: number;
  fullBrier: number;
  fullAcc: number;
};

let globalBest: BestResult | null = null;
const curveResults: Record<string, BestResult> = {};

for (const [curveName, gFn] of Object.entries(curves)) {
  let bestLL = Infinity;
  let best: BestResult | null = null;

  for (const k of kValues) {
    for (const scale of scaleValues) {
      for (const home of homeValues) {
        for (const scalar of scalarValues) {
          for (const nu of nuValues) {
            const params: CustomRollParams = { home, k, scale, scalar, gFn };
            const res = evalConfig(matches, params, nu);
            if (res.wc2022.logLoss < bestLL) {
              bestLL = res.wc2022.logLoss;
              best = {
                curveName,
                params,
                nu,
                wc2022LL: res.wc2022.logLoss,
                wc2026LL: res.wc2026.logLoss,
                fullLL: res.full.logLoss,
                wc2022Brier: res.wc2022.brier,
                wc2022Acc: res.wc2022.acc,
                wc2026Brier: res.wc2026.brier,
                wc2026Acc: res.wc2026.acc,
                fullBrier: res.full.brier,
                fullAcc: res.full.acc,
              };
            }
          }
        }
      }
    }
  }

  if (best) {
    curveResults[curveName] = best;
    console.log(`Curve: ${curveName}`);
    console.log(`  Best params: k=${best.params.k} scale=${best.params.scale} home=${best.params.home} scalar=${best.params.scalar} nu=${best.nu}`);
    console.log(`  wc2022: logLoss=${best.wc2022LL.toFixed(4)} brier=${best.wc2022Brier.toFixed(4)} acc=${best.wc2022Acc.toFixed(4)}`);
    console.log(`  wc2026: logLoss=${best.wc2026LL.toFixed(4)} brier=${best.wc2026Brier.toFixed(4)} acc=${best.wc2026Acc.toFixed(4)}`);
    console.log(`  full:   logLoss=${best.fullLL.toFixed(4)} brier=${best.fullBrier.toFixed(4)} acc=${best.fullAcc.toFixed(4)}`);
    console.log();

    if (!globalBest || best.wc2022LL < globalBest.wc2022LL) {
      globalBest = best;
    }
  }
}

// Fine-tune around the best curve found
console.log("=== Fine-tuning best curve ===\n");

if (globalBest) {
  const bestCurve = globalBest.curveName;
  const gFn = curves[bestCurve];
  const bp = globalBest.params;

  // Fine grid around best found values
  const fineK = [bp.k - 5, bp.k, bp.k + 5];
  const fineScale = [bp.scale - 25, bp.scale, bp.scale + 25];
  const fineHome = [bp.home - 10, bp.home, bp.home + 10];
  const fineScalar = [bp.scalar - 0.1, bp.scalar, bp.scalar + 0.1].filter(s => s > 0);
  const fineNu = [globalBest.nu - 0.05, globalBest.nu, globalBest.nu + 0.05].filter(n => n > 0 && n < 2);

  let bestLL = globalBest.wc2022LL;
  let fineBest = globalBest;

  for (const k of fineK) {
    for (const scale of fineScale) {
      for (const home of fineHome) {
        for (const scalar of fineScalar) {
          for (const nu of fineNu) {
            const params: CustomRollParams = { home, k, scale, scalar, gFn };
            const res = evalConfig(matches, params, nu);
            if (res.wc2022.logLoss < bestLL) {
              bestLL = res.wc2022.logLoss;
              fineBest = {
                curveName: bestCurve,
                params,
                nu,
                wc2022LL: res.wc2022.logLoss,
                wc2026LL: res.wc2026.logLoss,
                fullLL: res.full.logLoss,
                wc2022Brier: res.wc2022.brier,
                wc2022Acc: res.wc2022.acc,
                wc2026Brier: res.wc2026.brier,
                wc2026Acc: res.wc2026.acc,
                fullBrier: res.full.brier,
                fullAcc: res.full.acc,
              };
            }
          }
        }
      }
    }
  }

  globalBest = fineBest;
  console.log(`Fine-tuned best: curve=${globalBest.curveName}`);
  console.log(`  params: k=${globalBest.params.k} scale=${globalBest.params.scale} home=${globalBest.params.home} scalar=${globalBest.params.scalar} nu=${globalBest.nu}`);
  console.log(`  wc2022: logLoss=${globalBest.wc2022LL.toFixed(4)} brier=${globalBest.wc2022Brier.toFixed(4)} acc=${globalBest.wc2022Acc.toFixed(4)}`);
  console.log(`  wc2026: logLoss=${globalBest.wc2026LL.toFixed(4)} brier=${globalBest.wc2026Brier.toFixed(4)} acc=${globalBest.wc2026Acc.toFixed(4)}`);
  console.log(`  full:   logLoss=${globalBest.fullLL.toFixed(4)} brier=${globalBest.fullBrier.toFixed(4)} acc=${globalBest.fullAcc.toFixed(4)}`);
  console.log();
}

// Compare with baseline (original curve, scalar=1)
console.log("=== Baseline comparison (orig curve, scalar=1) ===\n");
const baselineRes = evalConfig(
  matches,
  { home: 87.5, k: 45, scale: 300, scalar: 1.0, gFn: gOrig },
  0.8
);
console.log(`  wc2022: logLoss=${baselineRes.wc2022.logLoss.toFixed(4)} brier=${baselineRes.wc2022.brier.toFixed(4)} acc=${baselineRes.wc2022.acc.toFixed(4)}`);
console.log(`  wc2026: logLoss=${baselineRes.wc2026.logLoss.toFixed(4)} brier=${baselineRes.wc2026.brier.toFixed(4)} acc=${baselineRes.wc2026.acc.toFixed(4)}`);
console.log(`  full:   logLoss=${baselineRes.full.logLoss.toFixed(4)} brier=${baselineRes.full.brier.toFixed(4)} acc=${baselineRes.full.acc.toFixed(4)}`);
console.log();

// Final JSON output
if (globalBest) {
  const result = {
    slug: "mov-curve",
    chosenCurve: globalBest.curveName,
    params: {
      k: globalBest.params.k,
      scale: globalBest.params.scale,
      home: globalBest.params.home,
      scalar: globalBest.params.scalar,
      nu: globalBest.nu,
    },
    full: {
      logLoss: +globalBest.fullLL.toFixed(4),
      brier: +globalBest.fullBrier.toFixed(4),
      acc: +globalBest.fullAcc.toFixed(4),
    },
    wc2022: {
      logLoss: +globalBest.wc2022LL.toFixed(4),
      brier: +globalBest.wc2022Brier.toFixed(4),
      acc: +globalBest.wc2022Acc.toFixed(4),
    },
    wc2026: {
      logLoss: +globalBest.wc2026LL.toFixed(4),
      brier: +globalBest.wc2026Brier.toFixed(4),
      acc: +globalBest.wc2026Acc.toFixed(4),
    },
    generalizes: globalBest.wc2026LL < 1.0929,
    overfitRisk: (globalBest.wc2022LL < 1.0 && globalBest.wc2026LL > 1.0929) ? "high" : "low",
  };
  console.log("FINAL_JSON:", JSON.stringify(result));
}
