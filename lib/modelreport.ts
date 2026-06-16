// Grade the prediction model against real, finished results. Pure — no I/O, no
// Date/Math.random — so it runs identically on the server and in tests. Reuses
// the live-Elo roll and the Davidson outcome model; never mutates inputs.
import type { Fixture, Group, Team } from "@/lib/types";
import { effectiveRating } from "@/lib/prediction";
import { eloUpdate } from "@/lib/ratings";
import { outcomeProbs, simulateTournament, type TeamOdds } from "@/lib/montecarlo";
import { qualifiedTeams } from "@/lib/qualifiers";

export type Outcome3 = "home" | "draw" | "away";

export interface MatchGrade {
  date: string;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  predicted: { home: number; draw: number; away: number };
  actual: Outcome3;
  correct: boolean;
}

export interface ReliabilityBucket {
  bucket: number; // 0..9
  predicted: number;
  observed: number;
  count: number;
}

export interface OutcomeReport {
  n: number;
  logLoss: number;
  brier: number;
  baselineLogLoss: number; // ln 3 — the uniform no-skill forecast
  hits: number; // matches where the model's most-likely outcome was correct
  reliability: ReliabilityBucket[];
  perMatch: MatchGrade[];
}

const BASELINE_LOGLOSS = Math.log(3);

function isFinishedReal(f: Fixture): boolean {
  return (
    f.status === "finished" &&
    f.home.id !== 0 && f.away.id !== 0 &&
    f.homeGoals != null && f.awayGoals != null
  );
}

function outcomeOf(hg: number, ag: number): Outcome3 {
  return hg > ag ? "home" : hg < ag ? "away" : "draw";
}

export function gradeOutcomes(fixtures: Fixture[]): OutcomeReport {
  // Seed ratings from the fixtures' own teams (never mutated → always the seed).
  const rating = new Map<number, number>();
  const host = new Map<number, boolean>();
  const seed = (t: Team) => {
    if (t.id !== 0 && !rating.has(t.id)) {
      rating.set(t.id, t.rating);
      host.set(t.id, !!t.host);
    }
  };
  for (const f of fixtures) { seed(f.home); seed(f.away); }

  const finished = fixtures
    .filter((f) => f.stage === "Group Stage" && isFinishedReal(f))
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));

  let logLoss = 0, brier = 0, hits = 0;
  const relP = new Array(10).fill(0);
  const relH = new Array(10).fill(0);
  const relN = new Array(10).fill(0);
  const perMatch: MatchGrade[] = [];

  for (const f of finished) {
    const h = f.home.id, a = f.away.id;
    const eh = effectiveRating({ rating: rating.get(h)!, host: host.get(h) });
    const ea = effectiveRating({ rating: rating.get(a)!, host: host.get(a) });
    const p = outcomeProbs(
      { rating: rating.get(h)!, host: host.get(h) },
      { rating: rating.get(a)!, host: host.get(a) },
    );
    const actual = outcomeOf(f.homeGoals!, f.awayGoals!);

    logLoss += -Math.log(Math.max(p[actual], 1e-15));
    for (const key of ["home", "draw", "away"] as Outcome3[]) {
      const y = actual === key ? 1 : 0;
      brier += (p[key] - y) ** 2;
      const b = Math.min(9, Math.floor(p[key] * 10));
      relP[b] += p[key]; relH[b] += y; relN[b] += 1;
    }
    const fav = (["home", "draw", "away"] as Outcome3[]).reduce((m, k) =>
      p[k] > p[m] ? k : m, "home" as Outcome3);
    const correct = fav === actual;
    if (correct) hits++;

    perMatch.push({
      date: f.kickoff.slice(0, 10),
      home: f.home.name, away: f.away.name,
      homeGoals: f.homeGoals!, awayGoals: f.awayGoals!,
      predicted: p, actual, correct,
    });

    // Roll the result in AFTER scoring (host-adjusted Elo, same K as the model).
    const d = eloUpdate(eh, ea, f.homeGoals!, f.awayGoals!);
    rating.set(h, rating.get(h)! + d);
    rating.set(a, rating.get(a)! - d);
  }

  const n = finished.length;
  const reliability = relN
    .map((cnt, i) => ({
      bucket: i,
      predicted: cnt ? relP[i] / cnt : 0,
      observed: cnt ? relH[i] / cnt : 0,
      count: cnt,
    }))
    .filter((r) => r.count > 0);

  return {
    n,
    logLoss: n ? logLoss / n : 0,
    brier: n ? brier / n : 0,
    baselineLogLoss: BASELINE_LOGLOSS,
    hits,
    reliability,
    perMatch,
  };
}

export interface QualMark {
  team: string;
  predicted: number; // pre-tournament escapeGroup prob
  advanced: boolean;
}
export interface QualificationReport {
  n: number; // teams whose fate is determined and scored
  brier: number;
  groupsComplete: number;
  allGroupsComplete: boolean;
  notableHits: QualMark[]; // advanced & model gave low odds, or out & high odds
  notableMisses: QualMark[];
}

const groupComplete = (g: Group) => g.rows.every((r) => r.played >= 3);

export function gradeQualification(
  fixtures: Fixture[],
  groups: Group[],
  preOdds?: TeamOdds[],
): QualificationReport {
  const groupFixtures = fixtures.filter((f) => f.stage === "Group Stage");

  // Pre-tournament odds: strip all group results, simulate from seeds. Callers
  // that already ran this simulation (e.g. the /model page, for the title
  // favourites) can pass it in via `preOdds` to avoid simulating twice.
  const odds =
    preOdds ??
    (() => {
      const stripped = groupFixtures.map((f) => ({
        ...f, status: "scheduled" as const, homeGoals: null, awayGoals: null,
      }));
      return stripped.length ? simulateTournament(stripped) : [];
    })();
  const escape = new Map<number, number>(); // teamId -> escapeGroup
  for (const o of odds) escape.set(o.team.id, o.escapeGroup);

  const complete = groups.filter(groupComplete);
  const allComplete = groups.length > 0 && complete.length === groups.length;
  const actualQualifiers = new Set(qualifiedTeams(groups).map((t) => t.id));

  const marks: QualMark[] = [];
  for (const g of complete) {
    // rows are rank-ordered by computeGroupStandings (1st..4th).
    g.rows.forEach((row, rank) => {
      const determined = rank === 0 || rank === 1 || rank === 3 || allComplete;
      if (!determined) return; // 3rd place: defer until every group is done
      const advanced =
        rank <= 1 ? true : rank === 3 ? false : actualQualifiers.has(row.team.id);
      marks.push({
        team: row.team.name,
        predicted: escape.get(row.team.id) ?? 0,
        advanced,
      });
    });
  }

  const n = marks.length;
  const brier = n
    ? marks.reduce((s, m) => s + (m.predicted - (m.advanced ? 1 : 0)) ** 2, 0) / n
    : 0;

  // Notable: advanced despite low odds, or eliminated despite high odds.
  const surprises = [...marks].sort(
    (a, b) =>
      Math.abs((b.advanced ? 1 : 0) - b.predicted) -
      Math.abs((a.advanced ? 1 : 0) - a.predicted),
  );
  return {
    n,
    brier,
    groupsComplete: complete.length,
    allGroupsComplete: allComplete,
    notableHits: surprises.filter((m) => m.advanced).slice(0, 3),
    notableMisses: surprises.filter((m) => !m.advanced).slice(0, 3),
  };
}
