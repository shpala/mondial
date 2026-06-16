# Backtest calibration report

Corpus: `data/intl_results.csv` — 11840 played matches, 8105 scored (burn-in to 2018).

Home advantage is fit on non-neutral matches and assumed equal to World Cup
host advantage. A single global Elo/K is a simplification of the real model.

## Constants

| | ν (draw) | home (Elo) | K (gain) | log-loss | Brier | draw obs/pred |
| --- | --- | --- | --- | --- | --- | --- |
| **baseline** | — | — | — | 1.0503 | 0.6333 | — / 23.1% |
| **shipping** | 0.63 | 100 | 60 | 0.8982 | 0.5285 | 23.1% / 20.2% |
| **tuned** | 0.75 | 112.5 | 70 | 0.8951 | 0.5272 | 23.1% / 22.7% |

Log-loss improvement: **0.0032** (lower is better).
Skill vs no-skill baseline (always predict base rates): **0.1521** log-loss better.

## Reliability — shipping constants

| bucket | predicted | observed | n |
| --- | --- | --- | --- |
| 0–10% | 6.0% | 4.3% | 1867 |
| 10–20% | 15.8% | 14.6% | 4797 |
| 20–30% | 23.4% | 25.4% | 7634 |
| 30–40% | 34.8% | 32.4% | 2340 |
| 40–50% | 44.9% | 44.0% | 2218 |
| 50–60% | 55.1% | 52.3% | 1907 |
| 60–70% | 64.8% | 65.1% | 1564 |
| 70–80% | 74.7% | 76.9% | 1176 |
| 80–90% | 84.2% | 88.7% | 665 |
| 90–100% | 93.0% | 96.6% | 147 |

## Reliability — tuned constants

| bucket | predicted | observed | n |
| --- | --- | --- | --- |
| 0–10% | 5.8% | 4.8% | 2124 |
| 10–20% | 15.5% | 13.8% | 4092 |
| 20–30% | 25.1% | 25.5% | 8520 |
| 30–40% | 34.8% | 34.9% | 2250 |
| 40–50% | 44.8% | 44.4% | 2090 |
| 50–60% | 55.0% | 53.3% | 1833 |
| 60–70% | 64.8% | 65.9% | 1488 |
| 70–80% | 74.7% | 77.6% | 1135 |
| 80–90% | 84.2% | 89.0% | 637 |
| 90–100% | 93.0% | 95.9% | 146 |
