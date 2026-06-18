// Rating-aware scoreline model: turns two host-adjusted Elo ratings into a
// plausible goal scoreline. The win/draw/away *outcome* stays with the
// calibrated Davidson model (lib/prediction); this only fills in the *margin*,
// so a simulated group game's goal difference — which drives the qualification
// tiebreaks — reflects team strength instead of fixed buckets.
//
// Each side's goal rate is an independent-Poisson mean scaled off a base by the
// rating gap. `base`/`gamma` were fit on ~8k pre-2022 internationals and
// validated out-of-sample on the 2022 World Cup (docs/wc2022-report.md): this
// "Davidson outcome + Poisson margin" variant beat a full-Poisson outcome model
// on every metric, so the calibrated outcome model is kept and only the margin
// is upgraded.

import type { MatchOutcome } from "@/lib/types";

/** Calibrated goal-model constants (2022 WC backtest winner). */
export const GOAL_BASE = 1.2;
export const GOAL_GAMMA = 575;

/** Poisson pmf P(K = k) for mean `lambda`. */
export function poissonPmf(lambda: number, k: number): number {
  let fact = 1;
  for (let i = 2; i <= k; i++) fact *= i;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / fact;
}

/** Expected goals for each side from host-adjusted ratings. */
export function goalRates(
  effHome: number,
  effAway: number,
  base: number = GOAL_BASE,
  gamma: number = GOAL_GAMMA,
): { lambdaHome: number; lambdaAway: number } {
  const lambdaHome = base * Math.pow(10, (effHome - effAway) / (2 * gamma));
  const lambdaAway = base * Math.pow(10, (effAway - effHome) / (2 * gamma));
  return { lambdaHome, lambdaAway };
}

/** Draw a Poisson variate with mean `lambda` from a [0,1) RNG (Knuth). */
export function samplePoisson(rng: () => number, lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L);
  return k - 1;
}

/** Alias of the shared {@link MatchOutcome} — the outcome a sampled scoreline is
 *  conditioned on. */
export type Outcome = MatchOutcome;

function fits(hg: number, ag: number, outcome: Outcome): boolean {
  return outcome === "home" ? hg > ag : outcome === "away" ? hg < ag : hg === ag;
}

/**
 * Sample a scoreline consistent with a pre-decided `outcome` by drawing
 * independent Poisson goals and rejecting mismatches. The outcome is chosen
 * upstream by the calibrated Davidson model, so this only shapes the margin; a
 * capped retry with a deterministic fallback guarantees termination even when
 * the conditioned outcome is unlikely under the goal rates.
 */
export function sampleScoreline(
  rng: () => number,
  lambdaHome: number,
  lambdaAway: number,
  outcome: Outcome,
): { hg: number; ag: number } {
  for (let tries = 0; tries < 64; tries++) {
    const hg = samplePoisson(rng, lambdaHome);
    const ag = samplePoisson(rng, lambdaAway);
    if (fits(hg, ag, outcome)) return { hg, ag };
  }
  // Fallback: coerce a fresh draw into the required outcome (rare — only when 64
  // Poisson pairs all missed, e.g. a heavy favourite conditioned to lose).
  const lo = Math.min(samplePoisson(rng, lambdaHome), samplePoisson(rng, lambdaAway));
  if (outcome === "draw") return { hg: lo, ag: lo };
  if (outcome === "home") return { hg: lo + 1, ag: lo };
  return { hg: lo, ag: lo + 1 };
}
