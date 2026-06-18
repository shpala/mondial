import { describe, expect, it } from "vitest";
import type { Fixture, Team } from "@/lib/types";
import { outcomeProbs, simulateTournament } from "@/lib/montecarlo";
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
