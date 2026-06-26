"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Fixture } from "@/lib/types";
import { MatchCard } from "@/components/MatchCard";
import { deviceTimeZone, isToday } from "@/lib/format";

function Section({
  title,
  href,
  badge,
  children,
}: {
  title: string;
  href?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-xl font-bold">{title}</h2>
          {badge}
        </div>
        {href && (
          <Link href={href} className="text-sm text-pitch-500 hover:underline">
            View all →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

const grid = "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

/**
 * The date-sensitive dashboard sections. The server buckets these in UTC; this
 * island re-buckets them in the viewer's timezone after mount, so the section a
 * fixture lands in agrees with each card's local "Today" badge. SSR and the
 * first client render use the server (UTC) buckets — no hydration mismatch —
 * then re-resolve to the device zone. The server arrays already cover the
 * near-now window, so re-bucketing their union is sufficient.
 */
export function DashboardSchedule({
  today,
  upcoming,
  recent,
  sample = false,
}: {
  today: Fixture[];
  upcoming: Fixture[];
  recent: Fixture[];
  sample?: boolean;
}) {
  // Capture "now" at mount rather than during render, so the memo stays pure.
  // Null until mounted → the server (UTC) buckets render first, matching SSR.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
  }, []);

  const buckets = useMemo(() => {
    if (now === null) return { today, upcoming, recent };
    const tz = deviceTimeZone();
    const seen = new Set<number>();
    const all = [...today, ...upcoming, ...recent].filter(
      (f) => !seen.has(f.id) && seen.add(f.id),
    );
    const byKickoff = (a: Fixture, b: Fixture) =>
      Date.parse(a.kickoff) - Date.parse(b.kickoff);
    return {
      today: all
        .filter((f) => f.status !== "live" && isToday(f.kickoff, tz))
        .sort(byKickoff),
      upcoming: all
        .filter(
          (f) =>
            f.status === "scheduled" &&
            Date.parse(f.kickoff) >= now &&
            !isToday(f.kickoff, tz),
        )
        .sort(byKickoff)
        .slice(0, 8),
      recent: all
        .filter((f) => f.status === "finished" && !isToday(f.kickoff, tz))
        .sort(byKickoff)
        .slice(-6)
        .reverse(),
    };
  }, [now, today, upcoming, recent]);

  return (
    <>
      {buckets.today.length > 0 && (
        <Section
          title="Today"
          badge={
            <span className="rounded-full bg-pitch-500/20 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-pitch-50/90">
              {buckets.today.length}{" "}
              {buckets.today.length === 1 ? "match" : "matches"}
            </span>
          }
        >
          <div className={grid}>
            {buckets.today.map((f) => (
              <MatchCard key={f.id} fixture={f} sample={sample} />
            ))}
          </div>
        </Section>
      )}

      <Section title="Upcoming" href="/matches">
        {buckets.upcoming.length ? (
          <div className={grid}>
            {buckets.upcoming.map((f) => (
              <MatchCard key={f.id} fixture={f} sample={sample} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-400">No upcoming fixtures scheduled.</p>
        )}
      </Section>

      {buckets.recent.length > 0 && (
        <Section title="Recent results" href="/matches">
          <div className={grid}>
            {buckets.recent.map((f) => (
              <MatchCard key={f.id} fixture={f} sample={sample} />
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
