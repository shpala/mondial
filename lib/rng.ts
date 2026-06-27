// Deterministic, seedable PRNG (mulberry32). A single shared copy so every
// seeded simulation — Monte Carlo title odds, the snapshot's illustrative
// scorelines, generated squads/lineups, and the tests — draws from the same
// tested generator. Four divergent copies would silently break the determinism
// guarantee the simulations rely on for stable, reproducible output.

/** Returns a function that yields the next deterministic value in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
