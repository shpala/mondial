// Pure prediction model for the knockout bracket. No I/O, no framework — so it
// runs identically on the server, in the client store, and in unit tests.
//
// Win probability uses an Elo-style logistic on the rating difference. Knockouts
// have no draws (extra time / penalties decide), so a two-outcome model fits.

import type { Team } from "@/lib/types";
import {
  DRAW_NU,
  HOST_ADVANTAGE,
  KNOCKOUT_SHOOTOUT_ENABLED,
  KNOCKOUT_SHOOTOUT_SPLIT,
  LOGISTIC_SCALE,
  WC_PREDICTION_SCALE,
} from "@/lib/model/constants";
import {
  GOAL_RHO,
  conditionScorelineGrid,
  goalRates,
  poissonJoint,
  topScorelines,
  type ScoreCell,
} from "@/lib/scoreline";

// Re-exported so existing callers keep importing it from here.
export { HOST_ADVANTAGE };

export const ROUNDS = [
  "Round of 32",
  "Round of 16",
  "Quarter-finals",
  "Semi-finals",
  "Final",
] as const;

export type RoundName = (typeof ROUNDS)[number];

/**
 * Probability that team A beats team B in a single knockout match. `scale` is the
 * logistic spread; it defaults to LOGISTIC_SCALE (the rating-system scale, used by
 * the Elo update), while the prediction-facing callers below pass the flatter
 * WC_PREDICTION_SCALE for displayed World Cup probabilities.
 */
export function winProbability(
  ratingA: number,
  ratingB: number,
  scale: number = LOGISTIC_SCALE,
): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / scale));
}

/**
 * Three-outcome Davidson probabilities (home / draw / away) on two ratings.
 * `nu` is the draw weight; conditional on a decisive result it collapses exactly
 * to `winProbability`. Ratings passed in are already host/home-adjusted.
 *
 * `scale` is the logistic spread (the Elo "400"): smaller → sharper, more
 * confident probabilities for the same rating gap; larger → flatter. Defaults to
 * LOGISTIC_SCALE (the rating-system scale); the prediction-facing callers
 * (predictScoreline, Monte Carlo) pass the flatter WC_PREDICTION_SCALE, and the
 * backtest sweeps it to calibrate.
 */
export function davidsonProbs(
  ratingA: number,
  ratingB: number,
  nu: number,
  scale = LOGISTIC_SCALE,
): { home: number; draw: number; away: number } {
  const a = Math.pow(10, ratingA / scale);
  const b = Math.pow(10, ratingB / scale);
  const d = nu * Math.sqrt(a * b);
  const z = a + b + d;
  return { home: a / z, draw: d / z, away: b / z };
}

/** A team's rating for prediction, including the host home-field bump. */
export function effectiveRating(team: Pick<Team, "rating" | "host">): number {
  return team.rating + (team.host ? HOST_ADVANTAGE : 0);
}

/**
 * Probability that `a` beats `b`, accounting for host advantage. Use this over
 * raw `winProbability` anywhere two real teams meet (match cards, bracket). Uses
 * the flatter WC_PREDICTION_SCALE: the live app only predicts World Cup fixtures,
 * where favourites win less often than the rating-system scale implies.
 */
export function predictWinProbability(
  a: Pick<Team, "rating" | "host">,
  b: Pick<Team, "rating" | "host">,
): number {
  return winProbability(effectiveRating(a), effectiveRating(b), WC_PREDICTION_SCALE);
}

/**
 * Probability that `a` *advances* past `b` in a single knockout tie, accounting for
 * the penalty-shootout structure. The Davidson model gives win/draw/away masses for
 * the match; a tie (the draw mass) goes to extra time then penalties, which are ≈ a
 * coin flip ({@link KNOCKOUT_SHOOTOUT_SPLIT}), so `a` advances with
 * `P(a wins) + split·P(draw)`.
 *
 * This is *flatter* than `predictWinProbability` — which equals `a/(a+b)`, i.e. it
 * hands the favourite the draw mass in proportion to strength. For evenly matched
 * sides both give 0.5; for a favourite this returns a value between 0.5 and
 * `predictWinProbability`, so the underdog advances slightly more often (penalties
 * level the tie). The winner the bracket *shows* is unchanged (the favourite still
 * clears 0.5); only the probability — and the Monte Carlo title odds — soften.
 */
export function knockoutAdvanceProbability(
  a: Pick<Team, "rating" | "host">,
  b: Pick<Team, "rating" | "host">,
): number {
  const { home, draw } = davidsonProbs(
    effectiveRating(a),
    effectiveRating(b),
    DRAW_NU,
    WC_PREDICTION_SCALE,
  );
  return home + KNOCKOUT_SHOOTOUT_SPLIT * draw;
}

/**
 * Advancement probability the LIVE bracket and Monte Carlo use for a knockout tie.
 * Gated by {@link KNOCKOUT_SHOOTOUT_ENABLED}: off (default) keeps the shipped
 * proportional two-outcome model ({@link predictWinProbability}); on switches to the
 * shootout-aware {@link knockoutAdvanceProbability}. Flip the flag to evaluate it —
 * the shown bracket winner is identical either way (the favourite stays > 0.5).
 */
