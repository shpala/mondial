# Prediction-algorithm bakeoff — tune on 2022, test on 2026

**Question.** Can we improve the win/draw/away model by tuning it on the *previous*
mondial (Qatar 2022, 64 matches) in a way that **generalizes to the already-played
2026 games** (12 matches so far)?

**Protocol (no leakage).** Elo is rolled once over the whole corpus in date order, so
every match is scored only from strictly-earlier results. Each algorithm tunes its
hyperparameters to minimise **wc2022** 1X2 log-loss, is then *frozen*, and read
out-of-sample on **wc2026**. The full ~8,100-match corpus (**full**) is a guardrail:
a real improvement must not regress it by more than ~+0.003 (else the model has just
flattened itself toward the coin-flip floor, which flatters a high-entropy 12-game
sample while getting worse at actual football). Harness: `scripts/explore/harness.ts`;
one script per algorithm: `scripts/explore/v-*.ts`. Lower log-loss is better; the
uniform-1/3 floor is ln3 = 1.0986.

**Baseline (shipped model — nu=0.8, home=87.5, k=45, scale=300):**
full **0.8959**, wc2022 **1.0666**, wc2026 **1.0929**.

## Scorecard (sorted by out-of-sample wc2026 log-loss)

| Algorithm | wc2022 | wc2026 (OOS) | full | Verdict |
|---|---|---|---|---|
| ordered-logit | 1.0144 | **1.0039** | 0.9302 | ✗ cut — wrecks full (+0.034): flattens everything |
| importance-k | 1.0513 | 1.0251 | 0.9148 | ✗ cut — full +0.019 |
| joint-grid | 1.0223 | 1.0288 | 0.9424 | ✗ cut — full +0.047 |
| per-outcome-power-scale | 1.0354 | 1.0323 | 0.9169 | ✗ cut — full +0.021 |
| mov-curve | 1.0287 | 1.0360 | 0.9285 | ✗ cut — full +0.033 |
| host-sweep | 1.0490 | 1.0411 | 0.9153 | ✗ cut — full +0.019 |
| shrink-baserate (global) | 1.0319 | 1.0463 | 0.9293 | ✗ cut — full +0.033 |
| temp-scale (global) | 1.0597 | 1.0617 | 0.9192 | ✗ cut — full +0.023 |
| **wc-flatten** | **1.0557** | **1.0619** | **0.8959** | ✅ **keep — full unchanged (0.0000)** |
| att-def-goals | 1.0484 | 1.0651 | 0.8988 | ✗ cut — novel feature inert/harmful |
| **wc-baserate-shrink** | **1.0359** | **1.0728** | 0.8987 | ✅ modify — shrinkage-only is clean |
| **recency-decay-k** (frozen) | 1.0610 | 1.0733 | 0.8988 | ✅ keep — at guardrail edge |
| rest-advantage-offset | 1.0560 | 1.0785 | 0.8990 | ✗ cut — rest feature inert |
| form-autocorr | 1.0534 | 1.0788 | 0.8976 | ◐ modify — EWMA inert; gain is constant re-tune |
| season-regress | 1.0689 | 1.0844 | 0.9008 | ✗ cut — no real gain |
| seed-prior | 1.0660 | 1.0935 | 0.8938 | ✗ cut — no effect |
| bivpois-1x2 | 1.0607 | 1.1095 | 0.8969 | ✗ cut — overfit; shared component lam3=0 |
| davidson-nu | 1.0640 | 1.1145 | 0.8975 | ✗ cut — overfit; 2022 & 2026 pull nu opposite ways |
| ensemble-blend | 1.0666 | 1.0929 | 0.8959 | ✗ cut — best blend = 0% Poisson (no change) |
| goal-refit (scoreline) | — | — | — | ✗ cut — shipped base/gamma/rho already optimal |

All "keep/modify" rows were adversarially re-run by a critic: numbers reproduced, no
leakage, and the 2022 gain *carries* to the untouched 2026 holdout.

## The one finding everything converges on

**The shipped model is over-confident on World Cup matches.** Eight different
algorithms posted big holdout gains, and *every* one of them did it by **flattening /
shrinking probabilities** — they only differ in whether they flattened World Cup
matches alone (legitimate) or the whole corpus (which is why most blew the guardrail).
At a World Cup the field is strength-compressed (only good teams qualify) and
single-match variance is high (fatigue, neutral venues, cagey knockouts), so the
favourite wins **less** often than the friendly-heavy global Elo curve implies. Two
secondary, consistent signals: the **host/home bump (87.5) is too large** — every clean
winner pulled it down to ~50–62 — and **draws are under-predicted** at WC (2026 drawObs
0.33 vs pred 0.25).

## Best improvement: `wc-flatten` — SHIPPED

**Status: implemented** as `WC_PREDICTION_SCALE = 500` in `lib/model/constants.ts`,
threaded through `predictWinProbability` / `predictScoreline` (`lib/prediction.ts`)
and the Monte Carlo `outcomeProbs` (`lib/montecarlo.ts`). The Elo rating update keeps
`LOGISTIC_SCALE = 300`. Guarded by `tests/wc-flatten-backtest.test.ts` (pins
wc2022 1.0666→1.0557 and the out-of-sample 2026 gain), evaluator
`lib/backtest/wcflatten.ts`.

Use a **flatter logistic scale for World Cup matches only**, leaving the Elo rating
update (scale 300) and the rest of the corpus untouched.

- wc2022 1.0666 → **1.0557** (−0.0109, the tuning target)
- wc2026 1.0929 → **1.0619** (−0.0310, **out-of-sample** — the real test)
- full 0.8959 → **0.8959** (zero cost — flattening is applied to WC matches only)
- Tuned `scaleWC ≈ 509` on 2022; the 2026 optimum (~550–600) sits right next to it, and
  the curve has a genuine interior minimum (flattening all the way to uniform is *worse*
  than baseline), so it is real calibration, not a degenerate move toward the floor.

Concretely: keep `LOGISTIC_SCALE = 300` for the live-Elo update, but convert rating
gaps to displayed win/draw/away probabilities with `WC_PREDICTION_SCALE ≈ 450–500`.
Because the live app predicts *only* 2026 World Cup fixtures, this simply makes every
bracket/match probability less extreme and better calibrated (e.g. an 82% favourite
becomes ~72%). Optional light layer: shrink WC probabilities ~20% toward the WC base
rate (`wc-baserate-shrink`) to also lift the under-predicted draw rate.

**Caveat.** wc2026 is only 12 games (high variance); read the −0.031 as directional, not
decisive. The corpus auto-updates as 2026 progresses — re-run the bakeoff to re-fit
`WC_PREDICTION_SCALE` once the group stage completes.
