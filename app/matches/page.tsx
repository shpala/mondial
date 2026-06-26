import { getFixtures, getDataStatus } from "@/lib/data";
import { MatchesBrowser } from "@/components/MatchesBrowser";
import { SampleDataBanner } from "@/components/ui/SampleDataBanner";
import { AutoRefresh } from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

const STATUS_VALUES = ["all", "today", "upcoming", "results"] as const;
type StatusFilter = (typeof STATUS_VALUES)[number];

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ group?: string; status?: string }>;
}) {
  const [{ group, status }, fixtures, { usingSample }] = await Promise.all([
    searchParams,
    getFixtures(),
    getDataStatus(),
  ]);
  const initialGroup = group && /^[A-L]$/.test(group) ? group : "";
  const initialStatus: StatusFilter = STATUS_VALUES.includes(
    status as StatusFilter,
  )
    ? (status as StatusFilter)
    : "all";

  return (
    <div className="animate-fade-up">
      <AutoRefresh
        seconds={fixtures.some((f) => f.status === "live") ? 20 : 60}
      />
      <SampleDataBanner />
      <h1 className="mb-1 font-display text-2xl font-extrabold">Matches</h1>
      <p className="mb-6 text-sm text-ink-400">
        The full schedule — {fixtures.length} fixtures. Filter by group or
        status; tap any match for its lineups. Kickoff times are shown in UTC.
      </p>
      <MatchesBrowser
        fixtures={fixtures}
        initialGroup={initialGroup}
        initialStatus={initialStatus}
        sample={usingSample}
      />
    </div>
  );
}
