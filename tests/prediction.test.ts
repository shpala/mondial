import { describe, expect, it } from "vitest";
import type { Team } from "@/lib/types";
import {
  bracketSeedOrder,
  buildBracket,
  resolveBracket,
  winnerProb,
  winProbability,
} from "@/lib/prediction";

function makeTeams(n: number): Team[] {
  // Strongest first: rating decreases with index.
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `Team ${i + 1}`,
    code: `T${i + 1}`,
    flag: "⚽",
    group: "A",
    rating: 2100 - i * 10,
  }));
}

describe("winProbability", () => {
  it("is 0.5 for equal ratings", () => {
    expect(winProbability(1800, 1800)).toBeCloseTo(0.5, 6);
  });

  it("is symmetric (probabilities sum to 1)", () => {
    expect(winProbability(1900, 1700) + winProbability(1700, 1900)).toBeCloseTo(
      1,
      6,
    );
  });

  it("favours the stronger team", () => {
    expect(winProbability(2000, 1600)).toBeGreaterThan(0.85);
    expect(winProbability(1600, 2000)).toBeLessThan(0.15);
  });
});

describe("bracketSeedOrder", () => {
  it("pairs 1 vs 2 for size 2", () => {
    expect(bracketSeedOrder(2)).toEqual([1, 2]);
  });

  it("keeps seeds 1 and 2 in opposite halves for size 32", () => {
    const order = bracketSeedOrder(32);
    expect(order).toHaveLength(32);
    const idx1 = order.indexOf(1);
    const idx2 = order.indexOf(2);
    // seed 1 in first half, seed 2 in second half
    expect(idx1).toBeLessThan(16);
    expect(idx2).toBeGreaterThanOrEqual(16);
  });

  it("contains every seed exactly once", () => {
    const order = bracketSeedOrder(32);
    expect(new Set(order).size).toBe(32);
  });
});

describe("buildBracket", () => {
  it("creates 5 rounds of sizes 16,8,4,2,1", () => {
    const b = buildBracket(makeTeams(32));
    expect(b.rounds.map((r) => r.length)).toEqual([16, 8, 4, 2, 1]);
  });

  it("seeds strongest vs weakest in the opening round", () => {
    const b = buildBracket(makeTeams(32));
    const first = b.rounds[0][0];
    expect(first.top?.id).toBe(1); // seed 1
    expect(first.bottom?.id).toBe(32); // seed 32
  });
});

describe("resolveBracket (model baseline)", () => {
  it("fills a winner for every matchup and a champion", () => {
    const resolved = resolveBracket(buildBracket(makeTeams(32)));
    for (const round of resolved.rounds) {
      for (const m of round) {
        expect(m.winnerId).not.toBeNull();
      }
    }
    expect(resolved.championId).toBe(1); // monotonic ratings -> top seed wins
  });

  it("advances the higher-rated team by default", () => {
    const resolved = resolveBracket(buildBracket(makeTeams(32)));
    const first = resolved.rounds[0][0];
    expect(first.winnerId).toBe(first.top?.id); // top seed stronger
    const wp = winnerProb(first);
    expect(wp).not.toBeNull();
    expect(wp!).toBeGreaterThan(0.5);
  });
});

describe("resolveBracket (user override)", () => {
  it("pins an underdog and propagates it downstream", () => {
    const bracket = buildBracket(makeTeams(32));
    const firstMatch = bracket.rounds[0][0];
    const underdogId = firstMatch.bottom!.id; // weaker team (seed 32)

    const resolved = resolveBracket(bracket, { [firstMatch.id]: underdogId });

    // It wins its first match...
    expect(resolved.rounds[0][0].winnerId).toBe(underdogId);
    // ...and appears in the next round's feeding matchup.
    const next = resolved.rounds[1][0];
    const present = next.top?.id === underdogId || next.bottom?.id === underdogId;
    expect(present).toBe(true);
  });

  it("ignores an override that names a team not in the matchup", () => {
    const bracket = buildBracket(makeTeams(32));
    const m = bracket.rounds[0][0];
    const resolved = resolveBracket(bracket, { [m.id]: 9999 });
    // Falls back to the model pick (stronger team).
    expect(resolved.rounds[0][0].winnerId).toBe(m.top?.id);
  });
});
