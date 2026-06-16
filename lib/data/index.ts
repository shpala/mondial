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

import type { Fixture, Group, Lineup, MatchLineups, Squad, Team } from "@/lib/types";
import { isToday } from "@/lib/format";
import { fetchOpenfootball } from "@/lib/api/sources/openfootball";
import {
  fetchEspnLineup,
  fetchEspnLive,
  pairCodeKey,
} from "@/lib/api/sources/espn";
import { fetchSquadTSDB, fetchLineupsTSDB } from "@/lib/api/sources/thesportsdb";
import { generateLineup, generateSquad } from "./generate";
import { computeLiveRatings, withLiveRating } from "@/lib/ratings";
import { teamByIdRegistry } from "@/lib/teams/registry";
import {
  TEAMS,
  matchLineups as snapshotLineups,
  resolveFixtureStatuses,
  squadForTeam,
  standings as snapshotStandings,
  teamById,
} from "./snapshot";

// Tracks whether the spine (openfootball) is serving live data, for the banner.
let spineLive = false;

export function usingSampleData(): boolean {
  return !spineLive;
}

async function trySpine() {
  try {
    const data = await fetchOpenfootball();
    spineLive = true;
    return data;
  } catch (err) {
    console.warn("[data] openfootball spine failed, using snapshot:", err);
    spineLive = false;
    return null;
  }
}

/** Chronological fixtures with real live scores overlaid, ratings untouched
 *  (pre-tournament seeds). The basis for live-rating computation. */
async function rawFixtures(): Promise<Fixture[]> {
  const spine = await trySpine();
  const fixtures = spine ? spine.fixtures : resolveFixtureStatuses(Date.now());
  // Always chronological so every consumer (dashboard, schedule, bracket) is
  // ordered by date.
  const sorted = [...fixtures].sort(
    (a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff),
  );
  return overlayLiveScores(sorted);
}

/** Seed-rating fixtures (live scores overlaid, ratings = pre-tournament seeds).
 *  The basis for model-accuracy grading, which must roll Elo from the seeds. */
export async function getRawFixtures(): Promise<Fixture[]> {
  return rawFixtures();
}

export async function getFixtures(): Promise<Fixture[]> {
  const fixtures = await rawFixtures();
  // Overlay live Elo so each fixture's win probability reflects results so far.
  const live = computeLiveRatings(fixtures);
  if (!live.size) return fixtures;
  return fixtures.map((f) => ({
    ...f,
    home: withLiveRating(f.home, live),
    away: withLiveRating(f.away, live),
  }));
}

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
    liveMap = await fetchEspnLive();
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
      const liveMap = await fetchEspnLive();
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
