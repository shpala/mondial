// Offline calibration harness. Replays data/intl_results.csv, scores the model
// for the currently-shipped constants and for the grid-search best, and writes a
// markdown report. Recommends — never edits — the live constants.
//
//   npm run backtest                # full sweep + refine, friendlies included
//   npm run backtest -- --no-friendlies
//   npm run backtest -- --no-refine

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseResults } from "@/lib/backtest/parse";
import {
  baseline,
  CURRENT,
  refineGrid,
  rollAndScore,
  sweep,
  type Report,
} from "@/lib/backtest/run";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const flags = new Set(process.argv.slice(2));
const noFriendlies = flags.has("--no-friendlies");
const refine = !flags.has("--no-refine");

let matches = parseResults(readFileSync(join(root, "data/intl_results.csv"), "utf8"));
if (noFriendlies) matches = matches.filter((m) => m.tournament !== "Friendly");

const current = rollAndScore(matches, CURRENT);
if (current.n === 0) {
  console.error(
    "No matches passed the burn-in cutoff — nothing to score. Check the corpus / filters.",
  );
  process.exit(1);
}
const base = baseline(matches);
let best = sweep(matches).best;
if (refine) {
  const r = sweep(matches, refineGrid(best.constants)).best;
  if (r.logLoss < best.logLoss) best = r;
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const f3 = (x: number) => x.toFixed(4);

function reliabilityTable(r: Report): string {
  const head = "| bucket | predicted | observed | n |\n| --- | --- | --- | --- |";
  const body = r.reliability
    .map((b) => `| ${b.bucket * 10}–${b.bucket * 10 + 10}% | ${pct(b.predicted)} | ${pct(b.observed)} | ${b.count} |`)
    .join("\n");
  return `${head}\n${body}`;
}

const lines = [
  "# Backtest calibration report",
  "",
  `Corpus: \`data/intl_results.csv\`${noFriendlies ? " (friendlies excluded)" : ""} — ${matches.length} played matches, ${current.n} scored (burn-in to 2018).`,
  "",
  "Home advantage is fit on non-neutral matches and assumed equal to World Cup",
  "host advantage. A single global Elo/K is a simplification of the real model.",
  "",
  "## Constants",
  "",
  "| | ν (draw) | home (Elo) | K (gain) | log-loss | Brier | draw obs/pred |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  `| **baseline** | — | — | — | ${f3(base.logLoss)} | ${f3(base.brier)} | — / ${pct(base.drawRate)} |`,
  `| **shipping** | ${current.constants.nu} | ${current.constants.home} | ${current.constants.k} | ${f3(current.logLoss)} | ${f3(current.brier)} | ${pct(current.drawObserved)} / ${pct(current.drawPredicted)} |`,
  `| **tuned** | ${best.constants.nu} | ${best.constants.home} | ${best.constants.k} | ${f3(best.logLoss)} | ${f3(best.brier)} | ${pct(best.drawObserved)} / ${pct(best.drawPredicted)} |`,
  "",
  `Log-loss improvement: **${f3(current.logLoss - best.logLoss)}** (lower is better).`,
  `Skill vs no-skill baseline (always predict base rates): **${f3(base.logLoss - current.logLoss)}** log-loss better.`,
  "",
  "## Reliability — shipping constants",
  "",
  reliabilityTable(current),
  "",
  "## Reliability — tuned constants",
  "",
  reliabilityTable(best),
  "",
];
const report = lines.join("\n");

mkdirSync(join(root, "docs"), { recursive: true });
writeFileSync(join(root, "docs/backtest-report.md"), report);
console.log(report);
console.log(`\nWrote docs/backtest-report.md`);
