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
  if (!rows.length) return null;

  const max = rows[0].champion || 1;

  return (
    <section className="card mb-6 overflow-hidden">
      <div className="flex items-center justify-between border-b border-ink-700 px-4 py-2.5">
        <h2 className="font-display text-sm font-bold">Title odds</h2>
        <span className="text-[11px] text-ink-400">Monte Carlo · 10k runs</span>
      </div>
      <table className="w-full text-sm" aria-label="Title odds">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-ink-400">
            <th scope="col" className="py-1.5 pl-4 text-left font-medium">
              Team
            </th>
            <th scope="col" className="py-1.5 text-right font-medium">
              Win
            </th>
            <th
              scope="col"
              className="hidden py-1.5 text-right font-medium sm:table-cell"
            >
              Final
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
              <td className="py-1.5 pl-4">
                <Link
                  href={`/teams/${o.team.id}`}
                  className="flex items-center gap-2 hover:underline"
                >
                  <TeamFlag flag={o.team.flag} alt={o.team.name} size={18} decorative />
                  <span className="truncate font-medium">{o.team.name}</span>
                </Link>
              </td>
              <td className="py-1.5 text-right font-bold tabular-nums">
                {pct(o.champion)}
              </td>
              <td className="hidden py-1.5 text-right tabular-nums text-ink-300 sm:table-cell">
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
    </section>
  );
}
