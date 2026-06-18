// Enrichment origin: TheSportsDB — free key ("3" test key by default, or set
// THESPORTSDB_KEY to a Patreon key for full data). Provides squads and starting
// lineups, joined to the openfootball spine by country code + match date.
//
// Note: the free test key caps lineups to a handful of players. When a lineup
// comes back too sparse to be useful we return null so the facade falls back to
// a generated XI.
import "server-only";

import type {
  Fixture,
  Lineup,
  LineupPlayer,
  Player,
  Position,
  Squad,
  Team,
} from "@/lib/types";
import { resolveTeam } from "@/lib/teams/registry";
import { fetchWithTimeout } from "@/lib/api/http";

const KEY = process.env.THESPORTSDB_KEY || "3";
const BASE = `https://www.thesportsdb.com/api/v1/json/${KEY}`;
const WORLD_CUP_LEAGUE = 4429;
const SEASON = process.env.WORLD_CUP_SEASON || "2026";
const MIN_USEFUL_XI = 7; // below this, fall back to a generated lineup
const MIN_USEFUL_SQUAD = 18; // below this (or no GK), fall back to a generated squad

async function tsdb<T>(path: string, revalidate = 600): Promise<T> {
  const res = await fetchWithTimeout(`${BASE}/${path}`, {
    next: { revalidate },
    headers: { "User-Agent": "mondial-app" },
  });
  if (!res.ok) throw new Error(`thesportsdb ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

function mapPosition(raw: string | null): Position {
  const p = (raw ?? "").toLowerCase();
  if (p.includes("keeper") || p === "gk") return "GK";
  if (p.includes("back") || p.includes("defen") || p.includes("centre-back"))
    return "DEF";
  if (
    p.includes("forward") ||
    p.includes("striker") ||
    p.includes("winger") ||
    p.includes("attack")
  )
    return "FWD";
  if (p.includes("midfield")) return "MID";
  return "MID";
}

// ---------------- squads ----------------

interface TsdbTeam {
  idTeam: string;
  strTeam: string;
  strSport: string;
}
interface TsdbPlayer {
  idPlayer: string;
  strPlayer: string;
  strPosition: string | null;
  strNumber: string | null;
}

async function findTeamId(team: Team): Promise<string | null> {
  const data = await tsdb<{ teams: TsdbTeam[] | null }>(
    `searchteams.php?t=${encodeURIComponent(team.name)}`,
  );
  const candidates = (data.teams ?? []).filter((t) => t.strSport === "Soccer");
  const match =
    candidates.find((t) => resolveTeam(t.strTeam)?.code === team.code) ??
    candidates[0];
  return match?.idTeam ?? null;
}

export async function fetchSquadTSDB(team: Team): Promise<Squad | null> {
  const teamId = await findTeamId(team);
  if (!teamId) return null;
  const data = await tsdb<{ player: TsdbPlayer[] | null }>(
    `lookup_all_players.php?id=${teamId}`,
  );
  const list = data.player ?? [];
  if (!list.length) return null;

  const players: Player[] = list.map((p, i) => ({
    id: Number(p.idPlayer) || team.id * 1000 + i,
    name: p.strPlayer,
    number: p.strNumber ? Number(p.strNumber) || null : null,
    position: mapPosition(p.strPosition),
    club: null,
    age: null,
  }));

  // Completeness gate: the free test key returns sparse rosters (often no
  // goalkeeper). Only trust the live squad when it looks like a real one;
  // otherwise let the facade generate a full XI.
  const hasGK = players.some((p) => p.position === "GK");
  if (players.length < MIN_USEFUL_SQUAD || !hasGK) return null;

  return { team, players, source: "live" };
}

// ---------------- lineups ----------------

interface TsdbEvent {
  idEvent: string;
  strHomeTeam: string;
  strAwayTeam: string;
  dateEvent: string;
}
interface TsdbLineupRow {
  strPlayer: string;
  strPosition: string | null;
  intSquadNumber: string | null;
  strHome: string; // "Yes" | "No"
  strSubstitute: string; // "Yes" | "No"
  idPlayer: string;
}

let seasonEventsCache: TsdbEvent[] | null = null;

async function seasonEvents(): Promise<TsdbEvent[]> {
  if (seasonEventsCache) return seasonEventsCache;
  const data = await tsdb<{ events: TsdbEvent[] | null }>(
    `eventsseason.php?id=${WORLD_CUP_LEAGUE}&s=${SEASON}`,
  );
  seasonEventsCache = data.events ?? [];
  return seasonEventsCache;
}

function eventMatchesFixture(e: TsdbEvent, fixture: Fixture): boolean {
  if (e.dateEvent !== fixture.kickoff.slice(0, 10)) return false;
  const eh = resolveTeam(e.strHomeTeam)?.code;
  const ea = resolveTeam(e.strAwayTeam)?.code;
  return eh === fixture.home.code && ea === fixture.away.code;
}

function buildLineup(team: Team, rows: TsdbLineupRow[]): Lineup | null {
  const starters = rows.filter((r) => r.strSubstitute !== "Yes");
  if (starters.length < MIN_USEFUL_XI) return null;

  const byPos: Record<Position, TsdbLineupRow[]> = {
    GK: [],
    DEF: [],
    MID: [],
    FWD: [],
  };
  for (const r of starters) byPos[mapPosition(r.strPosition)].push(r);

  const rowsOrder: Position[] = ["GK", "DEF", "MID", "FWD"];
  const startXI: LineupPlayer[] = [];
  rowsOrder.forEach((pos, rowIdx) => {
    byPos[pos].forEach((r, col) => {
      startXI.push({
        player: {
          id: Number(r.idPlayer) || team.id * 1000 + startXI.length,
          name: r.strPlayer,
          number: r.intSquadNumber ? Number(r.intSquadNumber) || null : null,
          position: pos,
          club: null,
          age: null,
        },
        grid: `${rowIdx + 1}:${col + 1}`,
      });
    });
  });

  const formation = `${byPos.DEF.length}-${byPos.MID.length}-${byPos.FWD.length}`;
  const substitutes: Player[] = rows
    .filter((r) => r.strSubstitute === "Yes")
    .map((r, i) => ({
      id: Number(r.idPlayer) || team.id * 2000 + i,
      name: r.strPlayer,
      number: r.intSquadNumber ? Number(r.intSquadNumber) || null : null,
      position: mapPosition(r.strPosition),
      club: null,
      age: null,
    }));

  return { team, formation, coach: null, startXI, substitutes, source: "live" };
}

export async function fetchLineupsTSDB(
  fixture: Fixture,
): Promise<{ home: Lineup | null; away: Lineup | null } | null> {
  const events = await seasonEvents();
  const event = events.find((e) => eventMatchesFixture(e, fixture));
  if (!event) return null;

  const data = await tsdb<{ lineup: TsdbLineupRow[] | null }>(
    `lookuplineup.php?id=${event.idEvent}`,
  );
  const rows = data.lineup ?? [];
  if (!rows.length) return null;

  const homeRows = rows.filter((r) => r.strHome === "Yes");
  const awayRows = rows.filter((r) => r.strHome !== "Yes");
  return {
    home: buildLineup(fixture.home, homeRows),
    away: buildLineup(fixture.away, awayRows),
  };
}
