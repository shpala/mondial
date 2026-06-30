import Link from "next/link";
import { getFixtures, getGroups, getLiveRatings, getTitleOdds } from "@/lib/data";
import { qualificationBreakdown } from "@/lib/qualifiers";
import { withLiveRating } from "@/lib/ratings";
import { buildOfficialBracket, r32DrawFromFixtures } from "@/lib/bracket";
import { buildResultMap } from "@/lib/bracket-results";
import { TitleOddsTable } from "@/components/TitleOddsTable";
import { BracketTree } from "@/components/BracketTree";
import { CandidatesPanel } from "@/components/CandidatesPanel";
import { SampleDataBanner } from "@/components/ui/SampleDataBanner";
import { AutoRefresh } from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

export default async function BracketPage() {
  const [groups, fixtures, live, odds] = await Promise.all([
    getGroups(),
    getFixtures(),
    getLiveRatings(),
    getTitleOdds(),
  ]);
  // Place teams into the official 2026 bracket by group position; overlay
  // results-adjusted Elo so each tie's win probability reflects form so far.
  const groupsLive = groups.map((g) => ({
    ...g,
    rows: g.rows.map((r) => ({ ...r, team: withLiveRating(r.team, live) })),
  }));
  // Once the knockout draw is published, slot the best-thirds from the real R32
  // fixtures so the bracket matches the actual draw (not a valid-but-different
  // reconstruction); falls back to the deterministic matching pre-draw.
  const skeleton = buildOfficialBracket(groupsLive, r32DrawFromFixtures(fixtures));
  const breakdown = qualificationBreakdown(groups);
  const results = buildResultMap(fixtures);

  return (
    <div className="animate-fade-up">
      <AutoRefresh
        seconds={fixtures.some((f) => f.status === "live") ? 20 : 60}
      />
      <SampleDataBanner />
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h1 className="font-display text-2xl font-extrabold">
          Prediction bracket
        </h1>
        <span className="rounded-full bg-ink-700/70 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink-300">
          Predicted
        </span>
      </div>
      <p className="mb-6 max-w-2xl text-sm text-ink-400">
        The model&rsquo;s predicted path to the trophy, Round of 32 to the Final —
        each tie filled in from team strength and win probability. Real knockout
        results lock in green as they&rsquo;re played; switch to{" "}
        <strong>Your picks</strong> to override any tie.{" "}
        <Link
          href="/methodology"
          className="font-medium text-accent-gold hover:underline"
        >
          How these are calculated →
        </Link>
      </p>
      <TitleOddsTable odds={odds} />
      {/* Phone: bracket first (the centerpiece), candidates below it.
          Desktop: candidates context first, then the tree. */}
      <div className="flex flex-col">
        <div className="order-2 lg:order-1">
          <CandidatesPanel
            winners={breakdown.winners}
            runnersUp={breakdown.runnersUp}
            bestThirds={breakdown.bestThirds}
          />
        </div>
        <div className="order-1 lg:order-2">
          <BracketTree skeleton={skeleton} results={results} />
        </div>
      </div>
    </div>
  );
}
