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

import type { Fixture, Group, MatchLineups, Squad, Team } from "@/lib/types";
import { isToday } from "@/lib/format";
import { fetchOpenfootball } from "@/lib/api/sources/openfootball";
import { fetchSquadTSDB, fetchLineupsTSDB } from "@/lib/api/sources/thesportsdb";
import { generateLineup, generateSquad } from "./generate";
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

export async function getFixtures(): Promise<Fixture[]> {
  const spine = await trySpine();
  const fixtures = spine ? spine.fixtures : resolveFixtureStatuses(Date.now());
  // Always chronological so every consumer (dashboard, schedule, bracket) is
  // ordered by date.
  return [...fixtures].sort(
    (a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff),
  );
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

  let home = null;
  let away = null;
  try {
    const live = await fetchLineupsTSDB(fixture);
    if (live) {
      home = live.home;
      away = live.away;
    }
  } catch (err) {
    console.warn("[data] TheSportsDB lineups failed, generating:", err);
  }

  // Fill any missing side with a generated XI so the pitch always renders
  // (real placeholder knockout slots — id 0 — get no generated XI).
  if (!home && fixture.home.id !== 0) home = generateLineup(fixture.home);
  if (!away && fixture.away.id !== 0) away = generateLineup(fixture.away);

  return { fixture, home, away };
}

/** Fixtures grouped for the dashboard: today, then next up, then recent. */
export async function getDashboardFixtures(): Promise<{
  today: Fixture[];
  upcoming: Fixture[];
  recent: Fixture[];
}> {
  const fixtures = await getFixtures(); // already sorted by kickoff ascending
  const now = Date.now();
  // Everything kicking off today (live + done + still to come), soonest first.
  const today = fixtures.filter((f) => isToday(f.kickoff));
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
  return { today, upcoming, recent };
}
