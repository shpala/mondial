// Official 2026 World Cup knockout slotting.
//
// The 2026 bracket is FIXED by group position, not re-seeded by rating: the
// Round of 32 pairs specific group winners, runners-up and best-third slots, so
// two teams from the same group cannot meet in the R32 and every team's path is
// the real one. Rating only feeds the per-match win probability (lib/prediction),
// never the seeding.
//
// Source: FIFA 2026 knockout bracket (matches 73–104). The R32 template below is
// in bracket-display order (an in-order traversal of the tournament tree), so the
// generic balanced-tree linking in buildBracketFromSlots reproduces the official
// R16 → QF → SF → Final pairings exactly.
//
// Best-third assignment: each of the 8 third slots may receive a third from one
// of 5 specific groups (FIFA's per-slot constraint). FIFA's Annex C is a 495-row
// lookup giving one assignment per combination of qualifying thirds; we instead
// solve the equivalent constrained matching deterministically. This preserves
// every property that matters (no same-group R32, correct winner/runner-up
// slots, correct tree); the specific slot among valid options may differ from
// Annex C's exact row.

import type { Group, Team } from "@/lib/types";
import { qualificationBreakdown } from "@/lib/qualifiers";
import { buildBracketFromSlots, type Bracket } from "@/lib/prediction";

type SlotSpec =
  | { kind: "winner"; group: string }
  | { kind: "runnerUp"; group: string }
  | { kind: "third" };

const W = (group: string): SlotSpec => ({ kind: "winner", group });
const R = (group: string): SlotSpec => ({ kind: "runnerUp", group });
const T: SlotSpec = { kind: "third" };

/**
 * The 16 Round-of-32 matches in bracket-display order. Index = position in the
 * tree; adjacent matches (2i, 2i+1) meet in the next round.
 */
export const R32_TEMPLATE: readonly (readonly [SlotSpec, SlotSpec])[] = [
  [W("E"), T], //  0  M74: Winner E   vs 3rd A/B/C/D/F
  [W("I"), T], //  1  M77: Winner I   vs 3rd C/D/F/G/H
  [R("A"), R("B")], //  2  M73: RU A   vs RU B
  [W("F"), R("C")], //  3  M75: Winner F vs RU C
  [R("K"), R("L")], //  4  M83: RU K   vs RU L
  [W("H"), R("J")], //  5  M84: Winner H vs RU J
  [W("D"), T], //  6  M81: Winner D   vs 3rd B/E/F/I/J
  [W("G"), T], //  7  M82: Winner G   vs 3rd A/E/H/I/J
  [W("C"), R("F")], //  8  M76: Winner C vs RU F
  [R("E"), R("I")], //  9  M78: RU E   vs RU I
  [W("A"), T], // 10  M79: Winner A   vs 3rd C/E/F/H/I
  [W("L"), T], // 11  M80: Winner L   vs 3rd E/H/I/J/K
  [W("J"), R("H")], // 12  M86: Winner J vs RU H
  [R("D"), R("G")], // 13  M88: RU D   vs RU G
  [W("B"), T], // 14  M85: Winner B   vs 3rd E/F/G/I/J
  [W("K"), T], // 15  M87: Winner K   vs 3rd D/E/I/J/L
];

/**
 * For each third-place slot (keyed by its index in R32_TEMPLATE), the five
 * groups whose third-placed team may be drawn into it. None includes the group
 * of the winner it faces, so a winner never meets a same-group third.
 */
export const THIRD_SLOT_GROUPS: Readonly<Record<number, readonly string[]>> = {
  0: ["A", "B", "C", "D", "F"],
  1: ["C", "D", "F", "G", "H"],
  6: ["B", "E", "F", "I", "J"],
  7: ["A", "E", "H", "I", "J"],
  10: ["C", "E", "F", "H", "I"],
  11: ["E", "H", "I", "J", "K"],
  14: ["E", "F", "G", "I", "J"],
  15: ["D", "E", "I", "J", "L"],
};

/**
 * Assign the (up to 8) qualifying third-placed groups to the 8 third slots,
 * respecting each slot's eligible-group constraint, as a one-to-one matching.
 * Deterministic backtracking. Returns a `slotIndex → group` map, or null if the
 * input isn't exactly 8 groups or no valid matching exists (never happens for a
 * real 8-of-12 combination — every one admits a matching).
 */
export function assignThirds(
  thirdGroups: string[],
): Record<number, string> | null {
  const slots = Object.keys(THIRD_SLOT_GROUPS).map(Number);
  if (thirdGroups.length !== slots.length) return null;

  const assignment: Record<number, string> = {};
  const used = new Set<string>();

  const solve = (si: number): boolean => {
    if (si === slots.length) return true;
    const slot = slots[si];
    const eligible = THIRD_SLOT_GROUPS[slot];
    for (const g of thirdGroups) {
      if (used.has(g) || !eligible.includes(g)) continue;
      used.add(g);
      assignment[slot] = g;
      if (solve(si + 1)) return true;
      used.delete(g);
      delete assignment[slot];
    }
    return false;
  };

  return solve(0) ? assignment : null;
}

/**
 * Build the bracket skeleton from the current group standings using the official
 * 2026 slotting. Group winners and runners-up go to their fixed slots; the 8
 * best thirds are matched to the third slots. The teams carry whatever rating
 * the caller put on the group rows (e.g. live Elo), which drives win probability.
 */
export function buildOfficialBracket(groups: Group[]): Bracket {
  const breakdown = qualificationBreakdown(groups);
  const winnerByGroup = new Map(breakdown.winners.map((c) => [c.group, c.team]));
  const runnerByGroup = new Map(
    breakdown.runnersUp.map((c) => [c.group, c.team]),
  );
  const thirdByGroup = new Map(
    breakdown.bestThirds.map((c) => [c.group, c.team]),
  );
  const slotAssign = assignThirds(breakdown.bestThirds.map((c) => c.group));

  const teamForSlot = (spec: SlotSpec, matchIndex: number): Team | null => {
    if (spec.kind === "winner") return winnerByGroup.get(spec.group) ?? null;
    if (spec.kind === "runnerUp") return runnerByGroup.get(spec.group) ?? null;
    const group = slotAssign?.[matchIndex];
    return group ? thirdByGroup.get(group) ?? null : null;
  };

  const slotted: (Team | null)[] = [];
  R32_TEMPLATE.forEach(([top, bottom], i) => {
    slotted.push(teamForSlot(top, i), teamForSlot(bottom, i));
  });

  return buildBracketFromSlots(slotted);
}
