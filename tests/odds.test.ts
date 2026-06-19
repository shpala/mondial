import { describe, expect, it } from "vitest";
import {
  MARKET_WEIGHT,
  impliedProbabilities,
  consensusProbabilities,
  blendOutcome,
  decisiveHomeProb,
  favouredOutcome,
} from "@/lib/odds";

describe("impliedProbabilities (de-vig)", () => {
  it("removes the vig and sums to exactly 1", () => {
    // Bet365 sample from football-data: 8.0 / 5.5 / 1.33 (overround ~1.07).
    const p = impliedProbabilities(8.0, 5.5, 1.33)!;
    expect(p.home + p.draw + p.away).toBeCloseTo(1, 12);
    // Favourite (lowest odds) gets the most mass.
    expect(p.away).toBeGreaterThan(p.home);
    expect(p.away).toBeGreaterThan(p.draw);
  });

  it("is a fair coin for symmetric even odds", () => {
    const p = impliedProbabilities(3, 3, 3)!;
    expect(p.home).toBeCloseTo(1 / 3, 12);
    expect(p.draw).toBeCloseTo(1 / 3, 12);
    expect(p.away).toBeCloseTo(1 / 3, 12);
  });

  it("strips the overround: 2.0/4.0/4.0 → 0.5/0.25/0.25 (booksum 1.0 already)", () => {
    const p = impliedProbabilities(2.0, 4.0, 4.0)!;
    expect(p.home).toBeCloseTo(0.5, 12);
    expect(p.draw).toBeCloseTo(0.25, 12);
    expect(p.away).toBeCloseTo(0.25, 12);
  });

  it("rejects missing or arbitrage-artefact odds (≤ 1)", () => {
    expect(impliedProbabilities(1.0, 5, 5)).toBeNull();
    expect(impliedProbabilities(NaN, 5, 5)).toBeNull();
    expect(impliedProbabilities(2, 0, 2)).toBeNull();
  });
});

describe("consensusProbabilities", () => {
  it("averages books and stays normalised", () => {
    const a = impliedProbabilities(2.0, 3.5, 4.0)!;
    const b = impliedProbabilities(2.2, 3.3, 3.6)!;
    const c = consensusProbabilities([a, b])!;
    expect(c.home + c.draw + c.away).toBeCloseTo(1, 12);
    expect(c.home).toBeCloseTo((a.home + b.home) / 2, 12);
  });

  it("returns null for no books", () => {
    expect(consensusProbabilities([])).toBeNull();
  });
});

describe("blendOutcome", () => {
  const model = { home: 0.5, draw: 0.3, away: 0.2 };
  const market = { home: 0.7, draw: 0.2, away: 0.1 };

  it("defaults to a market-dominant weight and stays normalised", () => {
    expect(MARKET_WEIGHT).toBe(0.9);
    const b = blendOutcome(model, market);
    expect(b.home + b.draw + b.away).toBeCloseTo(1, 12);
    expect(b.home).toBeCloseTo(0.1 * 0.5 + 0.9 * 0.7, 12); // 0.68
  });

  it("weight 1 = pure market, weight 0 = pure model", () => {
    expect(blendOutcome(model, market, 1)).toEqual(market);
    expect(blendOutcome(model, market, 0)).toEqual(model);
  });

  it("clamps out-of-range weights", () => {
    expect(blendOutcome(model, market, 5)).toEqual(market);
    expect(blendOutcome(model, market, -3)).toEqual(model);
  });
});

describe("decisiveHomeProb / favouredOutcome", () => {
  it("renormalises the draw away for knockouts", () => {
    expect(decisiveHomeProb({ home: 0.6, draw: 0.1, away: 0.3 })).toBeCloseTo(
      0.6 / 0.9,
      12,
    );
    expect(decisiveHomeProb({ home: 0, draw: 1, away: 0 })).toBe(0.5);
  });

  it("picks the most likely label", () => {
    expect(favouredOutcome({ home: 0.6, draw: 0.1, away: 0.3 })).toBe("home");
    expect(favouredOutcome({ home: 0.2, draw: 0.5, away: 0.3 })).toBe("draw");
    expect(favouredOutcome({ home: 0.2, draw: 0.3, away: 0.5 })).toBe("away");
  });
});
