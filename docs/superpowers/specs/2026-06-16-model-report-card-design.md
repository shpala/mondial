# Model Report Card — Design

**Status:** Approved (brainstorming) — pending spec review.
**Date:** 2026-06-16

## Goal

Grade Mondial's prediction model against the **real, live 2026 World Cup results**
and surface the verdict to users — turning every finished match into an honest,
public accuracy check. One sentence: *"How good have the model's calls actually
been?"*

This is **pure analysis over existing model code**. It introduces no new model,
changes no predictions, and does not touch the bracket. It reuses the scoring
machinery already built for the backtest (`rollAndScore`-style walk-forward) plus
`computeLiveRatings`, `outcomeProbs`, `simulateTournament`, and `qualifiedTeams`.

## What it grades — three tiers that light up as the tournament deepens

The feature degrades gracefully from "0 matches played" to the final. Each tier
renders only when it has data; otherwise it shows an explicit "not scored yet"
state — never a fabricated number.

### Tier A — Match outcomes (live from the first result)
For every **finished group-stage** match, reconstruct the model's *pre-match*
win/draw/away probability and score it.

- **Scope is group-stage only.** Knockout matches are 2-outcome (no draw) and
  penalty shootouts are not in the data (a shootout win is recorded as a
  full-time draw). Grading those as 1X2 would be wrong, so knockouts are graded
  as *advancement* under Tier B instead. This split removes the shootout
  ambiguity entirely and matches how the model actually predicts each phase
  (group = Davidson 3-outcome; knockout = 2-outcome advance).
