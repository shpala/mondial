"use client";

import { useEffect, useState } from "react";

function relative(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 15) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

/**
 * A neutral freshness anchor for live data: "updated 12s ago", ticking every
 * 10s. Reads `asOf` (the server fetch time of the live data); when the live feed
 * stalls, the growing relative time IS the staleness signal — no alarm. `stale`
 * (the overlay dropped and we're showing a frozen score) appends "· delayed".
 * Renders a neutral fallback pre-mount so there's no SSR/client hydration drift.
 */
export function LiveUpdatedAt({ asOf, stale }: { asOf: number; stale: boolean }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // The relative age depends on the client clock — only after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  const label = now === null ? "live" : `updated ${relative(now - asOf)}`;

  return (
    <span className="text-[10px] text-ink-400 tabular-nums">
      {label}
      {stale ? " · delayed" : ""}
    </span>
  );
}
