// Single data-access facade for all screens, with **capability routing** across
// multiple free origins:
//
//   spine       → openfootball (fixtures, groups, standings, scores)
//   enrichment  → TheSportsDB  (squads, starting lineups)
//   fallback    → bundled snapshot (always available)
//
// Each capability picks its best source independently and falls back to the
// snapshot on any error. The country registry reconciles names across origins.
import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";

import type { Fixture, Group, Lineup, MatchLineups, Squad, Team } from "@/lib/types";
import { isToday } from "@/lib/format";
import { fetchOpenfootball } from "@/lib/api/sources/openfootball";
import {
  fetchEspnLineup,
  fetchEspnLive,
  pairCodeKey,
} from "@/lib/api/sources/espn";
import { fetchSquadTSDB, fetchLineupsTSDB } from "@/lib/api/sources/thesportsdb";
import { fetchWorldCupOdds } from "@/lib/api/sources/oddsapi";
import { simulateTournament } from "@/lib/montecarlo";
import { gradeOutcomes } from "@/lib/modelreport";
import { generateLineup, generateSquad } from "./generate";
import { computeLiveRatings, withLiveRating } from "@/lib/ratings";
import { teamByIdRegistry } from "@/lib/teams/registry";
import {
  TEAMS,
  matchLineups as snapshotLineups,
  resolveFixtureStatuses,
  standings as snapshotStandings,
  teamById,
} from "./snapshot";

// Per-request memoized spine fetch (React cache): the openfootball fetch + parse
// runs once per request and is shared by every getter. Returns null when the
// spine is unreachable so callers fall back to the snapshot.
const trySpine = cache(async () => {
  try {
    return await fetchOpenfootball();
  } catch (err) {
    console.warn("[data] openfootball spine failed, using snapshot:", err);
    return null;
  }
});

/**
 * Whether this request is serving the bundled snapshot (spine unreachable),
 * for the sample-data banner. Request-scoped via `cache()` rather than a module
 * global, so concurrent requests can't flip each other's banner.
 */
export const getDataStatus = cache(
  async (): Promise<{ usingSample: boolean }> => ({
    usingSample: (await trySpine()) === null,
  }),
);

// Per-request memoized ESPN scoreboard (live scores + minute + goal timeline),
// shared by the score overlay and the line-up lookup.
const espnLive = cache(() => fetchEspnLive());

// Market odds (empty map unless ODDS_API_KEY is set), overlaid onto upcoming
// fixtures for sharper win probs. Cached ACROSS requests via unstable_cache — not
// just per-request — because the pages that read this export `force-dynamic`, which
// disables a plain fetch's own `revalidate`; without this, normal traffic would burn
// the 500/month odds quota. Stored as entries (unstable_cache can't serialize a Map).
const cachedOddsEntries = unstable_cache(
  async () => [...(await fetchWorldCupOdds()).entries()],
  ["market-odds-h2h"],
  { revalidate: 3600 },
);
const marketOdds = cache(async () => new Map(await cachedOddsEntries()));

/** Chronological fixtures with real live scores overlaid, ratings untouched
 *  (pre-tournament seeds). The basis for live-rating computation. Memoized per
 *  request so the spine parse + score overlay run once. */
const rawFixtures = cache(async (): Promise<Fixture[]> => {
  const spine = await trySpine();
  const fixtures = spine ? spine.fixtures : resolveFixtureStatuses(Date.now());
  // Always chronological so every consumer (dashboard, schedule, bracket) is
  // ordered by date.
  const sorted = [...fixtures].sort(
    (a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff),
  );
  return overlayLiveScores(sorted);
});

/** Seed-rating fixtures (live scores overlaid, ratings = pre-tournament seeds).
 *  The basis for model-accuracy grading, which must roll Elo from the seeds. */
export async function getRawFixtures(): Promise<Fixture[]> {
  return rawFixtures();
}

// Memoized per request: the live-Elo overlay (computeLiveRatings over the whole
// schedule) is non-trivial and several pages call this more than once.
export const getFixtures = cache(async (): Promise<Fixture[]> => {
  const fixtures = await rawFixtures();
  // Overlay live Elo so each fixture's win probability reflects results so far,
  // and de-vigged market odds (when ODDS_API_KEY is set) for upcoming fixtures.
  const live = computeLiveRatings(fixtures);
  const odds = await marketOdds();
  if (!live.size && !odds.size) return fixtures;
  return fixtures.map((f) => {
    const next: Fixture = live.size
      ? { ...f, home: withLiveRating(f.home, live), away: withLiveRating(f.away, live) }
      : { ...f };
    // Market consensus only applies to upcoming real-team fixtures; live/finished
    // games show the actual score, not a prediction.
    if (odds.size && f.status === "scheduled" && f.home.id !== 0 && f.away.id !== 0) {
      const m = odds.get(pairCodeKey(f.home.code, f.away.code));
      if (m) next.marketProbs = m;
    }
    return next;
  });
});

