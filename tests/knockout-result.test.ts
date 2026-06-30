import { describe, expect, it } from "vitest";
import type { Fixture, Team } from "@/lib/types";
import { buildResultMap, decidedWinnerId } from "@/lib/bracket-results";

let nextId = 1;
function team(name: string): Team {
  const id = nextId++;
  return { id, name, code: name.slice(0, 3).toUpperCase(), flag: "⚽", group: "A", rating: 1800 };
}

const placeholder: Team = {
  id: 0,
  name: "Winner M73",
  code: "W73",
  flag: "⚽",
  group: "?",
  rating: 1500,
};

function ko(
  home: Team,
  away: Team,
  overrides: Partial<Fixture> = {},
): Fixture {
  return {
    id: 100,
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
    ...overrides,
  };
}

const key = (a: number, b: number) => [a, b].sort((x, y) => x - y).join("-");

describe("decidedWinnerId", () => {
  const a = team("Alpha");
  const b = team("Beta");

  it("returns the higher-scoring side when the score is decisive", () => {
    expect(decidedWinnerId(ko(a, b, { homeGoals: 2, awayGoals: 1 }))).toBe(a.id);
    expect(decidedWinnerId(ko(a, b, { homeGoals: 0, awayGoals: 3 }))).toBe(b.id);
  });

  it("uses the shootout winner when the score is level", () => {
    // 1-1, away wins the shootout 4-3.
    expect(
      decidedWinnerId(
        ko(a, b, { homeGoals: 1, awayGoals: 1, shootout: { home: 3, away: 4 } }),
      ),
    ).toBe(b.id);
    // 0-0, home wins 5-4.
    expect(
      decidedWinnerId(
        ko(a, b, { homeGoals: 0, awayGoals: 0, shootout: { home: 5, away: 4 } }),
      ),
    ).toBe(a.id);
  });

  it("is undecided (null) when level with no shootout, or no score", () => {
    expect(decidedWinnerId(ko(a, b, { homeGoals: 1, awayGoals: 1 }))).toBeNull();
    expect(
      decidedWinnerId(ko(a, b, { homeGoals: 1, awayGoals: 1, shootout: { home: 3, away: 3 } })),
    ).toBeNull();
    expect(decidedWinnerId(ko(a, b, { homeGoals: null, awayGoals: null }))).toBeNull();
  });
});

describe("buildResultMap", () => {
  const ger = team("Germany");
  const par = team("Paraguay");
  const bra = team("Brazil");
  const jpn = team("Japan");

  it("locks a penalty-decided tie to the shootout winner and carries the tally", () => {
    const fx = [
      ko(ger, par, {
        id: 73,
        homeGoals: 1,
        awayGoals: 1,
        shootout: { home: 3, away: 4 },
      }),
    ];
    const map = buildResultMap(fx);
    const r = map[key(ger.id, par.id)];
    expect(r).toBeDefined();
    expect(r.winnerId).toBe(par.id); // Paraguay advanced on penalties
    expect(r.homeGoals).toBe(1);
    expect(r.awayGoals).toBe(1);
    expect(r.shootout).toEqual({ home: 3, away: 4 });
    expect(r.fixtureId).toBe(73);
  });

  it("includes a decisive knockout and skips a level tie with no shootout", () => {
    const fx = [
      ko(bra, jpn, { id: 80, homeGoals: 2, awayGoals: 1 }), // decisive
      ko(ger, par, { id: 73, homeGoals: 1, awayGoals: 1 }), // level, unknown winner
    ];
    const map = buildResultMap(fx);
    expect(map[key(bra.id, jpn.id)].winnerId).toBe(bra.id);
    expect(map[key(bra.id, jpn.id)].shootout ?? null).toBeNull();
    expect(map[key(ger.id, par.id)]).toBeUndefined();
  });

  it("ignores group-stage games, placeholder slots and unfinished matches", () => {
    const fx = [
      ko(bra, jpn, { id: 1, stage: "Group Stage", homeGoals: 2, awayGoals: 1 }),
      ko(placeholder, par, { id: 2, homeGoals: 1, awayGoals: 0 }),
      ko(ger, par, { id: 3, status: "scheduled", homeGoals: null, awayGoals: null }),
    ];
    expect(Object.keys(buildResultMap(fx))).toHaveLength(0);
  });
});
