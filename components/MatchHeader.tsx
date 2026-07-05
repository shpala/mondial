"use client";

import Link from "next/link";
import type { Fixture } from "@/lib/types";
import { TeamFlag } from "@/components/ui/TeamFlag";
import { LocalKickoff } from "@/components/LocalKickoff";
import { LiveUpdatedAt } from "@/components/LiveUpdatedAt";
import { formatKickoff, formatShootout, visibleShootout } from "@/lib/format";
import { fixtureHomeWinProb } from "@/lib/displayProbs";
import { isFabricatedResult } from "@/lib/provenance";
import { useLiveFreeze } from "@/components/useLiveFreeze";

/** One side's name, linked to its team page when it's a real team (placeholder
 *  knockout slots — id 0 — have no page). */
function TeamName({
  team,
  className,
}: {
  team: Fixture["home"];
  className: string;
}) {
  if (team.id === 0) return <span className={className}>{team.name}</span>;
  return (
    <Link
      href={`/teams/${team.id}`}
      className={`${className} rounded-sm hover:text-pitch-500 hover:underline`}
    >
      {team.name}
    </Link>
  );
}

/**
 * The match page's score header, as a client island so the live score can be
 * frozen when the ESPN overlay drops. Server-side, the page's `played` check
 * reads the incoming fixture — a dropped feed mid-match reverts it to the
 * scheduled layout ("win prob if decisive") even though the game is on. This
 * reconciles against the last-known live snapshot (same pattern as MatchCard)
 * and steps the badge down to a "Delayed" treatment while frozen.
 */
