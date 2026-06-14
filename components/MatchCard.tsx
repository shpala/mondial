import Link from "next/link";
import type { Fixture } from "@/lib/types";
import { TeamFlag } from "@/components/ui/TeamFlag";
import { formatKickoff, isToday } from "@/lib/format";
import { winProbability } from "@/lib/prediction";

function StatusPill({ status }: { status: Fixture["status"] }) {
  if (status === "live") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-red-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
        Live
      </span>
    );
  }
  if (status === "finished") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-300">
        ✓ Full-time
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent-gold/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-300">
      ◆ Predicted
    </span>
  );
}

function Side({
  flag,
  name,
  code,
  goals,
  align,
  favored,
}: {
  flag: string;
  name: string;
  code: string;
  goals: number | null;
  align: "left" | "right";
  favored: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 flex-1 items-center gap-2 ${
        align === "right" ? "flex-row-reverse text-right" : ""
      }`}
    >
      <TeamFlag flag={flag} alt={name} decorative />
      <span
        className={`truncate text-sm ${favored ? "font-bold text-white" : "font-medium"}`}
      >
        <span className="hidden sm:inline">{name}</span>
        <span className="sm:hidden">{code}</span>
      </span>
      {goals !== null && (
        <span className="ml-auto font-display text-lg font-bold tabular-nums">
          {goals}
        </span>
      )}
    </div>
  );
}

export function MatchCard({ fixture }: { fixture: Fixture }) {
  const played = fixture.status === "finished" || fixture.status === "live";
  const predicted = fixture.status === "scheduled";

  // Model prediction for upcoming games (skip placeholder knockout slots).
  const realTeams = fixture.home.id !== 0 && fixture.away.id !== 0;
  const homeProb =
    predicted && realTeams
      ? winProbability(fixture.home.rating, fixture.away.rating)
      : null;
  const homePct = homeProb != null ? Math.round(homeProb * 100) : 50;
  const awayPct = 100 - homePct;
  const today = isToday(fixture.kickoff);

  return (
    <Link
      href={`/matches/${fixture.id}`}
      className={`group flex flex-col gap-2 rounded-2xl border bg-ink-800/70 p-3 backdrop-blur transition hover:bg-ink-700/60 ${
        today ? "ring-1 ring-pitch-500/50" : ""
      } ${
        predicted
          ? "border-dashed border-accent-gold/30 hover:border-accent-gold/50"
          : "border-ink-700 hover:border-ink-500"
      }`}
    >
      <div className="flex items-center justify-between text-[11px] text-ink-400">
        <span className="flex items-center gap-1.5">
          {fixture.group ? `Group ${fixture.group}` : fixture.stage}
          {today && (
            <span className="rounded-full bg-pitch-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-pitch-50/90">
              Today
            </span>
          )}
        </span>
        <StatusPill status={fixture.status} />
      </div>

      <div className="flex items-center gap-2">
        <Side
          flag={fixture.home.flag}
          name={fixture.home.name}
          code={fixture.home.code}
          goals={fixture.homeGoals}
          align="left"
          favored={homeProb != null && homeProb > 0.5}
        />
        <span className="px-1 text-xs font-semibold text-ink-400">
          {played ? "–" : "v"}
        </span>
        <Side
          flag={fixture.away.flag}
          name={fixture.away.name}
          code={fixture.away.code}
          goals={fixture.awayGoals}
          align="right"
          favored={homeProb != null && homeProb < 0.5}
        />
      </div>

      {predicted &&
        (homeProb != null ? (
          <div className="mt-0.5">
            <div className="flex h-1.5 overflow-hidden rounded-full bg-ink-700">
              <div className="bg-pitch-500/70" style={{ width: `${homePct}%` }} />
              <div className="bg-accent-ember/70" style={{ width: `${awayPct}%` }} />
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-ink-400">
              <span className="tabular-nums">{homePct}%</span>
              <span className="uppercase tracking-wide">
                {formatKickoff(fixture.kickoff)}
              </span>
              <span className="tabular-nums">{awayPct}%</span>
            </div>
          </div>
        ) : (
          <div className="text-center text-[11px] text-ink-400">
            {formatKickoff(fixture.kickoff)}
          </div>
        ))}
    </Link>
  );
}
