import { getFixtures, getGroups } from "@/lib/data";
import { qualificationBreakdown, qualifiedTeams } from "@/lib/qualifiers";
import { BracketTree, type ResultMap } from "@/components/BracketTree";
import { CandidatesPanel } from "@/components/CandidatesPanel";
import { SampleDataBanner } from "@/components/ui/SampleDataBanner";
import { AutoRefresh } from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

function buildResultMap(
  fixtures: Awaited<ReturnType<typeof getFixtures>>,
): ResultMap {
  const map: ResultMap = {};
  for (const f of fixtures) {
    const isKnockout = f.stage !== "Group Stage";
    const realTeams = f.home.id !== 0 && f.away.id !== 0;
    if (
      !isKnockout ||
      !realTeams ||
      f.status !== "finished" ||
      f.homeGoals == null ||
      f.awayGoals == null ||
      f.homeGoals === f.awayGoals // settled on penalties; winner unknown from FT
    ) {
      continue;
    }
    const winnerId = f.homeGoals > f.awayGoals ? f.home.id : f.away.id;
    const key = [f.home.id, f.away.id].sort((a, b) => a - b).join("-");
    map[key] = {
      winnerId,
      homeId: f.home.id,
      awayId: f.away.id,
      homeGoals: f.homeGoals,
      awayGoals: f.awayGoals,
      fixtureId: f.id,
    };
  }
  return map;
}

export default async function BracketPage() {
  const [groups, fixtures] = await Promise.all([getGroups(), getFixtures()]);
  const qualified = qualifiedTeams(groups);
  const breakdown = qualificationBreakdown(groups);
  const results = buildResultMap(fixtures);

  return (
    <div className="animate-fade-up">
      <AutoRefresh seconds={60} />
      <SampleDataBanner />
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h1 className="font-display text-2xl font-extrabold">
          Prediction bracket
        </h1>
        <span className="rounded-full bg-accent-gold/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-300">
          ◆ Predicted
        </span>
      </div>
      <p className="mb-6 max-w-2xl text-sm text-ink-400">
        The knockout tree from the Round of 32 to the Final. The model fills in a
        baseline from team strength and win probabilities — switch to{" "}
        <strong>Your picks</strong> to override any result. As real knockout
        matches are played they replace the prediction and lock in green.
      </p>
      <CandidatesPanel
        winners={breakdown.winners}
        runnersUp={breakdown.runnersUp}
        bestThirds={breakdown.bestThirds}
      />
      <BracketTree qualified={qualified} results={results} />
    </div>
  );
}
