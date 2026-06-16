# Model Report Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grade Mondial's prediction model against live 2026 results and surface the verdict via a `/model` page + dashboard panel, without touching the bracket or any model logic.

**Architecture:** Pure grading functions (`lib/modelreport.ts`) walk finished fixtures and score the model's *pre-match* predictions, reusing `outcomeProbs`, `eloUpdate`, `effectiveRating`, `simulateTournament`, `computeGroupStandings`, `qualifiedTeams`. Two server-rendered surfaces consume them. One additive data accessor (`getRawFixtures`) exposes seed-rating fixtures so grading rolls Elo from seeds (not the live-overlaid ratings).

**Tech Stack:** Next.js 16 (App Router, server components), React 19, TypeScript strict, Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-16-model-report-card-design.md`

---

## Task 1: Tier A — `gradeOutcomes` + shared types

**Files:**
- Create: `lib/modelreport.ts`
- Test: `tests/modelreport.test.ts`

Grades every finished **group-stage** match: predict from ratings *before* the match (no leakage), score, then roll the result in.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/modelreport.test.ts
import { describe, expect, it } from "vitest";
import type { Fixture, Team } from "@/lib/types";
import { gradeOutcomes } from "@/lib/modelreport";

function team(id: number, rating: number, group = "A"): Team {
  return { id, name: `T${id}`, code: `T${id}`, flag: "⚽", group, rating };
}
function gx(
  id: number,
  home: Team,
  away: Team,
  hg: number | null,
  ag: number | null,
  kickoff: string,
): Fixture {
  return {
    id, stage: "Group Stage", group: home.group,
    kickoff, status: hg == null ? "scheduled" : "finished",
    venue: null, home, away, homeGoals: hg, awayGoals: ag, minute: null, goals: [],
  };
}

describe("gradeOutcomes", () => {
  const A = team(1, 1900), B = team(2, 1700);

  it("returns an empty report (no NaNs) when nothing is finished", () => {
    const r = gradeOutcomes([gx(1, A, B, null, null, "2026-06-11T00:00:00Z")]);
    expect(r.n).toBe(0);
    expect(r.logLoss).toBe(0);
    expect(r.baselineLogLoss).toBeCloseTo(Math.log(3), 9);
    expect(r.hits).toBe(0);
    expect(r.perMatch).toEqual([]);
  });

  it("scores a finished match with the pre-match Davidson probability", () => {
    const r = gradeOutcomes([gx(1, A, B, 2, 0, "2026-06-11T00:00:00Z")]);
    expect(r.n).toBe(1);
    expect(r.perMatch[0].actual).toBe("home");
    // log-loss equals -ln(p_home) for the only match
    expect(r.logLoss).toBeCloseTo(-Math.log(r.perMatch[0].predicted.home), 9);
    expect(r.hits).toBe(1); // A was favourite and won
  });

  it("ignores knockout matches (group stage only)", () => {
    const ko = gx(9, A, B, 1, 0, "2026-07-01T00:00:00Z");
    ko.stage = "Round of 16";
    expect(gradeOutcomes([ko]).n).toBe(0);
  });

  it("is leak-free: a later match's prediction ignores its own result", () => {
    const g1a = gx(1, A, B, 1, 0, "2026-06-11T00:00:00Z");
    const g2a = gx(2, A, B, 1, 0, "2026-06-15T00:00:00Z");
    const g2b = gx(2, A, B, 0, 5, "2026-06-15T00:00:00Z"); // different own result
    const p1 = gradeOutcomes([g1a, g2a]).perMatch[1].predicted;
    const p2 = gradeOutcomes([g1a, g2b]).perMatch[1].predicted;
    expect(p2).toEqual(p1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/modelreport.test.ts`
Expected: FAIL — `gradeOutcomes` not exported.

- [ ] **Step 3: Implement `lib/modelreport.ts` (Tier A)**

