"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

/**
 * Periodically soft-refreshes the route so server-rendered data (live status,
 * new results, bracket reordering) updates without a manual reload. Pauses while
 * the tab is hidden, and renders a status chip that doubles as a manual
 * "Refresh now" control. The chip briefly flashes "Updated"; only user-initiated
 * refreshes are announced to screen readers (auto-refreshes would be a steady
 * drip on a tab left open). Note: the openfootball spine updates roughly daily,
 * so this surfaces changes as they're recorded — it is not a per-second feed.
 */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  const [flash, setFlash] = useState(false);
  const [announce, setAnnounce] = useState(""); // SR: user-initiated refreshes only
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const msgTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isLive = seconds <= 30;

  const refresh = useCallback(
    (manual = false) => {
      // Non-urgent: a background re-render of the whole tree shouldn't block or
      // interrupt the user's interactions (protects INP); React keeps the current
      // UI live and commits the refreshed content as a low-priority transition.
      startTransition(() => router.refresh());
      setFlash(true);
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(false), 2500);
      if (manual) {
        // Clear then set on a later tick so a repeat press still re-announces.
        setAnnounce("");
        clearTimeout(msgTimer.current);
        msgTimer.current = setTimeout(() => setAnnounce("Content refreshed."), 50);
      }
    },
    [router],
  );

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      refresh();
    }, seconds * 1000);
    return () => {
      clearInterval(id);
      clearTimeout(flashTimer.current);
      clearTimeout(msgTimer.current);
    };
  }, [refresh, seconds]);

  // The visible status word is part of the button's accessible name too, so a
  // voice-control user can activate it by what they see (WCAG 2.5.3 Label in Name).
  const statusWord = flash ? "Updated" : isLive ? "Live" : "Auto-updating";

  return (
    <>
      <button
        type="button"
        onClick={() => refresh(true)}
        aria-label={`${statusWord}, refresh now`}
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-4 z-30 inline-flex items-center gap-1.5 rounded-full border border-ink-700 bg-ink-800/80 px-2.5 py-1 text-[11px] font-medium text-ink-400 backdrop-blur-sm transition hover:text-ink-100 md:bottom-4"
      >
        <span
          aria-hidden
          className={`h-1.5 w-1.5 rounded-full ${
            flash
              ? "bg-pitch-500 ring-2 ring-pitch-500/40"
              : isLive
                ? "animate-pulse bg-red-500"
                : "bg-ink-500"
          }`}
        />
        <span aria-hidden>{statusWord}</span>
      </button>
      {/* Separate, normally-empty live region: auto-refreshes stay silent, a
          manual "Refresh now" announces once. */}
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
    </>
  );
}
