# Backtest + Calibration Harness — Design

**Date:** 2026-06-16
**Status:** Approved design (pending spec review)
**Area:** Prediction model (`lib/prediction.ts`, `lib/ratings.ts`, `lib/montecarlo.ts`)

## Problem

The prediction model rests on three hand-chosen constants that have never been
checked against real outcomes:

| Constant | Where | Current value | Role |
| --- | --- | --- | --- |
| `DRAW_NU` (ν) | `lib/montecarlo.ts` | `0.63` | Davidson draw weight — how often even sides draw |
| `HOST_ADVANTAGE` | `lib/prediction.ts` | `100` | Elo bump for a team playing at home (the WC hosts) |
| `K` | `lib/ratings.ts` | `60` | Live-Elo update gain per finished match |

They are sensible but unvalidated guesses. This harness measures how good they
are and recommends data-fit replacements, so any future change to them is
evidence-based rather than vibes.

It is a **dev-time research tool**, not a shipped feature: an offline CLI that
prints a calibration report and writes it to git. It does not change the live
constants — that is a separate, deliberate follow-up once we have read the
numbers.

## Non-goals

- No UI surface, no API route, no addition to the Next bundle.
- No automatic editing of the live constants.
- Not a full team-strength engine — it reuses the app's exact Elo + Davidson
  math so it tunes *the code we ship*, not a parallel model.

## Data

Vendor a trimmed slice of the public **`martj42/international_results`** dataset
to `data/intl_results.csv`.

- Source columns: `date,home_team,away_team,home_score,away_score,tournament,city,country,neutral`.
- Slice: **played** internationals dated **≥ 2014-01-01** (drop rows with `NA`
  scores — the file includes future fixtures). ~11k rows, < 1 MB.
- The `neutral` flag is load-bearing: `neutral = FALSE` means the home team
  played at home and earns the home bump in both prediction and the Elo update;
  `neutral = TRUE` means no bump for either side (the case for almost all World
  Cup matches).
- The harness works **entirely in the corpus's own team-name space** — every
  distinct name gets a rolling rating. It needs nothing from the 48-team
  `registry.ts`, so the two are fully decoupled.

### Host-advantage assumption (explicit)

We fit a single generic **home** bump on all non-neutral matches and assume the
World Cup co-hosts (USA/Mexico/Canada) get that same edge when they play. This
is the same simplification eloratings.net makes (+100 home). The report will
state it.

## Method

A single chronological roll of one Elo table, scored out-of-sample:

1. **Init.** Every team starts at 1500.
2. **Roll chronologically.** For each played match, in date order:
   a. **Predict first** (strictly pre-match): `(P_home, P_draw, P_away)` via the
      Davidson model on the teams' current ratings, applying the home bump to the
      home side iff `neutral = FALSE`.
   b. **Score** the prediction against the actual 3-way outcome — but only if the
      match date is **≥ 2018-01-01** (4-year burn-in so ratings converge from the
      flat 1500 start). Pre-2018 matches roll the ratings but are not scored.
   c. **Update.** Fold the result back in with `R' = R + K·G·(W − Wₑ)` — the same
      rule as `lib/ratings.ts`, with the same goal-difference multiplier `G`.
3. **Sweep.** Re-run the whole roll for each `(ν, home, K)` combo on a coarse
   grid, then refine one finer step around the best:
   - ν ∈ {0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0}
   - home ∈ {0, 25, 50, 75, 100, 125, 150}
   - K ∈ {20, 30, 40, 50, 60, 70, 80}
   Pick the combo minimizing multiclass log-loss. (~400 combos × ~11k matches is
   a few seconds in TS.)

`K` affects both the rolling ratings and the predictions; ν and the home bump
affect predictions (home also enters the update via the expected score `Wₑ`).
All three are applied consistently in predict and update, matching the app.

## Scoring

- **Primary:** multiclass **log-loss** (lower is better).
- **Secondary:** multiclass **Brier** score.
- **Reliability table:** bucket predictions by predicted probability, compare to
  observed frequency (is "70%" actually ~70%?).
- **Draw calibration:** observed vs predicted draw rate.
- **Baseline:** a no-skill model predicting the global base rates, for context.

Everything is reported twice — for the **current** constants `(0.63, 100, 60)`
and for the **tuned** best — so the output reads: "shipping today → X log-loss;
best triple → Y; Δ = …".

## Code shape

The constants are currently inlined. Extract the pure math into parameterized
functions whose **defaults are the current values**, so app behavior and the
existing 39 tests are unchanged.

### Modified

- `lib/prediction.ts`
  - Add `davidsonProbs(rA, rB, nu): { home; draw; away }` — the pure 3-outcome
    math.
  - `effectiveRating(team, hostAdv = HOST_ADVANTAGE)` — add the optional override.
- `lib/montecarlo.ts`
  - `outcomeProbs(home, away)` becomes a thin wrapper: apply `effectiveRating`
    then delegate to `davidsonProbs(..., DRAW_NU)`. Behavior identical.
- `lib/ratings.ts`
  - Extract a pure `eloUpdate(rHome, rAway, gh, ga, k): { home; away }` (the
    symmetric per-match delta incl. the `G` multiplier). `computeLiveRatings`
    calls it with `K = 60`. Behavior identical.

### New

- `lib/backtest/parse.ts` — CSV → typed `MatchRow[]` (played-only, date-parsed).
- `lib/backtest/run.ts` — the roll + scoring + sweep, all pure (no I/O), so it is
  unit-testable on a small synthetic corpus.
- `scripts/backtest.ts` — the CLI: reads `data/intl_results.csv`, runs the sweep,
  prints the report, writes `docs/backtest-report.md`. Flags:
  - `--refine` — run the fine grid around the coarse best (default on).
  - `--no-friendlies` — exclude `tournament = "Friendly"` (they inflate draws and
    add noise); lets us see the fit with and without.
- `data/intl_results.csv` — the vendored corpus.
- `tests/backtest.test.ts` — parser correctness; log-loss rewards calibrated over
  miscalibrated probs; a synthetic corpus with a known built-in home edge is
  recovered in roughly the right direction.

### Tooling

- `package.json`: add `"backtest": "tsx scripts/backtest.ts"` and `tsx` as a
  **devDependency** (not bundled).

## Output

- Human-readable report to stdout.
- Same report written to `docs/backtest-report.md` so the recommendation lands in
  git and is reviewable in a diff.
- The harness **recommends**; it never edits the live constants. Changing
  `DRAW_NU` / `HOST_ADVANTAGE` / `K` is a separate commit made after we read the
  numbers and agree.

## Caveats baked into the report

- Home bump is fit on **international** non-neutral matches and assumed equal to
  WC host advantage.
- Friendlies are lower-intensity and draw-heavy; the `--no-friendlies` run shows
  the sensitivity.
- A single global Elo with one K is simpler than the app's per-confederation
  reality; the fit is a calibration of *this* model, not ground truth.

## Verification

- `npm run build` clean.
- Existing 39 tests green (defaults unchanged → identical behavior).
- New `tests/backtest.test.ts` passes.
- Run `npm run backtest` and read the recommended `(ν, host, K)` and the log-loss
  delta vs the current constants.
