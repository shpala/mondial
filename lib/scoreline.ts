// Rating-aware scoreline model: turns two host-adjusted Elo ratings into a
// plausible goal scoreline. The win/draw/away *outcome* stays with the
// calibrated Davidson model (lib/prediction); this only fills in the *margin*,
// so a simulated group game's goal difference — which drives the qualification
// tiebreaks — reflects team strength instead of fixed buckets.
//
// Each side's goal rate is an independent-Poisson mean scaled off a base by the
// rating gap. `base`/`gamma` were fit on ~8k pre-2022 internationals and tested
// out-of-sample on the 2022 World Cup (docs/wc2022-report.md): the "Davidson
// outcome + Poisson margin" variant edged a full-Poisson outcome model on every
// metric, though on a single 64-match tournament that edge is within sampling
// noise (see the paired bootstrap CI in the report). We keep the calibrated
// outcome model and upgrade only the margin.

import type { MatchOutcome } from "@/lib/types";

/** Calibrated goal-model constants (2022 WC backtest winner). */
export const GOAL_BASE = 1.2;
export const GOAL_GAMMA = 575;

/** Joint scoreline grid is computed over 0..MAX_GOALS per side; the tail beyond
 *  it is dropped and the grid renormalized. */
export const MAX_GOALS = 10;

/**
 * Dixon-Coles low-score dependence weight ρ. Two independent Poissons
 * under-predict draws — notably 0-0 and 1-1; a negative ρ lifts those two cells
 * and trims 1-0 / 0-1 toward the empirical frequency. NOTE on the shipped path:
 * `predictScoreline` conditions the grid on the calibrated Davidson outcome, which
 * already fixes the home/draw/away *rate* (via DRAW_NU); there ρ does not change
 * the total draw probability — it only reshapes scorelines *within* each region
 * (toward 0-0/1-1, away from 1-0/0-1). The raw {@link poissonJoint}/
 * {@link poissonOutcome} (used unconditioned) do see ρ shift the draw rate. Kept
 * here beside GOAL_BASE/GOAL_GAMMA — the goal model's other constants
 * intentionally live with the scoreline model (see lib/model/constants for the
 * rationale). Fitted on the pre-2022 train set by minimizing the shipped
 * (Variant-A) exact-scoreline NLL; refit by re-running scripts/wc2022-backtest.ts
 * and updating this value (the WC2022 regression test pins the two together).
 */
export const GOAL_RHO = -0.03;

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

/**
 * Dixon-Coles τ correction factor for a single cell. It multiplies the
 * independent-Poisson pmf product on the four low-score cells only (1 everywhere
 * else): ρ<0 boosts 0-0 and 1-1 (more draws) and shrinks 1-0 / 0-1, while ρ=0
 * leaves the plain independent model unchanged.
 */
export function dixonColesTau(
  homeGoals: number,
  awayGoals: number,
  lambdaHome: number,
  lambdaAway: number,
  rho: number,
): number {
  if (homeGoals === 0 && awayGoals === 0) return 1 - lambdaHome * lambdaAway * rho;
  if (homeGoals === 0 && awayGoals === 1) return 1 + lambdaHome * rho;
  if (homeGoals === 1 && awayGoals === 0) return 1 + lambdaAway * rho;
  if (homeGoals === 1 && awayGoals === 1) return 1 - rho;
  return 1;
}

/**
 * Full normalized joint scoreline grid P(i,j) for i,j in 0..MAX_GOALS (home goals
 * = row, away goals = column), from two independent Poisson rates with an optional
 * Dixon-Coles low-score correction (`rho`, default 0 = plain independent Poisson;
 * pass {@link GOAL_RHO} for the calibrated model). Normalized so the whole grid
 * sums to 1 (the tail beyond MAX_GOALS goals/side is dropped).
 */
