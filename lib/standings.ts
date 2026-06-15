// Pure standings computation, shared by any data origin: given the teams (with
// their group letters) and the played group-stage fixtures, build sorted group
// tables. No I/O — unit-testable and origin-agnostic.

import type { Fixture, Group, GroupRow, Team } from "@/lib/types";

function emptyRow(team: Team): GroupRow {
  return {
    team,
    played: 0,
    win: 0,
    draw: 0,
    loss: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
    rank: 0,
  };
}

export function computeGroupStandings(
  teams: Team[],
  fixtures: Fixture[],
): Group[] {
  const groupLetters = [...new Set(teams.map((t) => t.group))]
    .filter((g) => g && g !== "?")
    .sort();

  return groupLetters.map((letter) => {
    const groupTeams = teams.filter((t) => t.group === letter);
    const rows = new Map<number, GroupRow>(
      groupTeams.map((t) => [t.id, emptyRow(t)]),
    );

    fixtures
      .filter(
        (f) =>
          f.group === letter &&
          f.status !== "scheduled" &&
          f.homeGoals != null &&
          f.awayGoals != null &&
          rows.has(f.home.id) &&
          rows.has(f.away.id),
      )
      .forEach((f) => {
        const h = rows.get(f.home.id)!;
        const a = rows.get(f.away.id)!;
        const hg = f.homeGoals!;
        const ag = f.awayGoals!;
        h.played++;
        a.played++;
        h.goalsFor += hg;
        h.goalsAgainst += ag;
        a.goalsFor += ag;
        a.goalsAgainst += hg;
        if (hg > ag) {
          h.win++;
          h.points += 3;
          a.loss++;
        } else if (hg < ag) {
          a.win++;
          a.points += 3;
          h.loss++;
        } else {
          h.draw++;
          a.draw++;
          h.points++;
          a.points++;
        }
      });

    const sorted = [...rows.values()].sort((x, y) => {
      if (y.points !== x.points) return y.points - x.points;
      const xgd = x.goalsFor - x.goalsAgainst;
      const ygd = y.goalsFor - y.goalsAgainst;
      if (ygd !== xgd) return ygd - xgd;
      if (y.goalsFor !== x.goalsFor) return y.goalsFor - x.goalsFor;
      return y.team.rating - x.team.rating;
    });
    sorted.forEach((r, i) => (r.rank = i + 1));
    return { name: letter, rows: sorted };
  });
}
