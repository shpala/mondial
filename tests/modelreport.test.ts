import { describe, expect, it } from "vitest";
import type { Fixture, Team } from "@/lib/types";
import { gradeOutcomes, gradeQualification } from "@/lib/modelreport";
import { simulateTournament } from "@/lib/montecarlo";
import { computeGroupStandings } from "@/lib/standings";

function team(id: number, rating: number, group = "A"): Team {
  return { id, name: `T${id}`, code: `T${id}`, flag: "⚽", group, rating };
}
function gx(
  id: number,
  home: Team,
  away: Team,
  hg: number | null,
  ag: number | null,
  kickoff: string,
): Fixture {
  return {
    id, stage: "Group Stage", group: home.group,
    kickoff, status: hg == null ? "scheduled" : "finished",
    venue: null, home, away, homeGoals: hg, awayGoals: ag, minute: null, goals: [],
  };
}

describe("gradeOutcomes", () => {
  const A = team(1, 1900), B = team(2, 1700);

  it("returns an empty report (no NaNs) when nothing is finished", () => {
    const r = gradeOutcomes([gx(1, A, B, null, null, "2026-06-11T00:00:00Z")]);
    expect(r.n).toBe(0);
    expect(r.logLoss).toBe(0);
    expect(r.baselineLogLoss).toBeCloseTo(Math.log(3), 9);
    expect(r.hits).toBe(0);
    expect(r.perMatch).toEqual([]);
  });

  it("scores a finished match with the pre-match Davidson probability", () => {
    const r = gradeOutcomes([gx(1, A, B, 2, 0, "2026-06-11T00:00:00Z")]);
    expect(r.n).toBe(1);
    expect(r.perMatch[0].actual).toBe("home");
    // log-loss equals -ln(p_home) for the only match
    expect(r.logLoss).toBeCloseTo(-Math.log(r.perMatch[0].predicted.home), 9);
    expect(r.hits).toBe(1); // A was favourite and won
  });

  it("is leak-free: a later match's prediction ignores its own result", () => {
    const g1a = gx(1, A, B, 1, 0, "2026-06-11T00:00:00Z");
    const g2a = gx(2, A, B, 1, 0, "2026-06-15T00:00:00Z");
    const g2b = gx(2, A, B, 0, 5, "2026-06-15T00:00:00Z"); // different own result
    const p1 = gradeOutcomes([g1a, g2a]).perMatch[1].predicted;
    const p2 = gradeOutcomes([g1a, g2b]).perMatch[1].predicted;
    expect(p2).toEqual(p1);
  });
});

describe("gradeOutcomes — knockouts (advance calls)", () => {
  const A = team(1, 1900), B = team(2, 1700);
  // A knockout fixture (decisive or, with `shootout`, level after extra time).
  function ko(
    id: number,
    home: Team,
    away: Team,
    hg: number,
    ag: number,
    kickoff: string,
    shootout: { home: number; away: number } | null = null,
  ): Fixture {
    return { ...gx(id, home, away, hg, ag, kickoff), stage: "Round of 16", group: null, shootout };
  }

  it("grades a decisive knockout as an advance call (ln2 baseline), not a 3-way draw", () => {
    const r = gradeOutcomes([ko(9, A, B, 1, 0, "2026-07-01T00:00:00Z")]);
    expect(r.n).toBe(0); // group count unchanged
    expect(r.knockout.n).toBe(1);
    expect(r.totalN).toBe(1);
    expect(r.knockout.baselineLogLoss).toBeCloseTo(Math.log(2), 9);
    const m = r.knockout.perMatch[0];
    expect(m.actual).toBe("home"); // A advanced
    expect(m.predicted.draw).toBe(0); // no draw in a knockout
    expect(m.stage).toBe("Round of 16");
    expect(m.correct).toBe(true); // A (favourite) advanced
    expect(r.knockout.logLoss).toBeCloseTo(-Math.log(m.predicted.home), 9);
  });

  it("credits the shootout advancer when a tie is level after extra time", () => {
    // 1-1, B wins the shootout 4-2 → B advances; the higher-rated A does not.
    const r = gradeOutcomes([ko(9, A, B, 1, 1, "2026-07-01T00:00:00Z", { home: 2, away: 4 })]);
    expect(r.knockout.n).toBe(1);
    const m = r.knockout.perMatch[0];
    expect(m.actual).toBe("away"); // B advanced on penalties
    expect(m.correct).toBe(false); // model favoured A
    expect(r.knockout.logLoss).toBeCloseTo(-Math.log(m.predicted.away), 9);
    expect(m.shootout).toEqual({ home: 2, away: 4 }); // carried for display
  });

  it("leaves shootout null on a decisive knockout (no penalties)", () => {
    const r = gradeOutcomes([ko(8, A, B, 2, 0, "2026-07-01T00:00:00Z")]);
    expect(r.knockout.perMatch[0].shootout ?? null).toBeNull();
  });

  it("skips a knockout still level with no recorded shootout (winner unknown)", () => {
    const r = gradeOutcomes([ko(9, A, B, 1, 1, "2026-07-01T00:00:00Z")]);
    expect(r.knockout.n).toBe(0);
    expect(r.totalN).toBe(0);
  });

  it("combines group + knockout into totalN / totalHits", () => {
    const g = gx(1, A, B, 2, 0, "2026-06-11T00:00:00Z"); // A wins group game
    const k = ko(9, A, B, 1, 0, "2026-07-01T00:00:00Z"); // A advances KO
    const r = gradeOutcomes([g, k]);
    expect(r.n).toBe(1);
    expect(r.knockout.n).toBe(1);
    expect(r.totalN).toBe(2);
    expect(r.totalHits).toBe(r.hits + r.knockout.hits);
    expect(r.totalHits).toBe(2);
  });
});

