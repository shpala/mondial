// Pure prediction model for the knockout bracket. No I/O, no framework — so it
// runs identically on the server, in the client store, and in unit tests.
//
// Win probability uses an Elo-style logistic on the rating difference. Knockouts
// have no draws (extra time / penalties decide), so a two-outcome model fits.

import type { Team } from "@/lib/types";

export const ROUNDS = [
  "Round of 32",
  "Round of 16",
  "Quarter-finals",
  "Semi-finals",
  "Final",
] as const;

export type RoundName = (typeof ROUNDS)[number];

/**
 * Home-field bump (in Elo points) applied to the three 2026 co-hosts
 * (USA/Mexico/Canada) whenever they play. 100 is eloratings.net's standard
 * home-advantage constant — worth ~+14 percentage points between even sides.
 */
export const HOST_ADVANTAGE = 100;

/** Probability that team A beats team B in a single knockout match. */
export function winProbability(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Three-outcome Davidson probabilities (home / draw / away) on two ratings.
 * `nu` is the draw weight; conditional on a decisive result it collapses exactly
 * to `winProbability`. Ratings passed in are already host/home-adjusted.
 */
export function davidsonProbs(
  ratingA: number,
  ratingB: number,
  nu: number,
): { home: number; draw: number; away: number } {
  const a = Math.pow(10, ratingA / 400);
  const b = Math.pow(10, ratingB / 400);
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
 * Build the bracket skeleton from up to 32 qualified teams, ordered strongest
 * first. Slots are filled for the first round; later rounds are empty until
 * resolved.
 */
export function buildBracket(qualified: Team[]): Bracket {
  const size = 32;
  const teams = qualified.slice(0, size);
  const order = bracketSeedOrder(size);

  const first: Matchup[] = [];
  for (let i = 0; i < size / 2; i++) {
    const topSeed = order[i * 2];
    const bottomSeed = order[i * 2 + 1];
    first.push({
      id: `R0-${i}`,
      round: ROUNDS[0],
      roundIndex: 0,
      slot: i,
      top: teams[topSeed - 1] ?? null,
      bottom: teams[bottomSeed - 1] ?? null,
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
