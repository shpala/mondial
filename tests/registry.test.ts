// The registry is the cross-origin join key: every live origin's team name is
// normalised here. Its alias handling is the thing that keeps "South Korea",
// "Korea Republic" and "Korea, South" pointing at one team, so it deserves
// direct coverage.
import { describe, expect, it } from "vitest";
import {
  allCountries,
  hostNations,
  registryId,
  resolveTeam,
  teamByIdRegistry,
} from "@/lib/teams/registry";

describe("resolveTeam (cross-origin name reconciliation)", () => {
  it("resolves the canonical name and code", () => {
    expect(resolveTeam("Brazil")?.code).toBe("BRA");
    expect(resolveTeam("BRA")?.code).toBe("BRA");
  });

  it("resolves known aliases across origins", () => {
    const cases: [string, string][] = [
      ["Korea Republic", "KOR"],
      ["Korea, South", "KOR"],
      ["South Korea", "KOR"],
      ["Holland", "NED"],
      ["Türkiye", "TUR"],
      ["Turkiye", "TUR"],
      ["Côte d'Ivoire", "CIV"],
      ["Cote d'Ivoire", "CIV"],
      ["Ivory Coast", "CIV"],
      ["Czechia", "CZE"],
      ["United States", "USA"],
      ["IR Iran", "IRN"],
      ["Cabo Verde", "CPV"],
    ];
    for (const [name, code] of cases) {
      expect(resolveTeam(name)?.code, name).toBe(code);
    }
  });

  it("is insensitive to case, diacritics, spacing and punctuation", () => {
    expect(resolveTeam("  côte  d'ivoire ")?.code).toBe("CIV");
    expect(resolveTeam("SOUTH KOREA")?.code).toBe("KOR");
  });

  it("returns null for an unknown name (a placeholder, not a participant)", () => {
    expect(resolveTeam("Atlantis")).toBeNull();
    expect(resolveTeam("")).toBeNull();
  });

  it("carries the requested group onto the resolved team", () => {
    expect(resolveTeam("Brazil", "C")?.group).toBe("C");
  });
});

describe("registry identity", () => {
  it("covers exactly 48 participants with unique codes and ids", () => {
    const all = allCountries();
    expect(all).toHaveLength(48);
    expect(new Set(all.map((t) => t.code)).size).toBe(48);
    expect(new Set(all.map((t) => t.id)).size).toBe(48);
  });

  it("registryId and teamByIdRegistry round-trip with resolveTeam", () => {
    const t = resolveTeam("Brazil")!;
    expect(registryId("BRA")).toBe(t.id);
    expect(teamByIdRegistry(t.id)?.code).toBe("BRA");
  });
});

describe("hostNations", () => {
  it("returns the three 2026 co-hosts north-to-south with their flags", () => {
    const hosts = hostNations();
    expect(hosts.map((t) => t.code)).toEqual(["CAN", "USA", "MEX"]);
    expect(hosts.every((t) => t.host === true)).toBe(true);
    expect(hosts.every((t) => t.flag.length > 0)).toBe(true);
  });
});
