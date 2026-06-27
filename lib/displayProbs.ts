// Display-layer prediction: the win/draw/away probabilities a screen should show
// for a fixture, blending the de-vigged market consensus (when odds are present on
// the fixture) with the Elo-Davidson model. An offline backtest found the market is
// decisively sharper than the model (docs/odds-blend.md), so when odds exist the
// blend leans on them; with no odds it is exactly the model — so behaviour is
// unchanged wherever odds are absent (the default, until ODDS_API_KEY is set).
//
// Pure (model = davidsonProbs at the WC display scale + odds blend), so it runs in
// server and client components alike.

import type { Fixture } from "@/lib/types";
import { davidsonProbs, effectiveRating } from "@/lib/prediction";
import { DRAW_NU, WC_PREDICTION_SCALE } from "@/lib/model/constants";
import { blendOutcome, decisiveHomeProb, type OutcomeProbs } from "@/lib/odds";

type FixtureProbInput = Pick<Fixture, "home" | "away" | "marketProbs">;

/** 1X2 probabilities to display: market consensus blended with the model when the
 *  fixture carries odds, else the pure model. The pure model's 1X2 is identical to
 *  montecarlo.outcomeProbs (Davidson at the WC prediction scale), computed inline
 *  here to keep this client-safe (no montecarlo import). */
export function fixtureOutcomeProbs(f: FixtureProbInput): OutcomeProbs {
  const model = davidsonProbs(
    effectiveRating(f.home),
    effectiveRating(f.away),
    DRAW_NU,
    WC_PREDICTION_SCALE,
  );
  return f.marketProbs ? blendOutcome(model, f.marketProbs) : model;
}

/** Two-outcome home win probability (draw mass removed), market-blended when odds
 *  are present. With no odds this equals `predictWinProbability(home, away)`, since
 *  Davidson collapses to the Elo win prob on a decisive result — so the match-card
 *  split bar is unchanged until odds are configured. */
export function fixtureHomeWinProb(f: FixtureProbInput): number {
  return decisiveHomeProb(fixtureOutcomeProbs(f));
}

/** Whether the shown probability is market-informed (for a small badge/label). */
export function isMarketBacked(f: Pick<Fixture, "marketProbs">): boolean {
  return f.marketProbs != null;
}
