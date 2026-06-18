// Seed-Prior algorithm: Replace flat-1500 cold start with confederation-prior
// seed ratings. Top UEFA/CONMEBOL ~1620, mid UEFA/CONMEBOL ~1540,
// CONCACAF/AFC/CAF ~1480, OFC ~1380. Tune a global spread multiplier on wc2022.
//
//   npx tsx scripts/explore/v-seed-prior.ts

import {
  loadCorpus,
  evalDavidson,
  inFull,
  inWc2022,
  inWc2026,
  scoreWindow,
  rollCorpus,
  type Tuple,
  type Metrics,
} from "@/scripts/explore/harness";
import { davidsonProbs } from "@/lib/prediction";

const matches = loadCorpus();

// ---------------------------------------------------------------------------
// Confederation-based seed ratings (FIFA Elo-inspired priors).
// Base levels:
//   UEFA top      ~1620  (Brazil, Argentina, France, Germany, Spain, England, Portugal, etc.)
//   UEFA/CONMEBOL mid ~1540  (Netherlands, Belgium, Croatia, Uruguay, Mexico, etc.)
//   AFC/CAF/CONCACAF ~1480
//   OFC           ~1380
//
// A global multiplier `spread` scales the deviation from 1500:
//   seed(team) = 1500 + spread * (base(team) - 1500)
// ---------------------------------------------------------------------------

const BASE_SEEDS: Record<string, number> = {
  // CONMEBOL - elite
  "Brazil": 1640,
  "Argentina": 1680,
  "Uruguay": 1560,
  "Colombia": 1530,
  "Chile": 1510,
  "Paraguay": 1490,
  "Ecuador": 1490,
  "Peru": 1480,
  "Bolivia": 1440,
  "Venezuela": 1430,
  "Trinidad and Tobago": 1430,

  // UEFA - elite
  "France": 1660,
  "Germany": 1640,
  "Spain": 1640,
  "England": 1620,
  "Portugal": 1610,
  "Italy": 1610,
  "Netherlands": 1590,
  "Belgium": 1580,
  "Croatia": 1570,
  "Denmark": 1560,
  "Switzerland": 1550,
  "Sweden": 1540,
  "Austria": 1530,
  "Poland": 1530,
  "Serbia": 1520,
  "Czech Republic": 1520,
  "Scotland": 1510,
  "Turkey": 1510,
  "Norway": 1510,
  "Wales": 1510,
  "Hungary": 1500,
  "Slovakia": 1500,
  "Ukraine": 1510,
  "Russia": 1520,
  "Romania": 1490,
  "Greece": 1490,
  "Bosnia and Herzegovina": 1490,
  "Slovenia": 1480,
  "Finland": 1470,
  "Albania": 1460,
  "Bulgaria": 1460,
  "North Macedonia": 1450,
  "Ireland": 1470,
  "Northern Ireland": 1460,
  "Iceland": 1470,
  "Montenegro": 1450,
  "Republic of Ireland": 1470,

  // AFC
  "Japan": 1540,
  "South Korea": 1530,
  "Iran": 1520,
  "Australia": 1510,
  "Saudi Arabia": 1490,
  "Qatar": 1470,
  "China": 1470,
  "UAE": 1460,
  "Iraq": 1460,
  "Jordan": 1450,
  "Uzbekistan": 1450,
  "Thailand": 1440,
  "Vietnam": 1430,
  "Oman": 1430,
  "Bahrain": 1420,

  // CONCACAF
  "United States": 1530,
  "Mexico": 1530,
  "Costa Rica": 1490,
  "Honduras": 1470,
  "Jamaica": 1460,
  "Panama": 1460,
  "Trinidad": 1440,
  "Guatemala": 1430,
  "El Salvador": 1420,
  "Haiti": 1420,
  "Curaçao": 1430,
  "Cuba": 1400,
  "Canada": 1490,

  // CAF
  "Morocco": 1540,
  "Senegal": 1530,
  "Ivory Coast": 1510,
  "Ghana": 1500,
  "Nigeria": 1510,
  "Egypt": 1500,
  "Cameroon": 1490,
  "Algeria": 1490,
  "Tunisia": 1480,
  "Mali": 1470,
  "South Africa": 1480,
  "DR Congo": 1460,
  "Zambia": 1450,
  "Kenya": 1440,
  "Tanzania": 1430,
  "Uganda": 1430,
  "Ethiopia": 1420,
  "Zimbabwe": 1430,
  "Burkina Faso": 1460,
  "Cape Verde": 1450,
  "Equatorial Guinea": 1420,
  "Guinea": 1450,

  // OFC
  "New Zealand": 1420,
  "Fiji": 1380,
  "Vanuatu": 1360,
  "Solomon Islands": 1360,
  "Tahiti": 1350,
  "Papua New Guinea": 1360,
};

