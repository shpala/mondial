// Spine origin: openfootball/worldcup.json — free, public-domain, no key.
// Provides the schedule, results, groups and goalscorers for the live 2026
// World Cup. We derive teams + standings from it. (No squads or lineups — those
// come from TheSportsDB.)
import "server-only";

import type { Fixture, Goal, Group, Team } from "@/lib/types";
import { resolveTeam } from "@/lib/teams/registry";
import { computeGroupStandings } from "@/lib/standings";

const SOURCE_URL =
  "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

interface OfGoal {
  name: string;
  minute: string | number;
  owngoal?: boolean;
  penalty?: boolean;
}
interface OfMatch {
  round: string;
  date: string;
  time?: string;
  team1: string;
  team2: string;
  score?: { ft?: [number, number]; ht?: [number, number] };
  goals1?: OfGoal[];
  goals2?: OfGoal[];
  group?: string;
  ground?: string;
}
interface OfFile {
  name: string;
  matches: OfMatch[];
}

function parseOffset(time?: string): string {
  if (!time) return "+00:00";
  const m = /UTC([+-]\d{1,2})(?::?(\d{2}))?/.exec(time);
  if (!m) return "+00:00";
  const sign = m[1].startsWith("-") ? "-" : "+";
  const hh = Math.abs(parseInt(m[1], 10)).toString().padStart(2, "0");
  const mm = (m[2] ?? "00").padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

function kickoffIso(date: string, time?: string): string {
  const hm = time ? /(\d{1,2}):(\d{2})/.exec(time) : null;
  const h = hm ? hm[1].padStart(2, "0") : "12";
  const min = hm ? hm[2] : "00";
  const iso = `${date}T${h}:${min}:00${parseOffset(time)}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? `${date}T12:00:00Z` : d.toISOString();
}

// Sort key for a minute string like "9", "45+2", "90+3".
function minuteKey(m: string): number {
  const mm = /^(\d+)(?:\+(\d+))?/.exec(m);
  if (!mm) return 999;
  return parseInt(mm[1], 10) + (mm[2] ? parseInt(mm[2], 10) / 100 : 0);
}

function parseGoals(m: OfMatch): Goal[] {
  const one = (arr: OfGoal[] | undefined, side: "home" | "away") =>
    (arr ?? []).map((g) => ({
      side,
      minute: String(g.minute ?? ""),
      scorer: g.name ?? "",
      ownGoal: Boolean(g.owngoal),
      penalty: Boolean(g.penalty),
    }));
  return [...one(m.goals1, "home"), ...one(m.goals2, "away")].sort(
    (a, b) => minuteKey(a.minute) - minuteKey(b.minute),
  );
}

function placeholderTeam(label: string, group: string): Team {
  return { id: 0, name: label, code: label, flag: "⚽", group, rating: 1500 };
}

function stageFromRound(round: string): { stage: string; isGroup: boolean } {
  if (/matchday/i.test(round)) return { stage: "Group Stage", isGroup: true };
  return { stage: round, isGroup: false };
}

// Deterministic numeric id from chronological position (stable ordering).
function mapMatch(m: OfMatch, index: number): Fixture {
  const groupLetter = m.group ? m.group.replace(/^Group\s*/i, "") : null;
  const { stage, isGroup } = stageFromRound(m.round);
  const home =
    resolveTeam(m.team1, groupLetter ?? "?") ??
    placeholderTeam(m.team1, groupLetter ?? "?");
  const away =
    resolveTeam(m.team2, groupLetter ?? "?") ??
    placeholderTeam(m.team2, groupLetter ?? "?");

  const ft = m.score?.ft;
  const finished = Array.isArray(ft) && ft.length === 2;
  const kickoff = kickoffIso(m.date, m.time);

  // openfootball has no live field, so we infer "in play": kickoff has passed,
  // no final score yet, and we're inside a ~2.5h match window.
  const startMs = Date.parse(kickoff);
  const LIVE_WINDOW = 150 * 60 * 1000;
  const now = Date.now();
  let status: Fixture["status"] = "scheduled";
  if (finished) status = "finished";
  else if (now >= startMs && now <= startMs + LIVE_WINDOW) status = "live";

  return {
    id: index + 1,
    stage,
    group: isGroup ? groupLetter : null,
    kickoff,
    status,
    venue: m.ground ?? null,
    home,
    away,
    homeGoals: finished ? ft![0] : null,
    awayGoals: finished ? ft![1] : null,
    goals: parseGoals(m),
  };
}

export interface OpenfootballData {
  fixtures: Fixture[];
  teams: Team[];
  groups: Group[];
}

export async function fetchOpenfootball(
  revalidate = 600,
): Promise<OpenfootballData> {
  const res = await fetch(SOURCE_URL, { next: { revalidate } });
  if (!res.ok) throw new Error(`openfootball -> ${res.status}`);
  const data = (await res.json()) as OfFile;
  if (!data.matches?.length) throw new Error("openfootball: empty matches");

  const fixtures = data.matches.map(mapMatch);

  // Unique real teams that appear in group-stage fixtures, carrying group.
  const teamMap = new Map<number, Team>();
  for (const f of fixtures) {
    if (f.group) {
      for (const t of [f.home, f.away]) {
        if (t.id !== 0 && !teamMap.has(t.id)) teamMap.set(t.id, t);
      }
    }
  }
  const teams = [...teamMap.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const groups = computeGroupStandings(teams, fixtures);
  return { fixtures, teams, groups };
}
