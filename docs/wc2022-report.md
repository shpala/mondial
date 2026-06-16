# Qatar 2022 World Cup — Out-of-Sample Backtest

Held-out test set: the **64** matches with `tournament === "FIFA World Cup"`
and date in [2022-11-20, 2022-12-18]. Ratings come only from strictly-earlier
matches (no leakage). The Poisson goal model's `base`/`gamma` were fit on the
8131 pre-2022-11-20 match tuples by minimizing one-step scoreline NLL.

Fitted Poisson params: **base = 1.2**, **gamma = 575** (train NLL = 24164.33).

## Outcome (1X2) metrics — lower is better

| Variant | Model | Log-loss | Brier |
|---|---|---|---|
| A | Davidson (nu=0.7, scale=400) | 1.0613 | 0.6286 |
| B | Independent Poisson | 1.0740 | 0.6314 |

A coin-flip-style baseline (uniform 1/3 each) has log-loss ln 3 ≈ 1.0986.

## Exact-scoreline log-loss (goals 0..10) — lower is better

| Variant | Scoreline log-loss |
|---|---|
| A | 3.0458 |
| B | 3.0585 |

Variant A reuses the independent-Poisson joint but renormalizes each outcome
region (home / draw / away) so the region masses match Davidson's 1X2 split.

Per-match predictions: `docs/wc2022-predictions.json` (64 rows).
