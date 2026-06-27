// Out-of-sample evaluation of the World Cup prediction-flattening
// (WC_PREDICTION_SCALE), as a pure function so the regression test and any offline
// script share one implementation and can't drift. See docs/algo-bakeoff.md.
//
// No leakage: Elo is rolled once over the whole corpus in date order with the SHIPPED
// rating dynamics (the real lib/ratings.eloUpdate at LOGISTIC_SCALE, host bump
// HOST_ADVANTAGE, gain ELO_K), recording each match's PRE-match rating tuple before
// applying its own update. The two World Cup holdouts are then scored with the
// Davidson 1X2 model at two spreads:
//   - "baseline" : LOGISTIC_SCALE (300) — the rating-system scale
//   - "shipped"  : WC_PREDICTION_SCALE (500) — the flatter scale the live app displays
// The flattening touches only how rating gaps are turned into displayed probabilities;
// the rating roll is identical for both, so the comparison is apples-to-apples.

import { parseResults } from "@/lib/backtest/parse";
import { davidsonProbs } from "@/lib/prediction";
import { eloUpdate } from "@/lib/ratings";
import { outcomeOf } from "@/lib/outcome";
import type { MatchOutcome } from "@/lib/types";
import {
  DRAW_NU,
  HOST_ADVANTAGE,
  LOGISTIC_SCALE,
  WC_PREDICTION_SCALE,
} from "@/lib/model/constants";

const INIT = 1500;
const WC2022_START = "2022-11-20";
const WC2022_END = "2022-12-18";
const WC2026_START = "2026-06-01";
const WC2026_END = "2026-12-31";

interface Tuple {
  date: string;
  effHome: number; // host/home-adjusted PRE-match rating (only strictly-earlier results)
  effAway: number;
  hg: number;
  ag: number;
}

export interface WindowScore {
  n: number;
  /** Davidson 1X2 log-loss at the rating-system scale (LOGISTIC_SCALE). */
  baselineLogLoss: number;
  /** Davidson 1X2 log-loss at the shipped WC_PREDICTION_SCALE (flatter). */
  shippedLogLoss: number;
}

export interface WcFlattenResult {
  ratingScale: number; // LOGISTIC_SCALE
  predictionScale: number; // WC_PREDICTION_SCALE
  wc2022: WindowScore;
  wc2026: WindowScore;
}

function davidsonLogLoss(rows: Tuple[], scale: number): number {
  let ll = 0;
  for (const t of rows) {
    const p = davidsonProbs(t.effHome, t.effAway, DRAW_NU, scale);
    const o: MatchOutcome = outcomeOf(t.hg, t.ag);
    ll += -Math.log(Math.max(p[o], 1e-15));
  }
  return rows.length ? ll / rows.length : 0;
}

function scoreWindow(rows: Tuple[]): WindowScore {
  return {
    n: rows.length,
    baselineLogLoss: davidsonLogLoss(rows, LOGISTIC_SCALE),
    shippedLogLoss: davidsonLogLoss(rows, WC_PREDICTION_SCALE),
  };
}

/** Roll Elo once (shipped dynamics, no leakage) and score both World Cup holdouts
 *  at the baseline and shipped prediction scales. */
export function runWcFlattenBacktest(csv: string): WcFlattenResult {
  const matches = parseResults(csv); // sorted by date ascending
  const rating = new Map<string, number>();
  const at = (t: string) => rating.get(t) ?? INIT;

  const wc2022: Tuple[] = [];
  const wc2026: Tuple[] = [];
  for (const m of matches) {
    const effHome = at(m.home) + (m.neutral ? 0 : HOST_ADVANTAGE);
    const effAway = at(m.away);
    if (m.tournament === "FIFA World Cup") {
      const t: Tuple = {
        date: m.date,
        effHome,
        effAway,
        hg: m.homeGoals,
        ag: m.awayGoals,
      };
      if (m.date >= WC2022_START && m.date <= WC2022_END) wc2022.push(t);
      else if (m.date >= WC2026_START && m.date <= WC2026_END) wc2026.push(t);
    }
    // Roll forward with the shipped rating dynamics (eloUpdate uses LOGISTIC_SCALE
    // and the default ELO_K — the exact live-model update).
    const d = eloUpdate(effHome, effAway, m.homeGoals, m.awayGoals);
    rating.set(m.home, at(m.home) + d);
    rating.set(m.away, at(m.away) - d);
  }

  return {
    ratingScale: LOGISTIC_SCALE,
    predictionScale: WC_PREDICTION_SCALE,
    wc2022: scoreWindow(wc2022),
    wc2026: scoreWindow(wc2026),
  };
}
