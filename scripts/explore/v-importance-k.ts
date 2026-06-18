// v-importance-k.ts — Tournament-importance-weighted Elo exploration
//
// Hypothesis: de-noising friendlies (lower K-multiplier) sharpens
// tournament ratings. We try 2-3 weighting schedules, tune on wc2022,
// then read wc2026 out-of-sample.
//
//   npx tsx scripts/explore/v-importance-k.ts

import { loadCorpus, evalDavidson } from "@/scripts/explore/harness";

const matches = loadCorpus();

// ── Importance schedules ──────────────────────────────────────────────────────
// Each schedule maps a tournament name -> K multiplier.

function importanceScheduleA(tournament: string): number {
  if (tournament === "Friendly") return 0.5;
  const lower = tournament.toLowerCase();
  if (lower.includes("qualification")) return 0.8;
  if (tournament === "FIFA World Cup" || tournament === "FIFA Confederations Cup") return 1.25;
  return 1.0;
}

function importanceScheduleB(tournament: string): number {
  // More aggressive: friendlies even lower, WC even higher
  if (tournament === "Friendly") return 0.4;
  const lower = tournament.toLowerCase();
  if (lower.includes("qualification")) return 0.75;
  if (tournament === "FIFA World Cup" || tournament === "FIFA Confederations Cup") return 1.4;
  return 1.0;
}

function importanceScheduleC(tournament: string): number {
  // Moderate: friendlies low, qualifiers normal, tournaments slightly boosted
  if (tournament === "Friendly") return 0.5;
  const lower = tournament.toLowerCase();
  if (lower.includes("qualification")) return 0.9;
  if (tournament === "FIFA World Cup" || tournament === "FIFA Confederations Cup") return 1.2;
  return 1.05;
}

// ── Baseline (no importance weighting) ───────────────────────────────────────
// nu=0.8 home=87.5 k=45 scale=300
const BASE = { nu: 0.8, home: 87.5, k: 45, scale: 300 };

// ── Grid search ───────────────────────────────────────────────────────────────
// Vary k and scale; keep nu=0.8, home=87.5 (Davidson params fixed to compare).
// We sweep 3 schedules x multiple k values.

const schedules = [
  { name: "A (friendly=0.5 qual=0.8 wc=1.25)", fn: importanceScheduleA },
  { name: "B (friendly=0.4 qual=0.75 wc=1.4)", fn: importanceScheduleB },
  { name: "C (friendly=0.5 qual=0.9 wc=1.2)", fn: importanceScheduleC },
];

const kValues = [30, 35, 40, 45, 50, 55];
const scaleValues = [250, 300, 350];
const homeValues = [75, 87.5, 100];

let bestWc2022LL = Infinity;
let bestResult: ReturnType<typeof evalDavidson> | null = null;
let bestConfig = "";

const f4 = (x: number) => x.toFixed(4);

console.log("## Baseline (no importance weighting)");
const base = evalDavidson(matches, BASE);
console.log(`  full   ll=${f4(base.full.logLoss)} brier=${f4(base.full.brier)} acc=${f4(base.full.acc)}`);
console.log(`  wc2022 ll=${f4(base.wc2022.logLoss)} brier=${f4(base.wc2022.brier)} acc=${f4(base.wc2022.acc)}`);
console.log(`  wc2026 ll=${f4(base.wc2026.logLoss)} brier=${f4(base.wc2026.brier)} acc=${f4(base.wc2026.acc)}`);

console.log("\n## Grid search (tuning on wc2022) ...");

for (const sched of schedules) {
  for (const k of kValues) {
    for (const scale of scaleValues) {
      for (const home of homeValues) {
        const result = evalDavidson(matches, {
          nu: 0.8,
          home,
          k,
          scale,
          importance: sched.fn,
        });
        if (result.wc2022.logLoss < bestWc2022LL) {
          bestWc2022LL = result.wc2022.logLoss;
          bestResult = result;
          bestConfig = `schedule=${sched.name} k=${k} scale=${scale} home=${home} nu=0.8`;
        }
      }
    }
  }
}

console.log(`\n## Best config (lowest wc2022 logLoss): ${bestConfig}`);
if (bestResult) {
  console.log(`  full   ll=${f4(bestResult.full.logLoss)} brier=${f4(bestResult.full.brier)} acc=${f4(bestResult.full.acc)} n=${bestResult.full.n}`);
  console.log(`  wc2022 ll=${f4(bestResult.wc2022.logLoss)} brier=${f4(bestResult.wc2022.brier)} acc=${f4(bestResult.wc2022.acc)} n=${bestResult.wc2022.n}`);
  console.log(`  wc2026 ll=${f4(bestResult.wc2026.logLoss)} brier=${f4(bestResult.wc2026.brier)} acc=${f4(bestResult.wc2026.acc)} n=${bestResult.wc2026.n}`);

  console.log("\n## Deltas vs baseline (negative = better)");
  console.log(`  full   dLL=${((bestResult.full.logLoss - base.full.logLoss) >= 0 ? "+" : "") + (bestResult.full.logLoss - base.full.logLoss).toFixed(4)}`);
  console.log(`  wc2022 dLL=${((bestResult.wc2022.logLoss - base.wc2022.logLoss) >= 0 ? "+" : "") + (bestResult.wc2022.logLoss - base.wc2022.logLoss).toFixed(4)}`);
  console.log(`  wc2026 dLL=${((bestResult.wc2026.logLoss - base.wc2026.logLoss) >= 0 ? "+" : "") + (bestResult.wc2026.logLoss - base.wc2026.logLoss).toFixed(4)}`);

  // Print final JSON line for machine parsing
  const finalJson = {
    config: bestConfig,
    full: { logLoss: bestResult.full.logLoss, brier: bestResult.full.brier, acc: bestResult.full.acc },
    wc2022: { logLoss: bestResult.wc2022.logLoss, brier: bestResult.wc2022.brier, acc: bestResult.wc2022.acc },
    wc2026: { logLoss: bestResult.wc2026.logLoss, brier: bestResult.wc2026.brier, acc: bestResult.wc2026.acc },
  };
  console.log("\n## FINAL_JSON");
  console.log(JSON.stringify(finalJson, null, 2));
}
