import { getFixtures } from "@/lib/data";
import { MatchesBrowser } from "@/components/MatchesBrowser";
import { SampleDataBanner } from "@/components/ui/SampleDataBanner";

export const dynamic = "force-dynamic";

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string }>;
}) {
  const [{ group }, fixtures] = await Promise.all([searchParams, getFixtures()]);
  const initialGroup = group && /^[A-L]$/.test(group) ? group : "";

  return (
    <div className="animate-fade-up">
      <SampleDataBanner />
      <h1 className="mb-1 font-display text-2xl font-extrabold">Matches</h1>
      <p className="mb-6 text-sm text-ink-400">
        The full schedule — {fixtures.length} fixtures. Filter by group or
        status; tap any match for its lineups.
      </p>
      <MatchesBrowser fixtures={fixtures} initialGroup={initialGroup} />
    </div>
  );
}
