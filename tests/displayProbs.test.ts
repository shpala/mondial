import { describe, expect, it } from "vitest";
import type { Fixture, Team } from "@/lib/types";
import { predictWinProbability } from "@/lib/prediction";
import {
  fixtureHomeWinProb,
  fixtureOutcomeProbs,
  isMarketBacked,
} from "@/lib/displayProbs";

const team = (rating: number, host = false): Team => ({
  id: rating, name: `T${rating}`, code: `T${rating}`, flag: "⚽", group: "A",
  rating, ...(host ? { host: true } : {}),
});

// Minimal fixture stub carrying just what the display helpers read.
const fx = (home: Team, away: Team, marketProbs?: Fixture["marketProbs"]): Fixture => ({
  id: 1, stage: "Group Stage", group: "A", kickoff: "2026-06-20T18:00:00Z",
  status: "scheduled", venue: null, home, away, homeGoals: null, awayGoals: null,
  minute: null, goals: [], ...(marketProbs ? { marketProbs } : {}),
});

describe("displayProbs — no odds (default behaviour unchanged)", () => {
  const strong = team(1850), weak = team(1650);

  it("home win prob equals the pure model when no market odds are present", () => {
    expect(fixtureHomeWinProb(fx(strong, weak))).toBeCloseTo(
      predictWinProbability(strong, weak),
      12,
    );
  });

  it("isMarketBacked is false without odds, true with", () => {
    expect(isMarketBacked(fx(strong, weak))).toBe(false);
    expect(
      isMarketBacked(fx(strong, weak, { home: 0.5, draw: 0.3, away: 0.2 })),
    ).toBe(true);
  });

  it("the model outcome sums to 1", () => {
    const p = fixtureOutcomeProbs(fx(strong, weak));
    expect(p.home + p.draw + p.away).toBeCloseTo(1, 12);
  });
});

describe("displayProbs — with market odds (blend)", () => {
  const a = team(1700), b = team(1700); // even sides → model ~0.5 home

  it("pulls the displayed probability toward the market consensus", () => {
    const market = { home: 0.7, draw: 0.2, away: 0.1 }; // market favours home
    const blended = fixtureOutcomeProbs(fx(a, b, market));
    const model = fixtureOutcomeProbs(fx(a, b));
    // Blend lands between model and market, market-dominant (weight 0.9).
    expect(blended.home).toBeGreaterThan(model.home);
    expect(blended.home).toBeLessThan(market.home);
    expect(blended.home).toBeCloseTo(0.1 * model.home + 0.9 * market.home, 12);
    expect(blended.home + blended.draw + blended.away).toBeCloseTo(1, 12);
  });

  it("the home win prob reflects the blended, draw-removed market view", () => {
    const market = { home: 0.7, draw: 0.2, away: 0.1 };
    const hp = fixtureHomeWinProb(fx(a, b, market));
    expect(hp).toBeGreaterThan(predictWinProbability(a, b)); // shifted toward market
    expect(hp).toBeLessThan(1);
  });
});
