import { describe, expect, it } from "vitest";
import { davidsonProbs, winProbability } from "@/lib/prediction";

describe("davidsonProbs", () => {
  it("sums to 1 and collapses to winProbability on a decisive result", () => {
    const p = davidsonProbs(1900, 1700, 0.63);
    expect(p.home + p.draw + p.away).toBeCloseTo(1, 9);
    expect(p.home / (p.home + p.away)).toBeCloseTo(winProbability(1900, 1700), 9);
  });

  it("raises the draw share as nu grows", () => {
    const lo = davidsonProbs(1800, 1800, 0.3).draw;
    const hi = davidsonProbs(1800, 1800, 0.9).draw;
    expect(hi).toBeGreaterThan(lo);
  });

  it("defaults scale to 300", () => {
    const def = davidsonProbs(1900, 1700, 0.63);
    const explicit = davidsonProbs(1900, 1700, 0.63, 300);
    expect(def).toEqual(explicit);
  });

  it("sharpens (more confident) as scale shrinks", () => {
    // Same favourite; a smaller spread should push the favourite's win share up.
    const flat = davidsonProbs(1900, 1700, 0.63, 600).home;
    const sharp = davidsonProbs(1900, 1700, 0.63, 200).home;
    expect(sharp).toBeGreaterThan(flat);
    // still a valid distribution
    const p = davidsonProbs(1900, 1700, 0.63, 200);
    expect(p.home + p.draw + p.away).toBeCloseTo(1, 9);
  });
});
