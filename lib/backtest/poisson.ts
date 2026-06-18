// Backtest scoring helpers. The pure goal-model pieces — poissonPmf, goalRates,
// the joint scoreline grid (poissonJoint) and the 1X2 outcome (poissonOutcome) —
// all live in lib/scoreline so the offline harness and production can't drift.
// This module just re-exports them under the path the backtest scripts and tests
// already import. The joint scoreline is the product of two independent Poisson
// pmfs (with an optional Dixon-Coles low-score correction, off by default here so
// the harness measures the plain independent baseline); the 1X2 outcome is that
// joint summed over the home/draw/away regions.

export {
  goalRates,
  poissonPmf,
  poissonJoint,
  poissonOutcome,
  MAX_GOALS,
} from "@/lib/scoreline";
