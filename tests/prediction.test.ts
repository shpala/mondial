import { describe, expect, it } from "vitest";
import type { Team } from "@/lib/types";
import {
  bracketSeedOrder,
  buildBracket,
  davidsonProbs,
  effectiveRating,
  HOST_ADVANTAGE,
  predictScoreline,
  predictWinProbability,
  resolveBracket,
  winnerProb,
  winProbability,
} from "@/lib/prediction";
import { conditionScorelineGrid, goalRates, poissonJoint } from "@/lib/scoreline";
import { DRAW_NU, WC_PREDICTION_SCALE } from "@/lib/model/constants";

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

describe("host advantage", () => {
  it("adds the bump only for host teams", () => {
    expect(effectiveRating({ rating: 1800 })).toBe(1800);
    expect(effectiveRating({ rating: 1800, host: false })).toBe(1800);
    expect(effectiveRating({ rating: 1800, host: true })).toBe(
      1800 + HOST_ADVANTAGE,
    );
  });

  it("gives an evenly-matched host the edge", () => {
    const host = { rating: 1800, host: true };
    const visitor = { rating: 1800 };
    expect(predictWinProbability(host, visitor)).toBeGreaterThan(0.5);
    // ...and is exactly the mirror of the visitor's chance.
    expect(
      predictWinProbability(host, visitor) +
        predictWinProbability(visitor, host),
    ).toBeCloseTo(1, 6);
  });

  it("matches raw winProbability (at the WC prediction scale) when neither side hosts", () => {
    // Displayed World Cup probabilities use the flatter WC_PREDICTION_SCALE, not
    // the rating-system default — so predictWinProbability is less extreme than the
    // raw default-scale winProbability for the same gap.
    expect(predictWinProbability({ rating: 1900 }, { rating: 1700 })).toBe(
      winProbability(1900, 1700, WC_PREDICTION_SCALE),
    );
    expect(predictWinProbability({ rating: 1900 }, { rating: 1700 })).toBeLessThan(
      winProbability(1900, 1700),
    );
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

describe("predictScoreline", () => {
  const strong = { rating: 1950 };
  const weak = { rating: 1620 };

  it("returns a normalized grid with top scorelines sorted by probability", () => {
    const p = predictScoreline(strong, weak);
    let total = 0;
    for (const row of p.grid) for (const c of row) total += c;
    expect(total).toBeCloseTo(1, 9);
    expect(p.top).toHaveLength(3);
    expect(p.top[0].p).toBeGreaterThanOrEqual(p.top[1].p);
    expect(p.mostLikely).toEqual(p.top[0]);
  });

  it("its outcome marginals are the calibrated Davidson model (consistent with the site win-prob)", () => {
    const p = predictScoreline(strong, weak);
    expect(p.outcome.home + p.outcome.draw + p.outcome.away).toBeCloseTo(1, 9);
    // Davidson collapses to winProbability conditional on a decisive result, so
    // the home share among decisive outcomes must equal the displayed win-prob.
    const decisiveHome = p.outcome.home / (p.outcome.home + p.outcome.away);
    expect(decisiveHome).toBeCloseTo(predictWinProbability(strong, weak), 6);
  });

  it("predicts a home win as the most likely score for a clear favourite", () => {
    // Use a wide gap: at the flatter WC prediction scale a modest favourite can
    // still have 1-1 as its single most-likely *scoreline* (draw mass concentrates
    // on one cell while home wins spread over many) even though the home *outcome*
    // leads. A clear favourite's modal scoreline is unambiguously a home win.
    const clearFav = { rating: 1980 };
    const clearDog = { rating: 1520 };
    const p = predictScoreline(clearFav, clearDog);
    expect(p.outcome.home).toBeGreaterThan(0.5);
    expect(p.mostLikely.hg).toBeGreaterThan(p.mostLikely.ag);
  });

  it("honours host advantage", () => {
    const evenAway = predictScoreline({ rating: 1800 }, { rating: 1800 });
    const evenHost = predictScoreline({ rating: 1800, host: true }, { rating: 1800 });
    expect(evenHost.outcome.home).toBeGreaterThan(evenAway.outcome.home);
  });

  it("honours an explicit top-N", () => {
    expect(predictScoreline(strong, weak, { topN: 5 }).top).toHaveLength(5);
  });

  it("knockout (decisive) mode zeroes the draw region and renormalizes home/away", () => {
    const p = predictScoreline(strong, weak, { decisive: true });
    let drawMass = 0;
    for (let i = 0; i < p.grid.length; i++) drawMass += p.grid[i][i];
    expect(drawMass).toBeCloseTo(0, 12);
    expect(p.outcome.draw).toBe(0);
    // every listed scoreline is decisive (no draws)
    for (const c of p.top) expect(c.hg).not.toBe(c.ag);
    // outcome home is the 2-way Elo win prob — consistent with the bracket model
    expect(p.outcome.home).toBeCloseTo(predictWinProbability(strong, weak), 9);
    // still a proper normalized distribution
    let total = 0;
    for (const row of p.grid) for (const c of row) total += c;
    expect(total).toBeCloseTo(1, 9);
  });

  it("a knockout favourite's most likely score is a decisive home win", () => {
    const p = predictScoreline(strong, weak, { decisive: true });
    expect(p.mostLikely.hg).toBeGreaterThan(p.mostLikely.ag);
  });

  it("applies the Dixon-Coles correction through the shipped pipeline", () => {
    const home = { rating: 1820 };
    const away = { rating: 1780 };
    const eh = effectiveRating(home);
    const ea = effectiveRating(away);
    const outcome = davidsonProbs(eh, ea, DRAW_NU, WC_PREDICTION_SCALE);
    const { lambdaHome, lambdaAway } = goalRates(eh, ea);
    // The same prediction but WITHOUT the low-score correction (rho = 0).
    const noCorrection = conditionScorelineGrid(
      poissonJoint(lambdaHome, lambdaAway, 0),
      outcome,
    );
    const shipped = predictScoreline(home, away).grid;
    // DC lifts 0-0 and trims 1-0 / 0-1 within their (Davidson-fixed) regions.
    // Fails loudly if GOAL_RHO is zeroed or predictScoreline stops passing it.
    expect(shipped[0][0]).toBeGreaterThan(noCorrection[0][0]);
    expect(shipped[1][0]).toBeLessThan(noCorrection[1][0]);
    expect(shipped[0][1]).toBeLessThan(noCorrection[0][1]);
    // ...but the total draw rate is unchanged — Davidson sets it, DC only reshapes.
    const drawMass = (g: number[][]) => g.reduce((s, row, i) => s + row[i], 0);
    expect(drawMass(shipped)).toBeCloseTo(drawMass(noCorrection), 9);
  });
});
