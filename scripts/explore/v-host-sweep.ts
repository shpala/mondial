// Host/home advantage magnitude sweep.
// Sweeps home in [0..150] step 12.5, with nu=0.8 k=45 scale=300.
// Picks the home value minimizing wc2022 log-loss, then reports wc2026/full.

import {
  loadCorpus,
  evalDavidson,
} from "@/scripts/explore/harness";

const matches = loadCorpus();

const NU = 0.8;
const K = 45;
const SCALE = 300;

const homeValues: number[] = [];
for (let h = 0; h <= 150; h += 12.5) {
  homeValues.push(h);
}

console.log("Sweeping home advantage values:", homeValues);
console.log("");

let bestHome = homeValues[0];
let bestWc2022LL = Infinity;
const results: Array<{ home: number; wc2022LL: number; wc2026LL: number; fullLL: number }> = [];

for (const home of homeValues) {
  const r = evalDavidson(matches, { nu: NU, home, k: K, scale: SCALE });
  results.push({
    home,
    wc2022LL: r.wc2022.logLoss,
    wc2026LL: r.wc2026.logLoss,
    fullLL: r.full.logLoss,
  });
  if (r.wc2022.logLoss < bestWc2022LL) {
    bestWc2022LL = r.wc2022.logLoss;
    bestHome = home;
  }
}

console.log("home   | wc2022 LL | wc2026 LL | full LL");
console.log("-------|-----------|-----------|--------");
for (const r of results) {
  const marker = r.home === bestHome ? " <-- best" : "";
  console.log(
    `${r.home.toFixed(1).padStart(6)} | ${r.wc2022LL.toFixed(4).padStart(9)} | ${r.wc2026LL.toFixed(4).padStart(9)} | ${r.fullLL.toFixed(4).padStart(8)}${marker}`
  );
}

// Report final result with frozen best config
const finalResult = evalDavidson(matches, { nu: NU, home: bestHome, k: K, scale: SCALE });

console.log("\n=== CHOSEN CONFIG ===");
console.log(`home=${bestHome} nu=${NU} k=${K} scale=${SCALE}`);
console.log("\nfull  :", finalResult.full);
console.log("wc2022:", finalResult.wc2022);
console.log("wc2026:", finalResult.wc2026);

console.log("\nFINAL_JSON:", JSON.stringify({
  chosenConfig: { home: bestHome, nu: NU, k: K, scale: SCALE },
  full: {
    logLoss: finalResult.full.logLoss,
    brier: finalResult.full.brier,
    acc: finalResult.full.acc,
  },
  wc2022: {
    logLoss: finalResult.wc2022.logLoss,
    brier: finalResult.wc2022.brier,
    acc: finalResult.wc2022.acc,
  },
  wc2026: {
    logLoss: finalResult.wc2026.logLoss,
    brier: finalResult.wc2026.brier,
    acc: finalResult.wc2026.acc,
  },
}));
