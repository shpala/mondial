"use client";

import Link from "next/link";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="animate-fade-up py-20 text-center">
      <div className="mb-4 text-5xl" aria-hidden>
        🟥
      </div>
      <h1 className="mb-2 font-display text-2xl font-extrabold">
        Sent off
      </h1>
      <p className="mb-6 text-sm text-ink-400">
        Something went wrong loading this page. A data source may be temporarily
        unavailable.
      </p>
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-xl bg-pitch-500 px-4 py-2 text-sm font-semibold text-pitch-900 transition hover:bg-pitch-50"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-xl border border-ink-600 px-4 py-2 text-sm font-semibold transition hover:border-ink-500"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
