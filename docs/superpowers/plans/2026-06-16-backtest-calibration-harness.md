# Backtest + Calibration Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An offline CLI (`npm run backtest`) that replays ~12 years of real international results, scores the prediction model's calibration, and recommends data-fit values for the three hand-chosen constants `ν` (draw), `home` (host bump) and `K` (Elo gain).

**Architecture:** Extract the three constants out of inlined math in `lib/prediction.ts`, `lib/montecarlo.ts` and `lib/ratings.ts` into parameterized pure functions whose **defaults are the current values** (so app behavior and all 39 existing tests are unchanged). A new `lib/backtest/` module parses a vendored CSV corpus, rolls one Elo table chronologically, scores predictions out-of-sample (log-loss / Brier / reliability), and sweeps a grid of `(ν, home, K)`. A thin `scripts/backtest.ts` wires file I/O to that pure core and writes a markdown report.

**Tech Stack:** TypeScript (strict), Vitest, `tsx` (new devDependency, for the CLI). Pure functions throughout the core — no Date/Math.random, no framework.

**Spec:** `docs/superpowers/specs/2026-06-16-backtest-calibration-harness-design.md`

---

## File structure

| File | Responsibility |
| --- | --- |
| `data/intl_results.csv` | Vendored corpus: played internationals since 2014 (new) |
| `lib/prediction.ts` | Add pure `davidsonProbs(rA, rB, nu)` (modify) |
| `lib/montecarlo.ts` | `outcomeProbs` delegates to `davidsonProbs` (modify) |
| `lib/ratings.ts` | Extract pure `eloUpdate(effHome, effAway, gh, ga, k)` (modify) |
| `lib/backtest/parse.ts` | CSV → `MatchRow[]`, played-only, date-sorted (new) |
| `lib/backtest/run.ts` | Roll + score + sweep, all pure (new) |
| `scripts/backtest.ts` | CLI: read CSV, run sweep, print + write report (new) |
| `package.json` | `backtest` script + `tsx` devDep (modify) |
| `docs/backtest-report.md` | Generated report (new, by the CLI) |
| `README.md` | Short "Calibration" note (modify) |
| `tests/davidson.test.ts` | `davidsonProbs` (new) |
| `tests/elo-update.test.ts` | `eloUpdate` (new) |
| `tests/backtest-parse.test.ts` | `parseResults` (new) |
| `tests/backtest-run.test.ts` | `rollAndScore` / `sweep` / `refineGrid` (new) |

---

## Task 1: Vendor the historical corpus

**Files:**
- Create: `data/intl_results.csv`

- [ ] **Step 1: Download and trim the dataset**

The source is `martj42/international_results` (`results.csv`, columns
`date,home_team,away_team,home_score,away_score,tournament,city,country,neutral`).
Keep the header plus played rows dated on/after 2014-01-01 (drop future fixtures,
which carry `NA` scores). ISO dates compare correctly as strings.

Run:
```bash
mkdir -p data
curl -s https://raw.githubusercontent.com/martj42/international_results/master/results.csv \
  | awk -F, 'NR==1 || ($1>="2014-01-01" && $4!="NA" && $5!="NA")' \
  > data/intl_results.csv
```

- [ ] **Step 2: Sanity-check the file**

Run:
```bash
head -1 data/intl_results.csv
wc -l data/intl_results.csv
grep -c ",NA," data/intl_results.csv || true
```
Expected: header is `date,home_team,away_team,...,neutral`; ~8,000–11,000 lines;
the `grep -c ,NA,` prints `0` (no unplayed rows survived).

- [ ] **Step 3: Commit**

```bash
git add data/intl_results.csv
git commit -m "Vendor international results corpus (2014+) for backtesting"
```

---

## Task 2: `davidsonProbs` — parameterize the draw model

**Files:**
- Modify: `lib/prediction.ts` (after `winProbability`, ~line 29)
- Test: `tests/davidson.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/davidson.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { davidsonProbs, winProbability } from "@/lib/prediction";

describe("davidsonProbs", () => {
  it("sums to 1 and collapses to winProbability on a decisive result", () => {
    const p = davidsonProbs(1900, 1700, 0.63);
    expect(p.home + p.draw + p.away).toBeCloseTo(1, 9);
    expect(p.home / (p.home + p.away)).toBeCloseTo(winProbability(1900, 1700), 9);
  });

  it("raises the draw share as nu grows", () => {
    const lo = davidsonProbs(1800, 1800, 0.3).draw;
    const hi = davidsonProbs(1800, 1800, 0.9).draw;
    expect(hi).toBeGreaterThan(lo);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/davidson.test.ts`