/** Signature over every fixture input the Monte Carlo actually consumes — teams,
 *  their (live) ratings, group, status and any result — so ANY upstream change
 *  (a new result, a source correction to teams/groups, or a snapshot↔spine swap
 *  with the same match count) invalidates the cross-request cache, not just a new
 *  finished score. The simulation is a pure function of these, so same signature ⇒
 *  same odds. */
function resultsSignature(fixtures: Fixture[]): string {
  let sig = fixtures.length >>> 0;
  for (const f of fixtures) {
    const rating = Math.round((f.home.rating + f.away.rating) * 4);
    sig = (sig * 33 + f.home.id * 131 + f.away.id * 17) >>> 0;
    sig = (sig * 33 + (f.group?.charCodeAt(0) ?? 0) + f.status.charCodeAt(0)) >>> 0;
    sig = (sig * 33 + rating + (f.homeGoals ?? -1) * 7 + (f.awayGoals ?? -1)) >>> 0;
  }
  return sig.toString(36);
}

/**
 * Monte Carlo title odds (champion / final / etc.), memoized per request AND
 * cached across requests keyed on the results state — so the 10k-simulation runs
 * only when a real result changes it, not on every page view (the Verdict band
 * puts this on every route). Deterministic for a given results state.
 */
export const getTitleOdds = cache(async () => {
  const fixtures = await getFixtures();
  const sig = resultsSignature(fixtures);
  return unstable_cache(async () => simulateTournament(fixtures), ["title-odds", sig], {
    revalidate: 3600,
  })();
});

/**
 * Pre-tournament Monte Carlo odds: the group fixtures with every result stripped
 * back to seeds (status → scheduled, scores → null), simulated once. These are
 * what the /model report card grades qualification against and lists as the
 * from-seeds title favourites. Because the inputs are seed ratings + fixture
 * structure (not results), they are constant per deployment — so this caches one
 * 10k-simulation rather than re-running it on every request. Keyed on the
 * stripped signature, so sample mode (a different fixture set) gets its own entry.
 */
export const getPreTournamentOdds = cache(async () => {
  const fixtures = await getRawFixtures();
  const stripped = fixtures
    .filter((f) => f.stage === "Group Stage")
    .map((f) => ({
      ...f,
      status: "scheduled" as const,
      homeGoals: null,
      awayGoals: null,
    }));
  if (!stripped.length) return [];
  const sig = resultsSignature(stripped);
  return unstable_cache(
    async () => simulateTournament(stripped),
    ["pretournament-odds", sig],
    { revalidate: 3600 },
  )();
});

/**
 * Everything the persistent Verdict band shows: the model's current pick to win
 * the cup and its live track record (group calls right + log-loss edge over a
 * no-skill baseline). Null favourite until the bracket can be simulated.
 */
export const getVerdict = cache(async () => {
  const [odds, raw] = await Promise.all([getTitleOdds(), getRawFixtures()]);
  const favourite = odds.find((o) => o.champion > 0) ?? null;
  const report = gradeOutcomes(raw);
  return {
    favourite,
    hits: report.hits,
    n: report.n,
    edge: report.n ? report.baselineLogLoss - report.logLoss : 0,
  };
});

/**
 * Current (results-adjusted) Elo per team id. Consumers that seed predictions
 * from their own Team objects (e.g. the bracket) overlay this with
 * `withLiveRating`. Computed from raw fixtures so it is never double-counted.
 */
export async function getLiveRatings(): Promise<Map<number, number>> {
  return computeLiveRatings(await rawFixtures());
}

/**
 * Overlay real in-play status + running score + minute from ESPN onto the
 * openfootball spine (which has no live data). Best-effort: on any ESPN failure
 * the spine fixtures are returned unchanged. Matched by canonical team code, so
 * home/away orientation differences between sources don't matter.
 */
async function overlayLiveScores(fixtures: Fixture[]): Promise<Fixture[]> {
  let liveMap: Awaited<ReturnType<typeof fetchEspnLive>>;
  try {
    liveMap = await espnLive();
  } catch (err) {
    console.warn("[data] ESPN live overlay unavailable:", err);
    return fixtures;
  }
  if (!liveMap.size) return fixtures;

  return fixtures.map((f) => {
    if (f.home.id === 0 || f.away.id === 0) return f; // unresolved knockout slot
    const live = liveMap.get(pairCodeKey(f.home.code, f.away.code));
    if (!live) return f;
    const home = live.scores[f.home.code] ?? null;
    const away = live.scores[f.away.code] ?? null;
    // Map ESPN goals (keyed by team code) to this fixture's home/away sides.
    const goals = live.goals.map((g) => ({
      side: g.code === f.home.code ? ("home" as const) : ("away" as const),
      minute: g.minute,
      scorer: g.scorer,
      ownGoal: g.ownGoal,
      penalty: g.penalty,
    }));

    if (live.state === "in") {
      return {
        ...f,
        status: "live" as const,
        homeGoals: home,
        awayGoals: away,
        minute: live.minute,
        goals: goals.length ? goals : f.goals,
        liveOverlaid: true,
      };
    }
    // ESPN says full-time but the daily spine hasn't recorded it yet: surface
    // the final score (and scorers) immediately.
    if (live.state === "post" && f.status !== "finished") {
      return {
        ...f,
        status: "finished" as const,
        homeGoals: home,
        awayGoals: away,
        minute: null,
        goals: goals.length ? goals : f.goals,
        liveOverlaid: true,
      };
    }
    return f;
  });
}

