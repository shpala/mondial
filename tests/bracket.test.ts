import { describe, expect, it } from "vitest";
import type { Group, GroupRow, Team } from "@/lib/types";
import {
  assignThirds,
  buildOfficialBracket,
  R32_TEMPLATE,
  THIRD_SLOT_GROUPS,
} from "@/lib/bracket";

const GROUP_LETTERS = "ABCDEFGHIJKL".split("");

/** All k-subsets of `arr` (combinations). */
function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (k > arr.length) return [];
  const [head, ...rest] = arr;
  return [
    ...combinations(rest, k - 1).map((c) => [head, ...c]),
    ...combinations(rest, k),
  ];
}

describe("assignThirds (best-third → R32 slot matching)", () => {
  it("there are exactly 8 third-place slots, each with 5 eligible groups", () => {
    const slots = Object.keys(THIRD_SLOT_GROUPS).map(Number);
    expect(slots).toHaveLength(8);
    for (const s of slots) {
      expect(THIRD_SLOT_GROUPS[s]).toHaveLength(5);
    }
  });

  it("finds a valid one-to-one assignment for ALL 495 combinations of 8-of-12 groups", () => {
    const combos = combinations(GROUP_LETTERS, 8);
    expect(combos).toHaveLength(495); // C(12,8)

    for (const combo of combos) {
      const assignment = assignThirds(combo);
      expect(assignment, combo.join("")).not.toBeNull();
      const entries = Object.entries(assignment!);
      // exactly 8 slots filled, each a real third-slot
      expect(entries).toHaveLength(8);
      // bijection: distinct slots, distinct groups, covering the combo
      expect(new Set(entries.map(([slot]) => slot)).size).toBe(8);
      expect(new Set(entries.map(([, g]) => g))).toEqual(new Set(combo));
      // every assignment respects that slot's eligible-group constraint
      for (const [slot, g] of entries) {
        expect(THIRD_SLOT_GROUPS[Number(slot)]).toContain(g);
      }
    }
  });

  it("returns null when not given exactly 8 groups", () => {
    expect(assignThirds(["A", "B", "C"])).toBeNull();
  });
});

describe("R32_TEMPLATE (official 2026 slotting)", () => {
  it("has 16 matches and no slot pairs a group's winner with a third from its own group", () => {
    expect(R32_TEMPLATE).toHaveLength(16);
    for (const [a, b] of R32_TEMPLATE) {
      // a winner is never paired with a third whose eligible set includes the winner's group
      if (a.kind === "winner" && b.kind === "third") {
        // the third slot's eligibility is keyed by the match index; checked below
      }
      // two non-third slots in the same match must be different groups
      if (a.kind !== "third" && b.kind !== "third") {
        expect(a.group).not.toBe(b.group);
      }
    }
  });

  it("never lets a group winner meet a third from the same group", () => {
    R32_TEMPLATE.forEach((match, i) => {
      const winner = match.find((s) => s.kind === "winner");
      const hasThird = match.some((s) => s.kind === "third");
      if (winner && winner.kind === "winner" && hasThird) {
        expect(THIRD_SLOT_GROUPS[i]).not.toContain(winner.group);
      }
    });
  });
});

// --- buildOfficialBracket --------------------------------------------------

let nextId = 1;
function team(group: string, rank: number, rating: number): Team {
  const id = nextId++;
  return { id, name: `${group}${rank}`, code: `${group}${rank}`, flag: "⚽", group, rating };
}

function row(t: Team, rank: number, points: number): GroupRow {
  return {
    team: t,
    rank,
    points,
    played: 3,
    win: 0,
    draw: 0,
    loss: 0,
    goalsFor: 9 - rank,
    goalsAgainst: rank,
  };
}

function makeGroups(): Group[] {
  return GROUP_LETTERS.map((name, gi) => ({
    name,
    rows: [
      row(team(name, 1, 2000 - gi), 1, 9),
      row(team(name, 2, 1900 - gi), 2, 6),
      row(team(name, 3, 1800 - gi), 3, 3 + (gi % 4)), // varied thirds
      row(team(name, 4, 1700 - gi), 4, 0),
    ],
  }));
}

describe("buildOfficialBracket", () => {
  it("creates 5 rounds of sizes 16,8,4,2,1", () => {
    const b = buildOfficialBracket(makeGroups());
    expect(b.rounds.map((r) => r.length)).toEqual([16, 8, 4, 2, 1]);
  });

  it("places exactly the 32 qualifiers, each once, with no empty R32 slot", () => {
    const b = buildOfficialBracket(makeGroups());
    const ids = b.rounds[0].flatMap((m) => [m.top, m.bottom]).map((t) => t?.id);
    expect(ids.every((id) => id != null)).toBe(true);
    expect(new Set(ids).size).toBe(32);
  });

  it("never pairs two teams from the same group in the Round of 32", () => {
    const b = buildOfficialBracket(makeGroups());
    for (const m of b.rounds[0]) {
      expect(m.top!.group).not.toBe(m.bottom!.group);
    }
  });

  it("slots each group's winner and runner-up per the official template", () => {
    const b = buildOfficialBracket(makeGroups());
    const first = b.rounds[0];
    // Match 0 (M74): Winner E vs a best third.
    expect(first[0].top!.code).toBe("E1");
    // Match 2 (M73): Runner-up A vs Runner-up B.
    expect(first[2].top!.code).toBe("A2");
    expect(first[2].bottom!.code).toBe("B2");
    // Match 15 (M87): Winner K vs a best third.
    expect(first[15].top!.code).toBe("K1");
  });
});
