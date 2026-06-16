// Monte Carlo tournament simulation → per-team title odds.
//
// Simulates the whole tournament many times: sample the unplayed group games to
// get a distribution over who qualifies, then play out the knockouts as weighted
// coin flips, tallying how often each team wins the cup / reaches the final /
// escapes the group. Real finished results are held fixed in every run.
//
// Pure (a seeded RNG, no Date/Math.random), so it runs identically on the server
// and in tests. Reuses the live-Elo ratings carried on the fixtures' teams plus
// the existing standings / qualification / bracket logic.

import type { Fixture, Team } from "@/lib/types";
import { computeGroupStandings } from "@/lib/standings";
import { qualifiedTeams } from "@/lib/qualifiers";
import {
  ROUNDS,
  buildBracket,
  effectiveRating,
  predictWinProbability,
} from "@/lib/prediction";

const DEFAULT_RUNS = 10_000;

// Davidson draw parameter: ν ≈ 0.63 → ~24% draws between even sides. Conditional
// on a decisive result the model collapses exactly to `winProbability`.
const DRAW_NU = 0.63;

/** Deterministic PRNG so odds are stable between renders (seeded from results). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Win / draw / loss probabilities for a group match (Davidson on host-adj Elo). */
export function outcomeProbs(
  home: Pick<Team, "rating" | "host">,
  away: Pick<Team, "rating" | "host">,
): { home: number; draw: number; away: number } {
  const a = Math.pow(10, effectiveRating(home) / 400);
  const b = Math.pow(10, effectiveRating(away) / 400);
  const d = DRAW_NU * Math.sqrt(a * b);
  const z = a + b + d;
  return { home: a / z, draw: d / z, away: b / z };
}

function isFinished(f: Fixture): boolean {
  return (
    f.status === "finished" &&
    f.home.id !== 0 &&
    f.away.id !== 0 &&
    f.homeGoals != null &&
    f.awayGoals != null
  );
}

const pairKey = (x: number, y: number) => [x, y].sort((m, n) => m - n).join("-");

// Light goals model — used ONLY to give simulated group games a plausible GD /
// goals-for for tiebreaks. Returns goals for the match winner and loser (or a
// drawn scoreline). Not meant to be an accurate scoreline predictor.
function sampleMargin(rng: () => number): number {
  const r = rng();
  if (r < 0.5) return 1;
  if (r < 0.83) return 2;
  return 3 + Math.floor(rng() * 2); // 3 or 4
}
function sampleLoserGoals(rng: () => number): number {
  const r = rng();
  if (r < 0.45) return 0;
  if (r < 0.85) return 1;
  return 2;
}
function sampleDrawGoals(rng: () => number): number {
  const r = rng();
  if (r < 0.3) return 0;
  if (r < 0.75) return 1;
  if (r < 0.95) return 2;
  return 3;
}

/** Sample a finished scoreline for an unplayed group game. */
function sampleGroupScore(
  home: Team,
  away: Team,
  rng: () => number,
): { hg: number; ag: number } {
  const p = outcomeProbs(home, away);
  const r = rng();
  if (r < p.home) {
    const loser = sampleLoserGoals(rng);
    return { hg: loser + sampleMargin(rng), ag: loser };
  }
  if (r < p.home + p.draw) {
    const g = sampleDrawGoals(rng);
    return { hg: g, ag: g };
  }
  const loser = sampleLoserGoals(rng);
  return { hg: loser, ag: loser + sampleMargin(rng) };
}

export interface TeamOdds {
  team: Team;
  /** P(reach knockouts) — i.e. finish in a qualifying spot. */
  escapeGroup: number;
  reachQuarter: number;
  reachSemi: number;
  reachFinal: number;
  champion: number;
}

interface Tally {
  team: Team;
  q: number; // qualified (reached R32)
  r16: number;
  qf: number;
  sf: number;
  fin: number;
  champ: number;
}

/** Round index (in ROUNDS) → tally field a *participant* of that round earns. */
const ROUND_FIELD: (keyof Tally)[] = ["q", "r16", "qf", "sf", "fin"];

function winnerTeam(top: Team | null, bottom: Team | null, winnerId: number | null) {
  if (winnerId == null) return null;
  if (top?.id === winnerId) return top;
  if (bottom?.id === winnerId) return bottom;
  return null;
}

