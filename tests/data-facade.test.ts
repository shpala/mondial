// The facade's core promise — serve live data when the spine is up, otherwise
// fall back to the bundled snapshot and flag it — was entirely untested. These
// exercise it with a routed fetch mock, re-importing the module per test so the
// per-request React cache() starts clean.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Outside a real Next server, unstable_cache silently returns undefined without
// invoking the wrapped function — make it a passthrough so the facade's odds
// caching/fallback logic actually executes under test.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

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

function routeFetch(handlers: {
  openfootball?: Handler;
  espn?: Handler;
  odds?: Handler;
}) {
  const fn = vi.fn(async (url: unknown) => {
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
    if (u.includes("the-odds-api.com")) {
      return (
        handlers.odds?.() ?? {
          ok: true,
          status: 200,
          json: async () => [],
        }
      );
    }
    return { ok: true, status: 200, json: async () => ({}) };
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
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

describe("ESPN shootout overlay", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // The overlay only applies to fixtures whose kickoff is near "now" (the
    // scoreboard is date-less, keyed by team pair) — pin the clock near the
    // test fixtures' kickoff so they're inside that window.
    vi.useFakeTimers({ now: new Date("2026-06-30T14:00:00Z"), toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const KO_SPINE = {
    name: "World Cup 2026",
    matches: [
      {
        round: "Round of 32",
        date: "2026-06-30",
        team1: "Mexico",
        team2: "Brazil",
        // no score yet: the daily spine lags the finished match
      },
    ],
  };

  it("overlays a pens-decided tie (score + shootout) from a post ESPN event", async () => {
    routeFetch({
      openfootball: () => ({ ok: true, status: 200, json: async () => KO_SPINE }),
      espn: () => ({
        ok: true,
        status: 200,
        json: async () => ({
          events: [
            {
              id: "501",
              competitions: [
                {
                  status: { displayClock: "FT-Pens", type: { state: "post" } },
                  competitors: [
                    // ESPN's orientation is reversed vs the spine on purpose:
                    // the overlay must map by canonical code, not position.
                    { score: "1", shootoutScore: "4", team: { displayName: "Brazil" } },
                    { score: "1", shootoutScore: "2", team: { displayName: "Mexico" } },
                  ],
                },
              ],
            },
          ],
        }),
      }),
    });
    const data = await import("@/lib/data");
    const f = (await data.getRawFixtures()).find(
      (x) => x.home.code === "MEX" && x.away.code === "BRA",
    );
    expect(f).toBeDefined();
    expect(f!.status).toBe("finished");
    expect(f!.homeGoals).toBe(1);
    expect(f!.awayGoals).toBe(1);
    expect(f!.shootout).toEqual({ home: 2, away: 4 });
  });

  it("grafts ESPN's shootout onto a spine-finished level tie that lacks one", async () => {
    // The daily spine can publish the finished 1-1 score before its shootout
    // tally (`p`) lands. ESPN already knows the pens result — without the graft
    // the tie reads as undecided (bracket unlocked, model ungraded) for hours.
    routeFetch({
      openfootball: () => ({
        ok: true,
        status: 200,
        json: async () => ({
          name: "World Cup 2026",
          matches: [
            {
              round: "Round of 32",
              date: "2026-06-30",
              team1: "Mexico",
              team2: "Brazil",
              score: { ft: [1, 1] }, // finished per the spine, but no `p` yet
            },
          ],
        }),
      }),
      espn: () => ({
        ok: true,
        status: 200,
        json: async () => ({
          events: [
            {
              id: "503",
              competitions: [
                {
                  status: { displayClock: "FT-Pens", type: { state: "post" } },
                  competitors: [
                    { score: "1", shootoutScore: "4", team: { displayName: "Mexico" } },
                    { score: "1", shootoutScore: "2", team: { displayName: "Brazil" } },
                  ],
                },
              ],
            },
          ],
        }),
      }),
    });
    const data = await import("@/lib/data");
    const f = (await data.getRawFixtures()).find(
      (x) => x.home.code === "MEX" && x.away.code === "BRA",
    );
    expect(f!.status).toBe("finished");
    expect(f!.homeGoals).toBe(1); // spine's own score stays authoritative
    expect(f!.shootout).toEqual({ home: 4, away: 2 });
  });

  it("leaves an old finished meeting of the same pair untouched (rematch guard)", async () => {
    // The same two teams met in the group stage weeks ago; today's R32 rematch
    // goes to pens. ESPN events are keyed by team pair only (no date), so the
    // overlay must not graft the rematch's result onto the historical fixture.
    routeFetch({
      openfootball: () => ({
        ok: true,
        status: 200,
        json: async () => ({
          name: "World Cup 2026",
          matches: [
            {
              round: "Matchday 3",
              date: "2026-06-15",
              group: "Group A",
              team1: "Mexico",
              team2: "Brazil",
              score: { ft: [2, 0] },
            },
            { round: "Round of 32", date: "2026-06-30", team1: "Mexico", team2: "Brazil" },
          ],
        }),
      }),
      espn: () => ({
        ok: true,
        status: 200,
        json: async () => ({
          events: [
            {
              id: "504",
              competitions: [
                {
                  status: { displayClock: "FT-Pens", type: { state: "post" } },
                  competitors: [
                    { score: "1", shootoutScore: "4", team: { displayName: "Mexico" } },
                    { score: "1", shootoutScore: "2", team: { displayName: "Brazil" } },
                  ],
                },
              ],
            },
          ],
        }),
      }),
    });
    const data = await import("@/lib/data");
    const all = (await data.getRawFixtures()).filter(
      (x) => x.home.code === "MEX" && x.away.code === "BRA",
    );
    const group = all.find((x) => x.stage === "Group Stage")!;
    const r32 = all.find((x) => x.stage === "Round of 32")!;
    // Historical group result untouched: no pens graft, no score clobber.
    expect(group.status).toBe("finished");
    expect(group.homeGoals).toBe(2);
    expect(group.awayGoals).toBe(0);
    expect(group.shootout ?? null).toBeNull();
    // The rematch is the one that gets the overlay.
    expect(r32.status).toBe("finished");
    expect(r32.homeGoals).toBe(1);
    expect(r32.shootout).toEqual({ home: 4, away: 2 });
  });

  it("does not flip an old finished meeting back to live during a rematch", async () => {
    routeFetch({
      openfootball: () => ({
        ok: true,
        status: 200,
        json: async () => ({
          name: "World Cup 2026",
          matches: [
            {
              round: "Matchday 3",
              date: "2026-06-15",
              group: "Group A",
              team1: "Mexico",
              team2: "Brazil",
              score: { ft: [2, 0] },
            },
            { round: "Round of 32", date: "2026-06-30", team1: "Mexico", team2: "Brazil" },
          ],
        }),
      }),
      espn: () => ({
        ok: true,
        status: 200,
        json: async () => ({
          events: [
            {
              id: "505",
              competitions: [
                {
                  status: { displayClock: "12'", type: { state: "in" } },
                  competitors: [
                    { score: "0", team: { displayName: "Mexico" } },
                    { score: "0", team: { displayName: "Brazil" } },
                  ],
                },
              ],
            },
          ],
        }),
      }),
    });
    const data = await import("@/lib/data");
    const all = (await data.getRawFixtures()).filter(
      (x) => x.home.code === "MEX" && x.away.code === "BRA",
    );
    const group = all.find((x) => x.stage === "Group Stage")!;
    const r32 = all.find((x) => x.stage === "Round of 32")!;
    expect(group.status).toBe("finished"); // stays a historical result
    expect(group.homeGoals).toBe(2);
    expect(r32.status).toBe("live"); // the rematch is the live one
    expect(r32.homeGoals).toBe(0);
  });

  it("does not graft a pens tally onto a decisive finished score", async () => {
    // A shootout can only exist for a level tie — a mispaired/garbled ESPN
    // event must not attach pens to a 2-0.
    routeFetch({
      openfootball: () => ({
        ok: true,
        status: 200,
        json: async () => ({
          name: "World Cup 2026",
          matches: [
            {
              round: "Round of 32",
              date: "2026-06-30",
              team1: "Mexico",
              team2: "Brazil",
              score: { ft: [2, 0] },
            },
          ],
        }),
      }),
      espn: () => ({
        ok: true,
        status: 200,
        json: async () => ({
          events: [
            {
              id: "506",
              competitions: [
                {
                  status: { displayClock: "FT-Pens", type: { state: "post" } },
                  competitors: [
                    { score: "1", shootoutScore: "4", team: { displayName: "Mexico" } },
                    { score: "1", shootoutScore: "2", team: { displayName: "Brazil" } },
                  ],
                },
              ],
            },
          ],
        }),
      }),
    });
    const data = await import("@/lib/data");
    const f = (await data.getRawFixtures()).find(
      (x) => x.home.code === "MEX" && x.away.code === "BRA",
    );
    expect(f!.homeGoals).toBe(2);
    expect(f!.shootout ?? null).toBeNull();
  });

  it("overlays the running shootout tally on an in-play match", async () => {
    routeFetch({
      openfootball: () => ({ ok: true, status: 200, json: async () => KO_SPINE }),
      espn: () => ({
        ok: true,
        status: 200,
        json: async () => ({
          events: [
            {
              id: "502",
              competitions: [
                {
                  status: { displayClock: "Pens", type: { state: "in" } },
                  competitors: [
                    { score: "1", shootoutScore: "3", team: { displayName: "Mexico" } },
                    { score: "1", shootoutScore: "2", team: { displayName: "Brazil" } },
                  ],
                },
              ],
            },
          ],
        }),
      }),
    });
    const data = await import("@/lib/data");
    const f = (await data.getRawFixtures()).find(
      (x) => x.home.code === "MEX" && x.away.code === "BRA",
    );
    expect(f!.status).toBe("live");
    expect(f!.shootout).toEqual({ home: 3, away: 2 });
  });
});

describe("market-odds resilience", () => {
  const realKey = process.env.ODDS_API_KEY;

  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers({ now: new Date("2026-06-29T12:00:00Z"), toFake: ["Date"] });
    process.env.ODDS_API_KEY = "test-key";
  });
  afterEach(() => {
    vi.useRealTimers();
    if (realKey == null) delete process.env.ODDS_API_KEY;
    else process.env.ODDS_API_KEY = realKey;
  });

  const KO_SPINE = {
    name: "World Cup 2026",
    matches: [
      { round: "Round of 32", date: "2026-06-30", team1: "Mexico", team2: "Brazil" },
    ],
  };
  const ODDS_EVENT = {
    home_team: "Mexico",
    away_team: "Brazil",
    bookmakers: [
      {
        key: "bk1",
        markets: [
          {
            key: "h2h",
            outcomes: [
              { name: "Mexico", price: 2.4 },
              { name: "Brazil", price: 2.8 },
              { name: "Draw", price: 3.4 },
            ],
          },
        ],
      },
    ],
  };

  it("blends market odds onto an upcoming fixture when the feed is up", async () => {
    routeFetch({
      openfootball: () => ({ ok: true, status: 200, json: async () => KO_SPINE }),
      odds: () => ({ ok: true, status: 200, json: async () => [ODDS_EVENT] }),
    });
    const data = await import("@/lib/data");
    const f = (await data.getFixtures()).find(
      (x) => x.home.code === "MEX" && x.away.code === "BRA",
    );
    expect(f!.status).toBe("scheduled");
    expect(f!.marketProbs).toBeDefined();
    const p = f!.marketProbs!;
    expect(p.home + p.draw + p.away).toBeCloseTo(1, 9);
  });

  it("keeps rendering when the odds feed fails (adapter throws, facade catches)", async () => {
    // The adapter now throws on a non-ok response; the facade must catch it,
    // fall back to (empty) last-good odds, and never break the page render.
    const fetchSpy = routeFetch({
      openfootball: () => ({ ok: true, status: 200, json: async () => KO_SPINE }),
      odds: () => ({ ok: false, status: 500, json: async () => ({}) }),
    });
    const data = await import("@/lib/data");
    const f = (await data.getFixtures()).find(
      (x) => x.home.code === "MEX" && x.away.code === "BRA",
    );
    expect(f).toBeDefined(); // render path survived the odds outage
    expect(f!.marketProbs ?? null).toBeNull();
    const oddsCalls = () =>
      fetchSpy.mock.calls.filter((c) => String(c[0]).includes("the-odds-api.com"))
        .length;
    expect(oddsCalls()).toBe(1); // the fetch was genuinely attempted
    // A failure must back off, not re-probe the dead upstream on every render.
    await data.getFixtures();
    expect(oddsCalls()).toBe(1);
  });
});

describe("resultsSignature (cross-request odds cache key)", () => {
  function ko(over: Partial<import("@/lib/types").Fixture>): import("@/lib/types").Fixture {
    const t = (id: number) => ({
      id,
      name: `T${id}`,
      code: `T${id}`,
      flag: "⚽",
      group: "A",
      rating: 1800,
    });
    return {
      id: 73,
      stage: "Round of 32",
      group: null,
      kickoff: "2026-06-29T20:30:00Z",
      status: "finished",
      venue: null,
      home: t(1),
      away: t(2),
      homeGoals: 1,
      awayGoals: 1,
      minute: null,
      goals: [],
      shootout: null,
      ...over,
    };
  }

  it("changes when a level tie gains a shootout result (so cached odds recompute)", async () => {
    const { resultsSignature } = await import("@/lib/data");
    const level = [ko({})]; // 1-1, no shootout (winner unknown)
    const decided = [ko({ shootout: { home: 3, away: 4 } })]; // now decided on pens
    expect(resultsSignature(level)).not.toBe(resultsSignature(decided));
  });

  it("is stable for identical fixtures", async () => {
    const { resultsSignature } = await import("@/lib/data");
    expect(resultsSignature([ko({})])).toBe(resultsSignature([ko({})]));
  });
});
