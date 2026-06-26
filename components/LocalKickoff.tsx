"use client";

import { useEffect, useState } from "react";
import { deviceTimeZone, formatKickoff } from "@/lib/format";

/**
 * Renders a kickoff time in the viewer's own timezone. The server can't know the
 * device timezone, so it renders `fallback` (a UTC-formatted string) on the
 * server and until mount — matching the SSR HTML to avoid a hydration mismatch —
 * then swaps to the device-local time on the client. No-JS users keep the
 * labelled UTC fallback. Same mount-guard pattern as <Countdown>.
 */
export function LocalKickoff({
  iso,
  fallback,
}: {
  iso: string;
  /** UTC-formatted kickoff, shown on the server and before hydration. */
  fallback: string;
}) {
  const [tz, setTz] = useState<string | null>(null);

  useEffect(() => {
    // The device timezone is only knowable on the client, after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTz(deviceTimeZone());
  }, []);

  if (tz === null) return <>{fallback}</>;
  return <>{formatKickoff(iso, tz)}</>;
}
