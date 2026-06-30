import { describe, expect, it } from "vitest";
import type { Fixture, Team } from "@/lib/types";
import {
  forcedKnockoutWinners,
  outcomeProbs,
  simulateTournament,
} from "@/lib/montecarlo";
import { winProbability } from "@/lib/prediction";
import { WC_PREDICTION_SCALE } from "@/lib/model/constants";

function team(id: number, rating: number, group: string): Team {
  return { id, name: `T${id}`, code: `T${id}`, flag: "⚽", group, rating };
}

describe("outcomeProbs (Davidson)", () => {
  it("sums to 1", () => {
    const p = outcomeProbs({ rating: 1850 }, { rating: 1700 });
    expect(p.home + p.draw + p.away).toBeCloseTo(1, 9);
  });

  it("peaks the draw probability for even teams and decays with the gap", () => {
    const even = outcomeProbs({ rating: 1800 }, { rating: 1800 }).draw;
    const gap = outcomeProbs({ rating: 2000 }, { rating: 1600 }).draw;
    expect(even).toBeGreaterThan(gap);
    expect(even).toBeGreaterThan(0.2);
    expect(even).toBeLessThan(0.3);
  });

  it("is consistent with the Elo win prob (at the WC prediction scale) conditional on a decisive result", () => {
    const a = { rating: 1900 };
    const b = { rating: 1700 };
    const p = outcomeProbs(a, b);
    const conditional = p.home / (p.home + p.away);
    expect(conditional).toBeCloseTo(
      winProbability(1900, 1700, WC_PREDICTION_SCALE),
      9,
    );
  });
});

// A minimal but complete 48-team / 12-group fixture set: every team plays its
// three group-mates once. No games played yet → a pure prediction.
function buildGroupFixtures(): { fixtures: Fixture[]; teams: Team[] } {
  const groups = "ABCDEFGHIJKL".split("");
  const teams: Team[] = [];
  let id = 1;
  for (const g of groups) {
    // Descending strength within each group so seeding is well-defined.
    for (let i = 0; i < 4; i++) teams.push(team(id++, 1900 - i * 60, g));
  }
  const fixtures: Fixture[] = [];
  let fid = 1;
  for (const g of groups) {
    const gt = teams.filter((t) => t.group === g);
    for (let i = 0; i < gt.length; i++) {
      for (let j = i + 1; j < gt.length; j++) {
        fixtures.push({
          id: fid++,
          stage: "Group Stage",
          group: g,
          kickoff: `2026-06-${String(11 + (fid % 10)).padStart(2, "0")}T00:00:00Z`,
          status: "scheduled",
          venue: null,
          home: gt[i],
          away: gt[j],
          homeGoals: null,
          awayGoals: null,
          minute: null,
          goals: [],
        });
      }
    }
  }
  return { fixtures, teams };
}

describe("simulateTournament", () => {
  const { fixtures } = buildGroupFixtures();
  const odds = simulateTournament(fixtures, 3000);

  it("returns odds for every team", () => {
    expect(odds).toHaveLength(48);
  });

  it("champion probabilities sum to ~100%", () => {
    const total = odds.reduce((s, o) => s + o.champion, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it("is sorted with the strongest team most likely to win", () => {
    expect(odds[0].champion).toBeGreaterThanOrEqual(odds[1].champion);
    // The globally strongest seed (rating 1900) should lead the field.
    expect(odds[0].team.rating).toBe(1900);
  });

  it("ranks probabilities monotonically by depth (win ≤ final ≤ escape)", () => {
    for (const o of odds) {
      expect(o.champion).toBeLessThanOrEqual(o.reachFinal + 1e-9);
      expect(o.reachFinal).toBeLessThanOrEqual(o.escapeGroup + 1e-9);
    }
  });

  it("is deterministic for the same results state", () => {
    const again = simulateTournament(fixtures, 3000);
    expect(again[0].team.id).toBe(odds[0].team.id);
    expect(again[0].champion).toBe(odds[0].champion);
  });

  it("shifts the odds when a real group result lands", () => {
    // Knock the strongest team out: it loses all three group games heavily.
    const top = odds[0].team;
    const played = fixtures.map((f) => {
      if (f.group !== top.group) return f;
      const involvesTop = f.home.id === top.id || f.away.id === top.id;
      if (!involvesTop) return f;
      const topIsHome = f.home.id === top.id;
      return {
        ...f,
        status: "finished" as const,
        homeGoals: topIsHome ? 0 : 3,
        awayGoals: topIsHome ? 3 : 0,
        minute: null,
      };
    });
    const after = simulateTournament(played, 3000);
    const topAfter = after.find((o) => o.team.id === top.id)!;
    // Three heavy losses crater its title odds versus the all-unplayed baseline.
    expect(topAfter.champion).toBeLessThan(odds[0].champion);
    expect(topAfter.escapeGroup).toBeLessThan(odds[0].escapeGroup);
  });
});

describe("forcedKnockoutWinners", () => {
  const a = team(901, 1800, "A");
  const b = team(902, 1700, "B");
  const c = team(903, 1600, "C");
  const d = team(904, 1500, "D");

  function ko(home: Team, away: Team, o: Partial<Fixture>): Fixture {
    return {
      id: 73,
      stage: "Round of 32",
      group: null,
      kickoff: "2026-06-29T20:30:00Z",
      status: "finished",
      venue: null,
      home,
      away,
      homeGoals: null,
      awayGoals: null,
      minute: null,
      goals: [],
      shootout: null,
      ...o,
    };
  }
  const pk = (x: number, y: number) => (x < y ? `${x}-${y}` : `${y}-${x}`);

  it("forces the shootout winner of a knockout tie level after extra time", () => {
    // a 1-1 b, b wins 4-3 on penalties.
    const f = ko(a, b, { homeGoals: 1, awayGoals: 1, shootout: { home: 3, away: 4 } });
    const forced = forcedKnockoutWinners([f]);
    expect(forced.get(pk(a.id, b.id))).toBe(b.id);
  });

  it("forces a decisive winner and leaves a winner-unknown level tie unforced", () => {
    const decisive = ko(c, d, { id: 80, homeGoals: 2, awayGoals: 0 });
    const unknown = ko(a, b, { id: 73, homeGoals: 1, awayGoals: 1 }); // no shootout
    const forced = forcedKnockoutWinners([decisive, unknown]);
    expect(forced.get(pk(c.id, d.id))).toBe(c.id);
    expect(forced.has(pk(a.id, b.id))).toBe(false);
  });

  it("ignores group-stage games", () => {
    const grp = ko(a, b, { id: 1, stage: "Group Stage", homeGoals: 3, awayGoals: 0 });
    expect(forcedKnockoutWinners([grp]).size).toBe(0);
  });
});
