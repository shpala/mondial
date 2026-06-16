// Independent-Poisson goal model for the out-of-sample backtest.
// Pure functions, no I/O, so they run under tsx and vitest identically.
//
// Each side's goal rate is an Elo-style logistic in the rating gap (base scaled
// up/down by 10^(gap / (2*gamma))). The joint scoreline is the product of two
// independent Poisson pmfs; the 1X2 outcome is that joint summed over regions.

const MAX_GOALS = 10;

/** Poisson pmf: P(K = k) for mean `lambda`. */
export function poissonPmf(lambda: number, k: number): number {
  let fact = 1;
  for (let i = 2; i <= k; i++) fact *= i;
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / fact;
}

/** Expected goals for each side from host-adjusted ratings. */
export function goalRates(
  effHome: number,
  effAway: number,
  base: number,
  gamma: number,
): { lambdaHome: number; lambdaAway: number } {
  const lambdaHome = base * Math.pow(10, (effHome - effAway) / (2 * gamma));
  const lambdaAway = base * Math.pow(10, (effAway - effHome) / (2 * gamma));
  return { lambdaHome, lambdaAway };
}

/**
 * 1X2 outcome probabilities from two independent Poisson goal rates. Sums the
 * joint over the 0..10 x 0..10 grid into home/draw/away regions, then normalizes
 * by their total (the tail mass beyond 10 goals/side is dropped).
 */
export function poissonOutcome(
  lambdaHome: number,
  lambdaAway: number,
): { home: number; draw: number; away: number } {
  const ph: number[] = [];
  const pa: number[] = [];
  for (let k = 0; k <= MAX_GOALS; k++) {
    ph.push(poissonPmf(lambdaHome, k));
    pa.push(poissonPmf(lambdaAway, k));
  }
  let home = 0;
  let draw = 0;
  let away = 0;
  for (let i = 0; i <= MAX_GOALS; i++) {
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = ph[i] * pa[j];
      if (i > j) home += p;
      else if (i === j) draw += p;
      else away += p;
    }
  }
  const z = home + draw + away;
  return { home: home / z, draw: draw / z, away: away / z };
}

/**
 * Full normalized joint scoreline grid P(i,j) for i,j in 0..10, from two
 * independent Poisson rates. Normalized so the whole grid sums to 1.
 */
export function poissonJoint(lambdaHome: number, lambdaAway: number): number[][] {
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
      const p = ph[i] * pa[j];
      row.push(p);
      z += p;
    }
    grid.push(row);
  }
  for (let i = 0; i <= MAX_GOALS; i++)
    for (let j = 0; j <= MAX_GOALS; j++) grid[i][j] /= z;
  return grid;
}

export { MAX_GOALS };
