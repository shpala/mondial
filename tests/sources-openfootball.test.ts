import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOpenfootball } from "@/lib/api/sources/openfootball";

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

function mockJson(data: unknown, ok = true, status = 200) {
  global.fetch = vi.fn(async () => ({
    ok,
    status,
    json: async () => data,
  })) as unknown as typeof fetch;
}

const SPINE = {
  name: "World Cup 2026",
  matches: [
    {
      round: "Matchday 1",
      date: "2026-06-11",
      time: "20:00 (UTC-4)",
      group: "Group A",
      team1: "Mexico",
      team2: "Brazil",
      score: { ft: [1, 2] },
    },
    {
      round: "Matchday 1",
      date: "2026-06-11",
      group: "Group A",
      team1: "Atlantis", // unknown → placeholder
      team2: "Brazil",
    },
  ],
};

describe("fetchOpenfootball", () => {
  it("parses fixtures, teams and groups from the spine JSON", async () => {
    mockJson(SPINE);
    const data = await fetchOpenfootball();

    expect(data.fixtures).toHaveLength(2);
    const finished = data.fixtures[0];
    expect(finished.status).toBe("finished");
    expect(finished.homeGoals).toBe(1);
    expect(finished.awayGoals).toBe(2);
    expect(finished.group).toBe("A");

    // Real teams resolve via the registry (id != 0); the placeholder is excluded.
    expect(data.teams.some((t) => t.code === "BRA")).toBe(true);
    expect(data.teams.some((t) => t.code === "MEX")).toBe(true);
    expect(data.teams.every((t) => t.id !== 0)).toBe(true);
    expect(data.groups.length).toBeGreaterThan(0);
  });

  it("uses a placeholder (id 0) for an unknown team and omits it from teams", async () => {
    mockJson(SPINE);
    const data = await fetchOpenfootball();
    const placeholder = data.fixtures[1];
    expect(placeholder.home.id).toBe(0);
    expect(placeholder.home.code).toBe("Atlantis");
    expect(data.teams.some((t) => t.code === "Atlantis")).toBe(false);
  });

  it("throws on a non-ok response", async () => {
    mockJson({}, false, 503);
    await expect(fetchOpenfootball()).rejects.toThrow(/openfootball/);
  });

  it("throws when the spine has no matches", async () => {
    mockJson({ name: "x", matches: [] });
    await expect(fetchOpenfootball()).rejects.toThrow(/empty/);
  });

  it("does not mark a match finished without a full-time score", async () => {
    mockJson({
      name: "x",
      matches: [
        {
          round: "Matchday 1",
          date: "2026-06-11",
          group: "Group A",
          team1: "Mexico",
          team2: "Brazil",
        },
      ],
    });
    const data = await fetchOpenfootball();
    expect(data.fixtures[0].homeGoals).toBeNull();
    expect(data.fixtures[0].status).not.toBe("finished");
  });
});
