// Route-specific skeleton so /matches doesn't fall back to the dashboard-shaped
// root loading state. Mirrors the real layout: title + intro, the status/group
// filter rows, then a date-grouped grid of match cards.

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
      <div className="skeleton mb-2 h-7 w-36 rounded-sm" />
      <div className="skeleton mb-6 h-4 w-full max-w-md rounded-sm" />

      {/* Status segmented control + group chip row stand-ins */}
      <div className="skeleton mb-3 h-9 w-72 max-w-full rounded-full" />
      <div className="mb-6 flex flex-wrap gap-1.5">
        {Array.from({ length: 13 }).map((_, i) => (
          <span key={i} className="skeleton h-7 w-9 rounded-full" />
        ))}
      </div>

      <div className="skeleton mb-3 h-4 w-32 rounded-sm" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <MatchCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
