import type { Player, Position, Squad } from "@/lib/types";
import { positionLabel } from "@/lib/format";

const ORDER: Position[] = ["GK", "DEF", "MID", "FWD"];

function PlayerRow({ player }: { player: Player }) {
  return (
    <div className="flex items-center gap-3 border-b border-ink-700/50 px-3 py-2 last:border-0">
      <span className="w-7 text-center font-display text-sm font-bold tabular-nums text-ink-400">
        {player.number ?? "–"}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{player.name}</div>
        {player.club && (
          <div className="truncate text-[11px] text-ink-400">{player.club}</div>
        )}
      </div>
      {player.age != null && (
        <span className="text-xs text-ink-400">{player.age}y</span>
      )}
    </div>
  );
}

export function SquadList({ squad }: { squad: Squad }) {
  const byPosition = ORDER.map((pos) => ({
    pos,
    players: squad.players.filter((p) => p.position === pos),
  })).filter((g) => g.players.length > 0);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {byPosition.map((group) => (
        <section key={group.pos} className="card overflow-hidden">
          <h3 className="border-b border-ink-700 px-3 py-2 font-display text-xs font-bold uppercase tracking-wide text-ink-400">
            {positionLabel(group.pos)}
          </h3>
          <div>
            {group.players.map((p) => (
              <PlayerRow key={p.id} player={p} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