describe("gradeQualification", () => {
  it("returns not-scored when no group is complete", () => {
    const r = gradeQualification([], []);
    expect(r.n).toBe(0);
    expect(r.groupsComplete).toBe(0);
  });

  // Richer test: a complete 4-team group where the model's pre-tournament odds
  // (from simulateTournament over the stripped fixtures) are scored against who
  // actually advanced. The weakest team (lowest escapeGroup) wins the group — a
  // notable hit — and the strongest team (highest escapeGroup) finishes last — a
  // notable miss.
  it("scores a complete group's escapeGroup odds against who advanced", () => {
    // Group A, ratings descending: P1 strongest .. P4 weakest.
    const P1 = team(101, 1950);
    const P2 = team(102, 1850);
    const P3 = team(103, 1700);
    const P4 = team(104, 1550);
    const teams = [P1, P2, P3, P4];

    // All six round-robin fixtures, finished. Engineer the table so the weakest
    // team (P4) tops it and the strongest (P1) finishes bottom.
    const fixtures: Fixture[] = [
      gx(1, P4, P1, 3, 0, "2026-06-11T00:00:00Z"), // P4 beats P1
      gx(2, P3, P2, 0, 0, "2026-06-11T03:00:00Z"),
      gx(3, P4, P2, 2, 0, "2026-06-15T00:00:00Z"), // P4 beats P2
      gx(4, P3, P1, 1, 0, "2026-06-15T03:00:00Z"), // P3 beats P1
      gx(5, P4, P3, 1, 0, "2026-06-19T00:00:00Z"), // P4 beats P3 (P4 = 9 pts, 1st)
      gx(6, P2, P1, 1, 0, "2026-06-19T03:00:00Z"), // P2 beats P1 (P1 = 0 pts, 4th)
    ];

    const groups = computeGroupStandings(teams, fixtures);
    // Sanity: ranking is P4 (1st), P3 (2nd, better GD), P2 (3rd), P1 (4th).
    expect(groups[0].rows.map((r) => r.team.id)).toEqual([104, 103, 102, 101]);

    // Independently derive the model's pre-tournament odds the same way the
    // implementation does: strip results, simulate.
    const stripped = fixtures.map((f) => ({
      ...f, status: "scheduled" as const, homeGoals: null, awayGoals: null,
    }));
    const odds = simulateTournament(stripped);
    const escape = new Map(odds.map((o) => [o.team.id, o.escapeGroup]));

    const r = gradeQualification(fixtures, groups);
    expect(r.groupsComplete).toBe(1);
    expect(r.allGroupsComplete).toBe(true);
    expect(r.n).toBe(4); // all four fates determined (3rd resolved since all complete)

    // Actual advancers: 1st (P4), 2nd (P2), and the best-third (P3, the only 3rd).
    const advanced = new Set([104, 102, 103]);
    const expectedBrier =
      [P4, P2, P3, P1].reduce(
        (s, t) => s + (escape.get(t.id)! - (advanced.has(t.id) ? 1 : 0)) ** 2, 0,
      ) / 4;
    expect(r.brier).toBeCloseTo(expectedBrier, 9);

    // Notable hit: the strongest advancer the model least expected. P4 (weakest,
    // lowest escapeGroup) advanced, so it should head the notable hits.
    expect(r.notableHits[0].team).toBe("T104");
    expect(r.notableHits[0].advanced).toBe(true);
    // Notable miss: P1 (strongest, highest escapeGroup) went out.
    expect(r.notableMisses[0].team).toBe("T101");
    expect(r.notableMisses[0].advanced).toBe(false);
  });
});
