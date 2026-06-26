import type { Fixture } from "@/lib/types";

/**
 * Order the dashboard "Today" section: still-to-play fixtures first, then the
 * ones already finished, each by kickoff ascending. Pure (no I/O) so it's shared
 * by the server-side bucketing in lib/data and the client-side re-bucketing in
 * DashboardSchedule — keeping SSR and the post-mount order identical.
 */
export function compareTodayFixtures(a: Fixture, b: Fixture): number {
  return (
    (a.status === "finished" ? 1 : 0) - (b.status === "finished" ? 1 : 0) ||
    Date.parse(a.kickoff) - Date.parse(b.kickoff)
  );
}
