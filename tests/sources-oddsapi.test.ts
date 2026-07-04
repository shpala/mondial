import { afterEach, describe, expect, it, vi } from "vitest";

const realFetch = global.fetch;
const realKey = process.env.ODDS_API_KEY;
const realRegions = process.env.ODDS_API_REGIONS;

afterEach(() => {
  global.fetch = realFetch;
  if (realKey == null) delete process.env.ODDS_API_KEY;
  else process.env.ODDS_API_KEY = realKey;
  if (realRegions == null) delete process.env.ODDS_API_REGIONS;
  else process.env.ODDS_API_REGIONS = realRegions;
  vi.resetModules();
});

/** Import the adapter fresh with the given key (it reads env at module load). */
async function importOdds(key: string | undefined) {
  vi.resetModules();
  if (key == null) delete process.env.ODDS_API_KEY;
  else process.env.ODDS_API_KEY = key;
  delete process.env.ODDS_API_REGIONS;
  return import("@/lib/api/sources/oddsapi");
}

function mockJson(data: unknown, ok = true) {
  const fn = vi.fn(async (...args: unknown[]) => {
    void args;
    return {
      ok,
      status: ok ? 200 : 500,
      json: async () => data,
    };
  });
  global.fetch = fn as unknown as typeof fetch;
  return fn;
}

describe("fetchWorldCupOdds", () => {
  it("returns an empty map without calling the API when no key is set", async () => {
    const { fetchWorldCupOdds } = await importOdds(undefined);
    const fetchSpy = mockJson([]);
    expect((await fetchWorldCupOdds()).size).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("throws on a non-ok response so the caller can keep its last-good odds", async () => {
    // A transient upstream failure must be distinguishable from "no odds":
    // returning an empty map here would get cached as no-odds for a whole
    // revalidate period.
    const { fetchWorldCupOdds } = await importOdds("test-key");
    mockJson({}, false);
    await expect(fetchWorldCupOdds()).rejects.toThrow(/odds-api/);
  });

  it("defaults to a single region (eu) to conserve the free-tier quota", async () => {
    // The Odds API bills one credit per region per call: "eu,uk,us" is 3× the
    // spend of "eu" for the same h2h consensus.
    const { fetchWorldCupOdds } = await importOdds("test-key");
    const fetchSpy = mockJson([]);
    await fetchWorldCupOdds();
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain("regions=eu&");
    expect(url).not.toContain("eu,uk,us");
  });

  it("parses a de-vigged consensus keyed by canonical team pair", async () => {
    const { fetchWorldCupOdds } = await importOdds("test-key");
    mockJson([
      {
        home_team: "Brazil",
        away_team: "Mexico",
        bookmakers: [
          {
            key: "bk1",
            markets: [
              {
                key: "h2h",
                outcomes: [
                  { name: "Brazil", price: 1.6 },
                  { name: "Mexico", price: 5.5 },
                  { name: "Draw", price: 4.0 },
                ],
              },
            ],
          },
        ],
      },
    ]);
    const map = await fetchWorldCupOdds();
    const p = map.get("BRA-MEX");
    expect(p).toBeDefined();
    expect(p!.home + p!.draw + p!.away).toBeCloseTo(1, 9);
    expect(p!.home).toBeGreaterThan(p!.away); // shorter price → higher probability
  });
});
