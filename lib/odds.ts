// Market-odds → probabilities, and the market/model blend.
//
// An offline backtest on ~9,000 top-5-league matches with real Pinnacle closing
// odds (scripts/explore/ml/odds_blend.py) found the market is decisively sharper
// than our Elo rating model — log-loss 0.961 (market) vs 0.987 (model) — and the
// optimal blend is essentially PURE MARKET (log-loss falls monotonically as the
// market weight → 1). So when a fixture has market odds we lean almost entirely on
// them; the Elo-Davidson model is the fallback when odds are absent. A small model
// weight is kept only as a hedge against a stale or outlier live quote.
//
// Pure — no I/O, no framework. Safe to import anywhere.

import type { MatchOutcome } from "@/lib/types";

export interface OutcomeProbs {
  home: number;
  draw: number;
  away: number;
}

/**
 * Market weight for the blend. 0.9 ≈ market-dominant with a light model hedge —
 * the backtest's optimum was 1.0 but the 0.9→1.0 gain is negligible (~0.001),
 * while keeping 10% model guards against a single book pricing a match badly.
 * 1.0 = trust the market completely; 0 = ignore it.
 */
export const MARKET_WEIGHT = 0.9;

/**
 * De-vig decimal 1X2 odds into a proper probability distribution by proportional
 * normalisation (divide each implied 1/odds by the booksum/overround). Returns
 * null if any odd is missing or ≤ 1 (no information / arbitrage artefact).
 */
export function impliedProbabilities(
  oddsHome: number,
  oddsDraw: number,
  oddsAway: number,
): OutcomeProbs | null {
  const valid = (o: number) => Number.isFinite(o) && o > 1;
  if (!valid(oddsHome) || !valid(oddsDraw) || !valid(oddsAway)) return null;
  const h = 1 / oddsHome;
  const d = 1 / oddsDraw;
  const a = 1 / oddsAway;
  const z = h + d + a; // the overround (>1); dividing it out removes the vig
  return { home: h / z, draw: d / z, away: a / z };
}

/**
 * Average several books' de-vigged probabilities into one consensus (each input
 * already sums to 1, so the mean does too). Returns null for an empty list.
 */
export function consensusProbabilities(books: OutcomeProbs[]): OutcomeProbs | null {
  if (!books.length) return null;
  const sum = books.reduce(
    (acc, b) => ({ home: acc.home + b.home, draw: acc.draw + b.draw, away: acc.away + b.away }),
    { home: 0, draw: 0, away: 0 },
  );
  const n = books.length;
  return { home: sum.home / n, draw: sum.draw / n, away: sum.away / n };
}

/**
 * Blend the calibrated model outcome with the market consensus. Linear pool
 * (the backtest's best blend was linear, market-weighted); both inputs sum to 1,
 * so the result does too. `weight` is the market share (defaults to MARKET_WEIGHT).
 */
export function blendOutcome(
  model: OutcomeProbs,
  market: OutcomeProbs,
  weight: number = MARKET_WEIGHT,
): OutcomeProbs {
  const w = Math.min(1, Math.max(0, weight));
  return {
    home: (1 - w) * model.home + w * market.home,
    draw: (1 - w) * model.draw + w * market.draw,
    away: (1 - w) * model.away + w * market.away,
  };
}

/** Two-outcome (knockout) home win probability from a blended 1X2, splitting the
 *  draw mass proportionally between the decisive outcomes. */
export function decisiveHomeProb(p: OutcomeProbs): number {
  const decisive = p.home + p.away;
  return decisive > 0 ? p.home / decisive : 0.5;
}

/** The most likely 1X2 label, for display. */
export function favouredOutcome(p: OutcomeProbs): MatchOutcome {
  if (p.home >= p.draw && p.home >= p.away) return "home";
  return p.away >= p.draw ? "away" : "draw";
}
