"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Fixture } from "@/lib/types";
import { MatchCard } from "@/components/MatchCard";
import { dateKey, deviceTimeZone } from "@/lib/format";

// Pinned to UTC and fed noon-UTC of the (already timezone-resolved) day key, so
// it labels that calendar day regardless of the viewer's offset.
const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

type StatusFilter = "all" | "today" | "upcoming" | "results";

const GROUPS = "ABCDEFGHIJKL".split("");
// Ordered chips for the filter row ("" = All groups); drives roving-tabindex nav.
const GROUP_CHIPS = ["", ...GROUPS];

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
  // Roving tabindex for the group-filter chip row (one tab stop, arrow keys move).
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Group days by the viewer's local timezone, but only after mount: SSR and the
  // first client render both use UTC (so the hydrated HTML matches), then the
  // grouping/headers re-resolve to the device zone. Keeps the day headers
  // coherent with the local kickoff times shown on each card.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  const tz = mounted ? deviceTimeZone() : "UTC";
  const todayStr = dateKey(new Date(), tz);

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
      if (status === "today" && dateKey(f.kickoff, tz) !== todayStr) return false;
      if (status === "upcoming" && f.status !== "scheduled") return false;
      if (status === "results" && f.status === "scheduled") return false;
      return true;
    });
  }, [fixtures, group, status, tz, todayStr]);

  // Group the filtered fixtures by local calendar date for matchday headers.
  const byDate = useMemo(() => {
    const map = new Map<string, Fixture[]>();
    for (const f of filtered) {
      const day = dateKey(f.kickoff, tz);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(f);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered, tz]);

  // Index of the in-tab-order chip (the selected group; All groups when none).
  const selectedChip = Math.max(0, GROUP_CHIPS.indexOf(group));

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
          <div
            className="scroll-slim flex items-center gap-1 overflow-x-auto"
            role="group"
            aria-label="Filter by group"
          >
            {GROUP_CHIPS.map((g, i) => {
              const active = group === g;
              return (
                <button
                  key={g || "all"}
                  type="button"
                  ref={(el) => {
                    chipRefs.current[i] = el;
                  }}
                  onClick={() => updateFilters(g, status)}
                  aria-pressed={active}
                  aria-label={g ? `Group ${g}` : undefined}
                  // Roving tabindex: only the selected chip is in the tab order;
                  // ArrowLeft/Right move the selection along the row.
                  tabIndex={i === selectedChip ? 0 : -1}
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                    e.preventDefault();
                    const n = GROUP_CHIPS.length;
                    const next =
                      e.key === "ArrowRight" ? (i + 1) % n : (i - 1 + n) % n;
                    updateFilters(GROUP_CHIPS[next], status);
                    chipRefs.current[next]?.focus();
                  }}
                  className={chip(active)}
                >
                  {g || "All groups"}
                </button>
              );
            })}
          </div>
          <div
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l from-ink-900 to-transparent sm:hidden"
            aria-hidden
          />
        </div>
      </div>

      {/* Always-mounted live region so filtering announces its result count to
          screen readers (the visible list updates silently otherwise). */}
      <p className="sr-only" role="status" aria-live="polite">
        {filtered.length === 0
          ? "No matches match these filters."
          : `${filtered.length} ${filtered.length === 1 ? "match" : "matches"}.`}
      </p>

      {byDate.length === 0 ? (
        <div className="rounded-xl border border-ink-700 bg-ink-800/40 px-4 py-6 text-center">
          <p className="text-sm text-ink-400">
            No matches{group ? ` in Group ${group}` : ""}
            {status !== "all" ? ` under “${status}”` : ""}.
          </p>
          <button
            type="button"
            onClick={() => updateFilters("", "all")}
            className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-ink-600 px-3 py-1.5 text-sm font-medium text-ink-200 transition hover:bg-ink-700 md:min-h-0"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {byDate.map(([day, games]) => (
            <section key={day}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-300">
                {DATE_FMT.format(new Date(`${day}T12:00:00Z`))}
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
