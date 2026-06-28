import { describe, expect, it } from "vitest";
import type { Team } from "@/lib/types";
import {
  buildBracketFromSlots,
  resolveBracketWithResults,
  type PlayedResult,
  type ResultMap,
} from "@/lib/prediction";

function team(id: number, rating: number): Team {
  return { id, name: `Team ${id}`, code: `T${id}`, flag: "⚽", group: "A", rating };
}

function pairKey(a: number, b: number): string {
  return [a, b].sort((x, y) => x - y).join("-");
}

function result(winner: Team, loser: Team, fixtureId: number): PlayedResult {
  return {
    winnerId: winner.id,
    homeId: winner.id,
    awayId: loser.id,
    homeGoals: 1,
    awayGoals: 0,
    fixtureId,
  };
}

describe("resolveBracketWithResults", () => {
  // A & C are the model favourites (higher rated). B upsets A in R32, then beats
  // C in R16 — a real later-round result on a branch whose pairing the model
  // baseline got wrong (model had A vs C there, never B vs C).
  const teamA = team(1, 2000);
  const teamB = team(2, 1500);
  const teamC = team(3, 1900);
  const teamD = team(4, 1400);

  function skeleton() {
    // R0-0 = A vs B, R0-1 = C vs D; both feed R1-0. Rest of the 32-slot field empty.
    const slots: (Team | null)[] = Array(32).fill(null);
    slots[0] = teamA;
    slots[1] = teamB;
    slots[2] = teamC;
    slots[3] = teamD;
    return buildBracketFromSlots(slots);
  }

  it("locks in a later-round result even when an upstream upset changed the pairing", () => {
    const results: ResultMap = {
      [pairKey(teamA.id, teamB.id)]: result(teamB, teamA, 100), // R32 upset: B beats A
      [pairKey(teamC.id, teamD.id)]: result(teamC, teamD, 101), // R32 as modelled: C beats D
      [pairKey(teamB.id, teamC.id)]: result(teamB, teamC, 102), // R16 actual tie: B beats C
    };

    const { resolved, playedNodes } = resolveBracketWithResults(skeleton(), {}, results);

    // The R16 node (R1-0) must register as a played result, with B — the actual
    // winner — advancing, not the model's pick for the (wrong) A-vs-C pairing.
    expect(playedNodes["R1-0"]).toBeDefined();
    expect(playedNodes["R1-0"].winnerId).toBe(teamB.id);
    expect(resolved.rounds[1][0].winnerId).toBe(teamB.id);
  });

  it("locks in results that agree with the model baseline", () => {
    const results: ResultMap = {
      [pairKey(teamA.id, teamB.id)]: result(teamA, teamB, 100), // model-consistent
    };

    const { playedNodes } = resolveBracketWithResults(skeleton(), {}, results);

    expect(playedNodes["R0-0"]?.winnerId).toBe(teamA.id);
  });
});
