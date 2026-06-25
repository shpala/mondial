"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Periodically soft-refreshes the route so server-rendered data (live status,
 * new results, bracket reordering) updates without a manual reload. Pauses while
 * the tab is hidden, and shows an unobtrusive status chip so the refresh is
 * observable (it briefly flashes "Updated" and announces via aria-live). Note:
 * the openfootball spine updates roughly daily, so this surfaces changes as
 * they're recorded — it is not a per-second live feed.
 */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  const [flash, setFlash] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const isLive = seconds <= 30;

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      // Non-urgent: a background re-render of the whole tree shouldn't block or
      // interrupt the user's interactions (protects INP); React keeps the current
      // UI live and commits the refreshed content as a low-priority transition.
      startTransition(() => router.refresh());
      setFlash(true);
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(false), 2500);
    }, seconds * 1000);
    return () => {
      clearInterval(id);
      clearTimeout(flashTimer.current);
    };
  }, [router, seconds]);

  return (
    <div className="pointer-events-none fixed bottom-20 left-4 z-30 inline-flex items-center gap-1.5 rounded-full border border-ink-700 bg-ink-800/80 px-2.5 py-1 text-[11px] font-medium text-ink-400 backdrop-blur-sm md:bottom-4">
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${
          flash
            ? "bg-pitch-500 ring-2 ring-pitch-500/40"
            : isLive
              ? "animate-pulse bg-red-500"
              : "bg-ink-500"
        }`}
      />
      <span aria-live="polite">
        {flash ? "Updated" : isLive ? "Live" : "Auto-updating"}
      </span>
    </div>
  );
}
