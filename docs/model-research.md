# Model research log — what we tried, what we chose, and why

The shipped prediction model is deliberately simple: **World Football Elo →
Davidson 1X2 → Dixon-Coles Poisson scorelines**, with a World-Cup-specific
probability flattening and an optional betting-market overlay. This log records
the alternatives we tested to see if anything did better, so the choice to keep it
simple is on the record (and so we don't re-run the same dead ends).

> **Reproduce:** the harnesses and per-experiment scripts live in
> `scripts/explore/` (TS) and `scripts/explore/ml/` (Python; `build_features.py`
> builds the leakage-free feature matrix, `rc_grade.py` grades the report card,
> `odds_blend.py` validates the market blend). A throwaway venv with
> numpy/pandas/scikit-learn/xgboost/torch is required for the Python ones.

## TL;DR — what shipped

| Change | Status | Why |
|---|---|---|
| **WC-flatten** (`WC_PREDICTION_SCALE`) | ✅ shipped | World Cup favourites win *less* than the global Elo curve implies; a flatter display scale improved both the 2022 and played-2026 holdouts at zero cost to the rest of the corpus. (`docs/algo-bakeoff.md`) |
| **Market-odds blend** | ✅ shipped, **off by default** | Closing odds beat the rating model by ~0.026 log-loss; the only external signal that genuinely sharpens predictions. Needs `ODDS_API_KEY`. (`docs/odds-blend.md`) |
| Everything below | ❌ not shipped | None reliably beats the calibrated Elo-Davidson model **out-of-sample on World Cup matches**. |

## Evaluation protocol (no leakage)

Elo is rolled once over ~11.8k internationals (2014–2026) in date order, so every
match is scored only from strictly-earlier results. Models are **tuned on the 2022
World Cup** (64 matches), frozen, and read **out-of-sample on the played 2026 games**
plus a large general 2023+ holdout. Multiclass **log-loss** is the metric (uniform
floor ln 3 ≈ 1.099). The shipped Elo-Davidson is the bar to beat.

## What we tried

### 1. Match-type features (qualifier / continental / friendly / finals)
**No measurable gain.** Adding tournament-type one-hots + a match-importance term
to the model moved 1X2 log-loss by −0.0003 (noise) on the reliable holdout and
*hurt* both World Cup splits. In every tree model the `cat_*` features ranked at the
bottom of importance. Match type *does* matter for the rating **update** (down-
weighting friendlies), but that was tested separately and blew the full-corpus
guardrail. The Elo rating already absorbs match context.

### 2. Classical ML — logistic, random forest, SVM, HistGBM, XGBoost
Trained on a shared leakage-free feature matrix (rating gap, form, rest, goal
momentum, match type). On the large out-of-sample set vs the **0.882** baseline:

| Model | OOS log-loss | Verdict |
|---|---|---|
| Logistic regression (all features) | 0.870 | beats on the broad corpus, but the gain is the `games_played` (data-reliability) feature — meaningless for the uniformly high-cap WC field |
| Random forest (calibrated) | 0.876 | marginal |
| XGBoost / HistGBM (calibrated) | 0.90–0.91 | over-confident; lose even after calibration |
| SVM (RBF) | 0.96 | far worse |

Tree/boosting/kernel models need probability calibration and **still lose**; the
signal is dominated by the rating gap, which Elo already encodes optimally. The
apparent logistic win lives on non-WC games the app never serves.

### 3. Neural networks
A PyTorch MLP and a residual-over-Elo net posted the best raw numbers (~0.867–0.868
on the broad set), but the **team-embedding net overfit team identities** (Elo
learns team strength more efficiently from 8k games), and the residual net's gain
was the same calibration effect, not a new signal. None reliably beats Elo-Davidson
on the *World Cup* holdouts, which are what the app predicts.

### 4. Other corpus-derived features — recent form, rest days, shrinkage
Real but tiny on the broad corpus, and they **do not transfer to World Cup
predictions**: the WC field is uniformly high-cap, so low-data shrinkage only
removes real rating signal, and recent form is already in the registry seed. Tuned
to help the WC, the optimum was to add nothing.

### 5. Pre-cutoff seed sources for the `/model` report card
Can a different *pre-tournament rating* beat the registry's World Football Elo on
the report card? Tested registry vs corpus-rolled Elo vs FIFA-ranking blends vs
confederation shrinkage vs seed-refresh, each with a paired bootstrap (`rc_*.py`):

- **The registry (World Football Elo) is the best available seed.** It scores
  **0.959** on the 2026 report card; corpus-rolled Elo (1.062) is *significantly
  worse* (the only result that cleared significance), and no blend recovers the gap.
- **The 2026 report card can't validate a tweak anyway:** with 12 games the per-game
  SE is **0.118**, so a model must improve log-loss by **>0.24** to be distinguishable.
  No scale, host-advantage, draw-weight, FIFA-blend, or shrinkage change was
  significant on either the 2026 or the larger 2022 sample.
- One genuine structural hint (not yet actionable): the host bump (87.5) is
  calibrated for a *single dominant* host (Qatar 2022) and may not transfer cleanly
  to three 2026 co-hosts. Worth revisiting once more host games are played.

### 6. External data (research scout, by expected value)
Ranked for a free 2026 app: **betting-market odds** (high — shipped), per-team
attack/defence from the existing corpus (high — a future scoreline upgrade), FIFA
ranking (low — known inferior to Elo), squad market value and club-Elo ensembles
(medium, friction-heavy), xG (no free national-team coverage).

### 7. martj42 companion data — goalscorers & shootouts

The shipped corpus (`data/intl_results.csv`) is the `results.csv` from
[martj42/international_results](https://github.com/martj42/international_results). That repo
also ships **`goalscorers.csv`** (per-goal: scorer, minute, penalty, own-goal) and
**`shootouts.csv`** (penalty-shootout winners). We tested whether either improves predictions:

- **goalscorers.csv → no.** Leakage-free per-team traits (career penalty-share and late-goal
  share, computed strictly pre-match) added to the logistic model moved 1X2 log-loss the
  *wrong* way on every split (test_general +0.0009, wc2022 +0.0014, wc2026 +0.0011). Goal
  metadata describes *how* goals happened, not team strength — which Elo already encodes — so
  it carries no extra outcome signal. (Consistent with §1–4 and
  [`deep-learning-literature.md`](deep-learning-literature.md): the win is calibration and
  rating quality, not more features.)
- **shootouts.csv → not for 1X2, but it informs one *bracket-realism* change.** A penalty
  shootout is ≈ a coin flip: across 678 international shootouts the home side wins 54.1% and
  the first kicker 53.1% — small venue/order edges, **no team-strength edge**. The shipped
  knockout model collapses a drawn tie *proportionally* (`predictWinProbability` = a/(a+b),
  handing the favourite the draw mass). The refinement (`knockoutAdvanceProbability`,
  `KNOCKOUT_SHOOTOUT_SPLIT = 0.5`) splits the draw 50/50 instead, so knockout advancement
  flattens toward the underdog (a +400-Elo favourite's advance drops 86.3% → 78.5%). The
  *shown* bracket winner is unchanged (favourite still > 0.5); only the probability and the
  Monte Carlo title odds soften. It ships **behind a flag, `KNOCKOUT_SHOOTOUT_ENABLED`, off by
  default** (live keeps the proportional model) because it's a modelling-realism choice,
  **not** a backtestable accuracy gain — the corpus has no knockout-advancement label, and the
  2026 knockouts haven't been played. Flip the flag to evaluate it.
- **former_names.csv** (Dahomey → Benin, etc.) is a reconciliation aid; nearly every rename
  predates the 2014–2026 corpus window, so it's negligible here.

## What we chose, and why

- **Keep the simple Elo + Davidson + Dixon-Coles model.** Across match-type
  features, four classical ML families, and three neural-net architectures, nothing
  reliably beat it out-of-sample on World Cup matches — the field is compressed and
  the sample is small, so extra complexity fits noise.
- **Ship WC-flatten** — the one model change that demonstrably helps both World Cup
  holdouts at no cost elsewhere.
- **Ship the market-odds blend, off by default** — the only external signal the
  literature and our own backtest agree is sharper than the model.
- **Leave the report-card seeds as the registry's World Football Elo** — confirmed
  the best available pre-cutoff rating.

## Caveats / known issues in the research scripts

- `scripts/explore/ml/m_nn-residual-torch.py` reimplements the Davidson baseline with
  `e^(·)` and a flat draw term instead of the shipped `10^(·)` with `ν·√(ab)`; its
  internal "baseline" is therefore wrong, but the trained net was verified against
  the *correct* 0.882 baseline, so the conclusion (no reliable gain) stands.
- The report-card scripts (`rc_*.py`) read a committed seed snapshot
  (`registry_ratings.json`, beside the scripts) and reproduce from any checkout. The
  feature-matrix runners (`m_*.py`) still hard-code an absolute path to the
  (gitignored) `features.csv`, so reproduce those by running `build_features.py` first
  and pointing the path at the generated file. All are a research record, not
  production code (and are excluded from lint).

Whenever the prediction algorithm changes, update both this log and the user-facing
`/methodology` page (`app/methodology/page.tsx`).
