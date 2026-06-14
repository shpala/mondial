import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFixtures, getMatchLineups } from "@/lib/data";
import { PitchLineup } from "@/components/PitchLineup";
import { GoalList } from "@/components/GoalList";
import { TeamFlag } from "@/components/ui/TeamFlag";
import { SampleDataBanner } from "@/components/ui/SampleDataBanner";
import { EstimatedNotice, EstimatedTag } from "@/components/ui/EstimatedData";
import { formatKickoff } from "@/lib/format";
import { winProbability } from "@/lib/prediction";

export const dynamic = "force-dynamic";

// Slow region: lineups come from TheSportsDB (with generated fallback). Streamed
// under Suspense so the score header paints immediately from the spine.
async function LineupSection({ fixtureId }: { fixtureId: number }) {
  const data = await getMatchLineups(fixtureId);
  const home = data?.home ?? null;
  const away = data?.away ?? null;
  if (!home && !away) {
    return (
      <p className="text-sm text-ink-400">
        Line-ups appear once both teams are confirmed.
      </p>
    );
  }
  const estimatedXI =
    home?.source === "generated" || away?.source === "generated";
  return (
    <>
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <span>{estimatedXI ? "Estimated line-ups" : "Line-ups"}</span>
        {estimatedXI && <EstimatedTag />}
      </div>
      {estimatedXI && <EstimatedNotice kind="lineups" />}
      <PitchLineup home={home} away={away} />
    </>
  );
}

function LineupSkeleton() {
  return (
    <>
      <div className="skeleton mb-2 h-5 w-32 rounded" />
      <div className="skeleton mx-auto aspect-[2/3] w-full max-w-md rounded-2xl" />
    </>
  );
}

export default async function MatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const fixtureId = Number(id);
  if (!Number.isFinite(fixtureId)) notFound();

  const fixture = (await getFixtures()).find((f) => f.id === fixtureId);
  if (!fixture) notFound();

  const played = fixture.homeGoals !== null && fixture.awayGoals !== null;
  const live = fixture.status === "live";
  const predicted = fixture.status === "scheduled";
  const realTeams = fixture.home.id !== 0 && fixture.away.id !== 0;
  const homeProb =
    predicted && realTeams
      ? winProbability(fixture.home.rating, fixture.away.rating)
      : null;

  const badge = live
    ? { text: "● Live", cls: "bg-red-500/15 text-red-300" }
    : played
      ? { text: "✓ Full-time · result", cls: "bg-emerald-500/15 text-emerald-300" }
      : { text: "◆ Upcoming · predicted", cls: "bg-accent-gold/15 text-amber-300" };

  return (
    <div className="animate-fade-up">
      <SampleDataBanner />
      <Link
        href={fixture.group ? `/matches?group=${fixture.group}` : "/bracket"}
        className="mb-4 inline-block text-sm text-ink-400 hover:text-slate-200"
      >
        {fixture.group ? `← Group ${fixture.group} matches` : "← Bracket"}
      </Link>

      <header
        className={`mb-6 rounded-2xl border bg-ink-800/70 p-5 backdrop-blur ${
          predicted ? "border-dashed border-accent-gold/30" : "border-ink-700"
        }`}
      >
        <div className="mb-3 flex justify-center">
          <span
            className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${badge.cls}`}
          >
            {badge.text}
          </span>
        </div>
        <div className="mb-3 text-center text-[11px] uppercase tracking-widest text-ink-400">
          {fixture.group ? `Group ${fixture.group}` : fixture.stage}
          {fixture.venue ? ` · ${fixture.venue}` : ""}
        </div>
        <div className="flex items-center justify-center gap-4 sm:gap-8">
          <div className="flex flex-1 flex-col items-center gap-2 sm:flex-row sm:justify-end">
            <span className="text-center font-display text-lg font-bold sm:text-right">
              {fixture.home.name}
            </span>
            <TeamFlag flag={fixture.home.flag} alt={fixture.home.name} size={36} decorative />
          </div>
          <div className="min-w-[96px] text-center">
            {played ? (
              <div
                className="font-display text-3xl font-extrabold tabular-nums"
                aria-label={`Final score: ${fixture.home.name} ${fixture.homeGoals}, ${fixture.away.name} ${fixture.awayGoals}`}
              >
                {fixture.homeGoals}–{fixture.awayGoals}
              </div>
            ) : homeProb != null ? (
              <>
                <div
                  className="font-display text-xl font-extrabold tabular-nums text-amber-300"
                  aria-label={`Predicted win probability: ${fixture.home.name} ${Math.round(homeProb * 100)} percent, ${fixture.away.name} ${Math.round((1 - homeProb) * 100)} percent`}
                >
                  {Math.round(homeProb * 100)}%–{Math.round((1 - homeProb) * 100)}%
                </div>
                <div className="text-[10px] uppercase tracking-wide text-ink-400">
                  win prob
                </div>
              </>
            ) : (
              <div className="text-xs text-ink-400">
                {formatKickoff(fixture.kickoff)}
              </div>
            )}
          </div>
          <div className="flex flex-1 flex-col items-center gap-2 sm:flex-row sm:justify-start">
            <TeamFlag flag={fixture.away.flag} alt={fixture.away.name} size={36} decorative />
            <span className="text-center font-display text-lg font-bold sm:text-left">
              {fixture.away.name}
            </span>
          </div>
        </div>
      </header>

      <GoalList home={fixture.home} away={fixture.away} goals={fixture.goals} />

      <Suspense fallback={<LineupSkeleton />}>
        <LineupSection fixtureId={fixtureId} />
      </Suspense>
    </div>
  );
}
