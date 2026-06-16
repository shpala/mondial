# Backtest calibration report

Corpus: `data/intl_results.csv` — 11840 played matches, 8105 scored (burn-in to 2018).

Home advantage is fit on non-neutral matches and assumed equal to World Cup
host advantage. A single global Elo/K is a simplification of the real model.

## Constants

| | ν (draw) | home (Elo) | K (gain) | scale | log-loss | Brier | draw obs/pred |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **baseline** | — | — | — | — | 1.0503 | 0.6333 | — / 23.1% |
| **shipping** | 0.7 | 100 | 60 | 400 | 0.8961 | 0.5275 | 23.1% / 21.9% |
| **tuned** | 0.8 | 87.5 | 45 | 300 | 0.8925 | 0.5259 | 23.1% / 23.1% |

Log-loss improvement: **0.0036** (lower is better).
Skill vs no-skill baseline (always predict base rates): **0.1542** log-loss better.

## Reliability — shipping constants

| bucket | predicted | observed | n |
| --- | --- | --- | --- |
| 0–10% | 6.0% | 4.3% | 1841 |
| 10–20% | 15.7% | 13.4% | 4204 |
| 20–30% | 24.4% | 25.2% | 8452 |
| 30–40% | 34.9% | 33.7% | 2380 |
| 40–50% | 44.8% | 44.7% | 2208 |
| 50–60% | 54.9% | 53.9% | 1905 |
| 60–70% | 64.7% | 66.4% | 1529 |
| 70–80% | 74.7% | 78.6% | 1090 |
| 80–90% | 84.1% | 89.7% | 584 |
| 90–100% | 93.0% | 97.5% | 122 |

## Reliability — tuned constants

| bucket | predicted | observed | n |
| --- | --- | --- | --- |
| 0–10% | 5.4% | 5.5% | 2663 |
| 10–20% | 15.4% | 15.0% | 4068 |
| 20–30% | 25.7% | 26.1% | 8274 |
| 30–40% | 34.9% | 35.5% | 2052 |
| 40–50% | 44.8% | 45.3% | 1912 |
| 50–60% | 54.9% | 51.4% | 1700 |
| 60–70% | 64.8% | 63.7% | 1459 |
| 70–80% | 74.7% | 76.2% | 1157 |
| 80–90% | 84.4% | 85.9% | 792 |
| 90–100% | 93.3% | 95.0% | 238 |
