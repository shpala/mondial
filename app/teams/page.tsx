import Link from "next/link";
import { getTeams } from "@/lib/data";
import { TeamFlag } from "@/components/ui/TeamFlag";
import { SampleDataBanner } from "@/components/ui/SampleDataBanner";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const teams = await getTeams();

  return (
    <div className="animate-fade-up">
      <SampleDataBanner />
      <h1 className="mb-1 font-display text-2xl font-extrabold">Teams</h1>
      <p className="mb-6 text-sm text-ink-400">
        {teams.length} nations. Tap a team for its full squad.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {teams.map((team) => (
          <Link
            key={team.id}
            href={`/teams/${team.id}`}
            className="card flex items-center gap-3 p-3 transition hover:border-ink-500 hover:bg-ink-700/60"
          >
            <TeamFlag flag={team.flag} alt={team.name} size={28} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{team.name}</div>
              <div className="text-[11px] text-ink-400">Group {team.group}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
