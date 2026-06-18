// Bundled 2026 World Cup snapshot — the universal fallback when no live origin
// is reachable. Illustrative sample data (plausible but not authoritative);
// the UI shows a "sample data" banner whenever it is in use.

import type { Fixture, Group, MatchLineups, Squad, Team } from "@/lib/types";
import { generateLineup, generateSquad } from "./generate";
import { computeGroupStandings } from "@/lib/standings";
import { effectiveRating } from "@/lib/prediction";

const GROUP_LETTERS = "ABCDEFGHIJKL".split(""); // 12 groups

// 4 pots of 12, snake-assigned across the 12 groups. [name, code, flag, rating]
// Ratings are World Football Elo (eloratings.net, June 2026). Pot membership is
// the fixed draw structure (hosts seeded into Pot 1), not recomputed from rating.
type Seed = [string, string, string, number];

const HOST_CODES = new Set(["MEX", "CAN", "USA"]);

const POT1: Seed[] = [
  ["Mexico", "MEX", "🇲🇽", 1881],
  ["Canada", "CAN", "🇨🇦", 1767],
  ["United States", "USA", "🇺🇸", 1780],
  ["Argentina", "ARG", "🇦🇷", 2115],
  ["France", "FRA", "🇫🇷", 2063],
  ["Spain", "ESP", "🇪🇸", 2129],
  ["England", "ENG", "🏴", 2024],
  ["Brazil", "BRA", "🇧🇷", 1978],
  ["Portugal", "POR", "🇵🇹", 1989],
  ["Netherlands", "NED", "🇳🇱", 1944],
  ["Germany", "GER", "🇩🇪", 1939],
  ["Belgium", "BEL", "🇧🇪", 1894],
];
const POT2: Seed[] = [
  ["Croatia", "CRO", "🇭🇷", 1912],
  ["Morocco", "MAR", "🇲🇦", 1840],
  ["Japan", "JPN", "🇯🇵", 1910],
  ["Uruguay", "URU", "🇺🇾", 1892],
  ["Colombia", "COL", "🇨🇴", 1982],
  ["Senegal", "SEN", "🇸🇳", 1860],
  ["Switzerland", "SUI", "🇨🇭", 1865],
  ["Turkey", "TUR", "🇹🇷", 1849],
  ["Korea Republic", "KOR", "🇰🇷", 1786],
  ["Ecuador", "ECU", "🇪🇨", 1890],
  ["Austria", "AUT", "🇦🇹", 1830],
  ["Australia", "AUS", "🇦🇺", 1839],
];
const POT3: Seed[] = [
  ["Scotland", "SCO", "🏴󠁧󠁢󠁳󠁣󠁴󠁿", 1794],
  ["Norway", "NOR", "🇳🇴", 1914],
  ["Egypt", "EGY", "🇪🇬", 1696],
  ["Czech Republic", "CZE", "🇨🇿", 1712],
  ["Sweden", "SWE", "🇸🇪", 1755],
  ["DR Congo", "COD", "🇨🇩", 1652],
  ["Bosnia & Herzegovina", "BIH", "🇧🇦", 1616],
  ["Iraq", "IRQ", "🇮🇶", 1607],
  ["Côte d'Ivoire", "CIV", "🇨🇮", 1743],
  ["Tunisia", "TUN", "🇹🇳", 1585],
  ["Iran", "IRN", "🇮🇷", 1772],
  ["Saudi Arabia", "KSA", "🇸🇦", 1576],
];
const POT4: Seed[] = [
  ["Ghana", "GHA", "🇬🇭", 1510],
  ["Qatar", "QAT", "🇶🇦", 1447],
  ["Jordan", "JOR", "🇯🇴", 1680],
  ["New Zealand", "NZL", "🇳🇿", 1562],
  ["Panama", "PAN", "🇵🇦", 1730],
  ["Cape Verde", "CPV", "🇨🇻", 1606],
  ["Uzbekistan", "UZB", "🇺🇿", 1714],
  ["Haiti", "HAI", "🇭🇹", 1536],
  ["Curaçao", "CUW", "🇨🇼", 1427],
  ["South Africa", "RSA", "🇿🇦", 1511],
  ["Algeria", "ALG", "🇩🇿", 1772],
  ["Paraguay", "PAR", "🇵🇾", 1780],
];

