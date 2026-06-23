"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Fixture } from "@/lib/types";
import { MatchCard } from "@/components/MatchCard";
import { localDateKey } from "@/lib/format";

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "long",
});

type StatusFilter = "all" | "today" | "upcoming" | "results";

const GROUPS = "ABCDEFGHIJKL".split("");

const todayStr = localDateKey(new Date());

export function MatchesBrowser({
  fixtures,
  initialGroup = "",
  initialStatus = "all",
  sample = false,
}: {
  fixtures: Fixture[];
  initialGroup?: string;
  initialStatus?: StatusFilter;
  /** Serving the bundled snapshot — flags fabricated sample results. */
  sample?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [group, setGroup] = useState(initialGroup);
  const [status, setStatus] = useState<StatusFilter>(initialStatus);

  // Keep both filters in the URL so a filtered view is shareable, bookmarkable,
  // and restored by browser back/forward. replace() avoids history spam.
  function updateFilters(nextGroup: string, nextStatus: StatusFilter) {
    setGroup(nextGroup);
    setStatus(nextStatus);
    const params = new URLSearchParams();
    if (nextGroup) params.set("group", nextGroup);
    if (nextStatus !== "all") params.set("status", nextStatus);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const filtered = useMemo(() => {
    return fixtures.filter((f) => {
      if (group && f.group !== group) return false;
      if (status === "today" && localDateKey(f.kickoff) !== todayStr) return false;
      if (status === "upcoming" && f.status !== "scheduled") return false;
      if (status === "results" && f.status === "scheduled") return false;
      return true;
    });
  }, [fixtures, group, status]);

  // Group the filtered fixtures by calendar date for matchday headers.
  const byDate = useMemo(() => {
    const map = new Map<string, Fixture[]>();
    for (const f of filtered) {
      const day = localDateKey(f.kickoff);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(f);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const chip = (active: boolean) =>
    `inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition md:min-h-0 ${
      active ? "bg-ink-700 text-white" : "text-ink-400 hover:bg-ink-800 active:bg-ink-800"
    }`;

  return (
    <div>
      <div className="mb-5 space-y-3">
        <div
          className="inline-flex rounded-lg border border-ink-700 p-0.5"
          role="group"
          aria-label="Filter by status"
        >
          {(["all", "today", "upcoming", "results"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => updateFilters(group, s)}
              aria-pressed={status === s}
              className={`inline-flex min-h-11 items-center justify-center rounded-md px-3 py-1 text-sm font-medium capitalize transition md:min-h-0 ${
                status === s ? "bg-ink-700 text-white" : "text-ink-400"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="relative">
          <div className="scroll-slim flex items-center gap-1 overflow-x-auto">
            <button
              type="button"
              onClick={() => updateFilters("", status)}
              aria-pressed={group === ""}
              className={chip(group === "")}
            >
              All groups
            </button>
            {GROUPS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => updateFilters(g, status)}
                aria-pressed={group === g}
                className={chip(group === g)}
              >
                {g}
              </button>
            ))}
          </div>
          <div
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l from-ink-900 to-transparent sm:hidden"
            aria-hidden
          />
        </div>
      </div>

      {byDate.length === 0 ? (
        <p className="text-sm text-ink-400">No matches match these filters.</p>
      ) : (
        <div className="space-y-6">
          {byDate.map(([day, games]) => (
            <section key={day}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-300">
                {DATE_FMT.format(new Date(`${day}T12:00:00`))}
                {day === todayStr && (
                  <span className="rounded-full bg-pitch-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-pitch-50/90">
                    Today
                  </span>
                )}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {games.map((f) => (
                  <MatchCard key={f.id} fixture={f} sample={sample} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
