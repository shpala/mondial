import { describe, expect, it } from "vitest";
import type { Fixture, Team } from "@/lib/types";
import { isFabricatedResult } from "@/lib/provenance";

const team = (id: number): Team => ({
  id,
  name: `T${id}`,
  code: `T${id}`,
  flag: "⚽",
  group: "A",
  rating: 1500,
});

function fixture(over: Partial<Fixture> = {}): Fixture {
  return {
    id: 1,
    stage: "Group Stage",
    group: "A",
    kickoff: "2026-06-11T18:00:00Z",
    status: "finished",
    venue: null,
    home: team(1),
    away: team(2),
    homeGoals: 2,
    awayGoals: 1,
    minute: null,
    goals: [],
    ...over,
  };
}

describe("isFabricatedResult", () => {
  it("is true for a finished fixture in sample mode that was not ESPN-overlaid", () => {
    expect(isFabricatedResult(fixture(), true)).toBe(true);
  });

  it("is false in live (non-sample) mode regardless of overlay", () => {
    expect(isFabricatedResult(fixture(), false)).toBe(false);
    expect(isFabricatedResult(fixture({ liveOverlaid: true }), false)).toBe(false);
  });

  it("is false when a real ESPN score was overlaid onto a snapshot fixture", () => {
    // Spine is down (sample mode) but ESPN supplied a genuine final score.
    expect(isFabricatedResult(fixture({ liveOverlaid: true }), true)).toBe(false);
  });

  it("is false for non-finished fixtures (scheduled / live) in sample mode", () => {
    expect(isFabricatedResult(fixture({ status: "scheduled", homeGoals: null, awayGoals: null }), true)).toBe(false);
    expect(isFabricatedResult(fixture({ status: "live" }), true)).toBe(false);
  });
});
