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

  it("parses a penalty shootout: full-time score stays, shootout tally captured", async () => {
    mockJson({
      name: "x",
      matches: [
        {
          round: "Round of 32",
          date: "2026-06-29",
          time: "16:30 (UTC-4)",
          team1: "Germany",
          team2: "Paraguay",
          // 1-1 after extra time, Paraguay win 4-3 on penalties.
          score: { ft: [1, 1], et: [1, 1], p: [3, 4], ht: [0, 1] },
        },
      ],
    });
    const data = await fetchOpenfootball();
    const m = data.fixtures[0];
    expect(m.status).toBe("finished");
    // The displayed score is the pre-penalty result (here 1-1 a.e.t.).
    expect(m.homeGoals).toBe(1);
    expect(m.awayGoals).toBe(1);
    // The shootout tally is captured so the knockout winner is known.
    expect(m.shootout).toEqual({ home: 3, away: 4 });
  });

  it("uses the extra-time score for a match decided in extra time (no shootout)", async () => {
    mockJson({
      name: "x",
      matches: [
        {
          round: "Round of 16",
          date: "2026-07-03",
          team1: "Spain",
          team2: "Italy",
          // 1-1 at 90', 2-1 after extra time — decided without penalties.
          score: { ft: [1, 1], et: [2, 1], ht: [1, 0] },
        },
      ],
    });
    const data = await fetchOpenfootball();
    const m = data.fixtures[0];
    expect(m.status).toBe("finished");
    expect(m.homeGoals).toBe(2);
    expect(m.awayGoals).toBe(1);
    expect(m.shootout).toBeNull();
  });

  it("leaves shootout null for an ordinary finished match and ignores a malformed shootout", async () => {
    mockJson({
      name: "x",
      matches: [
        {
          round: "Round of 32",
          date: "2026-06-28",
          team1: "Brazil",
          team2: "Japan",
          score: { ft: [2, 1] },
        },
        {
          round: "Round of 32",
          date: "2026-06-28",
          team1: "Mexico",
          team2: "Canada",
          score: { ft: [0, 0], p: [3] }, // malformed shootout → ignored
        },
      ],
    });
    const data = await fetchOpenfootball();
    expect(data.fixtures[0].shootout).toBeNull();
    expect(data.fixtures[1].shootout).toBeNull();
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
