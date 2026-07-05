"use client";

import { useEffect, useState } from "react";
import type { Fixture } from "@/lib/types";
import {
  isFreshLive,
  reconcileLive,
  snapshotOf,
  type FreezeResult,
  type LiveSnapshot,
} from "@/lib/liveFreeze";

/**
 * Client half of the live-freeze, shared by every live-aware surface (MatchCard,
 * MatchHeader): remembers the last genuinely-live snapshot of a fixture across
 * router.refresh() and reconciles each incoming server fixture against it — the
 * pure decision logic lives (tested) in lib/liveFreeze. Without `fetchedAt`
 * (a non-live-aware surface) it's a passthrough.
 */
export function useLiveFreeze(fixture: Fixture, fetchedAt?: number): FreezeResult {
  const [liveSnap, setLiveSnap] = useState<LiveSnapshot | null>(null);
  useEffect(() => {
    if (fetchedAt == null) return;
    // Remember only a *fresh* live (a real overlay), forget on finish. A dropped
    // feed — a revert to scheduled OR a bare spine "live" row with no score —
    // keeps the last snapshot so reconcileLive can freeze it (gating on
    // isFreshLive here, not status, avoids clobbering it with null/null).
    if (isFreshLive(fixture)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLiveSnap(snapshotOf(fixture, fetchedAt));
    } else if (fixture.status === "finished") {
      setLiveSnap(null);
    }
  }, [fixture, fetchedAt]);
  return fetchedAt != null
    ? reconcileLive(fixture, liveSnap, fetchedAt)
    : { fixture, stale: false, asOf: null, remember: null };
}
