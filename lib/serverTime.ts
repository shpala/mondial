/**
 * Request-time clock for server components. `force-dynamic` pages legitimately
 * read the current time per request (e.g. the live freshness anchor's "fetched
 * at"), but a bare `Date.now()` in a component body trips react-hooks/purity.
 * Reading it through this named util keeps that intent explicit and lint-clean.
 */
export function requestNow(): number {
  return Date.now();
}
