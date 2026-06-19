import Link from "next/link";
import type { Fixture } from "@/lib/types";
import { TeamFlag } from "@/components/ui/TeamFlag";
import { Countdown } from "@/components/Countdown";
import { formatKickoff, isToday } from "@/lib/format";
import { fixtureHomeWinProb, isMarketBacked } from "@/lib/displayProbs";

function StatusPill({
  status,
  minute,
}: {
  status: Fixture["status"];
  minute?: string | null;
}) {
  if (status === "live") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-red-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
        {minute || "Live"}
      </span>
    );
  }
  if (status === "finished") {
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

export function MatchCard({ fixture }: { fixture: Fixture }) {
  const played = fixture.status === "finished" || fixture.status === "live";
  const predicted = fixture.status === "scheduled";

  // Model prediction for upcoming games (skip placeholder knockout slots).
  const realTeams = fixture.home.id !== 0 && fixture.away.id !== 0;
  const homeProb =
    predicted && realTeams ? fixtureHomeWinProb(fixture) : null;
  const marketBacked = predicted && realTeams && isMarketBacked(fixture);
  const homePct = homeProb != null ? Math.round(homeProb * 100) : 50;
  const awayPct = 100 - homePct;
  const today = isToday(fixture.kickoff);
  const live = fixture.status === "live";
  const ring = live
    ? "ring-2 ring-red-500/60"
    : today
      ? "ring-1 ring-pitch-500/50"
      : "";

  // For today's upcoming games, count down to kickoff; otherwise show the date.
  const kickoff = formatKickoff(fixture.kickoff);
  const kickoffLabel =
    predicted && today ? (
      <Countdown target={fixture.kickoff} fallback={kickoff} />
    ) : (
      kickoff
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
        <StatusPill status={fixture.status} minute={fixture.minute} />
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

      {predicted &&
        (homeProb != null ? (
          <div className="mt-0.5">
            {/* Probability-bar colour convention: a green/ember split = the
                head-to-head share between two named teams (here). A single gold
                fill = one team's standalone tournament chance (TitleOddsTable). */}
            <div
              role="img"
              aria-label={`Predicted win probability: ${fixture.home.name} ${homePct} percent, ${fixture.away.name} ${awayPct} percent`}
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
                title={marketBacked ? "Market-implied (de-vigged betting odds)" : undefined}
              >
                {marketBacked ? "◆ market" : "win prob"}
              </span>
              <span
                className={`font-display text-sm tabular-nums ${awayPct > homePct ? "text-ink-50" : "text-ink-300"}`}
              >
                {awayPct}%
              </span>
            </div>
            <div className="text-center text-[10px] uppercase tracking-wide text-ink-400 tabular-nums">
              {kickoffLabel}
            </div>
          </div>
        ) : (
          <div className="text-center text-[11px] text-ink-400 tabular-nums">
            {kickoffLabel}
          </div>
        ))}
    </Link>
  );
}