export function MatchHeader({
  fixture,
  fetchedAt,
  sample,
}: {
  fixture: Fixture;
  /** Server fetch time (ms epoch) — anchors the freshness line + freeze logic. */
  fetchedAt: number;
  /** True when serving the bundled snapshot (for the fabricated-score badge). */
  sample: boolean;
}) {
  // Live-freeze: keep the last-known live state visible if the overlay drops
  // (the facade would revert the fixture to "scheduled" / a score-less "live").
  const reconciled = useLiveFreeze(fixture, fetchedAt);
  const fx = reconciled.fixture;
  const stale = reconciled.stale;

  const played = fx.homeGoals !== null && fx.awayGoals !== null;
  const live = fx.status === "live";
  const predicted = fx.status === "scheduled";
  const fabricated = isFabricatedResult(fx, sample);
  const realTeams = fx.home.id !== 0 && fx.away.id !== 0;
  const homeProb = realTeams ? fixtureHomeWinProb(fx) : null;

  // A knockout tie decided on penalties: name who advanced and the tally, so
  // the page agrees with the bracket's "won on penalties" (the score above
  // stays the drawn on-field result). visibleShootout supplies the one shared
  // classification: a LIVE tally is a running lead (never a winner), and a
  // level tally on a finished tie is malformed feed data (shown as nothing).
  const shootout = visibleShootout(fx);
  const penWinner = shootout?.decided
    ? shootout.tally.home > shootout.tally.away
      ? fx.home
      : fx.away
    : null;
  const penHi = shootout ? Math.max(shootout.tally.home, shootout.tally.away) : 0;
  const penLo = shootout ? Math.min(shootout.tally.home, shootout.tally.away) : 0;

  const badge = live
    ? stale
      ? {
          text: fx.minute ? `● Delayed · ${fx.minute}` : "● Delayed",
          cls: "bg-accent-ember/15 text-accent-ember",
        }
      : {
          text: fx.minute ? `● Live · ${fx.minute}` : "● Live",
          cls: "bg-red-500/15 text-red-300",
        }
    : played
      ? fabricated
        ? { text: "≈ Full-time · sample", cls: "bg-ink-700/70 text-ink-300" }
        : shootout?.decided
          ? { text: "✓ Full-time · pens", cls: "bg-emerald-500/15 text-emerald-300" }
          : { text: "✓ Full-time · result", cls: "bg-emerald-500/15 text-emerald-300" }
      : { text: "◆ Upcoming · predicted", cls: "bg-accent-gold/15 text-accent-gold-bright" };

  const kickoffLine = (
    <LocalKickoff iso={fx.kickoff} fallback={formatKickoff(fx.kickoff)} />
  );

  return (
    <header
      className={`mb-6 rounded-2xl border bg-ink-800/70 p-5 backdrop-blur-sm ${
        predicted ? "border-dashed border-accent-gold/30" : "border-ink-700"
      }`}
    >
      <div className="mb-3 flex flex-col items-center gap-1">
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${badge.cls}`}
        >
          {badge.text}
        </span>
        {/* Freshness anchor while live: "updated Xs ago" (+ "delayed" when frozen). */}
        {live && reconciled.asOf != null && (
          <LiveUpdatedAt asOf={reconciled.asOf} stale={stale} />
        )}
      </div>
      <div className="mb-3 text-center text-[11px] uppercase tracking-widest text-ink-400">
        {fx.group ? `Group ${fx.group}` : fx.stage}
        {fx.venue ? ` · ${fx.venue}` : ""}
      </div>
      <div className="flex items-center justify-center gap-4 sm:gap-8">
        <div className="flex flex-1 flex-col items-center gap-2 sm:flex-row sm:justify-end">
          <TeamName
            team={fx.home}
            className="text-center font-display text-lg font-bold sm:text-right"
          />
          <TeamFlag flag={fx.home.flag} alt={fx.home.name} size={36} decorative />
        </div>
        <div className="min-w-[96px] text-center">
          {played ? (
            <>
              <div
                className="font-display text-3xl font-extrabold tabular-nums"
                aria-label={`${live ? "Live score" : "Final score"}: ${fx.home.name} ${fx.homeGoals}, ${fx.away.name} ${fx.awayGoals}${penWinner ? `, decided on penalties, ${penWinner.name} win ${penHi}–${penLo}` : ""}`}
              >
                {fx.homeGoals}–{fx.awayGoals}
              </div>
              {penWinner && (
                <div className="mt-0.5 text-[11px] font-semibold text-ink-300">
                  {penWinner.name} win {penHi}–{penLo} pens
                </div>
              )}
              {/* Mid-shootout: show the running tally, no winner yet. */}
              {shootout && !shootout.decided && (
                <div className="mt-0.5 text-[11px] font-semibold text-ink-300">
                  {formatShootout(shootout.tally)}
                </div>
              )}
            </>
          ) : homeProb != null ? (
            <>
              <div
                className="font-display text-xl font-extrabold tabular-nums text-accent-gold-bright"
                aria-label={`Predicted win probability if decisive: ${fx.home.name} ${Math.round(homeProb * 100)} percent, ${fx.away.name} ${Math.round((1 - homeProb) * 100)} percent`}
              >
                {Math.round(homeProb * 100)}%–{Math.round((1 - homeProb) * 100)}%
              </div>
              <div className="text-[10px] uppercase tracking-wide text-ink-400">
                win prob if decisive
              </div>
              {/* An upcoming match's one missing fact: when it kicks off. */}
              <div className="mt-1 text-xs text-ink-400 tabular-nums">
                {kickoffLine}
              </div>
            </>
          ) : (
            <div className="text-xs text-ink-400">{kickoffLine}</div>
          )}
        </div>
        {/* col-reverse on phones so the away side stacks name-over-flag like
            the home side; sm:flex-row restores the inner-flag desktop order. */}
        <div className="flex flex-1 flex-col-reverse items-center gap-2 sm:flex-row sm:justify-start">
          <TeamFlag flag={fx.away.flag} alt={fx.away.name} size={36} decorative />
          <TeamName
            team={fx.away}
            className="text-center font-display text-lg font-bold sm:text-left"
          />
        </div>
      </div>
    </header>
  );
}
