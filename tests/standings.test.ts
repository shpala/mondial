// computeGroupStandings is the origin-agnostic table builder feeding qualifiers,
// the bracket and the Monte Carlo. It was only exercised transitively; these pin
// the accounting and the tiebreak ladder directly.
import { describe, expect, it } from "vitest";
import type { Fixture, Team } from "@/lib/types";
import { computeGroupStandings } from "@/lib/standings";

let nextId = 1;
function team(rating: number, group = "A"): Team {
  const id = nextId++;
  return { id, name: `T${id}`, code: `T${id}`, flag: "⚽", group, rating };
}

function played(home: Team, away: Team, hg: number, ag: number): Fixture {
  return {
    id: nextId++,
    stage: "Group Stage",
    group: home.group,
    kickoff: "2026-06-12T00:00:00Z",
    status: "finished",
    venue: null,
    home,
    away,
    homeGoals: hg,
    awayGoals: ag,
    minute: null,
    goals: [],
  };
}

describe("computeGroupStandings", () => {
  it("tallies points, W/D/L and goals from finished fixtures", () => {
    const a = team(1800);
    const b = team(1700);
    const [group] = computeGroupStandings([a, b], [played(a, b, 2, 1)]);
    const rowA = group.rows.find((r) => r.team.id === a.id)!;
    const rowB = group.rows.find((r) => r.team.id === b.id)!;
    expect(rowA).toMatchObject({ played: 1, win: 1, draw: 0, loss: 0, points: 3, goalsFor: 2, goalsAgainst: 1 });
    expect(rowB).toMatchObject({ played: 1, win: 0, draw: 0, loss: 1, points: 0, goalsFor: 1, goalsAgainst: 2 });
    expect(group.rows[0].team.id).toBe(a.id); // winner ranked first
  });

  it("scores a draw as one point each", () => {
    const a = team(1800);
    const b = team(1700);
    const [group] = computeGroupStandings([a, b], [played(a, b, 1, 1)]);
    expect(group.rows.every((r) => r.points === 1 && r.draw === 1)).toBe(true);
  });

  it("ignores scheduled (unplayed) fixtures", () => {
    const a = team(1800);
    const b = team(1700);
    const sched: Fixture = { ...played(a, b, 5, 0), status: "scheduled", homeGoals: null, awayGoals: null };
    const [group] = computeGroupStandings([a, b], [sched]);
    expect(group.rows.every((r) => r.played === 0 && r.points === 0)).toBe(true);
  });

  it("breaks equal points by goal difference", () => {
    const [t1, t2, t3, t4] = [team(1500), team(1400), team(1300), team(1200)];
    // t1 +4 GD, t2 +1 GD, both on 3 points.
    const g = computeGroupStandings([t1, t2, t3, t4], [
      played(t1, t3, 4, 0),
      played(t2, t4, 1, 0),
    ])[0];
    expect([g.rows[0].team.id, g.rows[1].team.id]).toEqual([t1.id, t2.id]);
  });

  it("breaks equal points and GD by goals scored", () => {
    const [t1, t2, t3, t4] = [team(1500), team(1400), team(1300), team(1200)];
    // both +2 GD and 3 points, but t2 scored more (3 vs 2).
    const g = computeGroupStandings([t1, t2, t3, t4], [
      played(t1, t3, 2, 0),
      played(t2, t4, 3, 1),
    ])[0];
    expect([g.rows[0].team.id, g.rows[1].team.id]).toEqual([t2.id, t1.id]);
  });

  it("falls back to rating when points, GD and GF are all equal", () => {
    // NOTE: this pins the current deep-tiebreak behaviour. FIFA's ladder inserts
    // head-to-head before the ranking fallback; that refinement is not yet
    // implemented (see the comment in lib/standings.ts).
    const hi = team(1900);
    const lo = team(1500);
    const t3 = team(1300);
    const t4 = team(1200);
    const g = computeGroupStandings([hi, lo, t3, t4], [
      played(hi, t3, 1, 0),
      played(lo, t4, 1, 0),
    ])[0];
    expect(g.rows[0].team.id).toBe(hi.id); // higher rating ranks first
  });

  it("assigns dense 1-based ranks in sorted order", () => {
    const [t1, t2] = [team(1800), team(1700)];
    const g = computeGroupStandings([t1, t2], [played(t1, t2, 1, 0)])[0];
    expect(g.rows.map((r) => r.rank)).toEqual([1, 2]);
  });
});
