// The facade's core promise — serve live data when the spine is up, otherwise
// fall back to the bundled snapshot and flag it — was entirely untested. These
// exercise it with a routed fetch mock, re-importing the module per test so the
// per-request React cache() starts clean.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const realFetch = global.fetch;

afterEach(() => {
  global.fetch = realFetch;
  vi.resetModules();
  vi.restoreAllMocks();
});

const SPINE = {
  name: "World Cup 2026",
  matches: [
    {
      round: "Matchday 1",
      date: "2026-06-11",
      group: "Group A",
      team1: "Mexico",
      team2: "Brazil",
      score: { ft: [1, 2] },
    },
  ],
};

type Handler = () => { ok: boolean; status: number; json: () => Promise<unknown> };

function routeFetch(handlers: { openfootball?: Handler; espn?: Handler }) {
  global.fetch = vi.fn(async (url: unknown) => {
    const u = String(url);
    if (u.includes("worldcup.json")) {
      return (
        handlers.openfootball?.() ?? {
          ok: false,
          status: 500,
          json: async () => ({}),
        }
      );
    }
    if (u.includes("espn.com")) {
      return (
        handlers.espn?.() ?? {
          ok: true,
          status: 200,
          json: async () => ({ events: [] }),
        }
      );
    }
    return { ok: true, status: 200, json: async () => ({}) };
  }) as unknown as typeof fetch;
}

describe("data facade capability routing + fallback", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("serves live spine data and reports usingSample=false when it's up", async () => {
    routeFetch({
      openfootball: () => ({ ok: true, status: 200, json: async () => SPINE }),
    });
    const data = await import("@/lib/data");
    expect((await data.getDataStatus()).usingSample).toBe(false);
    expect((await data.getGroups()).length).toBeGreaterThan(0);
    expect((await data.getTeams()).some((t) => t.code === "BRA")).toBe(true);
  });

  it("falls back to the snapshot and reports usingSample=true when the spine fails", async () => {
    routeFetch({
      openfootball: () => ({ ok: false, status: 503, json: async () => ({}) }),
    });
    const data = await import("@/lib/data");
    expect((await data.getDataStatus()).usingSample).toBe(true);
    // The bundled snapshot always has the 12 groups.
    expect(await data.getGroups()).toHaveLength(12);
    expect((await data.getTeams()).length).toBe(48);
  });

  it("getDataStatus is consistent across getters within one request", async () => {
    routeFetch({
      openfootball: () => ({ ok: false, status: 500, json: async () => ({}) }),
    });
    const data = await import("@/lib/data");
    await data.getGroups();
    // Same request → same cached spine outcome.
    expect((await data.getDataStatus()).usingSample).toBe(true);
  });
});