export function bracketAdvanceProbability(
  a: Pick<Team, "rating" | "host">,
  b: Pick<Team, "rating" | "host">,
): number {
  return KNOCKOUT_SHOOTOUT_ENABLED
    ? knockoutAdvanceProbability(a, b)
    : predictWinProbability(a, b);
}

export interface ScorelinePrediction {
  /** Calibrated home/draw/away masses the scoreline grid is conditioned on. */
  outcome: { home: number; draw: number; away: number };
  /** Single most likely scoreline (identical to `top[0]`). */
  mostLikely: ScoreCell;
  /** The most likely scorelines, most likely first. */
  top: ScoreCell[];
  /** Full conditioned P(i,j) grid (home goals = row, away goals = column). */
  grid: number[][];
}

/**
 * Predict a full scoreline distribution for a single fixture. The calibrated
 * Davidson model sets the home/draw/away masses; the rating-aware Poisson goal
 * model (with the Dixon-Coles low-score correction) shapes the scorelines within
 * each outcome region, so the displayed scores stay consistent with the site's
 * win probabilities. Ratings are host-adjusted exactly as `predictWinProbability`
 * does. Pure — runs on the server and in tests.
 *
 * `decisive` (knockout mode): a knockout tie is settled by extra time / penalties,
 * so there is no drawn result. Setting it zeroes the draw region and conditions on
 * the two-outcome model (`winProbability`) the bracket already uses, so the most
 * likely score is always a decisive one.
 */
export function predictScoreline(
  home: Pick<Team, "rating" | "host">,
  away: Pick<Team, "rating" | "host">,
  { topN = 3, decisive = false }: { topN?: number; decisive?: boolean } = {},
): ScorelinePrediction {
  const effHome = effectiveRating(home);
  const effAway = effectiveRating(away);
  const decisiveHomeWin = winProbability(effHome, effAway, WC_PREDICTION_SCALE);
  const outcome = decisive
    ? { home: decisiveHomeWin, draw: 0, away: 1 - decisiveHomeWin }
    : davidsonProbs(effHome, effAway, DRAW_NU, WC_PREDICTION_SCALE);
  const { lambdaHome, lambdaAway } = goalRates(effHome, effAway);
  const grid = conditionScorelineGrid(
    poissonJoint(lambdaHome, lambdaAway, GOAL_RHO),
    outcome,
  );
  const top = topScorelines(grid, topN);
  return { outcome, mostLikely: top[0], top, grid };
}

export interface Matchup {
  id: string;
  round: RoundName;
  roundIndex: number;
  /** index within the round (0-based) */
  slot: number;
  top: Team | null;
  bottom: Team | null;
  /** model probability that `top` wins this match (null until both slots known) */
  topWinProb: number | null;
  /** resolved winner team id (override or model pick) */
  winnerId: number | null;
  /** child matchup ids feeding the two slots (null in the first round) */
  source: { top: string; bottom: string } | null;
}

export interface Bracket {
  rounds: Matchup[][];
  championId: number | null;
}

export type Overrides = Record<string, number>; // matchupId -> chosen team id

/**
 * Standard single-elimination seed order for a bracket of `n` slots (n a power
 * of two). Returns 1-based seed numbers arranged so seed 1 and seed 2 can only
 * meet in the final.
 */
export function bracketSeedOrder(n: number): number[] {
  let order = [1, 2];
  while (order.length < n) {
    const size = order.length * 2;
    order = order.flatMap((seed) => [seed, size + 1 - seed]);
  }
  return order;
}

/**
 * Build a 32-slot bracket skeleton from teams already placed in their opening
 * positions: `slotted[2i]`/`slotted[2i+1]` are the top/bottom of first-round
 * match `i`, and adjacent matches meet in the next round. Later rounds are empty
 * until resolved. This is the placement-agnostic core; callers decide the slot
 * order (rating seeding, or the official group-position template).
 */
export function buildBracketFromSlots(slotted: (Team | null)[]): Bracket {
  const size = 32;

  const first: Matchup[] = [];
  for (let i = 0; i < size / 2; i++) {
    first.push({
      id: `R0-${i}`,
      round: ROUNDS[0],
      roundIndex: 0,
      slot: i,
      top: slotted[i * 2] ?? null,
      bottom: slotted[i * 2 + 1] ?? null,
      topWinProb: null,
      winnerId: null,
      source: null,
    });
  }

  const rounds: Matchup[][] = [first];
  for (let r = 1; r < ROUNDS.length; r++) {
    const count = (size / 2) >> r;
    const round: Matchup[] = [];
    for (let i = 0; i < count; i++) {
      round.push({
        id: `R${r}-${i}`,
        round: ROUNDS[r],
        roundIndex: r,
        slot: i,
        top: null,
        bottom: null,
        topWinProb: null,
        winnerId: null,
        source: { top: `R${r - 1}-${i * 2}`, bottom: `R${r - 1}-${i * 2 + 1}` },
      });
    }
    rounds.push(round);
  }

  return { rounds, championId: null };
}

