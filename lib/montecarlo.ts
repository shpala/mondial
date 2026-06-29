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
  bracketAdvanceProbability,
  davidsonProbs,
  effectiveRating,
} from "@/lib/prediction";
import { buildOfficialBracket, r32DrawFromFixtures } from "@/lib/bracket";
import {
  goalRates,
  sampleScoreline,
  type Outcome,
} from "@/lib/scoreline";
import { DRAW_NU, WC_PREDICTION_SCALE } from "@/lib/model/constants";
import { mulberry32 } from "@/lib/rng";

const DEFAULT_RUNS = 10_000;

/** Win / draw / loss probabilities for a group match (Davidson on host-adj Elo).
 *  Uses the flatter WC_PREDICTION_SCALE — these are World Cup matches, so they get
 *  the same calibrated spread as the bracket (predictWinProbability). */
export function outcomeProbs(
  home: Pick<Team, "rating" | "host">,
  away: Pick<Team, "rating" | "host">,
): { home: number; draw: number; away: number } {
  return davidsonProbs(
    effectiveRating(home),
    effectiveRating(away),
    DRAW_NU,
    WC_PREDICTION_SCALE,
  );
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

const pairKey = (x: number, y: number) => (x < y ? `${x}-${y}` : `${y}-${x}`);

/**
 * Sample a finished scoreline for an unplayed group game. The calibrated
 * Davidson model picks the win/draw/away outcome; the rating-aware Poisson goal
 * model then fills in a margin consistent with it, so a strong side's win is by
 * a realistic GD rather than a fixed bucket. Validated out-of-sample on the 2022
 * World Cup (docs/wc2022-report.md). Both steps draw from the seeded `rng`.
 */
function sampleGroupScore(
  home: Team,
  away: Team,
  rng: () => number,
): { hg: number; ag: number } {
  const p = outcomeProbs(home, away);
  const r = rng();
  const outcome: Outcome = r < p.home ? "home" : r < p.home + p.draw ? "draw" : "away";
  const { lambdaHome, lambdaAway } = goalRates(
    effectiveRating(home),
    effectiveRating(away),
  );
  return sampleScoreline(rng, lambdaHome, lambdaAway, outcome);
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

function winnerTeam(top: Team | null, bottom: Team | null, winnerId: number) {
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

  // Published R32 draw (real teams once the group stage is decided). Used to slot
  // best-thirds per the actual draw; self-gates per run — when a simulated group
  // stage produces different winners/thirds, the id lookups miss and the bracket
  // falls back to the deterministic matching, so this only binds once results fix
  // the real qualifiers.
  const r32Draw = r32DrawFromFixtures(fixtures);

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

    // --- Knockouts: resolve the official bracket as weighted coin flips.
    const bracket = buildOfficialBracket(groups, r32Draw);
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
            winnerId =
              rng() < bracketAdvanceProbability(top, bottom) ? top.id : bottom.id;
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
