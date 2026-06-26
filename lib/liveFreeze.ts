import type { Fixture, Goal } from "@/lib/types";

/** The last-known live state of a fixture, captured when it was genuinely live,
 *  so the UI can keep showing it if the live overlay later drops out. */
export interface LiveSnapshot {
  homeGoals: number | null;
  awayGoals: number | null;
  minute: string | null;
  goals: Goal[];
  /** The fetch time when this fixture was last seen live (for the "updated …" anchor). */
  asOf: number;
}

export interface FreezeResult {
  /** The fixture to display (the incoming one, or a frozen-live reconstruction). */
  fixture: Fixture;
  /** True when we're showing a frozen (delayed) live score, not a fresh one. */
  stale: boolean;
  /** When the displayed live data was fetched — null when not a live display. */
  asOf: number | null;
  /** The snapshot to remember for the next reconcile (null = forget). */
  remember: LiveSnapshot | null;
}

/** Capture a fixture's current live state as a snapshot to remember. */
export function snapshotOf(f: Fixture, fetchedAt: number): LiveSnapshot {
  return {
    homeGoals: f.homeGoals,
    awayGoals: f.awayGoals,
    minute: f.minute,
    goals: f.goals,
    asOf: fetchedAt,
  };
}

/**
 * Decide how to display a fixture given the last-known live snapshot remembered
 * for it. The live (ESPN) overlay is best-effort: when it drops, the facade
 * returns the spine fixture unchanged, so a live match silently reverts to
 * "scheduled" and the card would vanish back to "Predicted". This keeps showing
 * the last-known live score (marked stale) until the match actually finishes.
 *
 * Pure — no React, no clock — so it's unit-tested; the client wrapper just holds
 * the remembered snapshot across refreshes and renders the result.
 */
export function reconcileLive(
  incoming: Fixture,
  remembered: LiveSnapshot | null,
  fetchedAt: number,
): FreezeResult {
  // Genuinely live (a real overlay): show it and (re)remember the snapshot.
  if (incoming.status === "live") {
    return {
      fixture: incoming,
      stale: false,
      asOf: fetchedAt,
      remember: snapshotOf(incoming, fetchedAt),
    };
  }

  // Finished: the real result is authoritative — show it and forget the snapshot.
  if (incoming.status === "finished") {
    return { fixture: incoming, stale: false, asOf: null, remember: null };
  }

  // Was live, now reverted to a non-live, non-finished state → the overlay
  // dropped. Freeze the last-known live score instead of reverting to "Predicted".
  if (remembered) {
    return {
      fixture: {
        ...incoming,
        status: "live",
        homeGoals: remembered.homeGoals,
        awayGoals: remembered.awayGoals,
        minute: remembered.minute,
        goals: remembered.goals,
        liveOverlaid: false, // frozen snapshot, not a fresh real overlay
      },
      stale: true,
      asOf: remembered.asOf,
      remember: remembered,
    };
  }

  // Never was live → show as-is.
  return { fixture: incoming, stale: false, asOf: null, remember: null };
}
