import Link from "next/link";
import { getDashboardFixtures, getTeams } from "@/lib/data";
import { MatchCard } from "@/components/MatchCard";
import { SampleDataBanner } from "@/components/ui/SampleDataBanner";

export const dynamic = "force-dynamic";

function Section({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-bold">{title}</h2>
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
  const [{ live, upcoming, recent }, teams] = await Promise.all([
    getDashboardFixtures(),
    getTeams(),
  ]);

  return (
    <div className="animate-fade-up">
      <SampleDataBanner />

      <section className="card mb-8 overflow-hidden">
        <div className="relative bg-gradient-to-br from-pitch-700/50 via-ink-800 to-ink-800 px-6 py-10 sm:py-14">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-pitch-50/80">
            <span aria-hidden>🇨🇦 🇺🇸 🇲🇽</span> FIFA World Cup
          </p>
          <h1 className="font-display text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-7xl">
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
        <Section title="Live now">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {live.map((f) => (
              <MatchCard key={f.id} fixture={f} />
            ))}
          </div>
        </Section>
      )}

      <Section title="Upcoming" href="/matches">
        {upcoming.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((f) => (
              <MatchCard key={f.id} fixture={f} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
