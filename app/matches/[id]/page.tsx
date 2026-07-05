import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFixtures, getMatchLineups, getDataStatus } from "@/lib/data";
import { PitchLineup } from "@/components/PitchLineup";
import { GoalList } from "@/components/GoalList";
import { MatchHeader } from "@/components/MatchHeader";
import { ScorelinePrediction } from "@/components/ScorelinePrediction";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { SampleDataBanner } from "@/components/ui/SampleDataBanner";
import { AutoRefresh } from "@/components/AutoRefresh";
import { EstimatedNotice, EstimatedTag } from "@/components/ui/EstimatedData";
import { predictScoreline } from "@/lib/prediction";
import { requestNow } from "@/lib/serverTime";

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

  const live = fixture.status === "live";
  const predicted = fixture.status === "scheduled";
  const realTeams = fixture.home.id !== 0 && fixture.away.id !== 0;
  // Knockout ties (group == null) are settled by ET/penalties — no draw — so we
  // predict a decisive scoreline there; group games keep the three-way model.
  const decisive = fixture.group == null;
  const scorePrediction = realTeams
    ? predictScoreline(fixture.home, fixture.away, { decisive })
    : null;

  return (
    <div className="animate-fade-up">
      {/* Match detail was fully static after load — self-update it, fast while live. */}
      <AutoRefresh seconds={live ? 20 : 60} />
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

      <MatchHeader fixture={fixture} fetchedAt={requestNow()} sample={usingSample} />

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
