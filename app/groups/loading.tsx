// Route-specific skeleton so /groups doesn't fall back to the dashboard-shaped
// root loading state. Mirrors the real layout: title + intro then the grid of
// group-table cards (header row + four team rows each) at the same breakpoints.

function GroupTableSkeleton() {
  return (
    <div className="card overflow-hidden p-4">
      <div className="skeleton mb-3 h-5 w-20 rounded-sm" />
      <div className="skeleton mb-2 h-3 w-full rounded-sm" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="mt-2 flex items-center gap-2">
          <span className="skeleton h-5 w-5 shrink-0 rounded-full" />
          <span className="skeleton h-4 flex-1 rounded-sm" />
          <span className="skeleton h-4 w-8 shrink-0 rounded-sm" />
        </div>
      ))}
    </div>
  );
}

export default function Loading() {
  return (
    <div className="animate-fade-up" aria-busy="true" aria-label="Loading">
      <div className="skeleton mb-2 h-7 w-40 rounded-sm" />
      <div className="skeleton mb-6 h-4 w-full max-w-xl rounded-sm" />
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <GroupTableSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
