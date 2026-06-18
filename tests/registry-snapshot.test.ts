// The bundled snapshot is the universal fallback; the registry is the canonical
// reconciliation layer for every live origin. If the two disagree on the field,
// a live origin naming a snapshot-only country resolves to null → an id:0
// placeholder that is silently dropped from teams and standings. These tests pin
// the two to the same 48 participants so any divergence fails loudly here.
import { describe, expect, it } from "vitest";
import { TEAMS } from "@/lib/data/snapshot";
import { allCountries, resolveTeam } from "@/lib/teams/registry";

describe("snapshot ↔ registry reconciliation", () => {
  it("every snapshot team resolves via the canonical registry", () => {
    const unresolved = TEAMS.filter((t) => resolveTeam(t.code) == null).map(
      (t) => t.code,
    );
    expect(unresolved).toEqual([]);
  });

  it("snapshot and registry describe the same 48 participants", () => {
    const snapCodes = [...new Set(TEAMS.map((t) => t.code))].sort();
    const regCodes = [...new Set(allCountries().map((t) => t.code))].sort();
    expect(snapCodes).toHaveLength(48);
    expect(regCodes).toHaveLength(48);
    expect(snapCodes).toEqual(regCodes);
  });

  it("each snapshot team's rating matches the registry (model inputs agree)", () => {
    for (const t of TEAMS) {
      const reg = resolveTeam(t.code);
      expect(reg, `${t.code} missing from registry`).not.toBeNull();
      expect(t.rating, `${t.code} rating`).toBe(reg!.rating);
    }
  });

  it("snapshot team ids are the canonical registry ids (stable links across modes)", () => {
    for (const t of TEAMS) {
      const reg = resolveTeam(t.code);
      expect(reg, `${t.code} missing from registry`).not.toBeNull();
      expect(t.id, `${t.code} id`).toBe(reg!.id);
    }
  });
});
