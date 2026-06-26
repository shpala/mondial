import Link from "next/link";

export default function NotFound() {
  return (
    <div className="animate-fade-up py-20 text-center">
      <div className="mb-4 text-5xl" aria-hidden>
        🥅
      </div>
      <h1 className="mb-2 font-display text-2xl font-extrabold">
        Off target
      </h1>
      <p className="mb-6 text-sm text-ink-400">
        That page wandered offside. Let&apos;s get you back on the pitch.
      </p>
      <Link
        href="/"
        className="rounded-xl bg-pitch-500 px-4 py-2 text-sm font-semibold text-pitch-900 transition hover:bg-pitch-50"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
