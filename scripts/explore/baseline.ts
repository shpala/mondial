// Baseline scorecard: the shipped model and the "tuned" candidate from
// docs/backtest-report.md, scored jointly on full / wc2022 / wc2026.
//
//   npx tsx scripts/explore/baseline.ts

import { loadCorpus, evalDavidson } from "@/scripts/explore/harness";
import { DRAW_NU, HOST_ADVANTAGE, ELO_K, LOGISTIC_SCALE } from "@/lib/model/constants";

const matches = loadCorpus();

const SHIPPING = { nu: DRAW_NU, home: HOST_ADVANTAGE, k: ELO_K, scale: LOGISTIC_SCALE };
const TUNED = { nu: 0.8, home: 62.5, k: 35, scale: 225 };

const f3 = (x: number) => x.toFixed(4);
function line(label: string, r: ReturnType<typeof evalDavidson>) {
  const w = (m: { n: number; logLoss: number; brier: number; acc: number }) =>
    `ll=${f3(m.logLoss)} brier=${f3(m.brier)} acc=${f3(m.acc)} n=${m.n}`;
  console.log(`\n## ${label}  (nu=${r.constants.nu} home=${r.constants.home} k=${r.constants.k} scale=${r.constants.scale})`);
  console.log(`  full   : ${w(r.full)}`);
  console.log(`  wc2022 : ${w(r.wc2022)}  drawObs=${f3(r.wc2022.drawObs)} drawPred=${f3(r.wc2022.drawPred)}`);
  console.log(`  wc2026 : ${w(r.wc2026)}  drawObs=${f3(r.wc2026.drawObs)} drawPred=${f3(r.wc2026.drawPred)}`);
}

const ship = evalDavidson(matches, SHIPPING);
const tuned = evalDavidson(matches, TUNED);
line("SHIPPING", ship);
line("TUNED (report)", tuned);

console.log("\n## JOINT deltas (tuned - shipping, negative = better)");
for (const win of ["full", "wc2022", "wc2026"] as const) {
  const d = tuned[win].logLoss - ship[win].logLoss;
  console.log(`  ${win}: dLogLoss=${(d >= 0 ? "+" : "") + d.toFixed(4)}`);
}