function buildSeedMap(spread: number): Map<string, number> {
  const m = new Map<string, number>();
  for (const [team, base] of Object.entries(BASE_SEEDS)) {
    m.set(team, 1500 + spread * (base - 1500));
  }
  return m;
}

// Base Davidson constants (same as the prompt baseline)
const BASE = { nu: 0.8, home: 87.5, k: 45, scale: 300 };

// ---------------------------------------------------------------------------
// Grid search: tune `spread` multiplier on wc2022 log-loss.
// ---------------------------------------------------------------------------

const f4 = (x: number) => x.toFixed(4);

console.log("## Tuning spread multiplier on wc2022 log-loss...\n");

let bestSpread = 1.0;
let bestWc2022Ll = Infinity;
let bestResult: ReturnType<typeof evalDavidson> | null = null;

for (let spread = 0.0; spread <= 2.0; spread = Math.round((spread + 0.05) * 100) / 100) {
  const seed = buildSeedMap(spread);
  const result = evalDavidson(matches, { ...BASE, seed });
  if (result.wc2022.logLoss < bestWc2022Ll) {
    bestWc2022Ll = result.wc2022.logLoss;
    bestSpread = spread;
    bestResult = result;
  }
  console.log(
    `  spread=${spread.toFixed(2)}  wc2022_ll=${f4(result.wc2022.logLoss)}  wc2026_ll=${f4(result.wc2026.logLoss)}  full_ll=${f4(result.full.logLoss)}`
  );
}

console.log(`\n## Best spread = ${bestSpread}  wc2022_ll = ${f4(bestWc2022Ll)}\n`);

// ---------------------------------------------------------------------------
// Fine-tune around the best spread
// ---------------------------------------------------------------------------

console.log("## Fine-tuning spread around best...\n");

const lo = Math.max(0, bestSpread - 0.1);
const hi = bestSpread + 0.1;

for (let spread = lo; spread <= hi + 0.001; spread = Math.round((spread + 0.01) * 100) / 100) {
  const seed = buildSeedMap(spread);
  const result = evalDavidson(matches, { ...BASE, seed });
  if (result.wc2022.logLoss < bestWc2022Ll) {
    bestWc2022Ll = result.wc2022.logLoss;
    bestSpread = spread;
    bestResult = result;
  }
  console.log(
    `  spread=${spread.toFixed(2)}  wc2022_ll=${f4(result.wc2022.logLoss)}  wc2026_ll=${f4(result.wc2026.logLoss)}`
  );
}

console.log(`\n## Final best spread = ${bestSpread}  wc2022_ll = ${f4(bestWc2022Ll)}\n`);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const r = bestResult!;

console.log(`\n## CHOSEN CONFIG`);
console.log(`  spread = ${bestSpread}`);
console.log(`  nu=${BASE.nu} home=${BASE.home} k=${BASE.k} scale=${BASE.scale}`);
console.log(`\n## RESULTS`);
console.log(`  full   : ll=${f4(r.full.logLoss)} brier=${f4(r.full.brier)} acc=${f4(r.full.acc)} n=${r.full.n}`);
console.log(`  wc2022 : ll=${f4(r.wc2022.logLoss)} brier=${f4(r.wc2022.brier)} acc=${f4(r.wc2022.acc)} n=${r.wc2022.n}`);
console.log(`  wc2026 : ll=${f4(r.wc2026.logLoss)} brier=${f4(r.wc2026.brier)} acc=${f4(r.wc2026.acc)} n=${r.wc2026.n}`);

console.log("\n## BASELINE vs SEED-PRIOR (delta, negative = better)");
const BASELINE = { full: { logLoss: 0.8959 }, wc2022: { logLoss: 1.0666 }, wc2026: { logLoss: 1.0929 } };
for (const win of ["full", "wc2022", "wc2026"] as const) {
  const d = r[win].logLoss - BASELINE[win].logLoss;
  console.log(`  ${win}: dLogLoss=${(d >= 0 ? "+" : "") + d.toFixed(4)}`);
}

const finalJson = {
  algorithm: "seed-prior",
  chosenConfig: {
    spread: bestSpread,
    nu: BASE.nu,
    home: BASE.home,
    k: BASE.k,
    scale: BASE.scale,
  },
  full: { logLoss: r.full.logLoss, brier: r.full.brier, acc: r.full.acc },
  wc2022: { logLoss: r.wc2022.logLoss, brier: r.wc2022.brier, acc: r.wc2022.acc },
  wc2026: { logLoss: r.wc2026.logLoss, brier: r.wc2026.brier, acc: r.wc2026.acc },
};

console.log("\n## FINAL JSON");
console.log(JSON.stringify(finalJson, null, 2));
