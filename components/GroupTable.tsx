import Link from "next/link";
import type { Group } from "@/lib/types";
import { TeamFlag } from "@/components/ui/TeamFlag";

/** Qualification standing for a row's left stripe + screen-reader label.
 *  through  = top two (green) · thirdIn = provisional best-third spot (gold) ·
 *  thirdOut = third place currently outside the eight-team cutoff (grey). */
function qualState(
  rank: number,
  teamId: number,
  bestThirdIds?: Set<number>,
): "through" | "thirdIn" | "thirdOut" | "none" {
  if (rank <= 2) return "through";
  if (rank === 3) {
    // No id-set passed (caller didn't compute it): leave thirds unmarked.
    if (!bestThirdIds) return "none";
    return bestThirdIds.has(teamId) ? "thirdIn" : "thirdOut";
  }
  return "none";
}

const QUAL_BAR: Record<
  ReturnType<typeof qualState>,
  { cls: string; label: string | null }
> = {
  through: { cls: "bg-pitch-500", label: "Qualifying position (top two)" },
  thirdIn: {
    cls: "bg-accent-gold",
    label: "Provisional qualifier (one of the eight best third-placed teams)",
  },
  thirdOut: {
    cls: "bg-ink-600",
    label: "Third place — currently outside the eight-team cutoff",
  },
  none: { cls: "bg-transparent", label: null },
};

export function GroupTable({
  group,
  bestThirdIds,
}: {
  group: Group;
  /** Team ids of the eight best third-placed teams (from
   *  `qualificationBreakdown`), so rank-3 rows can show provisional status. */
  bestThirdIds?: Set<number>;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-ink-700 px-4 py-2.5">
        <h3 className="font-display text-sm font-bold">Group {group.name}</h3>
        <Link
          href={`/matches?group=${group.name}`}
          className="text-[11px] font-medium text-pitch-500 hover:underline"
        >
          Schedule →
        </Link>
      </div>
      <table
        className="w-full text-sm"
        aria-label={`Group ${group.name} standings`}
      >
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-ink-400">
            <th scope="col" className="w-2">
              <span className="sr-only">Qualification</span>
            </th>
            <th scope="col" className="py-1.5 pl-3 text-left font-medium">
              Team
            </th>
            <th scope="col" className="py-1.5 text-center font-medium">
              P<span className="sr-only"> (played)</span>
            </th>
            <th
              scope="col"
              className="hidden py-1.5 text-center font-medium sm:table-cell"
            >
              W<span className="sr-only"> (won)</span>
            </th>
            <th
              scope="col"
              className="hidden py-1.5 text-center font-medium sm:table-cell"
            >
              D<span className="sr-only"> (drawn)</span>
            </th>
            <th
              scope="col"
              className="hidden py-1.5 text-center font-medium sm:table-cell"
            >
              L<span className="sr-only"> (lost)</span>
            </th>
            <th scope="col" className="py-1.5 text-center font-medium">
              GD<span className="sr-only"> (goal difference)</span>
            </th>
            <th scope="col" className="py-1.5 pr-4 text-right font-medium">
              Pts<span className="sr-only"> (points)</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {group.rows.map((row) => {
            const qual = qualState(row.rank, row.team.id, bestThirdIds);
            const bar = QUAL_BAR[qual];
            const gd = row.goalsFor - row.goalsAgainst;
            return (
              <tr
                key={row.team.id}
                className="border-t border-ink-700/50"
              >
                <td className="py-2 pl-3 pr-1">
                  <span
                    aria-hidden
                    className={`inline-block h-5 w-1 rounded-full ${bar.cls}`}
                  />
                  {bar.label && <span className="sr-only">{bar.label}</span>}
                </td>
                <td className="w-full max-w-0 py-2 pr-2">
                  <Link
                    href={`/teams/${row.team.id}`}
                    className="flex min-w-0 items-center gap-2 hover:underline"
                  >
                    <TeamFlag flag={row.team.flag} alt={row.team.name} size={18} decorative />
                    <span className="truncate font-medium">{row.team.name}</span>
                  </Link>
                </td>
                <td className="py-2 text-center text-ink-400 tabular-nums">
                  {row.played}
                </td>
                <td className="hidden py-2 text-center text-ink-400 tabular-nums sm:table-cell">
                  {row.win}
                </td>
                <td className="hidden py-2 text-center text-ink-400 tabular-nums sm:table-cell">
                  {row.draw}
                </td>
                <td className="hidden py-2 text-center text-ink-400 tabular-nums sm:table-cell">
                  {row.loss}
                </td>
                <td className="py-2 text-center text-ink-300 tabular-nums">
                  {gd > 0 ? `+${gd}` : gd}
                </td>
                <td className="py-2 pr-4 text-right font-display font-bold tabular-nums">
                  {row.points}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
