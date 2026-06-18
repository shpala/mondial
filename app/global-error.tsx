"use client";

// Catches errors thrown in the root layout itself (where the normal error.tsx
// can't render). It replaces the whole document, so globals.css/Tailwind aren't
// available — the fallback is intentionally inline-styled and self-contained.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0f14",
          color: "#e5e7eb",
          fontFamily: "system-ui, -apple-system, sans-serif",
          textAlign: "center",
          padding: "2rem",
        }}
      >
        <div>
          <div style={{ fontSize: "3rem" }} aria-hidden>
            🟥
          </div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, margin: "0.5rem 0" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#9ca3af", maxWidth: 360, margin: "0 auto 1.5rem" }}>
            The app hit an unexpected error. Try reloading the page.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              borderRadius: 12,
              border: "none",
              background: "#22c55e",
              color: "#052e16",
              padding: "0.5rem 1rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p style={{ marginTop: "1.5rem", fontSize: 11, color: "#4b5563" }}>
              Reference: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