```ts
// Grade the prediction model against real, finished results. Pure — no I/O, no
// Date/Math.random — so it runs identically on the server and in tests. Reuses
// the live-Elo roll and the Davidson outcome model; never mutates inputs.
import type { Fixture, Team } from "@/lib/types";
import { effectiveRating } from "@/lib/prediction";
import { eloUpdate } from "@/lib/ratings";
import { outcomeProbs } from "@/lib/montecarlo";

export type Outcome3 = "home" | "draw" | "away";

export interface MatchGrade {
  date: string;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  predicted: { home: number; draw: number; away: number };
  actual: Outcome3;
  correct: boolean;
}

export interface ReliabilityBucket {
  bucket: number; // 0..9
  predicted: number;
  observed: number;
  count: number;
}

export interface OutcomeReport {
  n: number;
  logLoss: number;
  brier: number;
  baselineLogLoss: number; // ln 3 — the uniform no-skill forecast
  hits: number; // matches where the model's most-likely outcome was correct
  reliability: ReliabilityBucket[];
  perMatch: MatchGrade[];
}

const BASELINE_LOGLOSS = Math.log(3);

function isFinishedReal(f: Fixture): boolean {
  return (
    f.status === "finished" &&
    f.home.id !== 0 && f.away.id !== 0 &&
    f.homeGoals != null && f.awayGoals != null
  );
}

function outcomeOf(hg: number, ag: number): Outcome3 {
  return hg > ag ? "home" : hg < ag ? "away" : "draw";
}

export function gradeOutcomes(fixtures: Fixture[]): OutcomeReport {
  // Seed ratings from the fixtures' own teams (never mutated → always the seed).
  const rating = new Map<number, number>();
  const host = new Map<number, boolean>();
  const seed = (t: Team) => {
    if (t.id !== 0 && !rating.has(t.id)) {
      rating.set(t.id, t.rating);
      host.set(t.id, !!t.host);
    }
  };
  for (const f of fixtures) { seed(f.home); seed(f.away); }

  const finished = fixtures
    .filter((f) => f.stage === "Group Stage" && isFinishedReal(f))
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));

  let logLoss = 0, brier = 0, hits = 0;
  const relP = new Array(10).fill(0);
  const relH = new Array(10).fill(0);
  const relN = new Array(10).fill(0);
  const perMatch: MatchGrade[] = [];

  for (const f of finished) {
    const h = f.home.id, a = f.away.id;
    const eh = effectiveRating({ rating: rating.get(h)!, host: host.get(h) });
    const ea = effectiveRating({ rating: rating.get(a)!, host: host.get(a) });
    const p = outcomeProbs(
      { rating: rating.get(h)!, host: host.get(h) },
      { rating: rating.get(a)!, host: host.get(a) },
    );
    const actual = outcomeOf(f.homeGoals!, f.awayGoals!);

    logLoss += -Math.log(Math.max(p[actual], 1e-15));
    for (const key of ["home", "draw", "away"] as Outcome3[]) {
      const y = actual === key ? 1 : 0;
      brier += (p[key] - y) ** 2;
      const b = Math.min(9, Math.floor(p[key] * 10));
      relP[b] += p[key]; relH[b] += y; relN[b] += 1;
    }
    const fav = (["home", "draw", "away"] as Outcome3[]).reduce((m, k) =>
      p[k] > p[m] ? k : m, "home" as Outcome3);
    const correct = fav === actual;
    if (correct) hits++;

    perMatch.push({
      date: f.kickoff.slice(0, 10),
      home: f.home.name, away: f.away.name,
      homeGoals: f.homeGoals!, awayGoals: f.awayGoals!,
      predicted: p, actual, correct,
    });

    // Roll the result in AFTER scoring (host-adjusted Elo, same K as the model).
    const d = eloUpdate(eh, ea, f.homeGoals!, f.awayGoals!);
    rating.set(h, rating.get(h)! + d);
    rating.set(a, rating.get(a)! - d);
  }

  const n = finished.length;
  const reliability = relN
    .map((cnt, i) => ({
      bucket: i,
      predicted: cnt ? relP[i] / cnt : 0,
      observed: cnt ? relH[i] / cnt : 0,
      count: cnt,
    }))
    .filter((r) => r.count > 0);

  return {
    n,
    logLoss: n ? logLoss / n : 0,
    brier: n ? brier / n : 0,
    baselineLogLoss: BASELINE_LOGLOSS,
    hits,
    reliability,
    perMatch,
  };
}
```

