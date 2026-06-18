// Live-score origin: ESPN's free, undocumented site API. No key, no signup.
// Provides real in-play status, running score, match minute AND the live goal
// timeline (scorer + minute) for the 2026 World Cup. Used to OVERLAY live data
// onto the openfootball spine — never the source of truth for fixtures/teams.
// Undocumented: parse defensively.
import "server-only";

import type { Lineup, Player, Position, Team } from "@/lib/types";
import { resolveTeam } from "@/lib/teams/registry";
import { gridForFormation } from "@/lib/data/generate";
import { fetchWithTimeout } from "@/lib/api/http";

const BASE =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";
const SUMMARY =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary";

export type EspnState = "pre" | "in" | "post";

export interface EspnGoal {
  code: string; // canonical code of the team the goal counted for
  minute: string; // "6", "45+5"
  scorer: string;
  ownGoal: boolean;
  penalty: boolean;
}

export interface EspnLive {
  state: EspnState;
  minute: string | null; // displayClock, e.g. "70'"
  /** ESPN event id — used to fetch the match summary (real line-ups). */
  eventId: string | null;
  /** running score keyed by canonical team code */
  scores: Record<string, number>;
  goals: EspnGoal[];
}

/** Unordered pair key on canonical team codes. */
export function pairCodeKey(a: string, b: string): string {
  return [a, b].sort().join("-");
}

interface EspnTeam {
  id?: string | number;
  displayName?: string;
  shortDisplayName?: string;
  abbreviation?: string;
}
interface EspnCompetitor {
  homeAway?: string;
  score?: string;
  team?: EspnTeam;
}
interface EspnDetail {
  scoringPlay?: boolean;
  shootout?: boolean;
  ownGoal?: boolean;
  penaltyKick?: boolean;
  clock?: { displayValue?: string };
  team?: { id?: string | number };
  athletesInvolved?: { displayName?: string }[];
}
interface EspnEvent {
  id?: string | number;
  competitions?: {
    status?: { displayClock?: string; type?: { state?: string } };
    competitors?: EspnCompetitor[];
    details?: EspnDetail[];
  }[];
}

function ymd(d: Date): string {
  return (
    d.getUTCFullYear().toString() +
    String(d.getUTCMonth() + 1).padStart(2, "0") +
    String(d.getUTCDate()).padStart(2, "0")
  );
}

function teamCode(t: EspnTeam | undefined): string | null {
  if (!t) return null;
  return (
    resolveTeam(t.displayName ?? "")?.code ??
    resolveTeam(t.shortDisplayName ?? "")?.code ??
    resolveTeam(t.abbreviation ?? "")?.code ??
    null
  );
}

function minuteKey(m: string): number {
  const mm = /^(\d+)(?:\+(\d+))?/.exec(m);
  if (!mm) return 999;
  return parseInt(mm[1], 10) + (mm[2] ? parseInt(mm[2], 10) / 100 : 0);
}

/**
 * Fetch the live scoreboard for a small UTC window around now and return a map
 * keyed by the unordered team-code pair. Best-effort: returns an empty map on
 * any failure so the caller can fall back to spine data.
 */
