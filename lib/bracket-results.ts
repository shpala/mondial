// Turning finished knockout fixtures into the bracket's result map.
//
// A knockout tie is decided by the on-field score (90' or, if level, after extra
// time), and only when STILL level by a penalty shootout. The single source of
// truth for "who advanced" is `decidedWinnerId` — used both by the bracket page
// (to lock a tie green) and by the Monte Carlo (to force a played tie's winner),
// so the two can never disagree.
//
// A tie level after extra time with no recorded shootout is genuinely undecided
// (the feed hasn't published the penalties yet) — it returns null and the tie
// stays predicted rather than guessing a winner.

import type { Fixture } from "@/lib/types";
import type { PlayedResult, ResultMap } from "@/lib/prediction";

/**
 * The id of the team that advanced from a finished knockout fixture, or null if
 * the result doesn't determine one (no score, or level with no decisive
 * shootout). `homeGoals`/`awayGoals` are the pre-shootout score (extra-time
 * result when applicable); `shootout` breaks a tie that's still level.
 */
export function decidedWinnerId(
  f: Pick<Fixture, "home" | "away" | "homeGoals" | "awayGoals" | "shootout">,
): number | null {
  if (f.homeGoals == null || f.awayGoals == null) return null;
  if (f.homeGoals !== f.awayGoals) {
    return f.homeGoals > f.awayGoals ? f.home.id : f.away.id;
  }
  const s = f.shootout;
  if (s && s.home !== s.away) {
    return s.home > s.away ? f.home.id : f.away.id;
  }
  return null; // level with no decisive shootout — winner not yet known
}

/**
 * Map of real, finished knockout results keyed by the unordered team-id pair, for
 * the bracket to lock in. Group games, unresolved placeholder slots (id 0) and
 * ties whose winner isn't yet determined are omitted.
 */
export function buildResultMap(fixtures: readonly Fixture[]): ResultMap {
  const map: ResultMap = {};
  for (const f of fixtures) {
    const isKnockout = f.stage !== "Group Stage";
    const realTeams = f.home.id !== 0 && f.away.id !== 0;
    if (!isKnockout || !realTeams || f.status !== "finished") continue;
    const winnerId = decidedWinnerId(f);
    if (winnerId == null) continue; // level on the field, no shootout → unknown
    const key = [f.home.id, f.away.id].sort((a, b) => a - b).join("-");
    const r: PlayedResult = {
      winnerId,
      homeId: f.home.id,
      awayId: f.away.id,
      homeGoals: f.homeGoals!,
      awayGoals: f.awayGoals!,
      fixtureId: f.id,
      shootout: f.shootout ?? null,
    };
    map[key] = r;
  }
  return map;
}