Note: `eloUpdate` uses the live model's default `K`; do not pass an override.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/modelreport.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` (exit 0)
```bash
git add lib/modelreport.ts tests/modelreport.test.ts
git commit -m "Add Tier A outcome grading (gradeOutcomes)"
```

---

## Task 2: Tier B — `gradeQualification`

**Files:**
- Modify: `lib/modelreport.ts`
- Test: `tests/modelreport.test.ts`

Compares the model's **pre-tournament** `escapeGroup` to who actually advanced. Scores 1st/2nd (advanced) and 4th (out) in completed groups immediately; defers 3rd-place teams until **all** groups are complete (best-thirds are cross-group).

- [ ] **Step 1: Write the failing test**

```ts
// append to tests/modelreport.test.ts
import { gradeQualification } from "@/lib/modelreport";
import type { Group } from "@/lib/types";

// A 4-team group where every team has played 3 games (complete).
function completeGroup(name: string, teams: Team[]): Group {
  return {
    name,
    rows: teams.map((t, i) => ({
      team: t, played: 3, won: 0, drawn: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, goalDiff: 3 - i, points: 9 - i * 3,
    })),
  } as Group;
}

describe("gradeQualification", () => {
  it("returns not-scored when no group is complete", () => {
    const r = gradeQualification([], []);
    expect(r.n).toBe(0);
    expect(r.groupsComplete).toBe(0);
  });
});
```

