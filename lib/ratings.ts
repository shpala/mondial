// Live Elo: fold completed real results back into team ratings, so predictions
// for later matches reflect form and upsets rather than only pre-tournament
// seeds. Without this the model is frozen at kickoff — a 7–1 win would change a
// team's qualification position but never its predicted strength.
//
// Uses the World Football Elo update (eloratings.net):
//
//   R' = R + K · G · (W − We)
//
// with K = 60 for World Cup finals and G a goal-difference multiplier. Host
// advantage is applied to the *expected* result We (via effectiveRating) but is
// never baked into the stored rating — it travels with the team's `host` flag.
// Pure and chronological, so it runs identically on the server and in tests.

import type { Fixture, Team } from "@/lib/types";
import { effectiveRating, winProbability } from "@/lib/prediction";
import { ELO_K } from "@/lib/model/constants";

/** Goal-difference multiplier from eloratings.net. */
function goalMultiplier(goalDiff: number): number {
  const d = Math.abs(goalDiff);
  if (d <= 1) return 1;
  if (d === 2) return 1.5;
  return (11 + d) / 8;
}

/**
 * Symmetric per-match Elo delta for the home side (away gets the negation).
 * `effHome`/`effAway` are already host/home-adjusted ratings; `k` is the gain
 * (default 60, the World Cup finals weight).
 */
export function eloUpdate(
  effHome: number,
  effAway: number,
  homeGoals: number,
  awayGoals: number,
  k: number = ELO_K,
): number {
  const we = winProbability(effHome, effAway);
  const w = homeGoals > awayGoals ? 1 : homeGoals < awayGoals ? 0 : 0.5;
  return k * goalMultiplier(homeGoals - awayGoals) * (w - we);
}

/** A finished real match with a recorded score, usable for an Elo update. */
function isCompleted(f: Fixture): boolean {
  return (
    f.status === "finished" &&
    f.home.id !== 0 &&
    f.away.id !== 0 &&
    f.homeGoals != null &&
    f.awayGoals != null
  );
}

/**
 * Current rating per team = pre-tournament seed + Elo deltas from every
 * completed match, applied in kickoff order. Returns a `teamId → rating` map;
 * teams with no completed games are absent (callers keep the seed).
 *
 * Read base seeds from the fixtures' own teams — the spine and the snapshot use
 * different id spaces, so the registry can't be assumed. Source Team objects are
 * never mutated, so their `rating` is always the seed; this stays correct even
 * if a caller has already overlaid live ratings elsewhere.
 */
export function computeLiveRatings(fixtures: Fixture[]): Map<number, number> {
  const base = new Map<number, number>();
  const host = new Map<number, boolean>();
  const record = (t: Team) => {
    if (t.id !== 0 && !base.has(t.id)) {
      base.set(t.id, t.rating);
      host.set(t.id, !!t.host);
    }
  };
  for (const f of fixtures) {
    record(f.home);
    record(f.away);
  }

  const delta = new Map<number, number>();
  const at = (id: number) => base.get(id)! + (delta.get(id) ?? 0);
  const bump = (id: number, d: number) =>
    delta.set(id, (delta.get(id) ?? 0) + d);

  const completed = fixtures
    .filter(isCompleted)
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));

  for (const f of completed) {
    const a = f.home.id;
    const b = f.away.id;
    // Symmetric Elo delta from the host-adjusted ratings at this point in time.
    const change = eloUpdate(
      effectiveRating({ rating: at(a), host: host.get(a) }),
      effectiveRating({ rating: at(b), host: host.get(b) }),
      f.homeGoals!,
      f.awayGoals!,
    );
    bump(a, change);
    bump(b, -change); // symmetric: (W_b − We_b) = −(W_a − We_a)
  }

  const live = new Map<number, number>();
  for (const [id, d] of delta) live.set(id, base.get(id)! + d);
  return live;
}

/** Copy of `team` with its rating replaced by the live value, if one exists. */
export function withLiveRating(team: Team, live: Map<number, number>): Team {
  const r = live.get(team.id);
  return r == null ? team : { ...team, rating: r };
}
