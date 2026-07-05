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

  it("parses the shootout tally when competitors carry shootoutScore", async () => {
    mockJson({
      events: [
        {
          id: "405",
          competitions: [
            {
              status: { displayClock: "FT-Pens", type: { state: "post" } },
              competitors: [
                { score: "1", shootoutScore: "4", team: { displayName: "Brazil" } },
                { score: "1", shootoutScore: "2", team: { displayName: "Mexico" } },
              ],
            },
          ],
        },
      ],
    });
    const live = (await fetchEspnLive()).get(pairCodeKey("BRA", "MEX"));
    expect(live!.scores).toEqual({ BRA: 1, MEX: 1 });
    expect(live!.shootout).toEqual({ BRA: 4, MEX: 2 });
  });

  it("reports no shootout for a match without shootoutScore", async () => {
    mockJson({
      events: [
        {
          id: "406",
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
    expect(live!.shootout).toBeNull();
  });

  it("ignores a malformed shootoutScore rather than inventing a tally", async () => {
    mockJson({
      events: [
        {
          id: "407",
          competitions: [
            {
              status: { displayClock: "FT-Pens", type: { state: "post" } },
              competitors: [
                { score: "1", shootoutScore: "abc", team: { displayName: "Brazil" } },
                { score: "1", shootoutScore: "2", team: { displayName: "Mexico" } },
              ],
            },
          ],
        },
      ],
    });
    const live = (await fetchEspnLive()).get(pairCodeKey("BRA", "MEX"));
    expect(live).toBeDefined();
    expect(live!.shootout).toBeNull();
  });

  it("rejects a negative or fractional shootoutScore (garbage must not decide a tie)", async () => {
    mockJson({
      events: [
        {
          id: "408",
          competitions: [
            {
              status: { displayClock: "FT-Pens", type: { state: "post" } },
              competitors: [
                { score: "1", shootoutScore: "-1", team: { displayName: "Brazil" } },
                { score: "1", shootoutScore: "2", team: { displayName: "Mexico" } },
              ],
            },
          ],
        },
        {
          id: "409",
          competitions: [
            {
              status: { displayClock: "FT-Pens", type: { state: "post" } },
              competitors: [
                { score: "1", shootoutScore: "2.5", team: { displayName: "France" } },
                { score: "1", shootoutScore: "2", team: { displayName: "Spain" } },
              ],
            },
          ],
        },
      ],
    });
    const map = await fetchEspnLive();
    expect(map.get(pairCodeKey("BRA", "MEX"))!.shootout).toBeNull();
    expect(map.get(pairCodeKey("FRA", "ESP"))!.shootout).toBeNull();
  });

  it("parses the DraftKings 1X2 moneyline into decimal odds keyed by team code", async () => {
    mockJson({
      events: [
        {
          id: "410",
          competitions: [
            {
              status: { type: { state: "pre" } },
              competitors: [
                { homeAway: "home", score: "0", team: { displayName: "Brazil" } },
                { homeAway: "away", score: "0", team: { displayName: "Mexico" } },
              ],
              odds: [
                {
                  provider: { name: "DraftKings" },
                  moneyline: {
                    // close preferred over open
                    home: { open: { odds: "-110" }, close: { odds: "-125" } },
                    away: { open: { odds: "+310" }, close: { odds: "+340" } },
                    draw: { open: { odds: "+260" }, close: { odds: "+275" } },
                  },
                },
              ],
            },
          ],
        },
      ],
    });
    const live = (await fetchEspnLive()).get(pairCodeKey("BRA", "MEX"));
    expect(live!.marketOdds).toBeDefined();
    expect(live!.marketOdds!.byCode.BRA).toBeCloseTo(1.8, 12); // -125
    expect(live!.marketOdds!.byCode.MEX).toBeCloseTo(4.4, 12); // +340
    expect(live!.marketOdds!.draw).toBeCloseTo(3.75, 12); // +275
  });

  it("falls back to the open quote when close is missing", async () => {
    mockJson({
      events: [
        {
          id: "411",
          competitions: [
            {
              status: { type: { state: "pre" } },
              competitors: [
                { homeAway: "home", score: "0", team: { displayName: "Brazil" } },
                { homeAway: "away", score: "0", team: { displayName: "Mexico" } },
              ],
              odds: [
                {
                  moneyline: {
                    home: { open: { odds: "-110" } },
                    away: { open: { odds: "+310" } },
                    draw: { open: { odds: "+260" } },
                  },
                },
              ],
            },
          ],
        },
      ],
    });
    const live = (await fetchEspnLive()).get(pairCodeKey("BRA", "MEX"));
    expect(live!.marketOdds!.byCode.BRA).toBeCloseTo(1 + 100 / 110, 12);
  });

  it("reports no market odds when the node is absent, incomplete, or unoriented", async () => {
    mockJson({
      events: [
        {
          id: "412", // no odds node at all
          competitions: [
            {
              status: { type: { state: "pre" } },
              competitors: [
                { homeAway: "home", score: "0", team: { displayName: "Brazil" } },
                { homeAway: "away", score: "0", team: { displayName: "Mexico" } },
              ],
            },
          ],
        },
        {
          id: "413", // draw price missing → cannot de-vig a 3-way
          competitions: [
            {
              status: { type: { state: "pre" } },
              competitors: [
                { homeAway: "home", score: "0", team: { displayName: "France" } },
                { homeAway: "away", score: "0", team: { displayName: "Spain" } },
              ],
              odds: [
                {
                  moneyline: {
                    home: { close: { odds: "-125" } },
                    away: { close: { odds: "+340" } },
                  },
                },
              ],
            },
          ],
        },
        {
          id: "414", // competitors carry no homeAway → sides can't be mapped
          competitions: [
            {
              status: { type: { state: "pre" } },
              competitors: [
                { score: "0", team: { displayName: "Germany" } },
                { score: "0", team: { displayName: "Paraguay" } },
              ],
              odds: [
                {
                  moneyline: {
                    home: { close: { odds: "-125" } },
                    away: { close: { odds: "+340" } },
                    draw: { close: { odds: "+275" } },
                  },
                },
              ],
            },
          ],
        },
      ],
    });
    const map = await fetchEspnLive();
    expect(map.get(pairCodeKey("BRA", "MEX"))!.marketOdds).toBeNull();
    expect(map.get(pairCodeKey("FRA", "ESP"))!.marketOdds).toBeNull();
    expect(map.get(pairCodeKey("GER", "PAR"))!.marketOdds).toBeNull();
  });

  it("throws on a non-ok response", async () => {
    mockJson({}, false);
    await expect(fetchEspnLive()).rejects.toThrow(/espn/);
  });
});