(The implementer should also add a richer test: build a complete group, give the
model pre-tournament odds via a small fixture set, and assert the Brier and the
notable hit/miss — see Step 3 for the exact contract.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/modelreport.test.ts`
Expected: FAIL — `gradeQualification` not exported.

- [ ] **Step 3: Implement Tier B**

Append to `lib/modelreport.ts`:

```ts
import type { Group } from "@/lib/types";
import { simulateTournament } from "@/lib/montecarlo";
import { computeGroupStandings } from "@/lib/standings";
import { qualifiedTeams } from "@/lib/qualifiers";

export interface QualMark {
  team: string;
  predicted: number; // pre-tournament escapeGroup prob
  advanced: boolean;
}
export interface QualificationReport {
  n: number; // teams whose fate is determined and scored
  brier: number;
  groupsComplete: number;
  allGroupsComplete: boolean;
  notableHits: QualMark[]; // advanced & model gave low odds, or out & high odds
  notableMisses: QualMark[];
}

const groupComplete = (g: Group) => g.rows.every((r) => r.played >= 3);

export function gradeQualification(
  fixtures: Fixture[],
  groups: Group[],
): QualificationReport {
  const groupFixtures = fixtures.filter((f) => f.stage === "Group Stage");

  // Pre-tournament odds: strip all group results, simulate from seeds.
  const stripped = groupFixtures.map((f) => ({
    ...f, status: "scheduled" as const, homeGoals: null, awayGoals: null,
  }));
  const odds = stripped.length ? simulateTournament(stripped) : [];
  const escape = new Map<number, number>(); // teamId -> escapeGroup
  for (const o of odds) escape.set(o.team.id, o.escapeGroup);

  const complete = groups.filter(groupComplete);
  const allComplete = groups.length > 0 && complete.length === groups.length;
  const actualQualifiers = new Set(qualifiedTeams(groups).map((t) => t.id));

  const marks: QualMark[] = [];
  for (const g of complete) {
    // rows are rank-ordered by computeGroupStandings (1st..4th).
    g.rows.forEach((row, rank) => {
      const determined = rank === 0 || rank === 1 || rank === 3 || allComplete;
      if (!determined) return; // 3rd place: defer until every group is done
      const advanced =
        rank <= 1 ? true : rank === 3 ? false : actualQualifiers.has(row.team.id);
      marks.push({
        team: row.team.name,
        predicted: escape.get(row.team.id) ?? 0,
        advanced,
      });
    });
  }

  const n = marks.length;
  const brier = n
    ? marks.reduce((s, m) => s + (m.predicted - (m.advanced ? 1 : 0)) ** 2, 0) / n
    : 0;

  // Notable: advanced despite low odds, or eliminated despite high odds.
  const surprises = [...marks].sort(
    (a, b) =>
      Math.abs((b.advanced ? 1 : 0) - b.predicted) -
      Math.abs((a.advanced ? 1 : 0) - a.predicted),
  );
  return {
    n,
    brier,
    groupsComplete: complete.length,
    allGroupsComplete: allComplete,
    notableHits: surprises.filter((m) => m.advanced).slice(0, 3),
    notableMisses: surprises.filter((m) => !m.advanced).slice(0, 3),
  };
}
```

- [ ] **Step 4: Run + typecheck + commit**

Run: `npx vitest run tests/modelreport.test.ts` (PASS), `npx tsc --noEmit` (exit 0)
```bash
git add lib/modelreport.ts tests/modelreport.test.ts
git commit -m "Add Tier B qualification grading (gradeQualification)"
```

---

## Task 3: `getRawFixtures` data accessor

**Files:**
- Modify: `lib/data/index.ts`

Expose seed-rating fixtures (live scores overlaid, ratings untouched) so the
report card rolls Elo from seeds rather than the live-overlaid `getFixtures`.

- [ ] **Step 1: Add the export**

Immediately after the existing `async function rawFixtures()` (which is internal),
add:

```ts
/** Seed-rating fixtures (live scores overlaid, ratings = pre-tournament seeds).
 *  The basis for model-accuracy grading, which must roll Elo from the seeds. */
export async function getRawFixtures(): Promise<Fixture[]> {
  return rawFixtures();
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit` (exit 0)
```bash
git add lib/data/index.ts
git commit -m "Expose getRawFixtures (seed-rating fixtures) for grading"
```

---

## Task 4: Dashboard teaser panel

**Files:**
- Create: `components/ModelReportCard.tsx`
- Modify: `app/page.tsx`

A compact, presentational panel that takes an `OutcomeReport` and links to `/model`.
Follow existing component conventions (the `.card` token, `ink/accent` colors — see
`components/MatchCard.tsx` for the house style).

- [ ] **Step 1: Implement the component**

```tsx
import Link from "next/link";
import type { OutcomeReport } from "@/lib/modelreport";

export function ModelReportCard({ report }: { report: OutcomeReport }) {
  if (report.n === 0) {
    return (
      <Link href="/model" className="card block p-4 hover:border-accent">
        <h3 className="text-sm font-semibold text-ink-200">Model report card</h3>
        <p className="mt-1 text-sm text-ink-400">
          No results scored yet — the model’s calls will be graded here as
          matches finish. <span className="text-accent">see detail →</span>
        </p>
      </Link>
    );
  }
  const edge = report.baselineLogLoss - report.logLoss; // >0 = beats a coin flip
  return (
    <Link href="/model" className="card block p-4 hover:border-accent">
      <h3 className="text-sm font-semibold text-ink-200">Model report card</h3>
      <p className="mt-1 text-sm text-ink-300">
        Called <strong>{report.hits} of {report.n}</strong> group results —{" "}
        {edge >= 0 ? "beating" : "trailing"} a blind guess by{" "}
        <strong>{Math.abs(edge).toFixed(2)}</strong> log-loss.{" "}
        <span className="text-accent">see detail →</span>
      </p>
    </Link>
  );
}
```

- [ ] **Step 2: Render it on the dashboard**

In `app/page.tsx`, import `getRawFixtures` and `gradeOutcomes`, compute the report
in the existing server data fetch, and render `<ModelReportCard report={report} />`
in a sensible spot (below the live/hero block). Keep it inside the existing layout
container; do not alter the live-score ordering logic.

- [ ] **Step 3: Verify + commit**

Run: `npx tsc --noEmit` (exit 0); `npm run build` (clean)
```bash
git add components/ModelReportCard.tsx app/page.tsx
git commit -m "Add model report card teaser to the dashboard"
```

---

## Task 5: The `/model` page

**Files:**
- Create: `app/model/page.tsx`

Server component. Fetch `getRawFixtures()` + `getGroups()`, run `gradeOutcomes` and
`gradeQualification`, render plain headline → outcome rigour → qualification →
title narrative → sample-size caveat. Match the page chrome of `app/groups/page.tsx`.

- [ ] **Step 1: Implement the page**

Sections, top-to-bottom:
1. **Plain headline** — `Called {hits} of {n} group results`; the coin-flip edge.
2. **Outcome rigour** — `log-loss {logLoss} vs {baselineLogLoss} baseline`, `Brier`,
   the 10-bucket reliability table (map `report.reliability`), and a per-match list
   (`report.perMatch`: predicted home/draw/away %, the score, ✓/✗).
3. **Qualification (Tier B)** — when `qual.groupsComplete > 0`: `Brier {qual.brier}`
   over `{qual.n}` determined teams, plus `notableHits`/`notableMisses`. Else a
   muted “unlocks as groups finish”.
4. **Title (Tier C)** — list the model’s pre-tournament top-5 title favourites
   (from `simulateTournament(stripped).slice(0,5)` champion odds) framed as “the
   model’s pre-tournament favourites.” (Reuse the stripped-fixtures simulation;
   compute once.)
5. **Sample-size caveat** — when `report.n < 16`, a prominent muted note that the
   sample is small and the numbers will settle as the tournament progresses.

Use a default-export async server component. Add `export const metadata = { title: "Model report card" }`.

- [ ] **Step 2: Verify + commit**

Run: `npm run build` (clean); start the dev server and confirm `GET /model` → 200.
```bash
git add app/model/page.tsx
git commit -m "Add the /model report card page"
```

---

## Task 6: Navigation link

**Files:**
- Modify: `components/SiteNav.tsx`

- [ ] **Step 1: Add the link**

In the `LINKS` array, add after the Bracket entry:

```ts
  { href: "/model", label: "Model" },
```

- [ ] **Step 2: Verify + commit**

Run: `npm run build` (clean)
```bash
git add components/SiteNav.tsx
git commit -m "Add /model to the site nav"
```

---

## Task 7: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full suite + build**

Run: `npx tsc --noEmit` (exit 0); `npx vitest run` (all green); `npm run build` (clean).

- [ ] **Step 2: Smoke the surfaces**

With the dev server running, confirm: `GET /model` → 200, `GET /` → 200 (panel
renders), and **`GET /bracket` → 200 unchanged** (the bracket must be unaffected).
Spot-check the console is clean on `/model`.

- [ ] **Step 3: Confirm the bracket is byte-untouched**

Run: `git diff main -- components/BracketTree.tsx app/bracket/page.tsx lib/montecarlo.ts lib/prediction.ts lib/scoreline.ts`
Expected: **empty** — the feature changed none of these.

---

## Self-review notes (author)
- Types (`OutcomeReport`, `MatchGrade`, `QualificationReport`, `QualMark`) are defined in Task 1–2 and consumed unchanged in Tasks 4–5.
- `outcomeProbs` is imported from `@/lib/montecarlo` (it is exported there) and applies the host bump via `effectiveRating` internally — Task 1 passes `{ rating, host }` objects, matching its `Pick<Team, "rating" | "host">` signature.
- No task modifies bracket/model files; Task 7 Step 3 enforces this.
