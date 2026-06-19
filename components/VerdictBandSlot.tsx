"use client";

import { usePathname } from "next/navigation";

/** Renders the Verdict band on every route EXCEPT the dashboard, where the hero
 *  already shows the model's pick at full scale (so the compact band would just
 *  repeat the headline). The band (an async server component) is passed as
 *  `children`; this only decides whether to show it. */
export function VerdictBandSlot({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return <>{children}</>;
}