Expected: FAIL — `davidsonProbs` is not exported.

- [ ] **Step 3: Add the function**

In `lib/prediction.ts`, immediately after the `winProbability` function (the block
ending at line 29), insert:
```ts
/**
 * Three-outcome Davidson probabilities (home / draw / away) on two ratings.
 * `nu` is the draw weight; conditional on a decisive result it collapses exactly
 * to `winProbability`. Ratings passed in are already host/home-adjusted.
 */
export function davidsonProbs(
  ratingA: number,
  ratingB: number,
  nu: number,
): { home: number; draw: number; away: number } {
  const a = Math.pow(10, ratingA / 400);
  const b = Math.pow(10, ratingB / 400);
  const d = nu * Math.sqrt(a * b);
  const z = a + b + d;
  return { home: a / z, draw: d / z, away: b / z };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/davidson.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/prediction.ts tests/davidson.test.ts
git commit -m "Add parameterized davidsonProbs to the prediction model"
```

---

## Task 3: Route `outcomeProbs` through `davidsonProbs`

**Files:**
- Modify: `lib/montecarlo.ts:41-50` (the `outcomeProbs` function and its imports)

This is a pure refactor — identical math, so the existing
`tests/montecarlo.test.ts` is the safety net (no new test).

- [ ] **Step 1: Update the import**

In `lib/montecarlo.ts`, the import block from `@/lib/prediction` (lines 15-20)
currently pulls `ROUNDS, buildBracket, effectiveRating, predictWinProbability`.
Add `davidsonProbs`:
```ts
import {
  ROUNDS,
  buildBracket,
  davidsonProbs,
  effectiveRating,
  predictWinProbability,
} from "@/lib/prediction";
```

- [ ] **Step 2: Delegate the body**

Replace the body of `outcomeProbs` (lines 41-50) with:
```ts
export function outcomeProbs(
  home: Pick<Team, "rating" | "host">,
  away: Pick<Team, "rating" | "host">,
): { home: number; draw: number; away: number } {
  return davidsonProbs(effectiveRating(home), effectiveRating(away), DRAW_NU);
}
```
(`DRAW_NU` stays defined at the top of the file as the default.)

- [ ] **Step 3: Run the montecarlo tests to verify unchanged behavior**

Run: `npx vitest run tests/montecarlo.test.ts`
Expected: PASS (all 9 — the Davidson sum, draw-peak, Elo-consistency and odds
tests still hold because the math is identical).

- [ ] **Step 4: Commit**

```bash
git add lib/montecarlo.ts
git commit -m "Route montecarlo outcomeProbs through davidsonProbs"
```

---

## Task 4: `eloUpdate` — parameterize the Elo gain

**Files:**
- Modify: `lib/ratings.ts` (add `eloUpdate`, call it from `computeLiveRatings:75-83`)
- Test: `tests/elo-update.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/elo-update.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { eloUpdate } from "@/lib/ratings";

describe("eloUpdate", () => {
  it("rewards the home winner with a positive delta", () => {
    expect(eloUpdate(1800, 1800, 2, 0)).toBeGreaterThan(0);
  });

  it("gives a bigger swing for a larger goal margin", () => {
    const small = eloUpdate(1800, 1800, 1, 0);
    const big = eloUpdate(1800, 1800, 4, 0);
    expect(big).toBeGreaterThan(small);
  });

  it("scales linearly with k", () => {
    expect(eloUpdate(1800, 1800, 2, 0, 30)).toBeCloseTo(
      eloUpdate(1800, 1800, 2, 0, 60) / 2,
      9,
    );
  });

  it("defaults k to the World Cup weight of 60", () => {
    // 1800 vs 1800, 2-goal win: 60 * 1.5 * (1 - 0.5) = 45
    expect(eloUpdate(1800, 1800, 2, 0)).toBeCloseTo(45, 9);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/elo-update.test.ts`
Expected: FAIL — `eloUpdate` is not exported.

- [ ] **Step 3: Add `eloUpdate` and call it from `computeLiveRatings`**

