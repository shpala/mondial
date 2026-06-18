import type { MatchOutcome } from "@/lib/types";

/** Classify a finished scoreline from the home side's perspective. */
export function outcomeOf(homeGoals: number, awayGoals: number): MatchOutcome {
  return homeGoals > awayGoals ? "home" : homeGoals < awayGoals ? "away" : "draw";
}
