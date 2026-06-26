import Link from "next/link";
import { getGroups } from "@/lib/data";
import { qualificationBreakdown } from "@/lib/qualifiers";
import { GroupTable } from "@/components/GroupTable";
import { SampleDataBanner } from "@/components/ui/SampleDataBanner";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const groups = await getGroups();
  // The eight best third-placed teams currently in a knockout spot, so each
  // group table can flag its third-placed side as provisionally in or out.
  const bestThirdIds = new Set(
    qualificationBreakdown(groups).bestThirds.map((c) => c.team.id),
  );

  return (
    <div className="animate-fade-up">
      <SampleDataBanner />
      <h1 className="mb-1 font-display text-2xl font-extrabold">Group stage</h1>
      <p className="mb-4 text-sm text-ink-400">
        Top two of each group plus the eight best third-placed teams advance to
        the{" "}
        <Link href="/bracket" className="text-pitch-500 hover:underline">
          Round of 32
        </Link>
        .
      </p>
      {/* Legend for the left-edge qualification stripes. */}
      <ul className="mb-6 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-ink-400">
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-1 rounded-full bg-pitch-500" aria-hidden />
          Top two — through
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-1 rounded-full bg-accent-gold" aria-hidden />
          Best third — provisional spot
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-1 rounded-full bg-ink-600" aria-hidden />
          Third — outside the cutoff
        </li>
      </ul>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => (
          <GroupTable
            key={group.name}
            group={group}
            bestThirdIds={bestThirdIds}
          />
        ))}
      </div>
    </div>
  );
}
