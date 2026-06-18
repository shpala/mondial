// Self-contained out-of-sample backtest of the Qatar 2022 World Cup.
//
// Run:  npx tsx scripts/wc2022-backtest.ts
//
// The computation lives in lib/backtest/wc2022.ts (shared with the regression
// test so the two can't drift). This wrapper just reads the corpus, runs it, and
// writes the report + per-match predictions.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { runWc2022Backtest } from "@/lib/backtest/wc2022";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const csv = readFileSync(resolve(ROOT, "data/intl_results.csv"), "utf8");
const r = runWc2022Backtest(csv);

const r4 = (x: number) => x.toFixed(4);

// --- write per-match predictions ---
const predsPath = resolve(ROOT, "docs/wc2022-predictions.json");
writeFileSync(predsPath, JSON.stringify(r.preds, null, 2) + "\n");

// --- write report ---
const reportPath = resolve(ROOT, "docs/wc2022-report.md");
const report = `# Qatar 2022 World Cup — Out-of-Sample Backtest

Held-out test set: the **${r.testMatches}** matches with \`tournament === "FIFA World Cup"\`
and date in [${r.testStart}, ${r.testEnd}]. Ratings come only from strictly-earlier
matches (no leakage). The Poisson goal model's \`base\`/\`gamma\` were fit on the
${r.trainTuples} pre-${r.trainCutoff} match tuples by minimizing one-step scoreline NLL;
the Dixon-Coles low-score weight \`rho\` was then fit on the same train set by
minimizing the Variant-A exact-scoreline NLL.

Fitted Poisson params: **base = ${r.fittedBase}**, **gamma = ${r.fittedGamma}** (train NLL = ${r.trainNLL.toFixed(2)}).
Fitted Dixon-Coles weight: **rho = ${r.fittedRho}**.

## Outcome (1X2) metrics — lower is better

| Variant | Model | Log-loss | Brier |
|---|---|---|---|
| A | Davidson (nu=0.7, scale=400) | ${r4(r.variantA.logLoss)} | ${r4(r.variantA.brier)} |
| B | Independent Poisson | ${r4(r.variantB.logLoss)} | ${r4(r.variantB.brier)} |

A coin-flip-style baseline (uniform 1/3 each) has log-loss ln 3 ≈ 1.0986.

## Is A's edge real? Paired bootstrap (n = ${r.testMatches})

Mean per-match log-loss advantage of A (Davidson) over B (Poisson):
**${r4(r.logLossAdvantageAoverB.mean)}** — 95% bootstrap CI [${r4(r.logLossAdvantageAoverB.lo)}, ${r4(r.logLossAdvantageAoverB.hi)}], 5000 resamples.
The interval **${r.logLossAdvantageAoverB.ciExcludesZero ? "excludes" : "includes"} 0**, so on this single
${r.testMatches}-match tournament the difference is ${r.logLossAdvantageAoverB.ciExcludesZero ? "unlikely to be due to chance" : "within sampling noise"}.

## Exact-scoreline log-loss (goals 0..10) — lower is better

| Variant | Scoreline log-loss |
|---|---|
| A — Davidson + Dixon-Coles (rho = ${r.fittedRho}) | ${r4(r.scorelineLogLoss.A)} |
| A — Davidson, independent Poisson (rho = 0) | ${r4(r.scorelineLogLoss.aIndependent)} |
| B — raw independent Poisson | ${r4(r.scorelineLogLoss.B)} |

Variant A reuses the Poisson joint but renormalizes each outcome region (home /
draw / away) so the region masses match Davidson's 1X2 split — the same
construction the shipped \`predictScoreline\` uses. The Dixon-Coles row is the
shipped model; the rho = 0 row is the same model without the low-score correction,
for comparison.

Per-match predictions: \`docs/wc2022-predictions.json\` (${r.preds.length} rows).
`;
writeFileSync(reportPath, report);

console.log(
  JSON.stringify(
    {
      built: true,
      files: [predsPath, reportPath],
      fittedBase: r.fittedBase,
      fittedGamma: r.fittedGamma,
      fittedRho: r.fittedRho,
      trainTuples: r.trainTuples,
      testMatches: r.testMatches,
      variantA: r.variantA,
      variantB: r.variantB,
      logLossAdvantageAoverB: r.logLossAdvantageAoverB,
      scorelineLogLoss: r.scorelineLogLoss,
      sanity: r.sanity,
    },
    null,
    2,
  ),
);