In `lib/ratings.ts`, add the exported function just after `goalMultiplier`
(after line 26):
```ts
/**
 * Symmetric per-match Elo delta for the home side (away gets the negation).
 * `effHome`/`effAway` are already host/home-adjusted ratings; `k` is the gain
 * (default 60, the World Cup finals weight).
 */
export function eloUpdate(
  effHome: number,
  effAway: number,
  homeGoals: number,
  awayGoals: number,
  k: number = K,
): number {
  const we = winProbability(effHome, effAway);
  const w = homeGoals > awayGoals ? 1 : homeGoals < awayGoals ? 0 : 0.5;
  return k * goalMultiplier(homeGoals - awayGoals) * (w - we);
}
```

Then replace the per-match computation inside the `for (const f of completed)`
loop (lines 75-85, from `// Expected (host-adjusted)...` through the `bump(b, ...)`
line) with:
```ts
    // Symmetric Elo delta from the host-adjusted ratings at this point in time.
    const change = eloUpdate(
      effectiveRating({ rating: at(a), host: host.get(a) }),
      effectiveRating({ rating: at(b), host: host.get(b) }),
      f.homeGoals!,
      f.awayGoals!,
    );
    bump(a, change);
    bump(b, -change); // symmetric: (W_b − We_b) = −(W_a − We_a)
```

(The `winProbability`, `effectiveRating`, `goalMultiplier` and `K` references are
all still used, so imports and constants stay as-is.)

- [ ] **Step 4: Run the new test and the existing ratings tests**

Run: `npx vitest run tests/elo-update.test.ts tests/ratings.test.ts`
Expected: PASS — `eloUpdate` passes and the 6 existing `computeLiveRatings`
tests still pass (identical math, just extracted).

- [ ] **Step 5: Commit**

```bash
git add lib/ratings.ts tests/elo-update.test.ts
git commit -m "Extract parameterized eloUpdate from computeLiveRatings"
```

---

## Task 5: CSV parser

**Files:**
- Create: `lib/backtest/parse.ts`
- Test: `tests/backtest-parse.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/backtest-parse.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { parseResults } from "@/lib/backtest/parse";

const CSV = `date,home_team,away_team,home_score,away_score,tournament,city,country,neutral
2018-07-15,France,Croatia,4,2,FIFA World Cup,Moscow,Russia,TRUE
2014-06-01,Brazil,Argentina,2,1,Friendly,Rio,Brazil,FALSE
2026-06-27,Panama,England,NA,NA,FIFA World Cup,East Rutherford,United States,TRUE`;

describe("parseResults", () => {
  it("keeps played rows, drops NA fixtures, and sorts by date", () => {
    const rows = parseResults(CSV);
    expect(rows).toHaveLength(2); // Panama–England (NA) dropped
    expect(rows[0].date).toBe("2014-06-01"); // sorted ascending
    expect(rows[1].home).toBe("France");
  });

  it("parses scores as numbers and neutral as a boolean", () => {
    const rows = parseResults(CSV);
    const fra = rows.find((r) => r.home === "France")!;
    expect(fra.homeGoals).toBe(4);
    expect(fra.awayGoals).toBe(2);
    expect(fra.neutral).toBe(true);
    const bra = rows.find((r) => r.home === "Brazil")!;
    expect(bra.neutral).toBe(false);
    expect(bra.tournament).toBe("Friendly");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/backtest-parse.test.ts`
Expected: FAIL — cannot find `@/lib/backtest/parse`.

- [ ] **Step 3: Implement the parser**

Create `lib/backtest/parse.ts`:
```ts
// Parse the vendored international-results CSV into typed, played-only rows.
// The dataset is unquoted and country/city names carry no commas, so a plain
// comma split with a 9-field guard is sufficient.

export interface MatchRow {
  date: string; // ISO yyyy-mm-dd (sortable as a string)
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  tournament: string;
  neutral: boolean;
}

export function parseResults(csv: string): MatchRow[] {
  const rows: MatchRow[] = [];
  const lines = csv.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const f = line.split(",");
    if (f.length !== 9) continue;
    const [date, home, away, hs, as, tournament, , , neutral] = f;
    const homeGoals = Number(hs);
    const awayGoals = Number(as);
    if (!Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) continue;
    rows.push({
      date,
      home,
      away,
      homeGoals,
      awayGoals,
      tournament,
      neutral: neutral.trim().toUpperCase() === "TRUE",
    });
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return rows;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/backtest-parse.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/backtest/parse.ts tests/backtest-parse.test.ts
git commit -m "Add backtest CSV parser"
```

