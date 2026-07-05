# Market-odds blend

The research bake-off (`docs/algo-bakeoff.md`, `scripts/explore/ml/`) found that no
model family (logistic, random forest, SVM, boosted trees, neural nets) and no
corpus-derived feature (match type, recent form, shrinkage) meaningfully beats the
shipped Elo-Davidson model **on World Cup matches**. The one lever that does is
**external data — betting-market odds.**

## Offline validation

`scripts/explore/ml/odds_blend.py` backtests the blend on ~9,000 top-5-league
matches with real **Pinnacle closing odds** (no free historical World Cup odds
exist). On a 2,695-match held-out time split (multiclass log-loss, lower better):

| Predictor | log-loss |
|---|---|
| no-skill (base rates) | 1.0787 |
| Elo rating model (logistic) | 0.9869 |
| **market (de-vigged Pinnacle)** | **0.9607** |

The market beats the rating model by **0.026**, and the optimal model↔market blend
is **pure market** — log-loss falls monotonically as the market weight → 1. So this
is less a "blend" than "**use the de-vigged market when available, fall back to the
model otherwise**". We keep a small (10%) model weight only as a hedge against a
stale or outlier live quote (`MARKET_WEIGHT = 0.9` in `lib/odds.ts`).

Caveat: the validation used *closing* odds (sharpest). A companion app shows
predictions earlier, where current odds are a touch less sharp — still well ahead
of the model, but expect a slightly smaller real-world edge.

## How it's wired (off by default)

- `lib/odds.ts` — pure de-vig (`impliedProbabilities`), multi-book consensus, and
  the linear `blendOutcome`. Fully unit-tested (`tests/odds.test.ts`).
- `lib/api/sources/oddsapi.ts` — fetches 1X2 odds from The Odds API (free tier,
  500 req/mo), resolves team names via the registry, returns a de-vigged consensus
  per fixture. **Returns an empty map unless `ODDS_API_KEY` is set**, so with no key
  the app behaves exactly as before.
- `lib/data/index.ts` — overlays the consensus onto upcoming real-team fixtures
  (`Fixture.marketProbs`), mirroring the ESPN live-score overlay.
- `lib/displayProbs.ts` — `fixtureHomeWinProb` / `fixtureOutcomeProbs` blend the
  market with the model when odds are present; with no odds they equal the pure
  model exactly. Used by `MatchCard` and the match page (the card shows a small
  "◆ market" label when the probability is market-informed).

The exact-score grid on the match page stays model-based for now (the market gives
1X2, not scorelines) — a future refinement is to condition the scoreline grid on
the blended outcome.

## To activate

**The blend is ON by default, with no key.** ESPN's scoreboard — the same
payload the app already polls for live scores — carries a DraftKings 1X2
moneyline (including the draw) per upcoming match. `lib/api/sources/espn.ts`
parses it into decimal odds and the facade de-vigs it with
`impliedProbabilities` — zero extra requests, zero keys, and the same ToS
posture as the rest of the ESPN usage. Being a single book it carries a normal
~5% overround that de-vigs cleanly; a July-2026 survey of free odds sources
(documented free tiers, exchanges, prediction markets, public sports-site
JSON) found no better keyless, server-fetchable option with a draw price.

Optionally, a **multi-book consensus** from The Odds API can outrank the
single-book quote:

1. Get a free key at https://the-odds-api.com.
2. Set `ODDS_API_KEY` (Vercel project env, all environments).
3. Optional overrides: `ODDS_API_SPORT` (default `soccer_fifa_world_cup`),
   `ODDS_API_REGIONS` (default `eu` — The Odds API bills one credit per region
   per call, so every extra region multiplies the spend against the 500/month
   free tier).

The Odds API response is cached ~2h (12 calls/day ≈ 360 credits/month at one
region). On an upstream failure the adapter throws and the facade keeps serving
the last-good odds it saw — bounded by a 24h staleness cap and a 5-minute retry
backoff — instead of caching an empty map for a whole revalidate period
(`lib/data/index.ts`, `marketOdds`).
