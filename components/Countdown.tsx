"use client";

import { useEffect, useState } from "react";

function format(ms: number): string {
  if (ms <= 0) return "Kicking off";
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `in ${d}d ${h}h`;
  if (h > 0) return `in ${h}h ${m}m`;
  if (m > 0) return `in ${m}m ${String(s).padStart(2, "0")}s`;
  return `in ${s}s`;
}

/**
 * Live "kicks off in …" countdown. Renders `fallback` (a static formatted time)
 * on the server and until mounted, then ticks every second on the client — this
 * sidesteps any SSR/client time-skew hydration mismatch.
 */
export function Countdown({
  target,
  fallback,
}: {
  target: string;
  fallback: string;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    // SSR-safe: the current time can't be read during render without a mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (now === null) return <>{fallback}</>;
  return <>{format(new Date(target).getTime() - now)}</>;
}