- **Metrics:** multiclass log-loss, Brier, a 10-bucket reliability table, and a
  plain hit-rate (model's most-likely outcome vs actual).
- **No-skill baseline:** the uniform 1/3 forecast (log-loss `ln 3 ≈ 1.0986`).
  Shown alongside every metric so "skill" is always in context. Uniform — not the
  empirical base rate — because base rates are unstable at small n.

### Tier B — Qualification (lights up as groups finish)
Compare the model's **pre-tournament** `escapeGroup` probability to who actually
advanced, scored as a Brier over each team's advanced/not (1/0). Surfaces the
biggest hits and misses ("model gave Team X 22% to advance — they did").

- A group contributes once all three of its rounds are played (`played >= 3` for
  every team in the group, mirroring the bracket's `confirmed` gate).
- "Pre-tournament" odds are computed from **seed ratings only** (no group
  results), so this is a leak-free preseason-forecast-vs-reality grade.

### Tier C — Title / finalist (narrative now, scored at the end)
Mid-tournament: show "pre-tournament favorites still alive" as narrative. Full
scoring (the model's champion/finalist probabilities vs the single actual
champion) is deferred to tournament end and labelled as the one-data-point result
it is. No probabilistic score is invented mid-tournament.

## How — walk-forward, no leakage

### Tier A algorithm (`gradeOutcomes`)
1. Take fixtures with **seed** ratings (raw, pre-live-overlay), so the roll starts
   from the registry seeds the app actually ships.
2. Filter to finished real group-stage matches; sort by kickoff.
3. Walk them in order, maintaining a `teamId → rating` map seeded from team
   `rating`:
   - Compute `effHome/effAway` via `effectiveRating` (host bump applied).
   - `predicted = outcomeProbs(home, away)` (Davidson, the shipped `DRAW_NU`).
   - `actual = sign(homeGoals - awayGoals)` → home/draw/away.
   - Accumulate `-ln(predicted[actual])` (log-loss), the three-class Brier, the
     reliability buckets, and the hit (argmax(predicted) === actual).
   - **Then** roll the result in with `eloUpdate(...)` (same K the live model
     uses). Each prediction therefore uses only strictly-earlier results.
4. Return `{ n, logLoss, brier, baselineLogLoss, hits, reliability[], perMatch[] }`.

### Tier B algorithm (`gradeQualification`)
1. Build a results-stripped copy of the fixtures (all group games
   `status: "scheduled"`, goals null) and run `simulateTournament` on it → the
   **pre-tournament** `escapeGroup` per team.
2. For every team in a **completed** group, `actual = 1` if it actually qualified
   (via `qualifiedTeams` on the real standings) else `0`.
3. Brier = mean over those teams of `(escapeGroup - actual)^2`. Also return the
   largest positive/negative residuals as "notable hits/misses".

Both algorithms are pure (no I/O, no Date/Math.random), so they run identically on
the server and in tests.

## Surfaces & framing

Framing is **plain headline first, technical detail below**.

### Dashboard panel — `components/ModelReportCard.tsx`
A compact teaser rendered in `app/page.tsx`, linking to `/model`:

```
┌ Model report card ───────────────┐
│ Called 7 of 11 group results —   │
│ beating a blind guess by 0.13    │
│ log-loss.            see detail → │
└──────────────────────────────────┘
```

When no group match is finished yet: *"No results scored yet — the model's calls
will be graded here as matches finish."*

### `/model` page — `app/model/page.tsx`
Server component, request-time data like the rest of the app. Layout top-to-bottom:
1. **Plain headline** — hit-rate and the coin-flip comparison.
2. **Outcome rigour** — log-loss vs the 1/3 baseline, Brier, the 10-bucket
   reliability table, and a per-match history (predicted probs vs result, ✓/✗).
3. **Qualification (Tier B)** — Brier on advancement + notable hits/misses, shown
   once any group completes.
4. **Title (Tier C)** — favorites-still-alive narrative.
5. A prominent **sample-size caveat** whenever `n` is small.

A nav link to `/model` is added to `SiteNav` (the only shared-surface edit beyond
the dashboard panel).

## Data flow

The grading must roll Elo from the **registry seed ratings**, not the live-adjusted
ones. The data facade's `getFixtures` overlays live Elo via `withLiveRating`
(replacing each team's `rating`), so rolling from its output would double-count.
The seed-rating fixtures live behind the **internal** `rawFixtures()` in
`lib/data/index.ts` ("ratings untouched — pre-tournament seeds"). So this feature
adds one small public accessor:

```ts
// lib/data/index.ts — additive export, pure plumbing, no model change
export async function getRawFixtures(): Promise<Fixture[]> {
  return rawFixtures(); // live scores overlaid, ratings = seeds
}
```

`/model` and the dashboard panel call `getRawFixtures()`, then `gradeOutcomes` /
`gradeQualification` (pure). No new data source, no caching changes — it rides the
existing request-time render + `AutoRefresh`, so grades refresh on the same cadence
as everything else.

## Files

| File | Responsibility |
| --- | --- |
| `lib/modelreport.ts` (new) | Pure grading: `gradeOutcomes`, `gradeQualification`, types. |
| `app/model/page.tsx` (new) | The `/model` page. |
| `components/ModelReportCard.tsx` (new) | Dashboard teaser panel. |
| `lib/data/index.ts` (edit) | Add the additive `getRawFixtures()` accessor (seed ratings). |
| `app/page.tsx` (edit) | Render the teaser panel. |
| `components/SiteNav.tsx` (edit) | Add `{ href: "/model", label: "Model" }` to the `LINKS` array. |
| `tests/modelreport.test.ts` (new) | Unit tests (below). |

**Explicitly NOT touched:** `BracketTree.tsx`, `app/bracket/page.tsx`,
`lib/montecarlo.ts`, `lib/prediction.ts`, `lib/scoreline.ts`, or any model logic.
The feature only reads from them.

## Testing

`tests/modelreport.test.ts`:
- **No leakage:** on a small hand-built fixture set, the prediction for match _k_
  is independent of match _k_'s own result (changing only the last match's score
  leaves earlier predictions byte-identical).
- **Log-loss / Brier correctness:** a one-match even fixture gives the known
  closed-form log-loss (matches the Davidson probability).
- **Hit-rate:** argmax outcome counted correctly.
- **Qualification Brier:** a tiny completed-group fixture yields the expected
  Brier and identifies the right notable hit/miss.
- **Empty state:** no finished matches → `n === 0`, no NaNs, baseline still defined.

## Out of scope
- Grading knockout 1X2 (handled as advancement in Tier B).
- Per-match scoreline/GD grading (the 1X2 outcome is what users read; scoreline
  accuracy is not user-facing).
- Persisting a historical time-series of accuracy (grades are recomputed from
  results each render; results are the source of truth).

## Honest guarantees
- A no-skill baseline accompanies every metric.
- Small-`n` warning shown prominently.
- Nothing fabricated when data is absent — explicit "not scored yet" states.
- Consistent with the README's "real vs modelled" framing.
