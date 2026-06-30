// Grade the prediction model against real, finished results. Pure — no I/O, no
// Date/Math.random — so it runs identically on the server and in tests. Reuses
// the live-Elo roll and the Davidson outcome model; never mutates inputs.
import type { Fixture, Group, MatchOutcome, Team } from "@/lib/types";
import { bracketAdvanceProbability, effectiveRating } from "@/lib/prediction";
import { decidedWinnerId } from "@/lib/bracket-results";
import { eloUpdate } from "@/lib/ratings";
import { outcomeOf } from "@/lib/outcome";
import { outcomeProbs, simulateTournament, type TeamOdds } from "@/lib/montecarlo";
import { qualifiedTeams } from "@/lib/qualifiers";

export interface MatchGrade {
  date: string;
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  /** Group games: 3-way win/draw/away masses. Knockouts: advance probabilities
   *  (home = P(home advances), away = its complement, draw always 0). */
  predicted: { home: number; draw: number; away: number };
  /** Group games: "home"|"draw"|"away" from the score. Knockouts: "home"|"away"
   *  for the side that advanced (penalties included) — never "draw". */
  actual: MatchOutcome;
  correct: boolean;
  stage: string; // "Group Stage" | "Round of 32" | … — lets the UI tag each row
  /** Penalty-shootout tally (home/away) for a knockout decided on penalties, so
   *  the match history can show "1–1 (4–3 pens)"; null otherwise. */
  shootout?: { home: number; away: number } | null;
}

export interface ReliabilityBucket {
  bucket: number; // 0..9
  predicted: number;
  observed: number;
  count: number;
}

/** A graded slice of the schedule (one prediction task). Group games and knockout
 *  ties are scored as different tasks — 3-way vs binary-advance — so each carries
 *  its own no-skill baseline (ln 3 vs ln 2) and calibration curve. */
export interface StageOutcome {
  n: number;
  logLoss: number;
  brier: number;
  baselineLogLoss: number;
  hits: number; // matches where the model's most-likely outcome was correct
  reliability: ReliabilityBucket[];
  perMatch: MatchGrade[];
}

export interface OutcomeReport {
  // Group stage (3-way W/D/L). Top-level for backward-compat with existing callers.
  n: number;
  logLoss: number;
  brier: number;
  baselineLogLoss: number; // ln 3 — the uniform no-skill 3-way forecast
  hits: number;
  reliability: ReliabilityBucket[];
  perMatch: MatchGrade[];
  // Knockout ties graded as advance calls (binary, baseline ln 2).
  knockout: StageOutcome;
  // Combined across every game up to the final (the headline track record).
  totalN: number;
  totalHits: number;
}

const BASELINE_LOGLOSS = Math.log(3);
const KO_BASELINE_LOGLOSS = Math.log(2);

// A reliability diagram is only meaningful with enough events spread across
// enough probability bins — below this a few games pin every bin's observed
// rate to 0% or 100% (a misleading scatter on the chart's rails). The group
// stage (~216 events over ~6 bins) clears it; an early knockout stage (~8
// events) does not, and should fall back to a per-match view instead.
const MIN_RELIABILITY_BINS = 4;
const MIN_RELIABILITY_EVENTS = 30;

/**
 * Greedy first-fit row assignment for strip marks. Given ascending x positions,
 * return a row index per mark such that no two marks in the same row are closer
 * than `minDx` — so glyphs never overlap, and a cluster of similar values stacks
 * onto extra rows instead of colliding. Used by the small-sample advance-call
 * strip (where vertical position carries no meaning, only x = confidence does).
 */
export function packStripRows(xs: number[], minDx: number): number[] {
  const rowLastX: number[] = [];
  return xs.map((x) => {
    let row = rowLastX.findIndex((lastX) => x - lastX >= minDx);
    if (row === -1) {
      row = rowLastX.length;
      rowLastX.push(x);
    } else {
      rowLastX[row] = x;
    }
    return row;
  });
}

/** Whether a reliability sample is large enough to plot as a calibration curve
 *  (vs. a misleading small-n scatter). Counts populated bins and total events. */
export function reliabilityIsAdequate(reliability: ReliabilityBucket[]): boolean {
  const pts = reliability.filter((r) => r.count > 0);
  const events = pts.reduce((s, p) => s + p.count, 0);
  return pts.length >= MIN_RELIABILITY_BINS && events >= MIN_RELIABILITY_EVENTS;
}

/** Reliability diagram rows from per-bucket sums (predicted mass, observed hits,
 *  count), keeping only populated buckets. */
function buildReliability(
  relP: number[],
  relH: number[],
  relN: number[],
): ReliabilityBucket[] {
  return relN
    .map((cnt, i) => ({
      bucket: i,
      predicted: cnt ? relP[i] / cnt : 0,
      observed: cnt ? relH[i] / cnt : 0,
      count: cnt,
    }))
    .filter((r) => r.count > 0);
}

