export default function Loading() {
  return (
    <div className="animate-fade-up">
      <div className="skeleton mb-4 h-4 w-28 rounded-sm" />
      <div className="skeleton mb-6 h-28 w-full rounded-2xl" />
      <div className="skeleton mb-2 h-5 w-32 rounded-sm" />
      <div className="skeleton mx-auto aspect-2/3 w-full max-w-md rounded-2xl" />
    </div>
  );
}
