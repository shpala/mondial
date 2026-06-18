/**
 * davidson-nu: Sweep nu in [0.5..1.3] step 0.05 with fixed home=87.5, k=45, scale=300.
 * Picks nu minimising wc2022 log-loss and reports draw calibration per window.
 */

import { loadCorpus, evalDavidson } from "@/scripts/explore/harness";

const matches = loadCorpus();

const HOME = 87.5;
const K = 45;
const SCALE = 300;

const results: Array<{
  nu: number;
  full: { logLoss: number; brier: number; acc: number; drawObs: number; drawPred: number };
  wc2022: { logLoss: number; brier: number; acc: number; drawObs: number; drawPred: number };
  wc2026: { logLoss: number; brier: number; acc: number; drawObs: number; drawPred: number };
}> = [];

// Sweep nu from 0.5 to 1.3 in steps of 0.05
const nuValues: number[] = [];
for (let nu = 0.50; nu <= 1.31; nu = Math.round((nu + 0.05) * 100) / 100) {
  nuValues.push(nu);
}

console.log("Sweeping nu values:", nuValues.join(", "));
console.log("");
console.log("nu\t\twc2022.ll\twc2022.drawObs\twc2022.drawPred\twc2026.ll\tfull.ll");

let bestNu = nuValues[0];
let bestWc2022Loss = Infinity;

for (const nu of nuValues) {
  const result = evalDavidson(matches, { nu, home: HOME, k: K, scale: SCALE });
  results.push({
    nu,
    full: result.full,
    wc2022: result.wc2022,
    wc2026: result.wc2026,
  });

  console.log(
    `${nu.toFixed(2)}\t\t${result.wc2022.logLoss.toFixed(6)}\t${result.wc2022.drawObs.toFixed(4)}\t\t${result.wc2022.drawPred.toFixed(4)}\t\t${result.wc2026.logLoss.toFixed(6)}\t${result.full.logLoss.toFixed(6)}`
  );

  if (result.wc2022.logLoss < bestWc2022Loss) {
    bestWc2022Loss = result.wc2022.logLoss;
    bestNu = nu;
  }
}

const bestResult = results.find((r) => r.nu === bestNu)!;

console.log("");
console.log("=== BEST CONFIG (minimises wc2022 log-loss) ===");
console.log(`nu=${bestNu} home=${HOME} k=${K} scale=${SCALE}`);
console.log("");
console.log("Draw calibration per window:");
console.log(
  `  full   drawObs=${bestResult.full.drawObs.toFixed(4)} drawPred=${bestResult.full.drawPred.toFixed(4)}`
);
console.log(
  `  wc2022 drawObs=${bestResult.wc2022.drawObs.toFixed(4)} drawPred=${bestResult.wc2022.drawPred.toFixed(4)}`
);
console.log(
  `  wc2026 drawObs=${bestResult.wc2026.drawObs.toFixed(4)} drawPred=${bestResult.wc2026.drawPred.toFixed(4)}`
);
console.log("");

const output = {
  chosenConfig: { nu: bestNu, home: HOME, k: K, scale: SCALE },
  full: {
    logLoss: bestResult.full.logLoss,
    brier: bestResult.full.brier,
    acc: bestResult.full.acc,
  },
  wc2022: {
    logLoss: bestResult.wc2022.logLoss,
    brier: bestResult.wc2022.brier,
    acc: bestResult.wc2022.acc,
  },
  wc2026: {
    logLoss: bestResult.wc2026.logLoss,
    brier: bestResult.wc2026.brier,
    acc: bestResult.wc2026.acc,
  },
};

console.log("FINAL JSON:");
console.log(JSON.stringify(output, null, 2));
