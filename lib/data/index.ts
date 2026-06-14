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
  if (spine) return spine.fixtures;
  return resolveFixtureStatuses(Date.now());
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

/** Fixtures grouped for the dashboard: live now, then next up, then recent. */
export async function getDashboardFixtures(): Promise<{
  live: Fixture[];
  upcoming: Fixture[];
  recent: Fixture[];
}> {
  const fixtures = await getFixtures();
  const live = fixtures.filter((f) => f.status === "live");
  const now = Date.now();
  const upcoming = fixtures
    .filter((f) => f.status === "scheduled" && Date.parse(f.kickoff) >= now)
    .slice(0, 8);
  const recent = fixtures
    .filter((f) => f.status === "finished")
    .slice(-6)
    .reverse();
  return { live, upcoming, recent };
}
