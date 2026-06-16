"use client";

import { useState } from "react";
import type { Lineup, LineupPlayer } from "@/lib/types";

interface Token {
  x: number; // 0..1 across the pitch width
  y: number; // 0..1 down the pitch height
  player: LineupPlayer["player"];
  color: string;
}

/** Group an XI by its grid row, then spread each row evenly across the width. */
function layout(lineup: Lineup, side: "home" | "away", color: string): Token[] {
  const rows = new Map<number, LineupPlayer[]>();
  lineup.startXI.forEach((lp, i) => {
    const row = lp.grid ? Number(lp.grid.split(":")[0]) : Math.floor(i / 3) + 1;
    if (!rows.has(row)) rows.set(row, []);
    rows.get(row)!.push(lp);
  });

  const sortedRows = [...rows.keys()].sort((a, b) => a - b);
  const rowCount = sortedRows.length || 1;
  const tokens: Token[] = [];

  sortedRows.forEach((rowKey, rowIndex) => {
    const players = rows.get(rowKey)!;
    // sort by grid column when available for stable lateral order
    players.sort((a, b) => {
      const ca = a.grid ? Number(a.grid.split(":")[1]) : 0;
      const cb = b.grid ? Number(b.grid.split(":")[1]) : 0;
      return ca - cb;
    });

    const depth = rowCount === 1 ? 0.5 : rowIndex / (rowCount - 1); // 0 = own goal
    // Each team keeps to its half with a dead zone at the halfway line so the
    // attacking lines of the two teams don't overlap on a narrow phone pitch.
    const y =
      side === "home" ? 0.96 - depth * 0.4 : 0.04 + depth * 0.4;

    players.forEach((lp, i) => {
      const x = (i + 1) / (players.length + 1);
      tokens.push({ x, y, player: lp.player, color });
    });
  });

  return tokens;
}

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : name;
}

/** Visually-hidden text alternative so screen readers can read each XI; the SVG
 *  itself is decorative to AT. */
function XIList({ lineup, side }: { lineup: Lineup; side: string }) {
  return (
    <div>
      <h4>
        {side}: {lineup.team.name} ({lineup.formation})
      </h4>
      <ol>
        {lineup.startXI.map((lp) => (
          <li key={lp.player.id}>
            {lp.player.number ?? "–"} {lp.player.name} — {lp.player.position}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Persistent "estimated" marker beside a generated XI's footer label, so the
 *  fabricated-roster caveat stays attached to the pitch after the notice above
 *  scrolls out of view. Uses the same slate provenance palette as EstimatedTag. */
function EstMark() {
  return (
    <span
      title="Estimated line-up — placeholder names, not the official squad"
      className="rounded-full bg-slate-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-300"
    >
      ≈ est
    </span>
  );
}

export function PitchLineup({
  home,
  away,
  withSidebar = false,
}: {
  home: Lineup | null;
  away: Lineup | null;
  /** When the goal list sits beside the pitch on desktop, left-align so the
   *  sidebar balances it; otherwise keep the pitch centered at every width. */
  withSidebar?: boolean;
}) {
  const [selected, setSelected] = useState<Token | null>(null);

  const tokens: Token[] = [
    ...(away ? layout(away, "away", "#f97316") : []),
    ...(home ? layout(home, "home", "#16a34a") : []),
  ];

  // viewBox in pitch units; width 100, height 150 (portrait)
  const W = 100;
  const H = 150;

  return (
    <div
      className={`card mx-auto max-w-md overflow-hidden${
        withSidebar ? " lg:mx-0" : ""
      }`}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        role="img"
        aria-label="Starting lineups on the pitch"
      >
        {/* grass */}
        <defs>
          <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0f3d24" />
            <stop offset="1" stopColor="#0b2e1b" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width={W} height={H} fill="url(#grass)" />
        {/* stripes */}
        {Array.from({ length: 10 }).map((_, i) => (
          <rect
            key={i}
            x="0"
            y={(i * H) / 10}
            width={W}
            height={H / 10}
            fill={i % 2 ? "#ffffff" : "#000000"}
            opacity={0.03}
          />
        ))}
        {/* markings */}
        <g
          stroke="#ffffff"
          strokeOpacity="0.25"
          strokeWidth="0.5"
          fill="none"
        >
          <rect x="4" y="4" width={W - 8} height={H - 8} />
          <line x1="4" y1={H / 2} x2={W - 4} y2={H / 2} />
          <circle cx={W / 2} cy={H / 2} r="10" />
          <circle cx={W / 2} cy={H / 2} r="0.8" fill="#fff" />
          {/* penalty boxes */}
          <rect x={W / 2 - 18} y="4" width="36" height="20" />
          <rect x={W / 2 - 18} y={H - 24} width="36" height="20" />
        </g>

        {/* players — selected token rendered last so it wins overlaps */}
        {[...tokens]
          .sort(
            (a, b) =>
              (a.player.id === selected?.player.id ? 1 : 0) -
              (b.player.id === selected?.player.id ? 1 : 0),
          )
          .map((t, i) => {
          const cx = 6 + t.x * (W - 12);
          const cy = 8 + t.y * (H - 16);
          const isSel = selected?.player.id === t.player.id;
          return (
            <g
              key={`${t.player.id}-${i}`}
              transform={`translate(${cx} ${cy})`}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label={`#${t.player.number ?? "–"} ${t.player.name}`}
              onClick={() => setSelected(isSel ? null : t)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected(isSel ? null : t);
                }
              }}
            >
              {/* ~44px transparent touch target (visible dot stays small) */}
              <circle r={6} fill="transparent" style={{ pointerEvents: "all" }} />
              <circle
                r={isSel ? 4.4 : 3.6}
                fill={t.color}
                stroke="#fff"
                strokeWidth={isSel ? 0.8 : 0.5}
              />
              <text
                textAnchor="middle"
                dy="1.4"
                fontSize="3.2"
                fontWeight="700"
                fill="#fff"
              >
                {t.player.number ?? ""}
              </text>
              <text
                className="pitch-surname"
                textAnchor="middle"
                y="7.5"
                fontSize="2.8"
                fill="#e2e8f0"
              >
                {shortName(t.player.name)}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="flex items-center justify-between gap-4 border-t border-ink-700 px-4 py-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-pitch-500" />
          <span className="text-ink-400">
            {home ? `${home.team.name} · ${home.formation}` : "Home"}
          </span>
          {home?.source === "generated" && <EstMark />}
        </div>
        {selected && (
          <div className="font-medium text-ink-100">
            #{selected.player.number ?? "–"} {selected.player.name}
          </div>
        )}
        <div className="flex items-center gap-2">
          {away?.source === "generated" && <EstMark />}
          <span className="text-ink-400">
            {away ? `${away.team.name} · ${away.formation}` : "Away"}
          </span>
          <span className="h-2.5 w-2.5 rounded-full bg-accent-ember" />
        </div>
      </div>

      <div className="sr-only">
        {home && <XIList lineup={home} side="Home" />}
        {away && <XIList lineup={away} side="Away" />}
      </div>
    </div>
  );
}
