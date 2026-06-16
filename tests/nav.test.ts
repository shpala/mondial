import { describe, expect, it } from "vitest";
import { NAV_ITEMS, isNavActive } from "@/lib/nav";

describe("NAV_ITEMS", () => {
  it("exposes a unique, non-empty destination for every nav item", () => {
    const hrefs = NAV_ITEMS.map((i) => i.href);
    expect(hrefs).toContain("/");
    expect(hrefs).toContain("/model"); // regression: /model must be in the shared set
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const item of NAV_ITEMS) {
      expect(item.label).not.toBe("");
      expect(item.shortLabel).not.toBe("");
      expect(item.icon).not.toBe("");
    }
  });
});

describe("isNavActive", () => {
  it("matches the root only on an exact path", () => {
    expect(isNavActive("/", "/")).toBe(true);
    expect(isNavActive("/matches", "/")).toBe(false);
  });

  it("matches a section and its detail pages", () => {
    expect(isNavActive("/teams", "/teams")).toBe(true);
    expect(isNavActive("/teams/42", "/teams")).toBe(true);
  });

  it("does not over-match on a shared prefix", () => {
    // A bare startsWith would wrongly light up "/team" while on "/teams".
    expect(isNavActive("/teams", "/team")).toBe(false);
    expect(isNavActive("/matches-archive", "/matches")).toBe(false);
  });
});
