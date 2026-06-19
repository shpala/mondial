// Market-odds origin: The Odds API (https://the-odds-api.com) — free tier, 500
// requests/month. Provides current 1X2 (h2h) decimal odds for upcoming 2026 World
// Cup fixtures from ~30 books. An offline backtest (scripts/explore/ml/odds_blend.py,
// docs/odds-blend.md) showed market odds are decisively sharper than our Elo model,
// so when a fixture has odds we lean on the de-vigged market consensus and fall back
// to the model otherwise.
//
// OFF by default: with no ODDS_API_KEY set, fetchWorldCupOdds() returns an empty map
// and the app behaves exactly as before. Best-effort and defensive like the other
// adapters — any failure yields an empty map, never throws into the render path.
import "server-only";

import { resolveTeam } from "@/lib/teams/registry";
import { fetchWithTimeout } from "@/lib/api/http";
import { pairCodeKey } from "@/lib/api/sources/espn";
import {
  impliedProbabilities,
  consensusProbabilities,
  type OutcomeProbs,
} from "@/lib/odds";

const KEY = process.env.ODDS_API_KEY || "";
const SPORT = process.env.ODDS_API_SPORT || "soccer_fifa_world_cup";
const REGIONS = process.env.ODDS_API_REGIONS || "eu,uk,us";

/** Is the market-odds overlay enabled (an API key is configured)? */
export const oddsEnabled = (): boolean => KEY.length > 0;

interface ApiOutcome {
  name?: string;
  price?: number;
}
interface ApiMarket {
  key?: string;
  outcomes?: ApiOutcome[];
}
interface ApiBookmaker {
  key?: string;
  markets?: ApiMarket[];
}
interface ApiEvent {
  home_team?: string;
  away_team?: string;
  bookmakers?: ApiBookmaker[];
}

/**
 * Fetch current 1X2 odds for the configured sport and return a map of
 * canonical-team-pair key → de-vigged market consensus probabilities. Empty map
 * when no key is set or on any upstream/parse failure (the caller falls back to
 * the model). `revalidate` caches the (rate-limited) response; default 1 hour.
 */
export async function fetchWorldCupOdds(
  revalidate = 3600,
): Promise<Map<string, OutcomeProbs>> {
  const map = new Map<string, OutcomeProbs>();
  if (!oddsEnabled()) return map;

  let events: ApiEvent[];
  try {
    const url =
      `https://api.the-odds-api.com/v4/sports/${SPORT}/odds` +
      `?apiKey=${KEY}&regions=${REGIONS}&markets=h2h&oddsFormat=decimal`;
    const res = await fetchWithTimeout(url, { next: { revalidate } });
    if (!res.ok) throw new Error(`odds-api -> ${res.status}`);
    events = (await res.json()) as ApiEvent[];
  } catch (err) {
    console.warn("[data] market odds unavailable:", err);
    return map;
  }

  for (const ev of Array.isArray(events) ? events : []) {
    const home = ev.home_team ? resolveTeam(ev.home_team) : null;
    const away = ev.away_team ? resolveTeam(ev.away_team) : null;
    if (!home || !away || home.id === away.id) continue;

    const books: OutcomeProbs[] = [];
    for (const bk of ev.bookmakers ?? []) {
      const h2h = bk.markets?.find((m) => m.key === "h2h");
      if (!h2h) continue;
      const priceOf = (name?: string) =>
        h2h.outcomes?.find((o) => o.name === name)?.price;
      const oddsHome = priceOf(ev.home_team);
      const oddsAway = priceOf(ev.away_team);
      const oddsDraw = priceOf("Draw");
      if (oddsHome == null || oddsAway == null || oddsDraw == null) continue;
      const p = impliedProbabilities(oddsHome, oddsDraw, oddsAway);
      if (p) books.push(p);
    }

    const consensus = consensusProbabilities(books);
    if (consensus) map.set(pairCodeKey(home.code, away.code), consensus);
  }

  return map;
}