/**
 * Build the bracket skeleton from up to 32 qualified teams, ordered strongest
 * first, using standard tennis-style seeding (seed 1 vs 32, etc.). Used for
 * tests and as a generic utility; the live app slots by official group position
 * (see lib/bracket).
 */
export function buildBracket(qualified: Team[]): Bracket {
  const order = bracketSeedOrder(32);
  return buildBracketFromSlots(order.map((seed) => qualified[seed - 1] ?? null));
}

function winnerOf(m: Matchup): Team | null {
  if (m.winnerId == null) return null;
  if (m.top?.id === m.winnerId) return m.top;
  if (m.bottom?.id === m.winnerId) return m.bottom;
  return null;
}

/**
 * Resolve every matchup: fill slots from earlier-round winners, compute model
 * probabilities, and pick a winner (user override if present, else the higher
 * model probability). Pure — returns a new bracket.
 */
export function resolveBracket(bracket: Bracket, overrides: Overrides = {}): Bracket {
  const byId = new Map<string, Matchup>();
  const rounds = bracket.rounds.map((round) =>
    round.map((m) => {
      const copy: Matchup = { ...m };
      byId.set(copy.id, copy);
      return copy;
    }),
  );

  for (let r = 0; r < rounds.length; r++) {
    for (const m of rounds[r]) {
      if (m.source) {
        m.top = winnerOf(byId.get(m.source.top)!);
        m.bottom = winnerOf(byId.get(m.source.bottom)!);
      }

      if (m.top && m.bottom) {
        // Live knockout advancement (flag-gated; shootout-aware when enabled), so the
        // displayed bracket % matches how the Monte Carlo resolves the same tie.
        m.topWinProb = bracketAdvanceProbability(m.top, m.bottom);
        const override = overrides[m.id];
        if (override === m.top.id || override === m.bottom.id) {
          m.winnerId = override;
        } else {
          m.winnerId = m.topWinProb >= 0.5 ? m.top.id : m.bottom.id;
        }
      } else {
        m.topWinProb = null;
        m.winnerId = m.top?.id ?? m.bottom?.id ?? null;
      }
    }
  }

  const final = rounds[rounds.length - 1][0];
  return { rounds, championId: final?.winnerId ?? null };
}

// A real, already-played knockout result, keyed by the unordered pair of team
// ids. Lets a predicted node flip to an actual result as the tournament unfolds.
export interface PlayedResult {
  winnerId: number;
  homeId: number;
  awayId: number;
  homeGoals: number;
  awayGoals: number;
  fixtureId: number;
  /** Penalty-shootout tally (home/away) when the tie was level after extra time
   *  and decided on penalties; absent/null otherwise. The `winnerId` already
   *  names who advanced — this is for display ("4–3 pens"). */
  shootout?: { home: number; away: number } | null;
}
export type ResultMap = Record<string, PlayedResult>;

function resultPairKey(a: number, b: number): string {
  return [a, b].sort((x, y) => x - y).join("-");
}

/**
 * Resolve a bracket with real played knockout results taking precedence over
 * the model prediction and any user picks. Returns the resolved bracket plus the
 * matchup-node ids whose outcome is an actual result (so the UI can render them
 * as settled rather than predicted).
 */
export function resolveBracketWithResults(
  skeleton: Bracket,
  overrides: Overrides,
  results: ResultMap,
): { resolved: Bracket; playedNodes: Record<string, PlayedResult> } {
  const forced: Overrides = {};
  const played: Record<string, PlayedResult> = {};
  let resolved = resolveBracket(skeleton, overrides);
  // Iterate to a fixed point: a real result is keyed by the ACTUAL team pair, so
  // forcing one round's true winner can change the next round's pairing and only
  // then reveal that round's real result. A single detection pass against the
  // model/user-resolved bracket would miss every later-round result that sits on
  // a branch where an upstream actual outcome diverged from the baseline.
  for (;;) {
    let grew = false;
    for (const round of resolved.rounds) {
      for (const m of round) {
        if (m.id in forced || !m.top?.id || !m.bottom?.id) continue;
        const r = results[resultPairKey(m.top.id, m.bottom.id)];
        if (r) {
          forced[m.id] = r.winnerId;
          played[m.id] = r;
          grew = true;
        }
      }
    }
    if (!grew) break;
    // Forced winners take precedence over model + user picks (spread last).
    resolved = resolveBracket(skeleton, { ...overrides, ...forced });
  }
  return { resolved, playedNodes: played };
}

/** Probability the resolved winner of a matchup wins it (for display). */
export function winnerProb(m: Matchup): number | null {
  if (m.topWinProb == null || m.winnerId == null) return null;
  return m.winnerId === m.top?.id ? m.topWinProb : 1 - m.topWinProb;
}
