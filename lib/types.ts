// Domain models for the app. These are the shapes the UI consumes — the source
// adapters in lib/api/sources/* (openfootball, ESPN, TheSportsDB) and the
// bundled snapshot both produce these, so screens never see raw provider JSON.

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
  /** True for the three host nations (USA/Mexico/Canada), who get a home-field
   *  bump in the prediction model. */
  host?: boolean;
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

/** A match result from the home side's perspective. The one shared union used
 *  by the prediction, scoreline, Monte Carlo, model-report and backtest code. */
export type MatchOutcome = "home" | "draw" | "away";

export interface Goal {
  side: "home" | "away"; // which team the goal counted for
  minute: string; // "9", "45+2", "90+3"
  scorer: string;
  ownGoal: boolean;
  penalty: boolean;
}

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
  /** Live match clock (e.g. "70'") when in play, else null. */
  minute: string | null;
  /** Goal timeline (scorer + minute), when the source provides it. */
  goals: Goal[];
  /** De-vigged market consensus 1X2 probabilities for an upcoming fixture when
   *  betting odds are available (lib/api/sources/oddsapi); absent otherwise. */
  marketProbs?: { home: number; draw: number; away: number } | null;
}

export interface LineupPlayer {
  player: Player;
  /** Grid position "row:col" (1-indexed, back-to-front rows), e.g. "2:3". */
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
