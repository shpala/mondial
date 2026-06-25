// Dashboard loading fallback. Structured to mirror the *real* page (app/page.tsx)
// closely — same hero box (gradient + `px-6 py-6 sm:py-12`), then a title-odds
// table, a report card and a match grid in the same order — so when the streamed
// content replaces this shell the layout doesn't jump. A height mismatch here
// (e.g. a short `p-6` hero swapping for the real `sm:py-12` one) shifts everything
// below it and shows up as field CLS, which is why the dimensions are matched.

function MatchCardSkeleton() {
  return (
    <div className="card relative overflow-hidden p-3">
      <span
        className="absolute inset-x-0 top-0 h-0.5 bg-pitch-500/40"
        aria-hidden
      />
      <div className="skeleton h-3 w-20 rounded-sm" />
      <div className="mt-3 flex items-center gap-2">
        <span className="skeleton h-7 w-7 shrink-0 rounded-full" />
        <span className="skeleton h-4 flex-1 rounded-sm" />
        <span className="skeleton h-5 w-9 shrink-0 rounded-sm" />
        <span className="skeleton h-4 flex-1 rounded-sm" />
        <span className="skeleton h-7 w-7 shrink-0 rounded-full" />
      </div>
      <div className="skeleton mt-3 h-2.5 w-full rounded-full" />
    </div>
  );
}

export default function Loading() {
  return (
    <div className="animate-fade-up" aria-busy="true" aria-label="Loading">
      {/* Hero — mirrors the favourite hero in app/page.tsx: same card + gradient
          and the same `px-6 py-6 sm:py-12` padding so the heights match. */}
      <section className="card mb-8 overflow-hidden">
        <div className="relative bg-linear-to-br from-pitch-700/50 via-ink-800 to-ink-800 px-6 py-6 sm:py-12">
          {/* eyebrow */}
          <div className="skeleton h-4 w-40 rounded-sm" />
          {/* "the model's pick" label */}
          <div className="skeleton mt-3 h-3 w-52 max-w-full rounded-sm" />
          {/* h1: flag + team name + pct (text-3xl → sm:text-5xl) */}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="skeleton h-9 w-9 shrink-0 rounded-full" />
            <span className="skeleton h-9 w-52 max-w-full rounded-md sm:h-12 sm:w-72" />
            <span className="skeleton h-9 w-16 rounded-md sm:h-12 sm:w-24" />
          </div>
          {/* description — two lines, matching the real hero's wrapped copy */}
          <div className="skeleton mt-3 h-4 w-80 max-w-full rounded-sm" />
          <div className="skeleton mt-1.5 h-4 w-56 max-w-full rounded-sm" />
          {/* CTA buttons */}
          <div className="mt-5 flex flex-wrap gap-3">
            <div className="skeleton h-9 w-44 rounded-xl" />
            <div className="skeleton h-9 w-40 rounded-xl" />
          </div>
        </div>
      </section>

      {/* Title odds table — mirrors <TitleOddsTable limit={5} />: header bar + 5 rows. */}
      <section className="card mb-6 overflow-hidden">
        <div className="flex items-center justify-between border-b border-ink-700 px-4 py-2.5">
          <div className="skeleton h-4 w-20 rounded-sm" />
          <div className="skeleton h-3 w-24 rounded-sm" />
        </div>
        <div className="divide-y divide-ink-700/60">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-1.5">
              <span className="skeleton h-[18px] w-[18px] shrink-0 rounded-full" />
              <span className="skeleton h-4 w-28 rounded-sm" />
              <span className="skeleton ml-auto h-3 w-8 rounded-sm" />
              <span className="skeleton hidden h-3 w-8 rounded-sm sm:block" />
              <span className="skeleton h-2 w-24 rounded-full" />
            </div>
          ))}
        </div>
      </section>

      {/* Model report card — mirrors <ModelReportCard /> (card p-4 with a 2-line body). */}
      <section className="mb-8">
        <div className="card p-4">
          <div className="skeleton h-4 w-36 rounded-sm" />
          <div className="skeleton mt-2 h-4 w-full max-w-md rounded-sm" />
          <div className="skeleton mt-1.5 h-4 w-72 max-w-full rounded-sm" />
        </div>
      </section>

      {/* Match grid (Upcoming) */}
      <div className="skeleton mb-3 h-6 w-40 rounded-sm" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <MatchCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
