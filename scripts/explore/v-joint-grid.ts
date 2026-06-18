// v-joint-grid.ts — Elo+Davidson grid search, 2022-tuned constants
// Sweeps nu in [0.5..1.1] step .1, home in [0..125] step 25,
//        k in [20..70] step 10, scale in [180..420] step 30
// Picks config minimising wc2022 log-loss (primary) and
// config minimising 0.5*wc2022 + 0.5*wc2026 (joint).

import { loadCorpus, evalDavidson } from "@/scripts/explore/harness";

const matches = loadCorpus();

// Sweep ranges
const nuVals     = [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1];
const homeVals   = [0, 25, 50, 75, 100, 125];
const kVals      = [20, 30, 40, 50, 60, 70];
const scaleVals  = [];
for (let s = 180; s <= 420; s += 30) scaleVals.push(s);

let bestWc2022: { logLoss: number; cfg: any; result: any } | null = null;
let bestJoint:  { score: number;   cfg: any; result: any } | null = null;

let count = 0;
const total = nuVals.length * homeVals.length * kVals.length * scaleVals.length;
console.error(`Total configs to evaluate: ${total}`);

for (const nu of nuVals) {
  for (const home of homeVals) {
    for (const k of kVals) {
      for (const scale of scaleVals) {
        const cfg = { nu, home, k, scale };
        const r = evalDavidson(matches, cfg);
        const wc2022LL = r.wc2022.logLoss;
        const wc2026LL = r.wc2026.logLoss;
        const jointScore = 0.5 * wc2022LL + 0.5 * wc2026LL;

        if (!bestWc2022 || wc2022LL < bestWc2022.logLoss) {
          bestWc2022 = { logLoss: wc2022LL, cfg, result: r };
        }
        if (!bestJoint || jointScore < bestJoint.score) {
          bestJoint = { score: jointScore, cfg, result: r };
        }
        count++;
        if (count % 500 === 0) {
          console.error(`  ${count}/${total} evaluated...`);
        }
      }
    }
  }
}

console.error(`\nDone evaluating ${count} configs.`);

console.error("\n=== BEST wc2022 config (minimise wc2022 log-loss) ===");
console.error("Config:", bestWc2022!.cfg);
console.error("full  :", bestWc2022!.result.full);
console.error("wc2022:", bestWc2022!.result.wc2022);
console.error("wc2026:", bestWc2022!.result.wc2026);

console.error("\n=== BEST joint config (minimise 0.5*wc2022 + 0.5*wc2026) ===");
console.error("Config:", bestJoint!.cfg);
console.error("full  :", bestJoint!.result.full);
console.error("wc2022:", bestJoint!.result.wc2022);
console.error("wc2026:", bestJoint!.result.wc2026);

// Final JSON line for the orchestrator
const out = {
  slug: "joint-grid",
  bestWc2022Config: bestWc2022!.cfg,
  bestWc2022: {
    full:   bestWc2022!.result.full,
    wc2022: bestWc2022!.result.wc2022,
    wc2026: bestWc2022!.result.wc2026,
  },
  bestJointConfig: bestJoint!.cfg,
  bestJoint: {
    full:   bestJoint!.result.full,
    wc2022: bestJoint!.result.wc2022,
    wc2026: bestJoint!.result.wc2026,
  },
};
console.log(JSON.stringify(out, null, 2));
