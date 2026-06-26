import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFixtures, getMatchLineups, getDataStatus } from "@/lib/data";
import { PitchLineup } from "@/components/PitchLineup";
import { GoalList } from "@/components/GoalList";
import { ScorelinePrediction } from "@/components/ScorelinePrediction";
import { TeamFlag } from "@/components/ui/TeamFlag";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { SampleDataBanner } from "@/components/ui/SampleDataBanner";
import { EstimatedNotice, EstimatedTag } from "@/components/ui/EstimatedData";
import { formatKickoff } from "@/lib/format";
import { LocalKickoff } from "@/components/LocalKickoff";
import { predictScoreline } from "@/lib/prediction";
import { fixtureHomeWinProb } from "@/lib/displayProbs";
import { isFabricatedResult } from "@/lib/provenance";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const fixture = (await getFixtures()).find((f) => f.id === Number(id));
  if (!fixture) return { title: "Match not found" };
  const tie = `${fixture.home.name} v ${fixture.away.name}`;
  return {
    title: `${tie} — line-ups & prediction`,
    description: `${tie} at the 2026 World Cup (${fixture.stage}): starting line-ups, live score and the model's prediction.`,
  };
}

// Slow region: lineups come from TheSportsDB (with generated fallback). Streamed
// under Suspense so the score header paints immediately from the spine.
async function LineupSection({
  fixtureId,
  withSidebar,
}: {
  fixtureId: number;
  withSidebar: boolean;
}) {
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
      <PitchLineup home={home} away={away} withSidebar={withSidebar} />
    </>
  );
}

function LineupSkeleton({ withSidebar }: { withSidebar: boolean }) {
  return (
    <>
      <div className="skeleton mb-2 h-5 w-32 rounded-sm" />
      <div
        className={`skeleton mx-auto aspect-2/3 w-full max-w-md rounded-2xl${
          withSidebar ? " lg:mx-0" : ""
        }`}
      />
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

  const [fixtures, { usingSample }] = await Promise.all([
    getFixtures(),
    getDataStatus(),
  ]);
  const fixture = fixtures.find((f) => f.id === fixtureId);
  if (!fixture) notFound();

  const played = fixture.homeGoals !== null && fixture.awayGoals !== null;
  const live = fixture.status === "live";
  const fabricated = isFabricatedResult(fixture, usingSample);
  const predicted = fixture.status === "scheduled";
  const realTeams = fixture.home.id !== 0 && fixture.away.id !== 0;
  // The pre-match prediction is status-independent (it's from team ratings, not
  // the running score), so we keep showing it once a game is live or finished —
  // labelled "pre-match" — alongside the actual score.
  const homeProb = realTeams ? fixtureHomeWinProb(fixture) : null;
  // Knockout ties (group == null) are settled by ET/penalties — no draw — so we
  // predict a decisive scoreline there; group games keep the three-way model.
  const decisive = fixture.group == null;
  const scorePrediction = realTeams
    ? predictScoreline(fixture.home, fixture.away, { decisive })
    : null;

  const badge = live
    ? {
        text: fixture.minute ? `● Live · ${fixture.minute}` : "● Live",
        cls: "bg-red-500/15 text-red-300",
      }
    : played
      ? fabricated
        ? { text: "≈ Full-time · sample", cls: "bg-ink-700/70 text-ink-300" }
        : { text: "✓ Full-time · result", cls: "bg-emerald-500/15 text-emerald-300" }
      : { text: "◆ Upcoming · predicted", cls: "bg-accent-gold/15 text-accent-gold-bright" };

  return (
    <div className="animate-fade-up">
      <SampleDataBanner />
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          fixture.group
            ? { label: `Group ${fixture.group}`, href: `/matches?group=${fixture.group}` }
            : { label: "Bracket", href: "/bracket" },
          { label: `${fixture.home.name} v ${fixture.away.name}` },
        ]}
      />

      <header
        className={`mb-6 rounded-2xl border bg-ink-800/70 p-5 backdrop-blur-sm ${
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
                aria-label={`${live ? "Live score" : "Final score"}: ${fixture.home.name} ${fixture.homeGoals}, ${fixture.away.name} ${fixture.awayGoals}`}
              >
                {fixture.homeGoals}–{fixture.awayGoals}
              </div>
            ) : homeProb != null ? (
              <>
                <div
                  className="font-display text-xl font-extrabold tabular-nums text-accent-gold-bright"
                  aria-label={`Predicted win probability if decisive: ${fixture.home.name} ${Math.round(homeProb * 100)} percent, ${fixture.away.name} ${Math.round((1 - homeProb) * 100)} percent`}
                >
                  {Math.round(homeProb * 100)}%–{Math.round((1 - homeProb) * 100)}%
                </div>
                <div className="text-[10px] uppercase tracking-wide text-ink-400">
                  win prob if decisive
                </div>
              </>
            ) : (
              <div className="text-xs text-ink-400">
                <LocalKickoff
                  iso={fixture.kickoff}
                  fallback={formatKickoff(fixture.kickoff)}
                />
              </div>
            )}
          </div>
          {/* col-reverse on phones so the away side stacks name-over-flag like
              the home side; sm:flex-row restores the inner-flag desktop order. */}
          <div className="flex flex-1 flex-col-reverse items-center gap-2 sm:flex-row sm:justify-start">
            <TeamFlag flag={fixture.away.flag} alt={fixture.away.name} size={36} decorative />
            <span className="text-center font-display text-lg font-bold sm:text-left">
              {fixture.away.name}
            </span>
          </div>
        </div>
      </header>

      {scorePrediction && (
        <ScorelinePrediction
          prediction={scorePrediction}
          home={fixture.home}
          away={fixture.away}
          decisive={decisive}
          prematch={!predicted}
        />
      )}

      {/* Goals above the pitch on phone; goals as a left sidebar on desktop. */}
      <div className="lg:flex lg:items-start lg:gap-6">
        {fixture.goals.length > 0 && (
          <div className="lg:order-1 lg:w-80 lg:shrink-0">
            <GoalList
              home={fixture.home}
              away={fixture.away}
              goals={fixture.goals}
            />
          </div>
        )}
        <div className="lg:order-2 lg:min-w-0 lg:flex-1">
          <Suspense
            fallback={<LineupSkeleton withSidebar={fixture.goals.length > 0} />}
          >
            <LineupSection
              fixtureId={fixtureId}
              withSidebar={fixture.goals.length > 0}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
