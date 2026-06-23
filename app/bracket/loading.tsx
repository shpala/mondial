// Route-specific skeleton so /bracket doesn't fall back to the dashboard-shaped
// root loading state. Approximates the round-column geometry of the real tree
// (fewer cards each round) so the placeholder->content swap doesn't jump.
const ROUND_CARDS = [6, 3, 2, 1];

export default function Loading() {
  return (
    <div className="animate-fade-up">
      <div className="skeleton mb-2 h-7 w-44 rounded-sm" />
      <div className="skeleton mb-6 h-4 w-full max-w-xl rounded-sm" />
      {/* title odds / candidates stand-in */}
      <div className="skeleton mb-6 h-40 w-full rounded-2xl" />
      {/* bracket round columns */}
      <div className="flex gap-4 overflow-hidden md:gap-6">
        {ROUND_CARDS.map((count, col) => (
          <div key={col} className="flex flex-1 flex-col gap-3">
            <div className="skeleton mx-auto mb-1 h-3 w-16 rounded-sm" />
            {Array.from({ length: count }).map((_, i) => (
              <div key={i} className="skeleton h-16 rounded-2xl" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
