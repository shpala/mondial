// The Verdict band — the app's signature. A persistent scoreboard strip below the
// nav stating the model's current call (favourite to win the cup) and its live
// track record. Built on scoreboard grammar: a bronze hairline rule, a station-
// ident eyebrow, the probability in fixed-width segmented digit cells (the one
// repeated treatment — bronze numerals in dark cells), and a track-record chip.
// Bronze = model output. Always the live model number, never a brand stamp.
//
// Async server component (the 10k-sim is cached cross-request in getVerdict);
// rendered inside <Suspense> in the layout so it never blocks first paint.

import Link from "next/link";
import { getVerdict } from "@/lib/data";
import { TeamFlag } from "@/components/ui/TeamFlag";

/** A probability as fixed-width segmented digit cells — the scoreboard datum,
 *  reused wherever the model states a number. */
function ScoreboardPct({ p }: { p: number }) {
  const digits = String(Math.round(p * 100));
  return (
    <span className="flex items-center gap-px" aria-hidden>
      {digits.split("").map((d, i) => (
        <span
          key={i}
          className="inline-flex h-6 min-w-[0.8em] items-center justify-center rounded-[3px] bg-ink-800 px-0.5 font-display text-base font-extrabold tabular-nums text-accent-gold"
        >
          {d}
        </span>
      ))}
      <span className="ml-0.5 font-display text-sm font-bold text-accent-gold/70">
        %
      </span>
    </span>
  );
}

export async function VerdictBand() {
  let verdict: Awaited<ReturnType<typeof getVerdict>>;
  try {
    verdict = await getVerdict();
  } catch {
    return null; // never break the layout if the sim/data is unavailable
  }
  const { favourite, hits, n, edge } = verdict;
  if (!favourite) return null;

  return (
    <aside aria-label="Model verdict" className="relative border-b border-ink-700 bg-ink-900/70">
      <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-accent-gold/40" />
      <div className="mx-auto flex max-w-6xl items-center gap-x-3 px-4 py-2 sm:px-6">
        <span className="hidden shrink-0 text-[10px] font-semibold uppercase tracking-[0.22em] text-ink-400 sm:inline">
          The model calls
        </span>
        <Link
          href="/bracket"
          className="flex min-w-0 items-center gap-2 transition hover:opacity-80"
        >
          <TeamFlag flag={favourite.team.flag} alt={favourite.team.name} size={18} decorative />
          <span className="truncate font-display text-sm font-bold text-ink-50">
            {favourite.team.name}
          </span>
          <span className="sr-only">
            {Math.round(favourite.champion * 100)} percent to win the cup
          </span>
          <ScoreboardPct p={favourite.champion} />
        </Link>
        {n > 0 && (
          <Link
            href="/model"
            className="ml-auto shrink-0 text-[11px] tabular-nums text-ink-300 transition hover:text-ink-100"
            title="The model's live track record on group games"
          >
            <span className="font-semibold text-ink-100">
              {hits}/{n}
            </span>{" "}
            called
            <span className="hidden sm:inline">
              {" "}
              · {edge >= 0 ? "+" : ""}
              {edge.toFixed(2)} vs baseline
            </span>
          </Link>
        )}
      </div>
    </aside>
  );
}

/** Thin Suspense fallback so the nav + page shell paint immediately. */
export function VerdictBandSkeleton() {
  return (
    <div className="relative border-b border-ink-700 bg-ink-900/70" aria-hidden>
      <span className="absolute inset-x-0 top-0 h-px bg-accent-gold/40" />
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 sm:px-6">
        <div className="skeleton h-4 w-44 rounded-sm" />
        <div className="skeleton ml-auto h-4 w-24 rounded-sm" />
      </div>
    </div>
  );
}
