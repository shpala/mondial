import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Fixture } from "@/lib/types";
import {
  getDataStatus,
  getFixtures,
  getSquad,
  getTeam,
  getTeams,
  getTitleOdds,
} from "@/lib/data";
import { SquadList } from "@/components/SquadList";
import { MatchCard } from "@/components/MatchCard";
import { TeamFlag } from "@/components/ui/TeamFlag";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { SampleDataBanner } from "@/components/ui/SampleDataBanner";
import { EstimatedNotice } from "@/components/ui/EstimatedData";

export const dynamic = "force-dynamic";

type FormResult = "W" | "D" | "L";

const FORM_CLS: Record<FormResult, string> = {
  W: "bg-pitch-500/20 text-pitch-500",
  D: "bg-ink-700 text-ink-300",
  L: "bg-accent-ember/20 text-accent-ember",
};

const FORM_WORD: Record<FormResult, string> = { W: "win", D: "draw", L: "loss" };

/** The team's last five finished results (oldest→newest), from the on-field
 *  result — the post-extra-time score where a knockout went to ET, so an
 *  ET-decided tie counts as the win/loss it became. A tie still level after
 *  extra time and settled only on penalties reads as the draw it was (D). */
function teamForm(fixtures: Fixture[], teamId: number): FormResult[] {
  return fixtures
    .filter(
      (f) =>
        f.status === "finished" && f.homeGoals != null && f.awayGoals != null,
    )
    .map((f) => {
      const isHome = f.home.id === teamId;
      const gf = (isHome ? f.homeGoals : f.awayGoals)!;
      const ga = (isHome ? f.awayGoals : f.homeGoals)!;
      return gf > ga ? "W" : gf < ga ? "L" : "D";
    })
    .slice(-5);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const team = await getTeam(Number(id));
  if (!team) return { title: "Team not found" };
  return {
    title: `${team.name} — squad, fixtures & title odds`,
    description: `${team.name}'s 2026 World Cup squad (Group ${team.group}), fixtures & results, starting line-ups, and the model's title odds.`,
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

  const [team, titleOdds, teams, fixtures, { usingSample }] = await Promise.all([
    getTeam(teamId),
    getTitleOdds(),
    getTeams(),
    getFixtures(),
    getDataStatus(),
  ]);
  if (!team) notFound();

  // Cached Monte Carlo title odds for this team (same simulation as /bracket).
  const odds = titleOdds.find((o) => o.team.id === teamId);
  // Strength rank, so the bare Elo number has a scale (e.g. "#7 of 48").
  const strengthRank =
    [...teams].sort((a, b) => b.rating - a.rating).findIndex((t) => t.id === teamId) +
    1;
  // This team's own fixtures (chronological); placeholder knockout slots carry
  // id 0 so they never match — pre-knockout this is the three group games.
  const teamFixtures = fixtures.filter(
    (f) => f.home.id === teamId || f.away.id === teamId,
  );
  const form = teamForm(teamFixtures, teamId);

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
            · #{strengthRank} of {teams.length} by strength (rating{" "}
            {Math.round(team.rating)}) ·{" "}
            <Link href="/bracket" className="text-pitch-500 hover:underline">
              bracket
            </Link>
          </p>
          {odds && (
            <p className="mt-1 text-sm text-ink-300">
              <span className="font-semibold text-accent-gold-bright">
                {oddsPct(odds.champion)}
              </span>{" "}
              to win the cup · {oddsPct(odds.reachFinal)} to reach the final ·{" "}
              {oddsPct(odds.escapeGroup)} to escape the group
            </p>
          )}
        </div>
      </header>

      {teamFixtures.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold">
              Fixtures &amp; results
            </h2>
            {form.length > 0 && (
              <span
                className="flex items-center gap-1"
                aria-label={`Recent form, most recent last: ${form
                  .map((r) => FORM_WORD[r])
                  .join(", ")}`}
              >
                {form.map((r, i) => (
                  <span
                    key={i}
                    aria-hidden
                    className={`inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold ${FORM_CLS[r]}`}
                  >
                    {r}
                  </span>
                ))}
              </span>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {teamFixtures.map((f) => (
              <MatchCard key={f.id} fixture={f} sample={usingSample} />
            ))}
          </div>
        </section>
      )}

      <Suspense fallback={<SquadSkeleton />}>
        <SquadSection teamId={teamId} />
      </Suspense>
    </div>
  );
}
