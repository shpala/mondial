// Route-specific skeleton so /teams doesn't fall back to the dashboard-shaped
// root loading state. Mirrors the real layout: title + intro then the 48-team
// flag-card grid (flag circle + name/group lines) at the same breakpoints.

export default function Loading() {
  return (
    <div className="animate-fade-up" aria-busy="true" aria-label="Loading">
      <div className="skeleton mb-2 h-7 w-28 rounded-sm" />
      <div className="skeleton mb-6 h-4 w-64 max-w-full rounded-sm" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {Array.from({ length: 24 }).map((_, i) => (
          <div key={i} className="card flex items-center gap-3 p-3">
            <span className="skeleton h-7 w-7 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <div className="skeleton h-4 w-full rounded-sm" />
              <div className="skeleton mt-1.5 h-3 w-12 rounded-sm" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
