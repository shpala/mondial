import type { Goal, Team } from "@/lib/types";
import { TeamFlag } from "@/components/ui/TeamFlag";

export function GoalList({
  home,
  away,
  goals,
}: {
  home: Team;
  away: Team;
  goals: Goal[];
}) {
  if (!goals.length) return null;

  return (
    <section className="card mb-6 p-4">
      <h2 className="mb-3 font-display text-sm font-bold">Goals</h2>
      <ul className="space-y-1.5">
        {goals.map((g, i) => {
          const team = g.side === "home" ? home : away;
          return (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span className="w-10 text-right font-display font-bold tabular-nums text-ink-300">
                {g.minute}&rsquo;
              </span>
              <span aria-hidden>⚽</span>
              <TeamFlag flag={team.flag} alt={team.name} size={16} decorative />
              <span className="font-medium">{g.scorer}</span>
              {g.penalty && (
                <span className="rounded-sm bg-ink-700 px-1 text-[10px] font-semibold uppercase text-ink-300">
                  pen
                </span>
              )}
              {g.ownGoal && (
                <span className="rounded-sm bg-ink-700 px-1 text-[10px] font-semibold uppercase text-ink-300">
                  og
                </span>
              )}
              <span className="ml-auto text-xs text-ink-400">{team.code}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
