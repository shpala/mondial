# Can deep learning beat the shipped model? — literature + a live test

**Question.** For Mondial's task — pre-kickoff 1X2 probabilities for *international / World
Cup* matches, on small samples, a strength-compressed field, and **no free national-team
event/tracking data** — would a deep-learning model beat the shipped **World Football Elo →
Davidson 1X2 → Dixon-Coles** pipeline (+ `WC_PREDICTION_SCALE` flattening, optional odds blend)?

**Verdict: no reliable gain.** Across the most relevant published benchmarks *and* a live re-run
of this repo's own neural nets on the 2014–2026 corpus, the win is **calibration and rating/feature
quality, not model capacity**. Extra neural capacity either fails to transfer to the World Cup field
or, where it helps, only re-learns the flattening the app already ships. This corroborates
[`model-research.md`](../model-research.md) §2–3.

## 1. Live test — this repo's PyTorch nets on the current corpus

Re-ran the three committed nets (`scripts/explore/ml/m_nn-*.py`) on Colab against the leakage-free
splits. Lower log-loss is better; **the bar is the shipped Elo–Davidson baseline**.

| Model | `test_general` (n=3,590) | `wc2022` (n=64) | `wc2026` (n=12) | train→test gap |
| --- | --- | --- | --- | --- |
| **Elo–Davidson baseline** | **0.8819** | **1.0666** | **1.0929** | — |
| MLP (feedforward) | 0.8680 ✓ | 1.0799 ✗ | 1.0308 | +0.028 |
| Residual-over-Elo net | 0.8670 ✓ | 1.0516 ✓ | 1.0396 | −0.038 |
| Team-embedding net | 0.8986 ✗ | 1.1249 ✗ | 0.7747 | **+0.093 (overfit)** |

Reading:
- On the **broad corpus** the MLP/residual nets reach ~0.867 — real but small (~0.013), matching the
  prior in-project finding.
- On the **larger, more reliable World Cup holdout** (`wc2022`, n=64) the MLP is **worse** than the
  baseline and the embedding net is **much worse**. Only the residual net edges it (−0.015) — and that
  net's entire design is "start from Elo, learn a small correction," so its gain *is* the flattening
  (≈ `WC_PREDICTION_SCALE`), not a new signal.
- The **team-embedding net overfits** team identities (train 0.806 vs test 0.899, gap +0.093) and
  loses on both broad and `wc2022`; its `wc2026` 0.775 is noise (n=12, the most-overfit model).
- `wc2026` (n=12) is too small to rank models — the numbers swing wildly and sit inside the noise band
  (see [`algo-bakeoff.md`](../algo-bakeoff.md); per-game SE ≈ 0.12).

## 2. What the published literature says

A fan-out, adversarially-verified deep-research pass (24/25 claims confirmed 3-0) converges on the
same conclusion:

- **National-team World Cup data.** Groll et al. on 250 WC matches (2002–2014): a plain random forest
  *lost* to bookmakers and to a Poisson ranking on RPS; only **RF + bivariate-Poisson team-abilities
  (Elo-like)** reached RPS 0.187 vs 0.188 bookmakers — a 0.001 edge. EURO-2020 state-of-the-art is
  likewise an RF over *ratings*, not a deep net. ([arXiv 1806.03208](https://arxiv.org/pdf/1806.03208),
  [2106.05799](https://arxiv.org/pdf/2106.05799))
- **2023 Soccer Prediction Challenge** (goals-only Open International Soccer Database — the regime
  closest to national-team data). Best live submission: **kNN on engineered ratings**. On the 1X2/RPS
  task, **CatBoost + pi-ratings won (0.2085)** ahead of the best deep model (Inception+TE+MLP, 0.2098);
  the transformer was picked only for *lower variance, not lower mean loss*. Organizers: *"relatively
  simple learning algorithms perform remarkably well compared to more complex algorithms… the key lies
  in how well soccer domain knowledge can be incorporated."*
  ([Springer 06625-9](https://link.springer.com/article/10.1007/s10994-024-06625-9),
  [arXiv 2309.14807](https://arxiv.org/abs/2309.14807),
  [Springer 06608-w](https://link.springer.com/article/10.1007/s10994-024-06608-w))
- **2024 surveys / controlled studies.** GBTs (CatBoost) on pi-ratings are *"currently the
  best-performing models on datasets containing only goals as features"*; a neural net is *"comparable
  to a Poisson model in cross-entropy"* and *"the choice of model is less important than the quality of
  the data and features."* Overfitting is *"particularly pronounced in sports with a limited number of
  games"* — i.e. the World Cup. ([arXiv 2403.07669](https://arxiv.org/abs/2403.07669),
  [2408.08331](https://arxiv.org/pdf/2408.08331))
- **Where deep learning *does* clearly win:** real-time *in-game* outcome prediction from player-level
  passing-network data (graph-attention nets) on big club leagues — an easier (mid-match) task on data
  that **does not exist for free in national-team football**, so it does not transfer here.
  ([J. Big Data 2025](https://link.springer.com/article/10.1186/s40537-025-01203-9))

## 3. If anything is worth trying

Not a raw deep net. The only ML that reaches the rating/bookmaker bar on goals-only data does so by
feeding **ratings in as features**: a regularized **gradient-boosted tree (CatBoost) over Mondial's Elo
(+ optional bookmaker-consensus) ratings** — the Groll/Berrar/pi-ratings pattern. Even then the realistic
upside is a marginal, likely within-noise RPS gain. A deep net on team identities is precisely what the
live test above (and `model-research.md`) shows overfits and fails out-of-sample on the World Cup.

## 4. Caveats

- Most of the *strongest* published evidence is **club** football; it supports the "capacity isn't the
  win" thesis by analogy plus this repo's own national-team holdout, not by direct national-team
  deep-net-vs-Elo measurement (there are very few such head-to-heads).
- The field is fast-moving (2023–2026); a future free national-team **event/tracking** dataset could
  change the calculus — that's the one data regime where DL has a demonstrated edge.
- RPS and log-loss/cross-entropy are related but distinct; cross-paper magnitudes are indicative, not
  exact. One xG/tracking RPS figure (0.197) was refuted 0-3 and excluded.

**Reproduce:** `scripts/explore/ml/m_nn-mlp-torch.py`, `m_nn-residual-torch.py`,
`m_nn-embeddings-torch.py` (need `pip install torch` + `build_features.py`, and `augment_teams.py` for
the embedding net). The graphs in [`research/ml-bakeoff.ipynb`](ml-bakeoff.ipynb) tell the same story.
