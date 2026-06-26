"use client";

import { useTransition } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="animate-fade-up py-20 text-center">
      <div className="mb-4 text-5xl" aria-hidden>
        🟥
      </div>
      {/* role=alert: the error boundary swaps in client-side (not a navigation),
          so without this a screen-reader user is never told the page failed. */}
      <div role="alert">
        <h1 className="mb-2 font-display text-2xl font-extrabold">Sent off</h1>
        <p className="mb-6 text-sm text-ink-400">
          Something went wrong loading this page. A data source may be
          temporarily unavailable.
        </p>
      </div>
      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => reset())}
          className="rounded-xl bg-pitch-500 px-4 py-2 text-sm font-semibold text-pitch-900 transition hover:bg-pitch-50 disabled:opacity-60"
        >
          {pending ? "Retrying…" : "Try again"}
        </button>
        <Link
          href="/"
          className="rounded-xl border border-ink-600 px-4 py-2 text-sm font-semibold transition hover:border-ink-500"
        >
          Back to dashboard
        </Link>
      </div>
      {error.digest && (
        <p className="mt-6 text-[11px] text-ink-600">Reference: {error.digest}</p>
      )}
    </div>
  );
}
