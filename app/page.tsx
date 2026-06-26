import Link from "next/link";
import {
  getDashboardFixtures,
  getDataStatus,
  getRawFixtures,
  getTeams,
  getTitleOdds,
} from "@/lib/data";
import { gradeOutcomes } from "@/lib/modelreport";
import { MatchCard } from "@/components/MatchCard";
import { DashboardSchedule } from "@/components/DashboardSchedule";
import { ModelReportCard } from "@/components/ModelReportCard";
import { TitleOddsTable } from "@/components/TitleOddsTable";
import { SampleDataBanner } from "@/components/ui/SampleDataBanner";
import { AutoRefresh } from "@/components/AutoRefresh";
import { TeamFlag } from "@/components/ui/TeamFlag";
import { hostNations } from "@/lib/teams/registry";
import { requestNow } from "@/lib/serverTime";

// Co-host nations shown in the hero eyebrow. Flags come from the registry (the
// canonical source) and render through <TeamFlag>, so they fall back to images
// on platforms without flag-emoji fonts (Windows) instead of bare letters.
const HOSTS = hostNations();

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [
    { live, today, upcoming, recent },
    teams,
    rawFixtures,
    odds,
    { usingSample },
  ] = await Promise.all([
    getDashboardFixtures(),
    getTeams(),
    getRawFixtures(),
    getTitleOdds(),
    getDataStatus(),
  ]);
  const report = gradeOutcomes(rawFixtures);
  // The model's current pick to win the cup — leads the hero (the product's thesis).
  const favourite = odds.find((o) => o.champion > 0) ?? null;

  return (
    <div className="animate-fade-up">
      <AutoRefresh seconds={live.length > 0 ? 20 : 60} />
      <SampleDataBanner />

      {/* On a phone, surface the live score above the marketing hero. */}
      <div className="flex flex-col">
      <section className="card mb-8 overflow-hidden">
        <div className="relative bg-linear-to-br from-pitch-700/50 via-ink-800 to-ink-800 px-6 py-6 sm:py-12">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-pitch-50/80">
            <span className="inline-flex items-center gap-1">
              {HOSTS.map((h) => (
                <TeamFlag key={h.code} flag={h.flag} alt={h.name} size={16} decorative />
              ))}
            </span>{" "}
            FIFA World Cup
          </p>
          {favourite ? (
            <>
              <p className="text-sm text-ink-300">
                The model&rsquo;s pick to lift the trophy
              </p>
              <h1 className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="flex items-center gap-3">
                  <TeamFlag
                    flag={favourite.team.flag}
                    alt={favourite.team.name}
                    size={36}
                  />
                  <span className="font-display text-3xl font-extrabold leading-none tracking-tight sm:text-5xl">
                    {favourite.team.name}
                  </span>
                </span>
                <span className="font-display text-3xl font-extrabold leading-none tabular-nums text-accent-gold sm:text-5xl">
                  {Math.round(favourite.champion * 100)}%
                </span>
              </h1>
              <p className="mt-3 max-w-xl text-sm text-ink-300">
                {report.n > 0 ? (
                  <>
                    {report.hits} of {report.n} group calls correct
                    {usingSample ? " on sample fixtures" : " so far"} — title
                    odds across {teams.length} nations, simulated thousands of
                    times.
                  </>
                ) : (
                  <>
                    Title odds across {teams.length} nations, simulated thousands
                    of times.
                  </>
                )}
              </p>
            </>
          ) : (
            <>
              <h1 className="font-display text-3xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl">
                Mondial <span className="text-accent-gold">2026</span>
              </h1>
              <p className="mt-3 max-w-xl text-sm text-ink-300">
                {teams.length} nations · 12 groups · live squads, starting
                lineups and an interactive prediction bracket.
              </p>
            </>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/bracket"
              className="rounded-xl bg-pitch-500 px-4 py-2 text-sm font-semibold text-pitch-900 transition hover:bg-pitch-50"
            >
              See the full bracket →
            </Link>
            <Link
              href="/model"
              className="rounded-xl border border-ink-600 px-4 py-2 text-sm font-semibold transition hover:border-ink-500"
            >
              How the model&rsquo;s doing
            </Link>
          </div>
          {/* Secondary hub links: the dashboard otherwise never routes to the
              group standings or the full team list. */}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <Link href="/groups" className="text-pitch-500 hover:underline">
              Group standings →
            </Link>
            <Link href="/teams" className="text-pitch-500 hover:underline">
              All {teams.length} teams →
            </Link>
          </div>
        </div>
      </section>

      {live.length > 0 && (
        <section className="order-first mb-8 sm:order-0">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="font-display text-xl font-bold">Live now</h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-red-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
              {live.length} in play
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {live.map((f) => (
              <MatchCard
                key={f.id}
                fixture={f}
                sample={usingSample}
                fetchedAt={requestNow()}
              />
            ))}
          </div>
        </section>
      )}
      </div>

      {favourite && <TitleOddsTable odds={odds} limit={5} />}

      <section className="mb-8">
        <ModelReportCard report={report} sample={usingSample} />
      </section>

      <DashboardSchedule
        today={today}
        upcoming={upcoming}
        recent={recent}
        sample={usingSample}
      />
    </div>
  );
}