---

## Task 6: Roll, score, and sweep

**Files:**
- Create: `lib/backtest/run.ts`
- Test: `tests/backtest-run.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/backtest-run.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { MatchRow } from "@/lib/backtest/parse";
import { CURRENT, refineGrid, rollAndScore, sweep } from "@/lib/backtest/run";

function m(
  date: string,
  home: string,
  away: string,
  hg: number,
  ag: number,
  neutral = true,
): MatchRow {
  return { date, home, away, homeGoals: hg, awayGoals: ag, tournament: "Friendly", neutral };
}

// Score everything (no burn-in) for deterministic assertions.
const ALL = "2000-01-01";

describe("rollAndScore", () => {
  it("computes log-loss for a single even neutral match", () => {
    // 1500 vs 1500, nu=0.63: p_home = 10^(1500/400) / (2 + 0.63) share = 0.38023.
    const r = rollAndScore([m("2020-01-01", "A", "B", 1, 0)], { nu: 0.63, home: 0, k: 60 }, ALL);
    expect(r.n).toBe(1);
    expect(r.logLoss).toBeCloseTo(-Math.log(0.38023), 4);
  });

  it("predicts more draws as nu rises", () => {
    const games = [m("2020-01-01", "A", "B", 0, 0), m("2020-02-01", "A", "B", 1, 1)];
    const lo = rollAndScore(games, { nu: 0.3, home: 0, k: 60 }, ALL).drawPredicted;
    const hi = rollAndScore(games, { nu: 0.9, home: 0, k: 60 }, ALL).drawPredicted;
    expect(hi).toBeGreaterThan(lo);
  });

  it("respects the burn-in cutoff when scoring", () => {
    const games = [m("2015-01-01", "A", "B", 1, 0), m("2019-01-01", "A", "B", 1, 0)];
    expect(rollAndScore(games, CURRENT, "2018-01-01").n).toBe(1);
  });
});

describe("sweep", () => {
  it("returns a best result minimizing log-loss over a small grid", () => {
    const games = [
      m("2020-01-01", "A", "B", 2, 0),
      m("2020-02-01", "C", "D", 1, 1),
      m("2020-03-01", "B", "C", 0, 1),
    ];
    const { best, all } = sweep(games, { nu: [0.4, 0.6], home: [0, 100], k: [40, 60] });
    expect(all).toHaveLength(8); // 2 × 2 × 2
    for (const r of all) expect(best.logLoss).toBeLessThanOrEqual(r.logLoss);
  });
});

describe("refineGrid", () => {
  it("brackets the centre and drops non-positive values", () => {
    const g = refineGrid({ nu: 0.05, home: 0, k: 5 });
    expect(g.nu).toEqual([0.05, 0.1]); // 0 dropped (nu must be > 0)
    expect(g.home).toEqual([0, 12.5]); // negative dropped (home >= 0)
    expect(g.k).toEqual([5, 10]); // 0 dropped (k must be > 0)
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/backtest-run.test.ts`
Expected: FAIL — cannot find `@/lib/backtest/run`.

- [ ] **Step 3: Implement the roller**

