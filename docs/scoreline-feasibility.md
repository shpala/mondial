# Feasibility: Exact-Score / Correct-Score Predictions

_Date: 2026-06-18 · Status: assessment (no code changes yet)_

**Question:** How hard would it be to add per-match exact-score predictions
(e.g. "most likely score 2–1"), and do we need another data source?

**Short answer:** Easy. The hard part — a calibrated, normalized scoreline
probability grid — is already written, tested, and out-of-sample validated in
this repo; it's just not surfaced to users. A credible v1 is roughly **1–1.5
days** of work with **no new data source**. The real risk is presentation
honesty, not engineering.

---

## 1. Bottom line

The hardest part of an exact-score feature already exists: `poissonJoint()` in
`lib/backtest/poisson.ts:49-70` produces a full normalized `P(i,j)` grid over
scorelines 0..10, built on the same `goalRates()` + `poissonPmf()` the
production Monte Carlo already uses. The goal model was fit on ~8k pre-2022
internationals (`GOAL_BASE=1.2`, `GOAL_GAMMA=575`) and validated out-of-sample
on the 64 WC2022 matches.

The grid simply has **zero production consumers** — it's referenced only by the
backtest module, its unit test, and `scripts/wc2022-backtest.ts`. So the work is
**promotion + UI**, not modelling.

Two optional upgrades exist — a Dixon-Coles draw correction (a few hours, no new
data) and a per-team attack/defense model (multi-day, fit from the CSV already
vendored). Neither is a prerequisite. **No new data source is required for any
tier worth building.**

The genuine risk is honesty: even a perfect model's single most-likely scoreline
sits at only ~8–14% probability, so the feature must be presented
probabilistically, never as a bare "2–1".

## 2. What already exists

The scoreline model is cleanly split into a **production** layer and a
**backtest** layer; the exact-score primitive sits one promotion away from
production.

**Production — `lib/scoreline.ts`** (framework-agnostic, no `server-only`,
importable client + server + tests):

- `goalRates(effHome, effAway)` (`:29-38`) — turns the host-adjusted Elo gap
  into two independent-Poisson goal means; geometric mean pinned at `GOAL_BASE`.
- `poissonPmf(lambda, k)` (`:22-26`) — exact per-side Poisson pmf.
- `GOAL_BASE=1.2 / GOAL_GAMMA=575` (`:18-19`) — single source of the calibrated
  constants.
- `samplePoisson` / `sampleScoreline` (`:41-84`) — used by the Monte Carlo sim.

**The exact-score grid already exists — but only in backtest —
`lib/backtest/poisson.ts`:**

- `poissonJoint(lambdaHome, lambdaAway)` (`:49-70`) — **the correct-score
  primitive**: full normalized `P(i,j)` grid, 0..10 × 0..10, sums to 1 (asserted
  by `tests/poisson.test.ts`). Product of two independent Poisson marginals,
  divided by total mass.
- `poissonOutcome` (`:20-43`) — 1X2 by summing the joint over home/draw/away
  regions.
- This module already **re-exports `goalRates`/`poissonPmf` from
  `lib/scoreline`** (`:9-11`) precisely so production and the harness can't
  drift — that is the exact promotion pattern to follow in reverse.

**Current production usage.** The scoreline math reaches users only indirectly:
`lib/montecarlo.ts` `sampleGroupScore` (`:59-72`) uses Davidson `outcomeProbs`
to pick home/draw/away, then `goalRates` + `sampleScoreline` to fill the
*margin* for goal-difference tiebreaks across the tournament sim (`:154-163`).
Users see only title odds (`app/bracket`, `app/teams/[id]`, `app/model` via
`components/TitleOddsTable`) and two-way win probabilities
(`predictWinProbability` on `MatchCard` and `app/matches/[id]/page.tsx`).
**No production code ever materializes a `P(i,j)` grid.**

**Calibration confidence.** `GOAL_BASE`/`GOAL_GAMMA` were fit on the ~8,131
pre-2022-11-20 tuples by minimizing one-step scoreline NLL and held out on the
64 WC2022 matches (`docs/wc2022-report.md`). The "Davidson + Poisson margin"
variant beat full-Poisson on exact-scoreline log-loss (3.0458 vs 3.0585), but
the paired bootstrap CI `[-0.0095, 0.0428]` **includes 0** — the edge is within
sampling noise on a single tournament. Good enough to ship a labelled
prediction; not strong enough to advertise as "beating the bookies".

## 3. Tiered options

