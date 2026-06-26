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
      <div className="flex flex-col items-center gap-3">
        <Link
          href="/"
          className="rounded-xl bg-pitch-500 px-4 py-2 text-sm font-semibold text-pitch-900 transition hover:bg-pitch-50"
        >
          Back to dashboard
        </Link>
        {/* A stale shared/bookmarked match or team link lands here, so offer the
            likely destinations rather than only the home hero. */}
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
          {[
            { href: "/matches", label: "Browse matches" },
            { href: "/teams", label: "All teams" },
            { href: "/groups", label: "Groups" },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-xl border border-ink-600 px-3 py-1.5 font-medium text-pitch-500 transition hover:border-ink-500"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
