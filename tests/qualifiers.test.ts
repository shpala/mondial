import { describe, expect, it } from "vitest";
import type { Group, GroupRow, Team } from "@/lib/types";
import { qualificationBreakdown, qualifiedTeams } from "@/lib/qualifiers";

let nextId = 1;
function team(rating: number): Team {
  const id = nextId++;
  return { id, name: `T${id}`, code: `T${id}`, flag: "⚽", group: "A", rating };
}

function row(t: Team, rank: number, points: number, gf = 0, ga = 0): GroupRow {
  return {
    team: t,
    rank,
    points,
    played: 3,
    win: 0,
    draw: 0,
    loss: 0,
    goalsFor: gf,
    goalsAgainst: ga,
  };
}

function makeGroups(): Group[] {
  const letters = "ABCDEFGHIJKL".split("");
  return letters.map((name, gi) => {
    const base = 2000 - gi * 30;
    const rows = [
      row(team(base), 1, 9, 7, 1),
      row(team(base - 40), 2, 6, 5, 3),
      row(team(base - 80), 3, 3 + (gi % 4), 3, 4), // varied thirds
      row(team(base - 120), 4, 0, 1, 8),
    ];
    return { name, rows };
  });
}

describe("qualifiedTeams", () => {
  it("returns exactly 32 teams", () => {
    expect(qualifiedTeams(makeGroups())).toHaveLength(32);
  });

  it("includes all 12 group winners and 12 runners-up", () => {
    const groups = makeGroups();
    const q = new Set(qualifiedTeams(groups).map((t) => t.id));
    for (const g of groups) {
      expect(q.has(g.rows[0].team.id)).toBe(true);
      expect(q.has(g.rows[1].team.id)).toBe(true);
    }
  });

  it("excludes all fourth-placed teams", () => {
    const groups = makeGroups();
    const q = new Set(qualifiedTeams(groups).map((t) => t.id));
    for (const g of groups) {
      expect(q.has(g.rows[3].team.id)).toBe(false);
    }
  });

  it("takes only the 8 best third-placed teams", () => {
    const groups = makeGroups();
    const q = new Set(qualifiedTeams(groups).map((t) => t.id));
    const thirdsIn = groups.filter((g) => q.has(g.rows[2].team.id)).length;
    expect(thirdsIn).toBe(8);
  });

  it("orders the field strongest first", () => {
    const ordered = qualifiedTeams(makeGroups());
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i - 1].rating).toBeGreaterThanOrEqual(ordered[i].rating);
    }
  });
});

describe("qualificationBreakdown", () => {
  it("splits into 12 winners, 12 runners-up, 8 best thirds", () => {
    const b = qualificationBreakdown(makeGroups());
    expect(b.winners).toHaveLength(12);
    expect(b.runnersUp).toHaveLength(12);
    expect(b.bestThirds).toHaveLength(8);
    expect(b.missedThirds).toHaveLength(4);
  });

  it("labels each candidate with group and place", () => {
    const b = qualificationBreakdown(makeGroups());
    expect(b.winners[0].place).toBe("1st");
    expect(b.runnersUp[0].place).toBe("2nd");
    expect(b.bestThirds.every((c) => c.place === "3rd")).toBe(true);
  });

  it("marks a position confirmed only when all 3 games are played", () => {
    const b = qualificationBreakdown(makeGroups()); // played: 3 each
    expect(b.winners.every((c) => c.confirmed)).toBe(true);
  });

  it("best thirds outrank missed thirds on points", () => {
    const b = qualificationBreakdown(makeGroups());
    const minBest = Math.min(...b.bestThirds.map((c) => c.points));
    const maxMissed = Math.max(...b.missedThirds.map((c) => c.points));
    expect(minBest).toBeGreaterThanOrEqual(maxMissed);
  });
});