function isFinishedReal(f: Fixture): boolean {
  return (
    f.status === "finished" &&
    f.home.id !== 0 && f.away.id !== 0 &&
    f.homeGoals != null && f.awayGoals != null
  );
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

  // Every finished real game, oldest first, so Elo rolls forward through the
  // group stage AND into the knockouts before each later game is predicted.
  const finished = fixtures
    .filter(isFinishedReal)
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));

  // Group stage — 3-way (W/D/L) scoring.
  let gLogLoss = 0, gBrier = 0, gHits = 0;
  const gRelP = new Array(10).fill(0), gRelH = new Array(10).fill(0), gRelN = new Array(10).fill(0);
  const gPerMatch: MatchGrade[] = [];
  // Knockouts — binary "who advanced" scoring (penalties included).
  let kLogLoss = 0, kBrier = 0, kHits = 0;
  const kRelP = new Array(10).fill(0), kRelH = new Array(10).fill(0), kRelN = new Array(10).fill(0);
  const kPerMatch: MatchGrade[] = [];

  for (const f of finished) {
    const h = f.home.id, a = f.away.id;
    const homeT = { rating: rating.get(h)!, host: host.get(h) };
    const awayT = { rating: rating.get(a)!, host: host.get(a) };
    const eh = effectiveRating(homeT);
    const ea = effectiveRating(awayT);

    if (f.stage === "Group Stage") {
      const p = outcomeProbs(homeT, awayT);
      const actual = outcomeOf(f.homeGoals!, f.awayGoals!);
      gLogLoss += -Math.log(Math.max(p[actual], 1e-15));
      for (const key of ["home", "draw", "away"] as MatchOutcome[]) {
        const y = actual === key ? 1 : 0;
        gBrier += (p[key] - y) ** 2;
        const b = Math.min(9, Math.floor(p[key] * 10));
        gRelP[b] += p[key]; gRelH[b] += y; gRelN[b] += 1;
      }
      const fav = (["home", "draw", "away"] as MatchOutcome[]).reduce((m, k) =>
        p[k] > p[m] ? k : m, "home" as MatchOutcome);
      const correct = fav === actual;
      if (correct) gHits++;
      gPerMatch.push({
        date: f.kickoff.slice(0, 10),
        home: f.home.name, away: f.away.name,
        homeGoals: f.homeGoals!, awayGoals: f.awayGoals!,
        predicted: p, actual, correct, stage: f.stage,
      });
    } else {
      // Knockout: grade the binary advance call. A tie still level with no
      // recorded shootout has no known winner yet — roll Elo but don't score it.
      const advancer = decidedWinnerId(f);
      if (advancer != null) {
        const pHome = bracketAdvanceProbability(homeT, awayT);
        const pAway = 1 - pHome;
        const actual: MatchOutcome = advancer === h ? "home" : "away";
        const pActual = actual === "home" ? pHome : pAway;
        kLogLoss += -Math.log(Math.max(pActual, 1e-15));
        for (const [key, pk] of [["home", pHome], ["away", pAway]] as const) {
          const y = actual === key ? 1 : 0;
          kBrier += (pk - y) ** 2;
          const b = Math.min(9, Math.floor(pk * 10));
          kRelP[b] += pk; kRelH[b] += y; kRelN[b] += 1;
        }
        const correct = (pHome >= pAway ? "home" : "away") === actual;
        if (correct) kHits++;
        kPerMatch.push({
          date: f.kickoff.slice(0, 10),
          home: f.home.name, away: f.away.name,
          homeGoals: f.homeGoals!, awayGoals: f.awayGoals!,
          predicted: { home: pHome, draw: 0, away: pAway }, actual, correct, stage: f.stage,
          shootout: f.shootout ?? null,
        });
      }
    }

    // Roll the result in AFTER scoring (host-adjusted Elo, same K as the model).
    // Penalty-decided ties are level on the field → eloUpdate scores them a draw,
    // matching computeLiveRatings (the rating the live model actually carries).
    const d = eloUpdate(eh, ea, f.homeGoals!, f.awayGoals!);
    rating.set(h, rating.get(h)! + d);
    rating.set(a, rating.get(a)! - d);
  }

  const gN = gPerMatch.length, kN = kPerMatch.length;
  const knockout: StageOutcome = {
    n: kN,
    logLoss: kN ? kLogLoss / kN : 0,
    brier: kN ? kBrier / kN : 0,
    baselineLogLoss: KO_BASELINE_LOGLOSS,
    hits: kHits,
    reliability: buildReliability(kRelP, kRelH, kRelN),
    perMatch: kPerMatch,
  };

  return {
    n: gN,
    logLoss: gN ? gLogLoss / gN : 0,
    brier: gN ? gBrier / gN : 0,
    baselineLogLoss: BASELINE_LOGLOSS,
    hits: gHits,
    reliability: buildReliability(gRelP, gRelH, gRelN),
    perMatch: gPerMatch,
    knockout,
    totalN: gN + kN,
    totalHits: gHits + kHits,
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
      const determined = rank !== 2 || allComplete;
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
