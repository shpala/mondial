// Derive the 32 knockout qualifiers from the 12 group tables:
// the 12 group winners, 12 runners-up, and the 8 best third-placed teams.
// Pure functions so they can be unit-tested and reused on client + server.

import type { Group, GroupRow, Team } from "@/lib/types";

function gd(row: GroupRow): number {
  return row.goalsFor - row.goalsAgainst;
}

/** A team currently occupying a knockout spot, with the credential that put it
 *  there. `confirmed` means all 3 group games are played, so the position is
 *  final rather than provisional. */
export interface Candidate {
  team: Team;
  group: string;
  /** "1st", "2nd", or "3rd" in the group */
  place: string;
  points: number;
  played: number;
  goalDiff: number;
  confirmed: boolean;
}

function toCandidate(row: GroupRow, group: string, place: string): Candidate {
  return {
    team: row.team,
    group,
    place,
    points: row.points,
    played: row.played,
    goalDiff: gd(row),
    confirmed: row.played >= 3,
  };
}

export interface QualificationBreakdown {
  winners: Candidate[]; // 1st in each group
  runnersUp: Candidate[]; // 2nd in each group
  bestThirds: Candidate[]; // 8 best 3rd-placed (in)
  missedThirds: Candidate[]; // 3rd-placed currently missing out
}

/** Break the current standings into the knockout qualification picture. */
export function qualificationBreakdown(groups: Group[]): QualificationBreakdown {
  const winners: Candidate[] = [];
  const runnersUp: Candidate[] = [];
  const thirds: Candidate[] = [];

  for (const group of groups) {
    const rows = [...group.rows].sort((a, b) => a.rank - b.rank);
    if (rows[0]) winners.push(toCandidate(rows[0], group.name, "1st"));
    if (rows[1]) runnersUp.push(toCandidate(rows[1], group.name, "2nd"));
    if (rows[2]) thirds.push(toCandidate(rows[2], group.name, "3rd"));
  }

  const rankedThirds = [...thirds].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    return b.team.rating - a.team.rating;
  });

  return {
    winners,
    runnersUp,
    bestThirds: rankedThirds.slice(0, 8),
    missedThirds: rankedThirds.slice(8),
  };
}

/**
 * Returns up to 32 qualified teams ordered strongest-first (by rating) for
 * bracket seeding, derived from current standings (i.e. from games played).
 * Tops up with the strongest remaining teams only if the field isn't full yet.
 */
export function qualifiedTeams(groups: Group[]): Team[] {
  const b = qualificationBreakdown(groups);
  const seen = new Set<number>();
  const qualified: Team[] = [];
  for (const c of [...b.winners, ...b.runnersUp, ...b.bestThirds]) {
    if (!seen.has(c.team.id)) {
      seen.add(c.team.id);
      qualified.push(c.team);
    }
  }

  if (qualified.length < 32) {
    const pool = groups
      .flatMap((g) => g.rows.map((r) => r.team))
      .filter((t) => !seen.has(t.id))
      .sort((a, b2) => b2.rating - a.rating);
    for (const t of pool) {
      if (qualified.length >= 32) break;
      seen.add(t.id);
      qualified.push(t);
    }
  }

  return qualified.sort((a, b2) => b2.rating - a.rating).slice(0, 32);
}