| Tier | What the user gets | Effort | New data source? |
|---|---|---|---|
| **1 — MVP** | "Most likely score: 1–0 (13%)" + top-3 scorelines (+ optional heatmap) on the match page | ~0.5–1 day | **No** |
| **2 — Dixon-Coles** | Better-calibrated 0-0 / 1-1 / draw cells | ~0.5 day | **No** |
| **3 — Team-specific attack/defense** | Scorelines that reflect *style*, not just rating gap | ~3–5 days | **No** (existing CSV) |

### Tier 1 — MVP: surface what already exists

- **What the user gets:** On the match detail page, "Most likely score: 1–0
  (13%)" plus a top-3 ranked scorelines list with probabilities, optionally a
  compact heatmap on larger screens.
- **What to build:**
  1. Promote `poissonJoint` (and optionally `poissonOutcome`) into
     `lib/scoreline.ts`; have `lib/backtest/poisson.ts` re-export it (mirroring
     `:9-11`) so backtest + production share one impl.
  2. Add `predictScoreline(home, away)` → `{ mostLikely:{hg,ag,p}, topN:[...],
     grid? }` that calls `goalRates(effectiveRating(home), effectiveRating(away))`
     exactly as `lib/montecarlo.ts:67-70` does, then argmax/sorts over the grid.
  3. New `components/ScorelinePrediction.tsx` (server-renderable), wired into
     `app/matches/[id]/page.tsx` where `homeProb` is computed (guarded by the
     existing `predicted && realTeams` so empty bracket slots and finished
     matches are excluded).
- **Files to touch:** `lib/scoreline.ts`, `lib/backtest/poisson.ts` (re-export),
  `tests/poisson.test.ts` + `tests/scoreline.test.ts` (repoint imports, add a
  most-likely-score test), `app/matches/[id]/page.tsx`,
  `components/ScorelinePrediction.tsx` (new). Optional chip on
  `components/MatchCard.tsx`.
