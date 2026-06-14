import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSquad, getTeam } from "@/lib/data";
import { SquadList } from "@/components/SquadList";
import { TeamFlag } from "@/components/ui/TeamFlag";
import { SampleDataBanner } from "@/components/ui/SampleDataBanner";
import { EstimatedNotice } from "@/components/ui/EstimatedData";

export const dynamic = "force-dynamic";

// Slow region: the squad comes from TheSportsDB (with generated fallback).
async function SquadSection({ teamId }: { teamId: number }) {
  const squad = await getSquad(teamId);
  if (!squad || !squad.players.length) {
    return <p className="text-sm text-ink-400">Squad not available yet.</p>;
  }
  return (
    <>
      {squad.source === "generated" && <EstimatedNotice kind="squad" />}
      <SquadList squad={squad} />
    </>
  );
}

function SquadSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="skeleton h-48 rounded-2xl" />
      ))}
    </div>
  );
}

export default async function TeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const teamId = Number(id);
  if (!Number.isFinite(teamId)) notFound();

  const team = await getTeam(teamId);
  if (!team) notFound();

  return (
    <div className="animate-fade-up">
      <SampleDataBanner />
      <Link
        href="/teams"
        className="mb-4 inline-block text-sm text-ink-400 hover:text-slate-200"
      >
        ← All teams
      </Link>

      <header className="card mb-6 flex items-center gap-4 p-5">
        <TeamFlag flag={team.flag} alt={team.name} size={44} decorative />
        <div>
          <h1 className="font-display text-2xl font-extrabold">{team.name}</h1>
          <p className="text-sm text-ink-400">
            <Link
              href={`/matches?group=${team.group}`}
              className="text-pitch-500 hover:underline"
            >
              Group {team.group}
            </Link>{" "}
            · strength rating {Math.round(team.rating)} ·{" "}
            <Link href="/bracket" className="text-pitch-500 hover:underline">
              bracket
            </Link>
          </p>
        </div>
      </header>

      <Suspense fallback={<SquadSkeleton />}>
        <SquadSection teamId={teamId} />
      </Suspense>
    </div>
  );
}
