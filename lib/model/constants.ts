// Single source of truth for the prediction model's tunable constants.
//
// The live model (lib/prediction, lib/ratings, lib/montecarlo) consumes these,
// and the calibration harness (lib/backtest) grades exactly these values via
// `CURRENT`. Keeping them here means changing a constant moves the app and its
// backtest together — there is no second place to forget. (The Poisson goal-rate
// constants GOAL_BASE/GOAL_GAMMA already have their own single source in
// lib/scoreline and are intentionally left there.)
//
// Pure, framework-agnostic — safe to import from anywhere, including tests and
// the tsx backtest scripts.

/**
 * Logistic spread of the Elo win-probability curve (the classic Elo "400").
 * Smaller → sharper, more confident probabilities for the same rating gap.
 */
export const LOGISTIC_SCALE = 400;

/**
 * Home-field bump (in Elo points) applied to the three 2026 co-hosts
 * (USA/Mexico/Canada) whenever they play. 100 is eloratings.net's standard
 * home-advantage constant — worth ~+14 percentage points between even sides.
 */
export const HOST_ADVANTAGE = 100;

/** World Cup finals Elo K-factor for the live-rating (results) update. */
export const ELO_K = 60;

/**
 * Davidson draw weight ν → ~26% draws between even sides. Conditional on a
 * decisive result the model collapses exactly to `winProbability`. Set to 0.70
 * after the backtest (`npm run backtest`) showed the model slightly
 * under-predicted draws; 0.70 captures nearly all the calibration gain.
 */
export const DRAW_NU = 0.7;
