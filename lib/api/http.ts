// Shared HTTP helper for the data adapters. Every upstream origin is a free,
// undocumented endpoint with no SLA, so a hung connection must not be able to
// stall a server-rendered request indefinitely: we bound each fetch with an
// abort timeout. On timeout the fetch rejects, which flows straight into each
// adapter's existing try/catch and the snapshot fallback.
//
// Framework-agnostic (no "server-only"), so it is unit-testable in isolation.

/** Default per-request budget for a single upstream fetch. */
export const DEFAULT_TIMEOUT_MS = 4000;

/**
 * Like `fetch`, but aborts (and rejects) if the request takes longer than
 * `timeoutMs`. Caller-supplied options — including Next's `next: { revalidate }`
 * cache hints and headers — are preserved.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}