Create `lib/backtest/run.ts`:
```ts
// Replay the corpus once per candidate (nu, home, K), scoring predictions
// out-of-sample against real outcomes. Pure: no I/O, no Date/Math.random.

import { davidsonProbs } from "@/lib/prediction";
import { eloUpdate } from "@/lib/ratings";
import type { MatchRow } from "@/lib/backtest/parse";

export interface Constants {
  nu: number;
  home: number;
  k: number;
}

export interface Report {
  constants: Constants;
  n: number; // matches actually scored (post burn-in)
  logLoss: number;
  brier: number;
  drawObserved: number;
  drawPredicted: number;
  reliability: { bucket: number; predicted: number; observed: number; count: number }[];
}

export interface SweepResult {
  best: Report;
  all: Report[];
}

/** The constants the app currently ships. */
export const CURRENT: Constants = { nu: 0.63, home: 100, k: 60 };

const INIT = 1500; // flat starting rating for every team
const BURN_IN = "2018-01-01"; // only score matches on/after this date

type Outcome = "home" | "draw" | "away";

function outcomeOf(r: MatchRow): Outcome {
  return r.homeGoals > r.awayGoals ? "home" : r.homeGoals < r.awayGoals ? "away" : "draw";
}

export function rollAndScore(
  matches: MatchRow[],
  c: Constants,
  burnIn: string = BURN_IN,
): Report {
  const rating = new Map<string, number>();
  const at = (t: string) => rating.get(t) ?? INIT;

  let ll = 0;
  let brier = 0;
  let n = 0;
  let drawObs = 0;
  let drawPred = 0;
  // Reliability pooled over the three outcome probabilities, 10 buckets.
  const relP = new Array(10).fill(0);
  const relH = new Array(10).fill(0);
  const relN = new Array(10).fill(0);

  for (const mtch of matches) {
    const effHome = at(mtch.home) + (mtch.neutral ? 0 : c.home);
    const effAway = at(mtch.away);
    const p = davidsonProbs(effHome, effAway, c.nu);

    if (mtch.date >= burnIn) {
      const o = outcomeOf(mtch);
      ll += -Math.log(Math.max(p[o], 1e-15));
      for (const key of ["home", "draw", "away"] as Outcome[]) {
        const y = o === key ? 1 : 0;
        brier += (p[key] - y) ** 2;
        const b = Math.min(9, Math.floor(p[key] * 10));
        relP[b] += p[key];
        relH[b] += y;
        relN[b] += 1;
      }
      drawObs += o === "draw" ? 1 : 0;
      drawPred += p.draw;
      n++;
    }

    // Roll ratings forward with the same gain the live model uses.
    const d = eloUpdate(effHome, effAway, mtch.homeGoals, mtch.awayGoals, c.k);
    rating.set(mtch.home, at(mtch.home) + d);
    rating.set(mtch.away, at(mtch.away) - d);
  }

  const reliability = relN
    .map((cnt, i) => ({
      bucket: i,
      predicted: cnt ? relP[i] / cnt : 0,
      observed: cnt ? relH[i] / cnt : 0,
      count: cnt,
    }))
    .filter((r) => r.count > 0);

  return {
    constants: c,
    n,
    logLoss: n ? ll / n : 0,
    brier: n ? brier / n : 0,
    drawObserved: n ? drawObs / n : 0,
    drawPredicted: n ? drawPred / n : 0,
    reliability,
  };
}

const COARSE = {
  nu: [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
  home: [0, 25, 50, 75, 100, 125, 150],
  k: [20, 30, 40, 50, 60, 70, 80],
};

export function sweep(
  matches: MatchRow[],
  grid: { nu: number[]; home: number[]; k: number[] } = COARSE,
): SweepResult {
  let best: Report | null = null;
  const all: Report[] = [];
  for (const nu of grid.nu) {
    for (const home of grid.home) {
      for (const k of grid.k) {
        const r = rollAndScore(matches, { nu, home, k });
        all.push(r);
        if (!best || r.logLoss < best.logLoss) best = r;
      }
    }
  }
  return { best: best!, all };
}

/** A finer grid bracketing a coarse winner, with non-positive values dropped. */
export function refineGrid(c: Constants): { nu: number[]; home: number[]; k: number[] } {
  return {
    nu: [c.nu - 0.05, c.nu, c.nu + 0.05].filter((x) => x > 0),
    home: [c.home - 12.5, c.home, c.home + 12.5].filter((x) => x >= 0),
    k: [c.k - 5, c.k, c.k + 5].filter((x) => x > 0),
  };
}
```

Note: `sweep` always scores with the default `BURN_IN`; the `burnIn` override on
`rollAndScore` exists only so tests can score every synthetic match.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/backtest-run.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/backtest/run.ts tests/backtest-run.test.ts
git commit -m "Add backtest roll/score/sweep core"
```

---

## Task 7: CLI wiring

**Files:**
- Create: `scripts/backtest.ts`
- Modify: `package.json` (scripts + devDependencies)

- [ ] **Step 1: Add the `tsx` devDependency and the npm script**

In `package.json`, add to `"scripts"`:
```json
    "backtest": "tsx scripts/backtest.ts",
```
and add to `"devDependencies"`:
```json
    "tsx": "4.19.2",
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: `tsx` installed, no other dependency changes.

- [ ] **Step 3: Write the CLI**