/**
 * Simulate the tournament `runs` times and return each team's title odds,
 * sorted by championship probability (descending). Finished real results — group
 * scores and knockout winners — are held fixed in every run.
 */
export function simulateTournament(
  fixtures: Fixture[],
  runs: number = DEFAULT_RUNS,
): TeamOdds[] {
  const groupFixtures = fixtures.filter((f) => f.stage === "Group Stage");

  // Unique group teams (carry whatever rating the caller overlaid, e.g. live Elo).
  const teams = new Map<number, Team>();
  for (const f of groupFixtures) {
    if (f.home.id !== 0 && !teams.has(f.home.id)) teams.set(f.home.id, f.home);
    if (f.away.id !== 0 && !teams.has(f.away.id)) teams.set(f.away.id, f.away);
  }
  const teamList = [...teams.values()];

  // Forced knockout winners from already-played knockout ties (keyed team-pair).
  const forced = new Map<string, number>();
  for (const f of fixtures) {
    if (f.stage === "Group Stage" || !isFinished(f)) continue;
    if (f.homeGoals === f.awayGoals) continue; // settled on pens; winner unknown
    forced.set(
      pairKey(f.home.id, f.away.id),
      f.homeGoals! > f.awayGoals! ? f.home.id : f.away.id,
    );
  }

  // Seed the RNG from the current results state so odds only shift when results do.
  let seed = groupFixtures.length * 2654435761;
  for (const f of fixtures) {
    if (isFinished(f)) {
      seed = (seed ^ ((f.id + 1) * 2246822519 + f.homeGoals! * 97 + f.awayGoals!)) >>> 0;
    }
  }
  const rng = mulberry32(seed || 1);

  const tallies = new Map<number, Tally>();
  const tally = (t: Team) => {
    let e = tallies.get(t.id);
    if (!e) {
      e = { team: t, q: 0, r16: 0, qf: 0, sf: 0, fin: 0, champ: 0 };
      tallies.set(t.id, e);
    }
    return e;
  };
  teamList.forEach(tally);

  for (let run = 0; run < runs; run++) {
    // --- Group stage: keep finished games, sample the rest, rebuild standings.
    const simFixtures = groupFixtures.map((f) => {
      if (isFinished(f)) return f;
      const { hg, ag } = sampleGroupScore(f.home, f.away, rng);
      return { ...f, status: "finished" as const, homeGoals: hg, awayGoals: ag };
    });
    const groups = computeGroupStandings(teamList, simFixtures);
    const qualified = qualifiedTeams(groups);
    for (const t of qualified) tally(t).q++;

    // --- Knockouts: resolve the bracket as weighted coin flips.
    const bracket = buildBracket(qualified);
    const resolved = new Map<string, Team | null>();
    for (let r = 0; r < bracket.rounds.length; r++) {
      for (const m of bracket.rounds[r]) {
        const top = m.source ? resolved.get(m.source.top) ?? null : m.top;
        const bottom = m.source ? resolved.get(m.source.bottom) ?? null : m.bottom;

        if (top && bottom) {
          // Both teams contest round r (and the round index >= 1 grants r16/qf/...).
          if (r >= 1) {
            tally(top)[ROUND_FIELD[r]]++;
            tally(bottom)[ROUND_FIELD[r]]++;
          }
          const forcedId = forced.get(pairKey(top.id, bottom.id));
          let winnerId: number;
          if (forcedId != null) {
            winnerId = forcedId;
          } else {
            winnerId = rng() < predictWinProbability(top, bottom) ? top.id : bottom.id;
          }
          resolved.set(m.id, winnerTeam(top, bottom, winnerId));
        } else {
          resolved.set(m.id, top ?? bottom ?? null);
        }
      }
    }
    const champ = resolved.get(bracket.rounds[bracket.rounds.length - 1][0].id);
    if (champ) tally(champ).champ++;
  }

  const odds: TeamOdds[] = [...tallies.values()].map((t) => ({
    team: t.team,
    escapeGroup: t.q / runs,
    reachQuarter: t.qf / runs,
    reachSemi: t.sf / runs,
    reachFinal: t.fin / runs,
    champion: t.champ / runs,
  }));
  odds.sort((a, b) => b.champion - a.champion || b.reachFinal - a.reachFinal);
  return odds;
}

// Re-export for callers that want the round labels alongside the odds.
export { ROUNDS };
