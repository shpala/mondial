import { getGroups } from "@/lib/data";
import { GroupTable } from "@/components/GroupTable";
import { SampleDataBanner } from "@/components/ui/SampleDataBanner";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const groups = await getGroups();

  return (
    <div className="animate-fade-up">
      <SampleDataBanner />
      <h1 className="mb-1 font-display text-2xl font-extrabold">Group stage</h1>
      <p className="mb-6 text-sm text-ink-400">
        Top two of each group plus the eight best third-placed teams advance to
        the Round of 32. Qualifying spots marked in green.
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => (
          <GroupTable key={group.name} group={group} />
        ))}
      </div>
    </div>
  );
}
