import Link from "next/link";
import type { TeamOdds } from "@/lib/montecarlo";
import { TeamFlag } from "@/components/ui/TeamFlag";

/** Format a probability as a percentage, with a floor label for tiny chances. */
function pct(p: number): string {
  if (p <= 0) return "—";
  if (p < 0.005) return "<1%";
  return `${Math.round(p * 100)}%`;
}

/**
 * Monte Carlo title odds — the most likely champions from simulating the rest of
 * the tournament thousands of times. Shows the top contenders by win probability.
 */
export function TitleOddsTable({
  odds,
  limit = 12,
}: {
  odds: TeamOdds[];
  limit?: number;
}) {
  const rows = odds.filter((o) => o.champion > 0).slice(0, limit);
  if (!rows.length) {
    return (
      <section className="card mb-6 p-4">
        <h2 className="font-display text-sm font-bold">Title odds</h2>
        <p className="mt-1 text-sm text-ink-400">
          Title odds appear once the bracket can be simulated.
        </p>
      </section>
    );
  }

  const max = rows[0].champion || 1;
  // How much of the title probability mass the listed teams actually cover —
  // the bars are normalized to the leader (so the favourite always reads ~100%),
  // which can be misread as near-certainty without this anchor.
  const coverage = Math.round(
    rows.reduce((sum, o) => sum + o.champion, 0) * 100,
  );
  // Only teams that can still win have champion > 0; once they all fit within the
  // limit there is no "remaining field" left to mention (true from the QF on).
  const eligible = odds.filter((o) => o.champion > 0).length;

  return (
    <section className="card mb-6 overflow-hidden">
      <div className="flex items-center justify-between border-b border-ink-700 px-4 py-2.5">
        <h2 className="font-display text-sm font-bold">Title odds</h2>
        <span className="text-[11px] text-ink-400">Model estimate</span>
      </div>
      <table className="w-full text-sm" aria-label="Title odds">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-ink-400">
            <th scope="col" className="py-1.5 pl-4 text-left font-medium">
              Team
            </th>
            <th
              scope="col"
              className="whitespace-nowrap py-1.5 pl-3 text-right font-medium"
            >
              Win cup
            </th>
            <th
              scope="col"
              className="hidden whitespace-nowrap py-1.5 pl-3 text-right font-medium sm:table-cell"
            >
              Reach final
            </th>
            <th scope="col" className="py-1.5 pr-4 text-right font-medium">
              <span className="sr-only">Win probability bar</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr
              key={o.team.id}
              className="border-t border-ink-700/60 hover:bg-ink-700/30"
            >
              <td className="w-full max-w-0 pl-4">
                <Link
                  href={`/teams/${o.team.id}`}
                  className="flex min-h-11 min-w-0 items-center gap-2 py-1 hover:underline sm:min-h-0 sm:py-1.5"
                >
                  <TeamFlag flag={o.team.flag} alt={o.team.name} size={18} decorative />
                  <span className="truncate font-medium">{o.team.name}</span>
                </Link>
              </td>
              <td className="py-1.5 pl-3 text-right font-display text-base font-extrabold tabular-nums text-accent-gold">
                {pct(o.champion)}
              </td>
              <td className="hidden py-1.5 pl-3 text-right tabular-nums text-ink-300 sm:table-cell">
                {pct(o.reachFinal)}
              </td>
              <td className="py-1.5 pl-3 pr-4">
                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-ink-700">
                  <div
                    className="h-full bg-accent-gold/70"
                    style={{ width: `${(o.champion / max) * 100}%` }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-ink-700 px-4 py-2 text-[11px] leading-snug text-ink-400">
        Chance of winning the cup / reaching the final, from simulating the rest
        of the tournament 10,000 times — a model estimate, not betting odds.{" "}
        These {rows.length} teams account for ~{coverage}% of simulated titles
        {rows.length < eligible
          ? "; the rest is spread across the remaining field."
          : "."}
      </p>
    </section>
  );
}
