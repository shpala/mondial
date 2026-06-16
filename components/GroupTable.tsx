import Link from "next/link";
import type { Group } from "@/lib/types";
import { TeamFlag } from "@/components/ui/TeamFlag";

export function GroupTable({ group }: { group: Group }) {
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
            const qualifies = row.rank <= 2;
            const gd = row.goalsFor - row.goalsAgainst;
            return (
              <tr
                key={row.team.id}
                className="border-t border-ink-700/50"
              >
                <td className="py-2 pl-3 pr-1">
                  <span
                    aria-hidden
                    className={`inline-block h-5 w-1 rounded-full ${
                      qualifies ? "bg-pitch-500" : "bg-transparent"
                    }`}
                  />
                  {qualifies && (
                    <span className="sr-only">Qualifying position</span>
                  )}
                </td>
                <td className="py-2 pr-2">
                  <Link
                    href={`/teams/${row.team.id}`}
                    className="flex items-center gap-2 hover:underline"
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
