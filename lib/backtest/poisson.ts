// Backtest-only scoring helpers built on the production goal model. The shared
// pure pieces (poissonPmf, goalRates) live in lib/scoreline.ts so production and
// the offline harness can't drift; this module adds the 1X2 outcome and the full
// joint grid used to *score* predictions against historical results.
//
// The joint scoreline is the product of two independent Poisson pmfs; the 1X2
// outcome is that joint summed over the home/draw/away regions.

import { goalRates, poissonPmf } from "@/lib/scoreline";

export { goalRates, poissonPmf };

const MAX_GOALS = 10;

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
