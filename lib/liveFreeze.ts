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

/**
 * Whether a `live` fixture carries *fresh* data from a real ESPN overlay.
 *
 * The overlay (lib/data/index.ts) sets `liveOverlaid` and a non-null score on
 * success. But openfootball's spine independently infers "live" purely from a
 * kickoff time window (lib/api/sources/openfootball.ts) and leaves the score
 * null — so when ESPN is down *mid-match* the facade returns a bare spine "live"
 * row. That's a dropped feed, not fresh data: snapshotting it would clobber a
 * remembered score with null/null. Only the overlaid case is fresh.
 */
export function isFreshLive(f: Fixture): boolean {
  return (
    f.status === "live" && (f.liveOverlaid === true || f.homeGoals !== null)
  );
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
 * returns the spine fixture unchanged — which is either back to "scheduled" (the
 * inferred live window has closed) or a bare "live" row with a null score (still
 * inside the window). Either way the card would lose its score (snapping back to
 * "Predicted" or showing a score-less "Live"). This keeps showing the last-known
 * live score (marked stale) until the match actually finishes.
 *
 * Pure — no React, no clock — so it's unit-tested; the client wrapper just holds
 * the remembered snapshot across refreshes and renders the result.
 */
export function reconcileLive(
  incoming: Fixture,
  remembered: LiveSnapshot | null,
  fetchedAt: number,
): FreezeResult {
  // Genuinely live (a real ESPN overlay): show it and (re)remember the snapshot.
  if (isFreshLive(incoming)) {
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

  // Not fresh-live and not finished → the overlay dropped. Covers BOTH a revert
  // to "scheduled" (the live window closed) AND a bare spine "live" row with no
  // score (ESPN down mid-window). If we remember a last-known live score, freeze
  // it instead of reverting to "Predicted" or a score-less "Live".
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

  // Nothing remembered → show as-is, and crucially DON'T remember: a bare spine
  // "live" row (no score) must not overwrite memory with null/null. A never-live
  // scheduled fixture lands here too.
  return { fixture: incoming, stale: false, asOf: null, remember: null };
}
