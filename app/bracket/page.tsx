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
import { TeamFlag } from "@/components/ui/TeamFlag";

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
  // Monte Carlo title favourite (most likely to win the cup over 10k sims). This
  // can differ from the deterministic tree's finalists, which just advance the
  // favourite at every tie. Odds are sorted by championship probability, so the
  // first with a non-zero chance is the favourite.
  const titleFavourite = odds.find((o) => o.champion > 0) ?? null;

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
        {titleFavourite && (
          <Link
            href="#title-odds"
            className="inline-flex items-center gap-1.5 rounded-full border border-accent-gold/30 bg-accent-gold/10 px-2.5 py-0.5 text-[11px] font-semibold text-accent-gold-bright transition hover:border-accent-gold/60"
            title="The team most likely to win the cup, from the simulation — see title odds"
          >
            <span className="font-medium uppercase tracking-wide text-ink-400">
              Most likely
            </span>
            <TeamFlag
              flag={titleFavourite.team.flag}
              alt={titleFavourite.team.name}
              size={13}
              decorative
            />
            {titleFavourite.team.name}
            <span className="tabular-nums">
              {Math.round(titleFavourite.champion * 100)}%
            </span>
          </Link>
        )}
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
      <div id="title-odds" className="scroll-mt-24">
        <TitleOddsTable odds={odds} />
      </div>
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
          <p className="mb-3 max-w-2xl text-xs text-ink-400">
            This tree follows the{" "}
            <strong className="font-semibold text-ink-300">
              favourite at every tie
            </strong>{" "}
            — one &ldquo;chalk&rdquo; path, not the overall title pick. Because
            upsets compound, the team most likely to actually <em>win the cup</em>
            {titleFavourite
              ? ` (${titleFavourite.team.name}, ${Math.round(
                  titleFavourite.champion * 100,
                )}%)`
              : ""}{" "}
            can differ from these projected finalists — see the{" "}
            <Link
              href="#title-odds"
              className="font-medium text-accent-gold hover:underline"
            >
              title odds
            </Link>{" "}
            above.
          </p>
          <BracketTree skeleton={skeleton} results={results} />
        </div>
      </div>
    </div>
  );
}
