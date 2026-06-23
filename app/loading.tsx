// Dashboard loading fallback. Structured to mirror the real layout — a hero block
// and match-card-shaped skeletons (flag circle + name bars + a prob bar) with a
// pitch-green top edge — so the loading state reads as "Mondial loading", not a
// broken page of blank rectangles.

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
      {/* Hero block */}
      <div className="card relative mb-8 overflow-hidden p-6">
        <span
          className="absolute inset-x-0 top-0 h-0.5 bg-pitch-500/40"
          aria-hidden
        />
        <div className="skeleton h-3 w-32 rounded-sm" />
        <div className="skeleton mt-3 h-9 w-64 rounded-sm" />
        <div className="skeleton mt-3 h-4 w-80 max-w-full rounded-sm" />
        <div className="mt-5 flex gap-3">
          <div className="skeleton h-9 w-40 rounded-xl" />
          <div className="skeleton h-9 w-32 rounded-xl" />
        </div>
      </div>

      <div className="skeleton mb-3 h-6 w-40 rounded-sm" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <MatchCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