export function poissonJoint(
  lambdaHome: number,
  lambdaAway: number,
  rho: number = 0,
): number[][] {
  const ph: number[] = [];
  const pa: number[] = [];
  for (let k = 0; k <= MAX_GOALS; k++) {
    ph.push(poissonPmf(lambdaHome, k));
    pa.push(poissonPmf(lambdaAway, k));
  }
  const grid: number[][] = [];
  let z = 0;
  for (let i = 0; i <= MAX_GOALS; i++) {
    const row: number[] = [];
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = ph[i] * pa[j] * dixonColesTau(i, j, lambdaHome, lambdaAway, rho);
      row.push(p);
      z += p;
    }
    grid.push(row);
  }
  for (let i = 0; i <= MAX_GOALS; i++)
    for (let j = 0; j <= MAX_GOALS; j++) grid[i][j] /= z;
  return grid;
}

/** Sum a normalized joint grid into its home / draw / away regions. */
function regionMasses(grid: number[][]): { home: number; draw: number; away: number } {
  let home = 0;
  let draw = 0;
  let away = 0;
  for (let i = 0; i < grid.length; i++)
    for (let j = 0; j < grid[i].length; j++) {
      if (i > j) home += grid[i][j];
      else if (i === j) draw += grid[i][j];
      else away += grid[i][j];
    }
  return { home, draw, away };
}

/** 1X2 outcome probabilities — the joint summed over the home/draw/away regions
 *  (`rho` as in {@link poissonJoint}). */
export function poissonOutcome(
  lambdaHome: number,
  lambdaAway: number,
  rho: number = 0,
): { home: number; draw: number; away: number } {
  return regionMasses(poissonJoint(lambdaHome, lambdaAway, rho));
}

/** A single scoreline cell with its probability. */
export interface ScoreCell {
  /** Home goals. */
  hg: number;
  /** Away goals. */
  ag: number;
  /** Probability of exactly this scoreline. */
  p: number;
}

/** The `n` most likely scorelines in a grid, most likely first. */
export function topScorelines(grid: number[][], n: number): ScoreCell[] {
  const cells: ScoreCell[] = [];
  for (let i = 0; i < grid.length; i++)
    for (let j = 0; j < grid[i].length; j++) cells.push({ hg: i, ag: j, p: grid[i][j] });
  cells.sort((a, b) => b.p - a.p);
  return cells.slice(0, n);
}

/**
 * Rescale a scoreline grid so its home/draw/away region masses match `outcome`,
 * keeping the Poisson shape *within* each region (Variant A). This ties the
 * displayed scorelines to a calibrated outcome model (Davidson) rather than the
 * raw independent-Poisson 1X2 — the analytic equivalent of the rejection sampling
 * in {@link sampleScoreline}. `outcome` is assumed to sum to 1, so the result does
 * too.
 */
export function conditionScorelineGrid(
  grid: number[][],
  outcome: { home: number; draw: number; away: number },
): number[][] {
  const m = regionMasses(grid);
  const scaleHome = m.home > 0 ? outcome.home / m.home : 0;
  const scaleDraw = m.draw > 0 ? outcome.draw / m.draw : 0;
  const scaleAway = m.away > 0 ? outcome.away / m.away : 0;
  return grid.map((row, i) =>
    row.map((p, j) => p * (i > j ? scaleHome : i === j ? scaleDraw : scaleAway)),
  );
}

/** P(total goals > line) for an over/under market, e.g. line 2.5 for Over 2.5. */
export function overProb(grid: number[][], line: number): number {
  let p = 0;
  for (let i = 0; i < grid.length; i++)
    for (let j = 0; j < grid[i].length; j++) if (i + j > line) p += grid[i][j];
  return p;
}

/** P(both teams score) — the "BTTS yes" market. */
export function bttsProb(grid: number[][]): number {
  let p = 0;
  for (let i = 1; i < grid.length; i++)
    for (let j = 1; j < grid[i].length; j++) p += grid[i][j];
  return p;
}
