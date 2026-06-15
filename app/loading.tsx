export default function Loading() {
  return (
    <div className="animate-fade-up">
      <div className="skeleton mb-8 h-40 w-full rounded-2xl" />
      <div className="skeleton mb-3 h-6 w-40 rounded" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-24 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
