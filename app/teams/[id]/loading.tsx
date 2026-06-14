export default function Loading() {
  return (
    <div className="animate-fade-up">
      <div className="skeleton mb-4 h-4 w-24 rounded" />
      <div className="skeleton mb-6 h-20 w-full rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-48 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
