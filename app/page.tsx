import Link from "next/link";
import { getDashboardFixtures, getRawFixtures, getTeams } from "@/lib/data";
import { gradeOutcomes } from "@/lib/modelreport";
import { MatchCard } from "@/components/MatchCard";
import { ModelReportCard } from "@/components/ModelReportCard";
import { SampleDataBanner } from "@/components/ui/SampleDataBanner";
import { AutoRefresh } from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

function Section({
  title,
  href,
  badge,
  children,
}: {
  title: string;
  href?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-xl font-bold">{title}</h2>
          {badge}
        </div>
        {href && (
          <Link href={href} className="text-sm text-pitch-500 hover:underline">
            View all →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export default async function DashboardPage() {
  const [{ live, today, upcoming, recent }, teams, rawFixtures] =
    await Promise.all([getDashboardFixtures(), getTeams(), getRawFixtures()]);
  const report = gradeOutcomes(rawFixtures);

  return (
    <div className="animate-fade-up">
      <AutoRefresh seconds={live.length > 0 ? 20 : 60} />
      <SampleDataBanner />

      {/* On a phone, surface the live score above the marketing hero. */}
      <div className="flex flex-col">
      <section className="card mb-8 overflow-hidden">
        <div className="relative bg-gradient-to-br from-pitch-700/50 via-ink-800 to-ink-800 px-6 py-6 sm:py-12">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-pitch-50/80">
            <span aria-hidden>🇨🇦 🇺🇸 🇲🇽</span> FIFA World Cup
          </p>
          <h1 className="font-display text-3xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl">
            Mondial <span className="text-accent-gold">2026</span>
          </h1>
          <p className="mt-3 max-w-xl text-sm text-ink-300">
            {teams.length} nations · 12 groups · live squads, starting lineups
            and an interactive prediction bracket.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/bracket"
              className="rounded-xl bg-pitch-500 px-4 py-2 text-sm font-semibold text-pitch-900 transition hover:bg-pitch-50"
            >
              Open prediction bracket →
            </Link>
            <Link
              href="/groups"
              className="rounded-xl border border-ink-600 px-4 py-2 text-sm font-semibold transition hover:border-ink-500"
            >
              Group standings
            </Link>
          </div>
        </div>
      </section>

      {live.length > 0 && (
        <section className="order-first mb-8 sm:order-none">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="font-display text-xl font-bold">Live now</h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-red-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
              {live.length} in play
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {live.map((f) => (
              <MatchCard key={f.id} fixture={f} />
            ))}
          </div>
        </section>
      )}
      </div>

      <section className="mb-8">
        <ModelReportCard report={report} />
      </section>

      {today.length > 0 && (
        <Section
          title="Today"
          badge={
            <span className="rounded-full bg-pitch-500/20 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-pitch-50/90">
              {today.length} {today.length === 1 ? "match" : "matches"}
            </span>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {today.map((f) => (
              <MatchCard key={f.id} fixture={f} />
            ))}
          </div>
        </Section>
      )}

      <Section title="Upcoming" href="/matches">
        {upcoming.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {upcoming.map((f) => (
              <MatchCard key={f.id} fixture={f} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-400">No upcoming fixtures scheduled.</p>
        )}
      </Section>

      {recent.length > 0 && (
        <Section title="Recent results" href="/matches">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {recent.map((f) => (
              <MatchCard key={f.id} fixture={f} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
