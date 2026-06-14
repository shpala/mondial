// Domain models for the app. These are the shapes the UI consumes — the
// API-Football client (lib/api/*) and the seeded snapshot both produce these,
// so screens never see raw provider JSON.

export type Position = "GK" | "DEF" | "MID" | "FWD";

export interface Team {
  id: number;
  name: string;
  /** ISO-ish 3-letter code used for flags + short labels, e.g. "BRA". */
  code: string;
  flag: string; // emoji or url
  group: string; // "A".."L"
  /** Pre-tournament strength rating (Elo-like). Used by the prediction model. */
  rating: number;
}

export interface Player {
  id: number;
  name: string;
  number: number | null;
  position: Position;
  club: string | null;
  age: number | null;
}

/** Where a squad/lineup came from: a real provider, or fabricated as a fallback. */
export type DataSource = "live" | "generated";

export interface Squad {
  team: Team;
  players: Player[];
  source: DataSource;
}

export interface GroupRow {
  team: Team;
  played: number;
  win: number;
  draw: number;
  loss: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  rank: number;
}

export interface Group {
  name: string; // "A".."L"
  rows: GroupRow[];
}

export type FixtureStatus = "scheduled" | "live" | "finished";

export interface Fixture {
  id: number;
  stage: string; // "Group Stage" | "Round of 32" | ...
  group: string | null;
  kickoff: string; // ISO timestamp
  status: FixtureStatus;
  venue: string | null;
  home: Team;
  away: Team;
  homeGoals: number | null;
  awayGoals: number | null;
}

export interface LineupPlayer {
  player: Player;
  /** Grid position "row:col" as provided by API-Football, e.g. "2:3". */
  grid: string | null;
}

export interface Lineup {
  team: Team;
  formation: string; // e.g. "4-3-3"
  coach: string | null;
  startXI: LineupPlayer[];
  substitutes: Player[];
  source: DataSource;
}

export interface MatchLineups {
  fixture: Fixture;
  home: Lineup | null;
  away: Lineup | null;
}