- **New data sources:** None.
- **Effort:** ~0.5–1 day (S).
- **Accuracy impact:** None vs the current model — pure surfacing. **Caveat:**
  the raw grid's modal cell can disagree with the Davidson 1X2 shown elsewhere
  (e.g. Davidson says draw most likely, the grid's modal cell is a home win).
  Cleanest fix: derive the displayed win% from `poissonOutcome` on the **same**
  grid so the scoreline and the 1X2 agree.

### Tier 2 — Better model: Dixon-Coles low-score correction

- **What the user gets:** Same UI, visibly better-calibrated 0-0 / 1-1 / draw
  probabilities — the most common and most-watched cells.
- **What to build:** Apply the Dixon-Coles `τ` multiplier to the four low-score
  cells before renormalizing in `poissonJoint`: `1 − λμρ` for (0,0), `1 + λρ`
  for (0,1), `1 + μρ` for (1,0), `1 − ρ` for (1,1), `1` elsewhere. Add a
  `GOAL_RHO` constant in `lib/model/constants.ts`. ρ can be seeded from the
  literature (~−0.03 to −0.15) for v1, then fit by extending the offline NLL
  grid search that already lives in `scripts/wc2022-backtest.ts:96-106`.
- **Files to touch:** `lib/scoreline.ts` (τ into `poissonJoint`),
  `lib/model/constants.ts` (new `GOAL_RHO`), `scripts/wc2022-backtest.ts` (fit ρ,
  add to the held-out scoreline log-loss check), `tests/poisson.test.ts` (grid
  still sums to 1 after correction).
- **New data sources:** None — fit ρ on the CSV already vendored.
- **Effort:** ~0.5 day (S). The correction itself is ~8 lines.
- **Accuracy impact:** Independent Poisson underestimates draws and low-score
  cells; the τ correction is the documented, cheapest fix. Best
  accuracy-per-hour upgrade available.

> **Implementation note (shipped).** Because `predictScoreline` conditions the
> grid on the calibrated Davidson outcome (Variant A), Davidson already fixes the
> home/draw/away *rate* (via `DRAW_NU`). So in the shipped path ρ does **not**
> raise the total draw probability — it redistributes mass *within* each result
> region (toward 0-0/1-1, away from 1-0/0-1). ρ does shift the draw rate only when
> the raw `poissonOutcome` is used unconditioned (e.g. in the backtest). Verified
> by computation during code review.
>
> ρ is now **fitted** on the pre-2022 train set to **−0.03** (improving the
> held-out exact-scoreline log-loss 3.0458 → 3.0440). `scripts/wc2022-backtest.ts`
> performs the fit via `lib/backtest/wc2022.ts`, and `tests/wc2022-backtest.test.ts`
> pins those numbers and asserts the shipped `GOAL_RHO` matches the fit.
> Knockout fixtures use `predictScoreline(..., { decisive: true })`, which zeroes
> the draw region (no draws in a knockout) and conditions on the two-outcome
> `winProbability` model the bracket already uses.

### Tier 3 — Team-specific attack/defense (and the xG question)

- **What the user gets:** Scorelines that reflect *style*, not just rating gap.
  Today, two matchups with the same Elo gap get identical λ
  (`lib/scoreline.ts:35-36`), so predicted scores look implausibly uniform
  across stylistically different fixtures.
- **What to build:** Fit per-team attack/defense (Maher/Dixon-Coles: attack +
  defense per team, global home advantage, ρ) by MLE over
  `data/intl_results.csv` in an offline script. **Bake the fitted coefficients
  into `lib/model/constants.ts`** — the CSV is offline-only (read via
  `readFileSync`/`import.meta.url` in scripts/tests only); a runtime
  `readFileSync` would break the server/edge bundle. Then `goalRates` gains a
  team-specific variant; reconcile it with the live Elo overlay
  (`lib/ratings.ts computeLiveRatings`) so the two strength notions don't fight.
  Extend `lib/teams/registry.ts` alias coverage to map the ~300 free-text CSV
  team names onto the 48 registry codes.
- **Files to touch:** an offline fit script (new MLE; note the existing scoreline
  grid-search lives in `scripts/wc2022-backtest.ts`, not `scripts/backtest.ts` —
  the latter only sweeps Davidson/Elo params), `lib/model/constants.ts` (fitted
  params), `lib/scoreline.ts` (team-aware λ), `lib/teams/registry.ts` (CSV name
  aliases), plus harness/test updates.
- **New data sources:** For attack/defense from **final scores: none** — the
  vendored CSV suffices. For an **xG-informed** model: yes, and it's a hard ask
  (see §4).
- **Effort:** ~3–5 days (M-to-L).
- **Accuracy impact:** Largest of the three, but incremental, and the
  correct-score *ceiling* is structural regardless (top scoreline still
  ~10–14%). Do this only if v1 predictions feel too uniform across stylistically
  different matchups.

## 4. Data-source verdict

**Tiers 1 and 2: no new data source. Full stop.** Everything needed is already
in the repo and already calibrated.

**Tier 3 (team-specific from final scores): the existing CSV is sufficient and
is the right choice.** `data/intl_results.csv` is a snapshot of the martj42
international-results dataset — men's full internationals, 2014→2026-06-14,
11,859 rows (~8,120 post-2018) across World Cup, qualifiers, continental
championships, Nations League, and friendlies; columns `date, home_team,
away_team, home_score, away_score, tournament, city, country, neutral`. That
breadth is exactly what a Dixon-Coles attack/defense fit needs. Pulling
football-data.org, API-Football, or TheSportsDB would add nothing over this for
scorelines.

**Tier 3 (xG-informed): don't, at hobby budget.** Free club-xG providers
(Understat) have no national-team coverage by design; FBref's advanced Opta
stats are no longer freely available; the only viable free national-team xG
(StatsBomb Open Data) covers only ~300 tournament-finals matches — no
qualifiers, no friendlies — far too thin to fit attack/defense across all 48
participants, with no confirmed 2026 release. Paid national-team xG options
(e.g. Sportmonks, TheStatsAPI) tend to cover only WC 2026 itself, not the
multi-year history a fit requires. **The vendored CSV is the correct and
sufficient foundation for every tier worth building.**

> The xG/market coverage points above come from web research and are external to
> this repo (not independently verifiable here), but they are consistent and not
> load-bearing for the recommended Tier 1 + Tier 2 work.

## 5. Validation

The harness to prove this is sound already exists — it just needs promoting out
of a one-off script plus a couple of added metrics.

- **Reuse the existing no-leakage backtest.** `scripts/wc2022-backtest.ts`
  already rolls Elo forward with no leakage, fits base/gamma on the
  pre-2022-11-20 train set, and computes **exact-scoreline log-loss** over the
  held-out 64 WC2022 matches (Variant A region-renormalized to Davidson vs
  Variant B raw joint). Promote those inline accumulators into a shared scorer
  (in `lib/scoreline.ts`) so the validated harness and production can't drift.
- **Add the missing metrics.** Today only log-loss/Brier exist. For an
  exact-score feature, add to `lib/backtest/run.ts`'s report: exact-hit rate
  (modal scoreline == actual), scoreline log-loss, and goal-difference MAE;
  optionally scoreline RPS. Pin them as regression guards in
  `tests/backtest-calibration.test.ts` (mirroring how it pins the 1X2 numbers:
  n=8105, log-loss 0.8961, Brier 0.5275).
- **Grade it live.** Extend `lib/modelreport.ts` `gradeOutcomes` to grade
  predicted vs actual scorelines on finished 2026 fixtures, surfaced on
  `app/model/page.tsx` alongside the existing 1X2 "Called N of M" section.
- **Define the grid edge cases.** The grid truncates at 10 goals/side and
  renormalizes; specify how a >10-goal actual is scored so log-loss doesn't
  spike on outliers.

### The honesty caveat (non-negotiable for the UI)

Exact-score is irreducibly noisy. Computed directly from this repo's own joint
grid: the single most-likely scoreline is only **~8–14%** probable (even
matchup: 1-1 ≈ 13.1%; clear favourite: 2-0/3-0 ≈ 14%), and the **top-5 cluster
reaches ~50–55%**. Real correct-score strike rates run in the low-teens per pick;
bookmakers carry a large overround on this market because no model beats the
noise. And on our own data the WC2022 scoreline edge over baseline was inside the
bootstrap CI.

So: **present probabilistically, never as a bare "2–1".** Always print the
probability beside the score, show top-3 (not just the modal cell), and add a
one-line note like "top score ≈ 13% likely; top 5 combined ≈ 52%". Consider
pairing with derived markets that are far less misleading and trivially summed
from the same grid — Over 2.5 %, BTTS %, clean-sheet % (these sit at ~55–70%).

## 6. Recommendation

**Ship Tier 1 + Tier 2 together as v1; defer Tier 3; skip xG.**

1. **Promote `poissonJoint` into `lib/scoreline.ts`** and re-export from
   `lib/backtest/poisson.ts` (one shared impl, no drift). Add `predictScoreline()`
   with a top-N extractor.
2. **Add the Dixon-Coles τ correction in the same pass** — ~8 lines, no new
   data, fixes the most visible miscalibration. Seed ρ from the literature for
   v1, then fit on the existing CSV via the harness.
3. **Render server-side on `app/matches/[id]/page.tsx`:** "Most likely score +
   top 3, each with its probability", plus the honesty note and ideally Over 2.5
   / BTTS / clean-sheet chips. Derive the displayed win% from `poissonOutcome` on
   the same grid so the scoreline and the 1X2 agree. Reuse the
   `predicted && realTeams` guard.
4. **Wire the validation in:** promote the WC2022 exact-scoreline scorer into the
   shared module, add hit-rate / scoreline-log-loss / GD-MAE to the backtest
   report, and pin them as regression tests.
5. **Defer Tier 3.** Only fit per-team attack/defense from `data/intl_results.csv`
   if, after v1 ships, predictions feel too uniform. **Do not pursue xG** — the
   free national-team coverage doesn't exist at the depth required.

**Net:** a credible, well-calibrated, honestly-presented exact-score feature is
roughly **1–1.5 days of work with no new data source**, because the model and
its out-of-sample validation already exist in the codebase.

---

### Appendix — verification provenance

This assessment was produced by a multi-agent workflow (4 codebase mappers +
3 web researchers → synthesis → adversarial critic). The critic re-read the
cited files and ran `grep`/`wc` to check every load-bearing claim; overall
confidence **high**. Verified directly against the code:

- `poissonJoint` exists at `lib/backtest/poisson.ts:49-70`, normalizes to 1
  (`tests/poisson.test.ts`), and has **zero** production consumers (grep).
- `lib/scoreline.ts` is production (no `server-only`) with the named exports and
  line numbers; consumed by `lib/montecarlo.ts:67-71`.
- `data/intl_results.csv`: 11,859 rows, 2014-01-01 → 2026-06-14, 8,120 post-2018,
  ~300 distinct team names; all Dixon-Coles input columns present.
- Calibration numbers (`base=1.2`, `gamma=575`, scoreline LL 3.0458 vs 3.0585,
  CI including 0) match `docs/wc2022-report.md` exactly.

Corrections already folded in above: the scoreline grid-search lives in
`scripts/wc2022-backtest.ts` (not `scripts/backtest.ts`); ~300 (not ~295) CSV
team names; and the modal/top-5 probability figures are the repo-computed values
(~8–14% / ~50–55%), slightly higher than the first-draft estimates.
