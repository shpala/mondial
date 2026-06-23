# Docs

Background notes for Mondial. **Canonical** docs describe what ships; **research**
docs are the experiment record behind those choices (kept so the dead ends don't get
re-run).

| Doc | Kind | What it covers |
| --- | --- | --- |
| [`model-research.md`](model-research.md) | research | The full log of what we tried (classical ML, neural nets, match-type features, alternative rating seeds), what we chose, and why. Start here. |
| [`algo-bakeoff.md`](algo-bakeoff.md) | research | Prediction-algorithm bake-off — tune on the 2022 World Cup, test out-of-sample on the played 2026 games. Where `wc-flatten` was selected. |
| [`backtest-report.md`](backtest-report.md) | canonical | Calibration backtest of the shipped constants over the full corpus (log-loss, Brier, reliability table). Regenerate with `npm run backtest`. |
| [`odds-blend.md`](odds-blend.md) | research | Validation of the optional betting-market odds blend (off by default). |
| [`scoreline-feasibility.md`](scoreline-feasibility.md) | research | Whether richer scoreline models / new data sources are worth it for the Dixon–Coles layer. |
| [`wc2022-report.md`](wc2022-report.md) | research | Out-of-sample 2022 World Cup bakeoff (Davidson + Poisson margin vs full-Poisson), with a paired bootstrap CI. |
| [`wc2022-predictions.json`](wc2022-predictions.json) | data | The 2022 World Cup predictions used by that report. |
| [`research/ml-bakeoff.ipynb`](research/ml-bakeoff.ipynb) | research | Zero-setup Colab that reproduces the Python ML comparison from `model-research.md`. |

The reproducible scripts behind the research docs live in `scripts/explore/` (TypeScript
algorithm experiments) and `scripts/explore/ml/` (Python ML experiments — see its
[`requirements.txt`](../scripts/explore/ml/requirements.txt)).
