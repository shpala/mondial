# Backtest calibration report

Corpus: `data/intl_results.csv` — 11840 played matches, 8105 scored (burn-in to 2018).

Home advantage is fit on non-neutral matches and assumed equal to World Cup
host advantage. A single global Elo/K is a simplification of the real model.

## Constants

| | ν (draw) | home (Elo) | K (gain) | scale | log-loss | Brier | draw obs/pred |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **baseline** | — | — | — | — | 1.0503 | 0.6333 | — / 23.1% |
| **shipping** | 0.8 | 87.5 | 45 | 300 | 0.8959 | 0.5277 | 23.1% / 24.1% |
| **tuned** | 0.8 | 62.5 | 35 | 225 | 0.8925 | 0.5259 | 23.1% / 23.0% |

Log-loss improvement: **0.0034** (lower is better).
Skill vs no-skill baseline (always predict base rates): **0.1544** log-loss better.

## Reliability — shipping constants

| bucket | predicted | observed | n |
| --- | --- | --- | --- |
| 0–10% | 5.9% | 4.7% | 1943 |
| 10–20% | 15.5% | 12.7% | 3798 |
| 20–30% | 25.8% | 25.2% | 9066 |
| 30–40% | 34.9% | 36.0% | 2398 |
| 40–50% | 44.8% | 45.3% | 2121 |
| 50–60% | 54.8% | 55.9% | 1883 |
| 60–70% | 64.8% | 67.4% | 1463 |
| 70–80% | 74.7% | 80.1% | 1017 |
| 80–90% | 84.1% | 89.4% | 520 |
| 90–100% | 93.0% | 97.2% | 106 |

## Reliability — tuned constants

| bucket | predicted | observed | n |
| --- | --- | --- | --- |
| 0–10% | 5.4% | 5.5% | 2685 |
| 10–20% | 15.3% | 15.1% | 4077 |
| 20–30% | 25.7% | 26.1% | 8246 |
| 30–40% | 34.9% | 35.6% | 2057 |
| 40–50% | 44.9% | 45.5% | 1911 |
| 50–60% | 55.0% | 51.7% | 1676 |
| 60–70% | 64.8% | 63.2% | 1452 |
| 70–80% | 74.8% | 75.9% | 1169 |
| 80–90% | 84.4% | 85.5% | 795 |
| 90–100% | 93.3% | 95.1% | 247 |
