import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFixtures, getSquad, getTeam } from "@/lib/data";
import { simulateTournament } from "@/lib/montecarlo";
import { SquadList } from "@/components/SquadList";
import { TeamFlag } from "@/components/ui/TeamFlag";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { SampleDataBanner } from "@/components/ui/SampleDataBanner";
import { EstimatedNotice } from "@/components/ui/EstimatedData";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const team = await getTeam(Number(id));
  if (!team) return { title: "Team not found" };
  return {
    title: `${team.name} — squad & title odds`,
    description: `${team.name}'s 2026 World Cup squad (Group ${team.group}), starting line-ups, and the model's title odds.`,
  };
}

/** Probability → sentence-friendly percentage (never a bare dash). */
function oddsPct(p: number): string {
  return p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`;
}

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

  const [team, fixtures] = await Promise.all([getTeam(teamId), getFixtures()]);
  if (!team) notFound();

  // Monte Carlo title odds for this team (same simulation as /bracket).
  const odds = simulateTournament(fixtures).find((o) => o.team.id === teamId);

  return (
    <div className="animate-fade-up">
      <SampleDataBanner />
      <Breadcrumb
        items={[
          { label: "Home", href: "/" },
          { label: "Teams", href: "/teams" },
          { label: team.name },
        ]}
      />

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
          {odds && (
            <p className="mt-1 text-sm text-ink-300">
              <span className="font-semibold text-amber-300">
                {oddsPct(odds.champion)}
              </span>{" "}
              to win the cup · {oddsPct(odds.reachFinal)} to reach the final ·{" "}
              {oddsPct(odds.escapeGroup)} to escape the group
            </p>
          )}
        </div>
      </header>

      <Suspense fallback={<SquadSkeleton />}>
        <SquadSection teamId={teamId} />
      </Suspense>
    </div>
  );
}
