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
 * Logistic spread of the Elo win-probability curve (the classic Elo "400"),
 * used by the RATING SYSTEM: the live-Elo update's expected result `We`
 * (lib/ratings) and the full-corpus backtest. Smaller → sharper, more confident
 * probabilities for the same rating gap. This is the scale ratings are *fit* on;
 * displayed World Cup probabilities flatten it via {@link WC_PREDICTION_SCALE}.
 */
export const LOGISTIC_SCALE = 300;

/**
 * Logistic spread used to turn rating gaps into the DISPLAYED win/draw/away
 * probabilities for World Cup matches (the bracket, match cards, Monte Carlo title
 * odds, exact-score predictions) — i.e. everything the live app shows, which is
 * exclusively the 2026 World Cup. Deliberately flatter than LOGISTIC_SCALE: World
 * Cup fields are strength-compressed (only qualified sides play) and single-match
 * variance is high, so favourites win *less* often than the friendly-heavy global
 * Elo curve (300) implies.
 *
 * Found by the algorithm bakeoff (docs/algo-bakeoff.md): tuned on the 2022 World
 * Cup it generalises out-of-sample to the played 2026 games — 1X2 log-loss
 * wc2022 1.0666→1.0557, wc2026 1.0929→1.0622 — while leaving the rating system and
 * the full backtest corpus untouched (the Elo roll still uses LOGISTIC_SCALE). The
 * 2022 optimum was ~509 and the 2026 optimum ~550; 500 is a robust round value at
 * the conservative end of that range. Re-fit as the 2026 group stage completes.
 */
export const WC_PREDICTION_SCALE = 500;

/**
 * Home-field bump (in Elo points) applied to the three 2026 co-hosts
 * (USA/Mexico/Canada) whenever they play. 100 is eloratings.net's standard
 * home-advantage constant — worth ~+14 percentage points between even sides.
 */
export const HOST_ADVANTAGE = 87.5;

/** World Cup finals Elo K-factor for the live-rating (results) update. */
export const ELO_K = 45;

/**
 * Davidson draw weight ν → ~26% draws between even sides. Conditional on a
 * decisive result the model collapses exactly to `winProbability`. Set to 0.70
 * after the backtest (`npm run backtest`) showed the model slightly
 * under-predicted draws; 0.70 captures nearly all the calibration gain.
 */
export const DRAW_NU = 0.8;
