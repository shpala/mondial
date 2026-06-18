// Pure prediction model for the knockout bracket. No I/O, no framework — so it
// runs identically on the server, in the client store, and in unit tests.
//
// Win probability uses an Elo-style logistic on the rating difference. Knockouts
// have no draws (extra time / penalties decide), so a two-outcome model fits.

import type { Team } from "@/lib/types";
import { HOST_ADVANTAGE, LOGISTIC_SCALE } from "@/lib/model/constants";

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

/** Probability that team A beats team B in a single knockout match. */
export function winProbability(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / LOGISTIC_SCALE));
}

/**
 * Three-outcome Davidson probabilities (home / draw / away) on two ratings.
 * `nu` is the draw weight; conditional on a decisive result it collapses exactly
 * to `winProbability`. Ratings passed in are already host/home-adjusted.
 *
 * `scale` is the logistic spread (the Elo "400"): smaller → sharper, more
 * confident probabilities for the same rating gap; larger → flatter. Defaults to
 * LOGISTIC_SCALE so production is unchanged; the backtest sweeps it to calibrate.
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
 * raw `winProbability` anywhere two real teams meet (match cards, bracket).
 */
export function predictWinProbability(
  a: Pick<Team, "rating" | "host">,
  b: Pick<Team, "rating" | "host">,
): number {
  return winProbability(effectiveRating(a), effectiveRating(b));
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
    const next: number[] = [];
    for (const seed of order) {
      next.push(seed);
      next.push(size + 1 - seed);
    }
    order = next;
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
        m.topWinProb = predictWinProbability(m.top, m.bottom);
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

/** Probability the resolved winner of a matchup wins it (for display). */
export function winnerProb(m: Matchup): number | null {
  if (m.topWinProb == null || m.winnerId == null) return null;
  return m.winnerId === m.top?.id ? m.topWinProb : 1 - m.topWinProb;
}