Create `scripts/backtest.ts`:
```ts
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
  `| **shipping** | ${current.constants.nu} | ${current.constants.home} | ${current.constants.k} | ${f3(current.logLoss)} | ${f3(current.brier)} | ${pct(current.drawObserved)} / ${pct(current.drawPredicted)} |`,
  `| **tuned** | ${best.constants.nu} | ${best.constants.home} | ${best.constants.k} | ${f3(best.logLoss)} | ${f3(best.brier)} | ${pct(best.drawObserved)} / ${pct(best.drawPredicted)} |`,
  "",
  `Log-loss improvement: **${f3(current.logLoss - best.logLoss)}** (lower is better).`,
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
```

- [ ] **Step 4: Verify the CLI runs end-to-end**

Run: `npm run backtest`
Expected: prints the report (a Constants table with `shipping` vs `tuned` rows and
a positive-or-zero log-loss improvement), and writes `docs/backtest-report.md`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json scripts/backtest.ts
git commit -m "Add npm run backtest CLI"
```

---

## Task 8: Generate the report and document

**Files:**
- Create: `docs/backtest-report.md` (generated in Task 7, now committed)
- Modify: `README.md` (the "Title odds (Monte Carlo)" area, ~lines 113-130)

- [ ] **Step 1: Run the full suite to confirm nothing regressed**

Run: `npx vitest run`
Expected: PASS — original 39 plus the new davidson/elo-update/parse/run tests
(≈ 50 total).

- [ ] **Step 2: Regenerate the report (both variants) for the record**

Run:
```bash
npm run backtest
npm run backtest -- --no-friendlies
```
Expected: `docs/backtest-report.md` reflects the last run. (Run the all-matches
variant last so the committed report includes friendlies.)

- [ ] **Step 3: Add a README note**

In `README.md`, immediately after the Monte Carlo "Title odds" subsection (the
paragraph ending "…a backtest harness (a future addition) would tune them.",
~line 130), append:
```markdown

**Calibration.** Those constants are now checkable: `npm run backtest` replays
~12 years of real international results (`data/intl_results.csv`), rolls one Elo
table forward, and scores the model out-of-sample (log-loss, Brier, a reliability
table) for the shipping constants versus a grid-search best — see
`docs/backtest-report.md`. It **recommends** values for ν, the host bump and K; it
does not change them. Pass `--no-friendlies` to see the fit without low-intensity
games.
```
Also update the preceding sentence — replace "a backtest harness (a future
addition) would tune them." with "the `npm run backtest` harness (below) quantifies
how good they are."

- [ ] **Step 4: Commit**

```bash
git add README.md docs/backtest-report.md
git commit -m "Document the backtest harness and commit the calibration report"
```

---

## Self-review

**Spec coverage:**
- Vendored corpus since 2014, NA dropped → Task 1. ✓
- Roll from 1500, burn-in score ≥ 2018 → `rollAndScore` (Task 6). ✓
- Predict-before-update ordering, home bump only when not neutral → Task 6 loop. ✓
- Sweep ν×home×K minimizing log-loss, coarse + refine → `sweep`/`refineGrid` (Task 6), wired in Task 7. ✓
- Scoring: log-loss, Brier, reliability, draw obs/pred, baseline context → Task 6 + report (Task 7). (Base-rate baseline is conveyed via the reliability table + draw obs/pred columns; an explicit no-skill row is not separately computed — acceptable, the shipping-vs-tuned comparison is the headline.)
- Parameterized refactor with current defaults → Tasks 2–4 (davidsonProbs, outcomeProbs delegate, eloUpdate). ✓
- `effectiveRating(team, hostAdv=…)` from the spec is **intentionally dropped** (YAGNI): the backtest applies the home bump itself per-neutral-flag, so the override param would be dead code. Noted here so it is a conscious cut, not an omission.
- CLI `npm run backtest`, `--no-friendlies`, `--no-refine`, writes `docs/backtest-report.md`, recommends not auto-applies → Task 7. ✓
- Verification: build clean, 39 tests green, new tests → Task 8. ✓

**Placeholder scan:** none — every code step is complete.

**Type consistency:** `Constants {nu,home,k}`, `Report`, `SweepResult {best,all}`,
`MatchRow {date,home,away,homeGoals,awayGoals,tournament,neutral}`, `davidsonProbs(rA,rB,nu)`,
`eloUpdate(effHome,effAway,homeGoals,awayGoals,k?)` are used identically across
Tasks 2–7 and their tests.
