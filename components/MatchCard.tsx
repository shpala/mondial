"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Fixture } from "@/lib/types";
import { TeamFlag } from "@/components/ui/TeamFlag";
import { Countdown } from "@/components/Countdown";
import { LiveUpdatedAt } from "@/components/LiveUpdatedAt";
import { deviceTimeZone, formatKickoff, isToday } from "@/lib/format";
import { fixtureHomeWinProb, isMarketBacked } from "@/lib/displayProbs";
import { isFabricatedResult } from "@/lib/provenance";
import {
  isFreshLive,
  reconcileLive,
  snapshotOf,
  type LiveSnapshot,
} from "@/lib/liveFreeze";

function StatusPill({
  status,
  minute,
  fabricated,
  stale,
}: {
  status: Fixture["status"];
  minute?: string | null;
  fabricated?: boolean;
  stale?: boolean;
}) {
  if (status === "live") {
    // A frozen score (the live overlay dropped — we're showing the last-known
    // score, not a fresh tick) must not wear the fresh-live treatment. Downgrade
    // to a static amber "Delayed" pill so the dominant cue matches reality; the
    // anchor underneath carries the growing "updated Xs ago · delayed". Mirrors
    // the fabricated → "≈ Full-time" neutralization below.
    if (stale) {
      return (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-accent-ember/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent-ember"
          aria-label={minute ? `Delayed, last seen ${minute}` : "Delayed"}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-accent-ember" aria-hidden />
          <span aria-hidden>{minute ? `Delayed · ${minute}` : "Delayed"}</span>
        </span>
      );
    }
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-red-300"
        aria-label={minute ? `Live, ${minute}` : "Live"}
      >
        <span
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400"
          aria-hidden
        />
        <span aria-hidden>{minute || "Live"}</span>
      </span>
    );
  }
  if (status === "finished") {
    // A fabricated sample result must not wear the emerald "real result" badge —
    // render it neutral with a "≈" qualifier (the global banner explains why).
    if (fabricated) {
      return (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-ink-700/70 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink-300"
          title="Sample fixture — illustrative score, not a real result"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-ink-400" aria-hidden />
          ≈ Full-time
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
        Full-time
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent-gold/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-accent-gold-bright">
      <span className="h-1.5 w-1.5 rounded-full bg-accent-gold" aria-hidden />
      Predicted
    </span>
  );
}

function Side({
  flag,
  name,
  code,
  align,
  favored,
}: {
  flag: string;
  name: string;
  code: string;
  align: "left" | "right";
  favored: boolean;
}) {
  const label = (
    <span
      className={`truncate text-sm ${favored ? "font-bold text-white" : "font-medium"}`}
    >
      <span aria-hidden className="hidden sm:inline">
        {name}
      </span>
      <span aria-hidden className="sm:hidden">
        {code}
      </span>
      {/* full name is always the accessible label, even when the code shows */}
      <span className="sr-only">{name}</span>
    </span>
  );
  const flagEl = <TeamFlag flag={flag} alt={name} decorative />;
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-2 ${
        align === "right" ? "justify-end text-right" : ""
      }`}
    >
      {align === "right" ? (
        <>
          {label}
          {flagEl}
        </>
      ) : (
        <>
          {flagEl}
          {label}
        </>
      )}
    </div>
  );
}

function ScoreBlock({
  home,
  away,
  played,
}: {
  home: number | null;
  away: number | null;
  played: boolean;
}) {
  if (played && home !== null && away !== null) {
    return (
      <div className="flex shrink-0 items-center gap-1.5 font-display text-lg font-bold tabular-nums">
        <span>{home}</span>
        <span className="text-ink-400">–</span>
        <span>{away}</span>
      </div>
    );
  }
  return <span className="shrink-0 px-1 text-xs font-semibold text-ink-400">v</span>;
}

export function MatchCard({
  fixture,
  sample = false,
  fetchedAt,
}: {
  fixture: Fixture;
  /** True when serving the bundled snapshot (live feed down) — used to flag a
   *  finished fixture's illustrative score as not-a-real-result. */
  sample?: boolean;
  /** Server fetch time (ms epoch). Supplied on live-aware surfaces: enables the
   *  freshness anchor and freezes the last-known live score if the live overlay
   *  drops (instead of the card snapping back to "Predicted"). Omit elsewhere. */
  fetchedAt?: number;
}) {
  // Resolve the viewer's timezone on mount so the displayed kickoff, the "Today"
  // badge/ring and the countdown branch all agree on the same local day. SSR and
  // the first client render use UTC (no hydration mismatch), then re-resolve to
  // the device zone — keeping each card self-consistent on every surface (the
  // dashboard, the team page, MatchesBrowser) without threading a prop.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  const tz = mounted ? deviceTimeZone() : "UTC";

  // Live-freeze: on a live-aware surface (fetchedAt provided), keep the last-known
  // live score visible if the ESPN overlay drops — the facade reverts the fixture
  // to "scheduled", which would otherwise snap the card back to "Predicted". The
  // remembered snapshot is synced from the server-pushed fixture (the external
  // system) and persists across router.refresh(); the render reconciles the
  // incoming fixture against it.
  const [liveSnap, setLiveSnap] = useState<LiveSnapshot | null>(null);
  const reconciled =
    fetchedAt != null
      ? reconcileLive(fixture, liveSnap, fetchedAt)
      : { fixture, stale: false, asOf: null as number | null, remember: null };
  useEffect(() => {
    if (fetchedAt == null) return;
    // Remember only a *fresh* live (a real overlay), forget on finish. A dropped
    // feed — a revert to scheduled OR a bare spine "live" row with no score —
    // keeps the last snapshot so reconcileLive can freeze it (gating on
    // isFreshLive here, not status, avoids clobbering it with null/null).
    if (isFreshLive(fixture)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLiveSnap(snapshotOf(fixture, fetchedAt));
    } else if (fixture.status === "finished") {
      setLiveSnap(null);
    }
  }, [fixture, fetchedAt]);
  const fx = reconciled.fixture;
  const liveStale = reconciled.stale;
  const liveAsOf = reconciled.asOf;

  const played = fx.status === "finished" || fx.status === "live";
  const predicted = fx.status === "scheduled";
  const fabricated = isFabricatedResult(fx, sample);

  // The model's pre-match prediction. It's derived from team ratings (not the
  // running score), so it's status-independent — we surface it for live and
  // finished games too, labelled "pre-match", not just upcoming ones. Skip
  // placeholder knockout slots (id 0).
  const realTeams = fx.home.id !== 0 && fx.away.id !== 0;
  const homeProb = realTeams ? fixtureHomeWinProb(fx) : null;
  const marketBacked = realTeams && isMarketBacked(fx);
  const homePct = homeProb != null ? Math.round(homeProb * 100) : 50;
  const awayPct = 100 - homePct;
  const today = isToday(fx.kickoff, tz);
  const live = fx.status === "live";
  // Latest goal for a live card's footer (the timeline is chronological, so the
  // most recent goal is last). Gives a live card context below the running score.
  const latestGoal =
    live && fx.goals.length ? fx.goals[fx.goals.length - 1] : null;
  // A live card gets the loud red ring; a frozen (stale) one steps down to a
  // soft amber ring so it doesn't read as fresh-live.
  const ring = live
    ? liveStale
      ? "ring-1 ring-accent-ember/40"
      : "ring-2 ring-red-500/60"
    : today
      ? "ring-1 ring-pitch-500/50"
      : "";

  // For today's upcoming games, count down to kickoff; otherwise show the date
  // in the viewer's local timezone (UTC pre-mount, per `tz`). The countdown is a
  // duration, so it's timezone-independent.
  const kickoff = formatKickoff(fx.kickoff, tz);
  const kickoffLabel =
    predicted && today ? (
      <Countdown target={fx.kickoff} fallback={kickoff} />
    ) : (
      kickoff
    );

  return (
    <Link
      href={`/matches/${fx.id}`}
      className={`card group flex flex-col gap-2 p-3 transition hover:bg-ink-700/60 active:bg-ink-700/60 ${ring} ${
        predicted
          ? "border-l-2 border-l-accent-gold/70 hover:border-l-accent-gold"
          : "hover:border-ink-500"
      }`}
    >
      <div className="flex items-center justify-between text-[11px] text-ink-400">
        <span className="flex items-center gap-1.5">
          {fx.group ? `Group ${fx.group}` : fx.stage}
          {today && (
            <span className="rounded-full bg-pitch-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-pitch-50/90">
              Today
            </span>
          )}
        </span>
        <StatusPill
          status={fx.status}
          minute={fx.minute}
          fabricated={fabricated}
          stale={liveStale}
        />
      </div>

      <div className="flex items-center gap-2">
        <Side
          flag={fx.home.flag}
          name={fx.home.name}
          code={fx.home.code}
          align="left"
          favored={homeProb != null && homeProb > 0.5}
        />
        <ScoreBlock
          home={fx.homeGoals}
          away={fx.awayGoals}
          played={played}
        />
        <Side
          flag={fx.away.flag}
          name={fx.away.name}
          code={fx.away.code}
          align="right"
          favored={homeProb != null && homeProb < 0.5}
        />
      </div>

      {live && latestGoal && (
        <div className="flex items-center gap-1.5 text-[11px] text-ink-300">
          <span className="sr-only">Latest goal: </span>
          <span aria-hidden>⚽</span>
          <span className="font-display font-bold tabular-nums">
            {latestGoal.minute}&rsquo;
          </span>
          <span className="truncate font-medium">{latestGoal.scorer}</span>
          {latestGoal.penalty && (
            <span className="rounded-sm bg-ink-700 px-1 text-[10px] font-semibold uppercase text-ink-400">
              pen
            </span>
          )}
          {latestGoal.ownGoal && (
            <span className="rounded-sm bg-ink-700 px-1 text-[10px] font-semibold uppercase text-ink-400">
              og
            </span>
          )}
          <span className="ml-auto shrink-0 text-ink-400">
            {(latestGoal.side === "home" ? fx.home : fx.away).code}
          </span>
        </div>
      )}

      {/* Freshness anchor for live cards: "updated Xs ago" (+ "delayed" when the
          live feed dropped and we're showing a frozen score). */}
      {liveAsOf != null && (
        <div className="text-right">
          <LiveUpdatedAt asOf={liveAsOf} stale={liveStale} />
        </div>
      )}

      {homeProb != null ? (
        <div className="mt-0.5">
          {/* Probability-bar colour convention: a green/ember split = the
              head-to-head share between two named teams (here). A single gold
              fill = one team's standalone tournament chance (TitleOddsTable). */}
          <div
            role="img"
            aria-label={`${predicted ? "Predicted" : "Pre-match"} win probability: ${fx.home.name} ${homePct} percent, ${fx.away.name} ${awayPct} percent`}
            className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-ink-700"
          >
            <div className="bg-pitch-500" style={{ width: `${homePct}%` }} />
            <div className="bg-accent-ember" style={{ width: `${awayPct}%` }} />
          </div>
          <div className="mt-1.5 flex items-baseline justify-between text-[10px] text-ink-400">
            <span
              className={`font-display text-sm tabular-nums ${homePct >= awayPct ? "text-ink-50" : "text-ink-300"}`}
            >
              {homePct}%
            </span>
            <span
              className={`uppercase tracking-wide ${marketBacked ? "text-accent-gold" : ""}`}
              title={
                marketBacked
                  ? "Market-implied (de-vigged betting odds)"
                  : predicted
                    ? undefined
                    : "The model's pre-match win probability"
              }
            >
              {predicted
                ? marketBacked
                  ? "◆ market"
                  : "win prob"
                : marketBacked
                  ? "◆ pre-match"
                  : "pre-match"}
            </span>
            <span
              className={`font-display text-sm tabular-nums ${awayPct > homePct ? "text-ink-50" : "text-ink-300"}`}
            >
              {awayPct}%
            </span>
          </div>
          {/* Countdown / kickoff time only matters before kickoff. */}
          {predicted && (
            <div className="text-center text-[10px] uppercase tracking-wide text-ink-400 tabular-nums">
              {kickoffLabel}
            </div>
          )}
        </div>
      ) : (
        predicted && (
          <div className="text-center text-[11px] text-ink-400 tabular-nums">
            {kickoffLabel}
          </div>
        )
      )}
    </Link>
  );
}
