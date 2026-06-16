import { describe, expect, it } from "vitest";
import type { Fixture, Team } from "@/lib/types";
import { computeLiveRatings } from "@/lib/ratings";
import { effectiveRating, winProbability } from "@/lib/prediction";

function team(id: number, rating: number, host = false): Team {
  return {
    id,
    name: `T${id}`,
    code: `T${id}`,
    flag: "⚽",
    group: "A",
    rating,
    ...(host ? { host: true } : {}),
  };
}

function match(
  home: Team,
  away: Team,
  homeGoals: number,
  awayGoals: number,
  kickoff: string,
  status: Fixture["status"] = "finished",
): Fixture {
  return {
    id: Number(kickoff.slice(-2)),
    stage: "Group Stage",
    group: "A",
    kickoff,
    status,
    venue: null,
    home,
    away,
    homeGoals: status === "scheduled" ? null : homeGoals,
    awayGoals: status === "scheduled" ? null : awayGoals,
    minute: null,
    goals: [],
  };
}

const A = team(1, 1800);
const B = team(2, 1800);

describe("computeLiveRatings", () => {
  it("returns an empty map when nothing has finished", () => {
    const live = computeLiveRatings([
      match(A, B, 0, 0, "2026-06-11T00:00:00Z", "scheduled"),
    ]);
    expect(live.size).toBe(0);
  });

  it("moves the winner up and the loser down by the same amount", () => {
    const live = computeLiveRatings([match(A, B, 1, 0, "2026-06-11T00:00:00Z")]);
    const a = live.get(1)!;
    const b = live.get(2)!;
    expect(a).toBeGreaterThan(1800);
    expect(b).toBeLessThan(1800);
    // Zero-sum: deltas cancel.
    expect(a - 1800 + (b - 1800)).toBeCloseTo(0, 6);
    // Even sides, GD 1 → K·(1 − 0.5) = 30.
    expect(a).toBeCloseTo(1830, 6);
  });

  it("scales the swing by goal difference", () => {
    const narrow = computeLiveRatings([
      match(A, B, 1, 0, "2026-06-11T00:00:00Z"),
    ]).get(1)!;
    const rout = computeLiveRatings([
      match(A, B, 4, 0, "2026-06-11T00:00:00Z"),
    ]).get(1)!;
    // GD 4 multiplier (11+4)/8 = 1.875 > 1.
    expect(rout - 1800).toBeGreaterThan(narrow - 1800);
    expect(rout).toBeCloseTo(1800 + 30 * 1.875, 6);
  });

  it("rewards an upset more than an expected win", () => {
    const strong = team(1, 2000);
    const weak = team(2, 1600);
    const expectedWin = computeLiveRatings([
      match(strong, weak, 1, 0, "2026-06-11T00:00:00Z"),
    ]).get(1)!;
    const upset = computeLiveRatings([
      match(weak, strong, 1, 0, "2026-06-11T00:00:00Z"),
    ]).get(2)!;
    expect(expectedWin - 2000).toBeLessThan(15); // favourite barely gains
    expect(upset - 1600).toBeGreaterThan(45); // underdog gains a lot
  });

  it("applies updates in chronological order, not array order", () => {
    // Listed newest-first; the fold must still process the early game first.
    const live = computeLiveRatings([
      match(A, B, 1, 0, "2026-06-13T00:00:00Z"),
      match(A, B, 1, 0, "2026-06-11T00:00:00Z"),
    ]);
    // After game 1, A is 1830/B 1770; game 2 expects A to win more often, so the
    // second win adds less than the first → total < 60.
    expect(live.get(1)! - 1800).toBeGreaterThan(30);
    expect(live.get(1)! - 1800).toBeLessThan(60);
  });

  it("uses the host bump when forming the expected result", () => {
    const host = team(1, 1800, true);
    const visitor = team(2, 1800);
    // Host was already favoured, so beating an even side gains less than 30.
    const gain =
      computeLiveRatings([
        match(host, visitor, 1, 0, "2026-06-11T00:00:00Z"),
      ]).get(1)! - 1800;
    const we = winProbability(
      effectiveRating(host),
      effectiveRating(visitor),
    );
    expect(gain).toBeCloseTo(60 * (1 - we), 6);
    expect(gain).toBeLessThan(30);
  });
});
