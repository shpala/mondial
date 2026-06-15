"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Periodically soft-refreshes the route so server-rendered data (live status,
 * new results, bracket reordering) updates without a manual reload. Pauses while
 * the tab is hidden. Note: the openfootball spine updates roughly daily, so this
 * surfaces changes as they're recorded — it is not a per-second live feed.
 */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
