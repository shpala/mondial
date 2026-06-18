// Shared joint-holdout evaluation harness for prediction-model exploration.
//
// Rolls Elo once over the whole corpus in date order (no leakage: a match is
// scored only from strictly-earlier results), then scores any 1X2 model on three
// windows at once:
//   - full   : every played match on/after FULL_BURN_IN (the calibration corpus)
//   - wc2022 : the 64 Qatar 2022 World Cup matches (out-of-sample holdout)
//   - wc2026 : the already-played 2026 World Cup matches (the live holdout)
//
// The point of the harness is the JOINT objective: an improvement the user can
// trust must help the 2022 holdout AND the already-played 2026 games, not just
// one tournament. wc2026 is tiny (high variance) so it is a guardrail, not the
// sole target — read it together with wc2022 and full.
//
// Pure-ish: only reads the CSV. No Date.now()/Math.random().

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseResults, type MatchRow } from "@/lib/backtest/parse";
import { eloUpdate } from "@/lib/ratings";
import { davidsonProbs } from "@/lib/prediction";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const CSV = resolve(ROOT, "data/intl_results.csv");
export const loadCorpus = (): MatchRow[] =>
  parseResults(readFileSync(CSV, "utf8"));

export const INIT = 1500;
export const FULL_BURN_IN = "2018-01-01";
export const WC2022_START = "2022-11-20";
export const WC2022_END = "2022-12-18";
export const WC2026_START = "2026-06-01";
export const WC2026_END = "2026-12-31";

export type Outcome = "home" | "draw" | "away";
export const actualOf = (hg: number, ag: number): Outcome =>
  hg > ag ? "home" : hg < ag ? "away" : "draw";

/** A pre-match tuple: ratings here come only from strictly-earlier matches. */
export interface Tuple {
  date: string;
  home: string;
  away: string;
  effHome: number; // host/home-adjusted pre-match rating
  effAway: number;
  ratHome: number; // raw pre-match rating (no home bump)
  ratAway: number;
  neutral: boolean;
  hg: number;
  ag: number;
  tournament: string;
}

export interface RollParams {
  home: number; // home/host bump in Elo points (applied to non-neutral home side)
  k: number; // Elo K gain
  scale: number; // logistic scale used INSIDE the Elo expectation
  init?: number;
  /** Optional per-team seed ratings (e.g. confederation priors); default INIT. */
  seed?: Map<string, number>;
  /** Optional multiplier on K per tournament name (importance weighting). */
  importance?: (tournament: string) => number;
  /** Optional half-life in days for exponential time-decay of K (recency). */
  // (kept simple: callers wanting decay can post-process; left here for docs)
}

/** Roll Elo once over the corpus, returning a pre-match tuple per match. */
export function rollCorpus(matches: MatchRow[], p: RollParams): Tuple[] {
  const init = p.init ?? INIT;
  const rating = new Map<string, number>();
  const at = (t: string) => rating.get(t) ?? p.seed?.get(t) ?? init;
  const tuples: Tuple[] = [];
  for (const m of matches) {
    const ratHome = at(m.home);
    const ratAway = at(m.away);
    const effHome = ratHome + (m.neutral ? 0 : p.home);
    const effAway = ratAway;
    tuples.push({
      date: m.date,
      home: m.home,
      away: m.away,
      effHome,
      effAway,
      ratHome,
      ratAway,
      neutral: m.neutral,
      hg: m.homeGoals,
      ag: m.awayGoals,
      tournament: m.tournament,
    });
    const imp = p.importance ? p.importance(m.tournament) : 1;
    const d = eloUpdateScaled(effHome, effAway, m.homeGoals, m.awayGoals, p.k * imp, p.scale);
    rating.set(m.home, at(m.home) + d);
    rating.set(m.away, at(m.away) - d);
  }
  return tuples;
}

/** eloUpdate with an explicit logistic scale for the expectation (so the Elo
 *  update and the scoring model share one scale). Mirrors lib/ratings.eloUpdate
 *  but threads `scale` instead of hard-coding LOGISTIC_SCALE. */
export function eloUpdateScaled(
  effHome: number,
  effAway: number,
  hg: number,
  ag: number,
  k: number,
  scale: number,
): number {
  const we = 1 / (1 + Math.pow(10, (effAway - effHome) / scale));
  const w = hg > ag ? 1 : hg < ag ? 0 : 0.5;
  const gd = Math.abs(hg - ag);
  const g = gd <= 1 ? 1 : gd === 2 ? 1.5 : (11 + gd) / 8;
  return k * g * (w - we);
}

export interface Metrics {
  n: number;
  logLoss: number;
  brier: number;
  drawObs: number;
  drawPred: number;
  /** Accuracy of the argmax-outcome pick. */
  acc: number;
}

export type PredictFn = (t: Tuple) => { home: number; draw: number; away: number };

/** Score a 1X2 model over the tuples passing `keep`. */
export function scoreWindow(tuples: Tuple[], keep: (t: Tuple) => boolean, predict: PredictFn): Metrics {
  let ll = 0, brier = 0, n = 0, drawObs = 0, drawPred = 0, correct = 0;
  for (const t of tuples) {
    if (!keep(t)) continue;
    const p = predict(t);
    const o = actualOf(t.hg, t.ag);
    ll += -Math.log(Math.max(p[o], 1e-15));
    for (const c of ["home", "draw", "away"] as Outcome[]) {
      const y = o === c ? 1 : 0;
      brier += (p[c] - y) ** 2;
    }
    const pick: Outcome = p.home >= p.draw && p.home >= p.away ? "home" : p.away >= p.draw ? "away" : "draw";
    if (pick === o) correct++;
    drawObs += o === "draw" ? 1 : 0;
    drawPred += p.draw;
    n++;
  }
  return {
    n,
    logLoss: n ? ll / n : 0,
    brier: n ? brier / n : 0,
    drawObs: n ? drawObs / n : 0,
    drawPred: n ? drawPred / n : 0,
    acc: n ? correct / n : 0,
  };
}

export const inFull = (t: Tuple) => t.date >= FULL_BURN_IN;
export const inWc2022 = (t: Tuple) =>
  t.tournament === "FIFA World Cup" && t.date >= WC2022_START && t.date <= WC2022_END;
export const inWc2026 = (t: Tuple) =>
  t.tournament === "FIFA World Cup" && t.date >= WC2026_START && t.date <= WC2026_END;

/** Evaluate one set of constants on all three windows with the Davidson 1X2
 *  model — the shipped outcome model. Returns the joint scorecard. */
export function evalDavidson(
  matches: MatchRow[],
  c: { nu: number; home: number; k: number; scale: number; seed?: Map<string, number>; importance?: (t: string) => number },
) {
  const tuples = rollCorpus(matches, c);
  const predict: PredictFn = (t) => davidsonProbs(t.effHome, t.effAway, c.nu, c.scale);
  return {
    constants: c,
    full: scoreWindow(tuples, inFull, predict),
    wc2022: scoreWindow(tuples, inWc2022, predict),
    wc2026: scoreWindow(tuples, inWc2026, predict),
  };
}
