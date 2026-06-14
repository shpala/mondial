// Live-score origin: ESPN's free, undocumented site API. No key, no signup.
// Provides real in-play status, running score, match minute AND the live goal
// timeline (scorer + minute) for the 2026 World Cup. Used to OVERLAY live data
// onto the openfootball spine — never the source of truth for fixtures/teams.
// Undocumented: parse defensively.
import "server-only";

import { resolveTeam } from "@/lib/teams/registry";

const BASE =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard";

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

  const res = await fetch(url, { next: { revalidate } });
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
      scores[code] = Number(c.score ?? 0) || 0;
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
      scores,
      goals,
    });
  }
  return map;
}
