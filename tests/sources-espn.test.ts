import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchEspnLive, pairCodeKey } from "@/lib/api/sources/espn";

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

function mockJson(data: unknown, ok = true) {
  global.fetch = vi.fn(async () => ({
    ok,
    status: ok ? 200 : 500,
    json: async () => data,
  })) as unknown as typeof fetch;
}

describe("fetchEspnLive", () => {
  it("parses score, state, minute, eventId and the goal timeline, keyed by team pair", async () => {
    mockJson({
      events: [
        {
          id: "401",
          competitions: [
            {
              status: { displayClock: "70'", type: { state: "in" } },
              competitors: [
                { homeAway: "home", score: "2", team: { id: "10", displayName: "Brazil" } },
                { homeAway: "away", score: "1", team: { id: "20", displayName: "Mexico" } },
              ],
              details: [
                {
                  scoringPlay: true,
                  team: { id: "10" },
                  clock: { displayValue: "23'" },
                  athletesInvolved: [{ displayName: "Neymar" }],
                },
                { scoringPlay: false, team: { id: "20" } }, // not a goal
              ],
            },
          ],
        },
      ],
    });

    const map = await fetchEspnLive();
    const live = map.get(pairCodeKey("BRA", "MEX"));
    expect(live).toBeDefined();
    expect(live!.state).toBe("in");
    expect(live!.minute).toBe("70'");
    expect(live!.eventId).toBe("401");
    expect(live!.scores).toEqual({ BRA: 2, MEX: 1 });
    expect(live!.goals).toHaveLength(1);
    expect(live!.goals[0]).toMatchObject({ code: "BRA", minute: "23", scorer: "Neymar" });
  });

  it("skips an event whose score is not a finite number", async () => {
    mockJson({
      events: [
        {
          id: "402",
          competitions: [
            {
              status: { type: { state: "in" } },
              competitors: [
                { score: "abc", team: { displayName: "Brazil" } },
                { score: "1", team: { displayName: "Mexico" } },
              ],
            },
          ],
        },
      ],
    });
    expect((await fetchEspnLive()).size).toBe(0);
  });

  it("skips an event with an unresolvable team", async () => {
    mockJson({
      events: [
        {
          id: "403",
          competitions: [
            {
              status: { type: { state: "pre" } },
              competitors: [
                { score: "0", team: { displayName: "Atlantis" } },
                { score: "0", team: { displayName: "Mexico" } },
              ],
            },
          ],
        },
      ],
    });
    expect((await fetchEspnLive()).size).toBe(0);
  });

  it("reports no minute unless the match is in play", async () => {
    mockJson({
      events: [
        {
          id: "404",
          competitions: [
            {
              status: { displayClock: "FT", type: { state: "post" } },
              competitors: [
                { score: "1", team: { displayName: "Brazil" } },
                { score: "0", team: { displayName: "Mexico" } },
              ],
            },
          ],
        },
      ],
    });
    const live = (await fetchEspnLive()).get(pairCodeKey("BRA", "MEX"));
    expect(live!.state).toBe("post");
    expect(live!.minute).toBeNull();
  });

  it("throws on a non-ok response", async () => {
    mockJson({}, false);
    await expect(fetchEspnLive()).rejects.toThrow(/espn/);
  });
});