function buildTeams(): Team[] {
  const teams: Team[] = [];
  let id = 1;
  [POT1, POT2, POT3, POT4].forEach((pot, potIndex) => {
    pot.forEach((seed, i) => {
      const groupIndex = potIndex % 2 === 0 ? i : GROUP_LETTERS.length - 1 - i;
      const [name, code, flag, rating] = seed;
      teams.push({
        id: id++,
        name,
        code,
        flag,
        rating,
        group: GROUP_LETTERS[groupIndex],
        ...(HOST_CODES.has(code) ? { host: true } : {}),
      });
    });
  });
  return teams.sort((a, b) => a.id - b.id);
}

export const TEAMS: Team[] = buildTeams();

const TEAM_BY_ID = new Map(TEAMS.map((t) => [t.id, t]));
const TEAM_BY_CODE = new Map(TEAMS.map((t) => [t.code, t]));

export function teamById(id: number): Team | undefined {
  return TEAM_BY_ID.get(id);
}
export function teamByCode(code: string): Team | undefined {
  return TEAM_BY_CODE.get(code);
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GROUP_STAGE_START = Date.UTC(2026, 5, 11, 16, 0, 0); // 2026-06-11
const DAY = 24 * 60 * 60 * 1000;

const ROUND_ROBIN: [number, number][][] = [
  [[0, 1], [2, 3]],
  [[0, 2], [1, 3]],
  [[0, 3], [1, 2]],
];

function scoreFromRng(rng: () => number, ratingDiff: number): number {
  const base = rng() * 3;
  const bias = Math.max(0, ratingDiff / 250);
  return Math.min(5, Math.round(base + bias * rng()));
}

let FIXTURE_CACHE: Fixture[] | null = null;

export function groupFixtures(): Fixture[] {
  if (FIXTURE_CACHE) return FIXTURE_CACHE;
  const fixtures: Fixture[] = [];
  let fid = 1000;
  GROUP_LETTERS.forEach((letter, gi) => {
    const groupTeams = TEAMS.filter((t) => t.group === letter);
    ROUND_ROBIN.forEach((round, ri) => {
      round.forEach(([a, b], mi) => {
        const home = groupTeams[a];
        const away = groupTeams[b];
        if (!home || !away) return;
        const kickoffMs =
          GROUP_STAGE_START + (ri * 5 + gi) * (DAY / 2) + mi * (DAY / 6);
        const rng = mulberry32(fid);
        const ratingDiff = effectiveRating(home) - effectiveRating(away);
        fixtures.push({
          id: fid++,
          stage: "Group Stage",
          group: letter,
          kickoff: new Date(kickoffMs).toISOString(),
          status: "scheduled",
          venue: null,
          home,
          away,
          homeGoals: scoreFromRng(rng, ratingDiff),
          awayGoals: scoreFromRng(rng, -ratingDiff),
          minute: null,
          goals: [],
        });
      });
    });
  });
  FIXTURE_CACHE = fixtures;
  return fixtures;
}

export function resolveFixtureStatuses(now: number): Fixture[] {
  return groupFixtures().map((f) => {
    const start = Date.parse(f.kickoff);
    const end = start + 110 * 60 * 1000;
    if (now >= end) return { ...f, status: "finished" as const };
    if (now >= start) return { ...f, status: "live" as const };
    return { ...f, status: "scheduled" as const, homeGoals: null, awayGoals: null };
  });
}

export function standings(now: number): Group[] {
  return computeGroupStandings(TEAMS, resolveFixtureStatuses(now));
}

export function squadForTeam(teamId: number): Squad {
  const team = teamById(teamId);
  if (!team) throw new Error(`Unknown team ${teamId}`);
  return generateSquad(team);
}

export function matchLineups(fixtureId: number, now: number): MatchLineups | null {
  const fixture = resolveFixtureStatuses(now).find((f) => f.id === fixtureId);
  if (!fixture) return null;
  return {
    fixture,
    home: generateLineup(fixture.home),
    away: generateLineup(fixture.away),
  };
}
