// Guards the single source of truth for the model's tunable constants. The
// backtest must grade exactly the values the live model ships, and no live code
// path may re-hardcode a divergent value. These pin live BEHAVIOUR to the
// shared constants, so a future hardcode (in the model or in CURRENT) fails here.
import { describe, expect, it } from "vitest";
import {
  DRAW_NU,
  ELO_K,
  HOST_ADVANTAGE,
  LOGISTIC_SCALE,
} from "@/lib/model/constants";
import { davidsonProbs, effectiveRating, winProbability } from "@/lib/prediction";
import { eloUpdate } from "@/lib/ratings";
import { outcomeProbs } from "@/lib/montecarlo";
import { CURRENT } from "@/lib/backtest/run";

describe("model constants — single source of truth", () => {
  it("the backtest's CURRENT grades exactly the live shipped constants", () => {
    expect(CURRENT).toEqual({
      nu: DRAW_NU,
      home: HOST_ADVANTAGE,
      k: ELO_K,
      scale: LOGISTIC_SCALE,
    });
  });

  it("the Monte Carlo group model uses the shared draw weight + scale", () => {
    const home = { rating: 1850, host: false };
    const away = { rating: 1700, host: false };
    expect(outcomeProbs(home, away)).toEqual(
      davidsonProbs(1850, 1700, DRAW_NU, LOGISTIC_SCALE),
    );
  });

  it("the live Elo update uses the shared K by default", () => {
    expect(eloUpdate(1800, 1700, 2, 0)).toBeCloseTo(
      eloUpdate(1800, 1700, 2, 0, ELO_K),
      12,
    );
  });

  it("the host bump equals the shared HOST_ADVANTAGE", () => {
    const bump =
      effectiveRating({ rating: 1800, host: true }) -
      effectiveRating({ rating: 1800, host: false });
    expect(bump).toBe(HOST_ADVANTAGE);
  });

  it("winProbability shares the logistic scale with davidsonProbs", () => {
    // Davidson with ν=0 collapses to the two-outcome logistic, so its home
    // probability must equal winProbability at the SAME scale.
    expect(davidsonProbs(1850, 1700, 0, LOGISTIC_SCALE).home).toBeCloseTo(
      winProbability(1850, 1700),
      12,
    );
  });
});
