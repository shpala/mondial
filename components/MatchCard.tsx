import Link from "next/link";
import type { Fixture } from "@/lib/types";
import { TeamFlag } from "@/components/ui/TeamFlag";
import { Countdown } from "@/components/Countdown";
import { LocalKickoff } from "@/components/LocalKickoff";
import { formatKickoff, isToday } from "@/lib/format";
import { fixtureHomeWinProb, isMarketBacked } from "@/lib/displayProbs";
import { isFabricatedResult } from "@/lib/provenance";

function StatusPill({
  status,
  minute,
  fabricated,
}: {
  status: Fixture["status"];
  minute?: string | null;
  fabricated?: boolean;
}) {
  if (status === "live") {
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
    <span className="inline-flex items-center gap-1 rounded-full bg-accent-gold/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-300">
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
  timeZone = "UTC",
}: {
  fixture: Fixture;
  /** True when serving the bundled snapshot (live feed down) — used to flag a
   *  finished fixture's illustrative score as not-a-real-result. */
  sample?: boolean;
  /** Timezone for the "Today" badge/ring + countdown branch. Defaults to UTC
   *  (matching the server-side today/upcoming/recent bucketing in lib/data).
   *  MatchesBrowser passes the viewer's device zone so the pill agrees with its
   *  local day grouping and "Today" filter. */
  timeZone?: string;
}) {
  const played = fixture.status === "finished" || fixture.status === "live";
  const predicted = fixture.status === "scheduled";
  const fabricated = isFabricatedResult(fixture, sample);

  // The model's pre-match prediction. It's derived from team ratings (not the
  // running score), so it's status-independent — we surface it for live and
  // finished games too, labelled "pre-match", not just upcoming ones. Skip
  // placeholder knockout slots (id 0).
  const realTeams = fixture.home.id !== 0 && fixture.away.id !== 0;
  const homeProb = realTeams ? fixtureHomeWinProb(fixture) : null;
  const marketBacked = realTeams && isMarketBacked(fixture);
  const homePct = homeProb != null ? Math.round(homeProb * 100) : 50;
  const awayPct = 100 - homePct;
  const today = isToday(fixture.kickoff, timeZone);
  const live = fixture.status === "live";
  // Latest goal for a live card's footer (the timeline is chronological, so the
  // most recent goal is last). Gives a live card context below the running score.
  const latestGoal =
    live && fixture.goals.length
      ? fixture.goals[fixture.goals.length - 1]
      : null;
  const ring = live
    ? "ring-2 ring-red-500/60"
    : today
      ? "ring-1 ring-pitch-500/50"
      : "";

  // For today's upcoming games, count down to kickoff; otherwise show the date
  // in the viewer's local timezone (UTC string is the SSR fallback). The
  // countdown is a duration, so it's timezone-independent.
  const kickoff = formatKickoff(fixture.kickoff);
  const kickoffLabel =
    predicted && today ? (
      <Countdown target={fixture.kickoff} fallback={kickoff} />
    ) : (
      <LocalKickoff iso={fixture.kickoff} fallback={kickoff} />
    );

  return (
    <Link
      href={`/matches/${fixture.id}`}
      className={`card group flex flex-col gap-2 p-3 transition hover:bg-ink-700/60 active:bg-ink-700/60 ${ring} ${
        predicted
          ? "border-l-2 border-l-accent-gold/70 hover:border-l-accent-gold"
          : "hover:border-ink-500"
      }`}
    >
      <div className="flex items-center justify-between text-[11px] text-ink-400">
        <span className="flex items-center gap-1.5">
          {fixture.group ? `Group ${fixture.group}` : fixture.stage}
          {today && (
            <span className="rounded-full bg-pitch-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-pitch-50/90">
              Today
            </span>
          )}
        </span>
        <StatusPill
          status={fixture.status}
          minute={fixture.minute}
          fabricated={fabricated}
        />
      </div>

      <div className="flex items-center gap-2">
        <Side
          flag={fixture.home.flag}
          name={fixture.home.name}
          code={fixture.home.code}
          align="left"
          favored={homeProb != null && homeProb > 0.5}
        />
        <ScoreBlock
          home={fixture.homeGoals}
          away={fixture.awayGoals}
          played={played}
        />
        <Side
          flag={fixture.away.flag}
          name={fixture.away.name}
          code={fixture.away.code}
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
            {(latestGoal.side === "home" ? fixture.home : fixture.away).code}
          </span>
        </div>
      )}

      {homeProb != null ? (
        <div className="mt-0.5">
          {/* Probability-bar colour convention: a green/ember split = the
              head-to-head share between two named teams (here). A single gold
              fill = one team's standalone tournament chance (TitleOddsTable). */}
          <div
            role="img"
            aria-label={`${predicted ? "Predicted" : "Pre-match"} win probability: ${fixture.home.name} ${homePct} percent, ${fixture.away.name} ${awayPct} percent`}
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