export async function getGroups(): Promise<Group[]> {
  const spine = await trySpine();
  if (spine) return spine.groups;
  return snapshotStandings(Date.now());
}

export async function getTeams(): Promise<Team[]> {
  const spine = await trySpine();
  if (spine && spine.teams.length) return spine.teams;
  return [...TEAMS].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getTeam(id: number): Promise<Team | undefined> {
  const teams = await getTeams();
  return (
    teams.find((t) => t.id === id) ??
    teamByIdRegistry(id) ??
    teamById(id) ??
    undefined
  );
}

export async function getSquad(teamId: number): Promise<Squad | null> {
  const team = await getTeam(teamId);
  if (!team) return null;
  try {
    const live = await fetchSquadTSDB(team);
    if (live && live.players.length) return live;
  } catch (err) {
    console.warn("[data] TheSportsDB squad failed, generating:", err);
  }
  return generateSquad(team);
}

export async function getMatchLineups(
  fixtureId: number,
): Promise<MatchLineups | null> {
  const fixtures = await getFixtures();
  const fixture = fixtures.find((f) => f.id === fixtureId);
  if (!fixture) {
    // snapshot-only fallback (e.g. spine down)
    return snapshotLineups(fixtureId, Date.now());
  }

  let home: Lineup | null = null;
  let away: Lineup | null = null;

  // Once a match has kicked off, ESPN's summary carries the REAL starting XI +
  // formation. Prefer it for live/finished games (matched by event id from the
  // already-cached scoreboard fetch). Upcoming games have no XI yet → estimated.
  const kickedOff = fixture.status === "live" || fixture.status === "finished";
  const realTeams = fixture.home.id !== 0 && fixture.away.id !== 0;
  if (kickedOff && realTeams) {
    try {
      const liveMap = await espnLive();
      const entry = liveMap.get(pairCodeKey(fixture.home.code, fixture.away.code));
      if (entry?.eventId) {
        const espn = await fetchEspnLineup(
          entry.eventId,
          fixture.home,
          fixture.away,
        );
        home = espn.home;
        away = espn.away;
      }
    } catch (err) {
      console.warn("[data] ESPN line-ups unavailable:", err);
    }
  }

  // TheSportsDB fills anything ESPN didn't (a missing side, or scheduled games).
  if (!home || !away) {
    try {
      const live = await fetchLineupsTSDB(fixture);
      if (live) {
        if (!home) home = live.home;
        if (!away) away = live.away;
      }
    } catch (err) {
      console.warn("[data] TheSportsDB lineups failed, generating:", err);
    }
  }

  // Fill any still-missing side with a generated XI so the pitch always renders
  // (real placeholder knockout slots — id 0 — get no generated XI).
  if (!home && fixture.home.id !== 0) home = generateLineup(fixture.home);
  if (!away && fixture.away.id !== 0) away = generateLineup(fixture.away);

  return { fixture, home, away };
}

/** Fixtures grouped for the dashboard: live, today, next up, recent. */
export async function getDashboardFixtures(): Promise<{
  live: Fixture[];
  today: Fixture[];
  upcoming: Fixture[];
  recent: Fixture[];
}> {
  const fixtures = await getFixtures(); // already sorted by kickoff ascending
  const now = Date.now();
  // In-play right now — surfaced on top.
  const live = fixtures.filter((f) => f.status === "live");
  // The rest of today's matches (live ones get their own section above).
  const today = fixtures.filter(
    (f) => isToday(f.kickoff) && f.status !== "live",
  );
  // Future days only (today lives in its own section), soonest first.
  const upcoming = fixtures
    .filter(
      (f) =>
        f.status === "scheduled" &&
        Date.parse(f.kickoff) >= now &&
        !isToday(f.kickoff),
    )
    .slice(0, 8);
  // Most recent first, excluding today.
  const recent = fixtures
    .filter((f) => f.status === "finished" && !isToday(f.kickoff))
    .slice(-6)
    .reverse();
  return { live, today, upcoming, recent };
}