export async function fetchEspnLive(revalidate = 15): Promise<Map<string, EspnLive>> {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
  const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
  const url = `${BASE}?dates=${ymd(yesterday)}-${ymd(tomorrow)}`;

  const res = await fetchWithTimeout(url, { next: { revalidate } });
  if (!res.ok) throw new Error(`espn -> ${res.status}`);
  const data = (await res.json()) as { events?: EspnEvent[] };

  const map = new Map<string, EspnLive>();
  for (const ev of data.events ?? []) {
    const comp = ev.competitions?.[0];
    const state = comp?.status?.type?.state as EspnState | undefined;
    const competitors = comp?.competitors ?? [];
    if (!state || competitors.length !== 2) continue;

    const scores: Record<string, number> = {};
    const teamIdToCode = new Map<string, string>();
    let ok = true;
    for (const c of competitors) {
      const code = teamCode(c.team);
      if (!code) {
        ok = false;
        break;
      }
      const score = Number(c.score ?? 0);
      if (!Number.isFinite(score)) {
        ok = false; // malformed score — skip the event rather than invent a 0-0
        break;
      }
      scores[code] = score;
      if (c.team?.id != null) teamIdToCode.set(String(c.team.id), code);
    }
    if (!ok) continue;

    const goals: EspnGoal[] = [];
    for (const d of comp?.details ?? []) {
      if (!d.scoringPlay || d.shootout) continue; // goals only, exclude shootouts
      const code = d.team?.id != null ? teamIdToCode.get(String(d.team.id)) : undefined;
      if (!code) continue;
      goals.push({
        code,
        minute: (d.clock?.displayValue ?? "").replace(/['\s]/g, ""),
        scorer: d.athletesInvolved?.[0]?.displayName ?? "",
        ownGoal: Boolean(d.ownGoal),
        penalty: Boolean(d.penaltyKick),
      });
    }
    goals.sort((a, b) => minuteKey(a.minute) - minuteKey(b.minute));

    const codes = Object.keys(scores);
    map.set(pairCodeKey(codes[0], codes[1]), {
      state,
      minute: state === "in" ? (comp?.status?.displayClock ?? null) : null,
      eventId: ev.id != null ? String(ev.id) : null,
      scores,
      goals,
    });
  }
  return map;
}

// --- Real line-ups (match summary endpoint) -------------------------------
// The scoreboard has scores but no XI; the per-event `summary` endpoint carries
// each side's real starting XI, formation and bench. Parsed into Lineup objects
// (source: "live") so live/finished matches show real players, not placeholders.

interface EspnRosterAthlete {
  id?: string | number;
  displayName?: string;
  fullName?: string;
}
interface EspnRosterEntry {
  starter?: boolean;
  jersey?: string;
  athlete?: EspnRosterAthlete;
  position?: { abbreviation?: string; name?: string; displayName?: string };
}
interface EspnRoster {
  homeAway?: string;
  formation?: string;
  team?: EspnTeam;
  roster?: EspnRosterEntry[];
}
interface EspnSummary {
  rosters?: EspnRoster[];
}

/** Map an ESPN position to our four-bucket scheme (name first, abbr fallback). */
function classifyPosition(entry: EspnRosterEntry): Position {
  const name = (entry.position?.name ?? "").toLowerCase();
  if (name.includes("goalkeeper")) return "GK";
  if (name.includes("defender") || name.includes("back")) return "DEF";
  if (name.includes("midfield")) return "MID";
  if (
    name.includes("forward") ||
    name.includes("striker") ||
    name.includes("winger")
  )
    return "FWD";
  // Fall back to the abbreviation base (e.g. "CD-L" -> "CD") for odd labels.
  const base = (entry.position?.abbreviation ?? "").toUpperCase().split("-")[0];
  if (base === "G" || base === "GK") return "GK";
  if (["CD", "CB", "LB", "RB", "LWB", "RWB", "SW", "D", "WB"].includes(base))
    return "DEF";
  if (["F", "CF", "ST", "S", "LW", "RW", "W"].includes(base)) return "FWD";
  return "MID";
}

function toPlayer(entry: EspnRosterEntry, teamId: number, idx: number): Player {
  const num = entry.jersey ? parseInt(entry.jersey, 10) : NaN;
  return {
    id: entry.athlete?.id != null ? Number(entry.athlete.id) : teamId * 1000 + idx,
    name: entry.athlete?.displayName ?? entry.athlete?.fullName ?? "—",
    number: Number.isFinite(num) ? num : null,
    position: classifyPosition(entry),
    club: null,
    age: null,
  };
}

function buildLineup(roster: EspnRoster, team: Team): Lineup | null {
  const entries = roster.roster ?? [];
  const starters = entries.filter((e) => e.starter);
  if (!starters.length) return null;

  const players = starters.map((e, i) => toPlayer(e, team.id, i));
  const gk = players.filter((p) => p.position === "GK");
  const def = players.filter((p) => p.position === "DEF");
  const mid = players.filter((p) => p.position === "MID");
  const fwd = players.filter((p) => p.position === "FWD");
  // GK first, then back-to-front: gridForFormation lays rows out in this order.
  const ordered = [...gk, ...def, ...mid, ...fwd];

  // Use ESPN's reported formation when it accounts for all outfield players,
  // else derive one from the classified counts so the pitch always has a shape.
  const reported = (roster.formation ?? "").trim();
  const parts = reported.split("-").map((n) => parseInt(n, 10));
  const outfield = ordered.length - 1;
  const validFormation =
    parts.length >= 2 &&
    parts.every((n) => Number.isFinite(n) && n > 0) &&
    parts.reduce((a, b) => a + b, 0) === outfield;
  const formation = validFormation
    ? reported
    : `${def.length}-${mid.length}-${fwd.length}`;
  const grids = gridForFormation(formation);

  const startXI = ordered.map((player, i) => ({ player, grid: grids[i] ?? null }));
  const substitutes = entries
    .filter((e) => !e.starter)
    .map((e, i) => toPlayer(e, team.id, 100 + i));

  return { team, formation, coach: null, startXI, substitutes, source: "live" };
}

/**
 * Fetch real line-ups for one event from ESPN's match summary. Each roster is
 * matched to the passed home/away Team by canonical code (orientation-agnostic).
 * Returns null per side when ESPN has no confirmed XI for it.
 */
export async function fetchEspnLineup(
  eventId: string,
  home: Team,
  away: Team,
  revalidate = 30,
): Promise<{ home: Lineup | null; away: Lineup | null }> {
  const url = `${SUMMARY}?event=${encodeURIComponent(eventId)}`;
  const res = await fetchWithTimeout(url, { next: { revalidate } });
  if (!res.ok) throw new Error(`espn summary -> ${res.status}`);
  const data = (await res.json()) as EspnSummary;

  let homeLineup: Lineup | null = null;
  let awayLineup: Lineup | null = null;
  for (const roster of data.rosters ?? []) {
    const code = teamCode(roster.team);
    if (code === home.code) homeLineup = buildLineup(roster, home);
    else if (code === away.code) awayLineup = buildLineup(roster, away);
  }
  return { home: homeLineup, away: awayLineup };
}
