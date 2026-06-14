"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Team } from "@/lib/types";
import {
  buildBracket,
  resolveBracket,
  winnerProb,
  type Matchup,
} from "@/lib/prediction";
import { useBracketStore } from "@/store/bracket";
import { TeamFlag } from "@/components/ui/TeamFlag";

// A real, already-played knockout result, keyed by the unordered pair of team
// ids. Lets a predicted node flip to an actual result as the tournament unfolds.
export interface PlayedResult {
  winnerId: number;
  homeId: number;
  awayId: number;
  homeGoals: number;
  awayGoals: number;
  fixtureId: number;
}
export type ResultMap = Record<string, PlayedResult>;

function pairKey(a: number, b: number): string {
  return [a, b].sort((x, y) => x - y).join("-");
}

type WinnerTone = "result" | "pick" | "model";

const WINNER_CLASS: Record<WinnerTone, string> = {
  result: "bg-emerald-600/45 font-semibold text-white", // actually played
  pick: "bg-accent-gold/25 font-bold text-amber-100", // your override
  model: "bg-ink-500/80 font-semibold text-white", // model prediction
};

function Slot({
  team,
  isWinner,
  winnerTone,
  prob,
  score,
  dimmed,
  locked,
  interactive,
  onPick,
}: {
  team: Team | null;
  isWinner: boolean;
  winnerTone: WinnerTone;
  prob: number | null;
  score: number | null;
  dimmed: boolean;
  locked: boolean;
  interactive: boolean;
  onPick: () => void;
}) {
  if (!team) {
    return (
      <div className="flex h-11 items-center px-2 text-xs text-ink-400 sm:h-9">
        —
      </div>
    );
  }
  const clickable = interactive && !locked;
  const stateWord = isWinner
    ? winnerTone === "result"
      ? "winner, actual result"
      : winnerTone === "pick"
        ? "winner, your pick"
        : "projected winner"
    : dimmed
      ? "eliminated"
      : "awaiting result";
  const metric =
    score != null
      ? `, scored ${score}`
      : isWinner && prob != null
        ? `, ${Math.round(prob * 100)} percent win probability`
        : "";

  return (
    <button
      type="button"
      onClick={clickable ? onPick : undefined}
      disabled={!interactive && !locked}
      aria-disabled={locked || undefined}
      aria-label={`${team.name}, ${stateWord}${metric}`}
      className={`flex h-11 w-full items-center gap-1.5 px-2 text-left transition sm:h-9 ${
        clickable
          ? "cursor-pointer hover:bg-ink-700/60 active:bg-ink-600"
          : "cursor-default"
      } ${isWinner ? WINNER_CLASS[winnerTone] : dimmed ? "text-ink-400" : ""}`}
    >
      <TeamFlag flag={team.flag} alt={team.name} size={16} decorative />
      <span className="truncate text-xs">{team.code}</span>
      {score != null ? (
        <span
          className="ml-auto font-display text-xs font-bold tabular-nums"
          aria-hidden
        >
          {score}
        </span>
      ) : (
        prob != null && (
          <span
            className="ml-auto text-[10px] tabular-nums text-ink-400"
            aria-hidden
          >
            {Math.round(prob * 100)}%
          </span>
        )
      )}
    </button>
  );
}

function MatchupCard({
  m,
  override,
  result,
  interactive,
  isFinal,
  onPick,
}: {
  m: Matchup;
  override: number | undefined;
  result: PlayedResult | null;
  interactive: boolean;
  isFinal: boolean;
  onPick: (teamId: number) => void;
}) {
  const wp = winnerProb(m);
  const topPct = m.topWinProb != null ? Math.round(m.topWinProb * 100) : 50;
  const played = result != null;
  const isOverridden =
    !played &&
    override != null &&
    (override === m.top?.id || override === m.bottom?.id);

  const topScore =
    played && m.top
      ? m.top.id === result!.homeId
        ? result!.homeGoals
        : result!.awayGoals
      : null;
  const bottomScore =
    played && m.bottom
      ? m.bottom.id === result!.homeId
        ? result!.homeGoals
        : result!.awayGoals
      : null;

  const winnerTone: WinnerTone = played
    ? "result"
    : isOverridden
      ? "pick"
      : "model";

  const border = played
    ? "border-emerald-600/60"
    : isOverridden
      ? "border-accent-gold/60"
      : "border-dashed border-ink-600";

  const card = (
    <div
      className={`overflow-hidden rounded-lg border bg-ink-800 ${border} ${
        isFinal ? "w-44 ring-1 ring-accent-gold/50 shadow-lg shadow-black/40" : "w-36"
      }`}
    >
      <Slot
        team={m.top}
        isWinner={m.winnerId != null && m.winnerId === m.top?.id}
        winnerTone={winnerTone}
        prob={m.winnerId === m.top?.id ? wp : null}
        score={topScore}
        dimmed={m.winnerId != null && m.winnerId !== m.top?.id}
        locked={played}
        interactive={interactive}
        onPick={() => m.top && onPick(m.top.id)}
      />
      <div className="h-1.5 bg-ink-700">
        {!played && (
          <div
            className="h-full bg-pitch-500/70"
            style={{ width: `${topPct}%` }}
            aria-hidden
          />
        )}
      </div>
      <Slot
        team={m.bottom}
        isWinner={m.winnerId != null && m.winnerId === m.bottom?.id}
        winnerTone={winnerTone}
        prob={m.winnerId === m.bottom?.id ? wp : null}
        score={bottomScore}
        dimmed={m.winnerId != null && m.winnerId !== m.bottom?.id}
        locked={played}
        interactive={interactive}
        onPick={() => m.bottom && onPick(m.bottom.id)}
      />
    </div>
  );

  // A played tie deep-links to its match page; predicted ties stay interactive.
  if (played) {
    return (
      <Link
        href={`/matches/${result!.fixtureId}`}
        aria-label={`View result: ${m.top?.name ?? ""} vs ${m.bottom?.name ?? ""}`}
        className="block"
      >
        {card}
      </Link>
    );
  }
  return card;
}

export function BracketTree({
  qualified,
  results = {},
}: {
  qualified: Team[];
  results?: ResultMap;
}) {
  const { overrides, pick, reset } = useBracketStore();
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<"you" | "model">("you");

  useEffect(() => setMounted(true), []);

  const skeleton = useMemo(() => buildBracket(qualified), [qualified]);
  const effectiveOverrides = mode === "you" && mounted ? overrides : {};

  // Resolve once for pairings, derive forced winners from real results, resolve
  // again so actual outcomes take precedence over model + user picks.
  const { resolved, playedNodes } = useMemo(() => {
    const base = resolveBracket(skeleton, effectiveOverrides);
    const forced: Record<string, number> = {};
    const played: Record<string, PlayedResult> = {};
    for (const round of base.rounds) {
      for (const mm of round) {
        if (mm.top && mm.bottom && mm.top.id && mm.bottom.id) {
          const r = results[pairKey(mm.top.id, mm.bottom.id)];
          if (r) {
            forced[mm.id] = r.winnerId;
            played[mm.id] = r;
          }
        }
      }
    }
    const finalBracket = Object.keys(forced).length
      ? resolveBracket(skeleton, { ...effectiveOverrides, ...forced })
      : base;
    return { resolved: finalBracket, playedNodes: played };
  }, [skeleton, effectiveOverrides, results]);

  const champion =
    resolved.championId != null
      ? qualified.find((t) => t.id === resolved.championId) ?? null
      : null;

  const overrideCount = Object.keys(overrides).length;
  const playedCount = Object.keys(playedNodes).length;
  const lastRound = resolved.rounds.length - 1;

  // --- SVG connector lines between rounds (measured from the laid-out cards) ---
  const contentRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[][]>([]);
  const setCardRef =
    (r: number, i: number) => (el: HTMLDivElement | null) => {
      if (!cardRefs.current[r]) cardRefs.current[r] = [];
      cardRefs.current[r][i] = el;
    };
  const [conns, setConns] = useState<{ segs: string[]; w: number; h: number }>({
    segs: [],
    w: 0,
    h: 0,
  });
  const lastSig = useRef("");

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const compute = () => {
      const crect = content.getBoundingClientRect();
      const refs = cardRefs.current;
      const segs: string[] = [];
      // Each matchup i in round r+1 is fed by matchups 2i and 2i+1 in round r.
      for (let r = 0; r < refs.length - 1; r++) {
        const cur = refs[r];
        const nxt = refs[r + 1];
        if (!cur || !nxt) continue;
        for (let i = 0; i < nxt.length; i++) {
          const A = cur[2 * i];
          const B = cur[2 * i + 1];
          const T = nxt[i];
          if (!A || !B || !T) continue;
          const a = A.getBoundingClientRect();
          const b = B.getBoundingClientRect();
          const t = T.getBoundingClientRect();
          const ay = Math.round(a.top - crect.top + a.height / 2);
          const by = Math.round(b.top - crect.top + b.height / 2);
          const ty = Math.round(t.top - crect.top + t.height / 2);
          const ax = Math.round(a.right - crect.left);
          const bx = Math.round(b.right - crect.left);
          const tx = Math.round(t.left - crect.left);
          const midX = Math.round((Math.max(ax, bx) + tx) / 2);
          segs.push(`M${ax},${ay} H${midX}`); // stub out of top source
          segs.push(`M${bx},${by} H${midX}`); // stub out of bottom source
          segs.push(`M${midX},${ay} V${by}`); // vertical join
          segs.push(`M${midX},${ty} H${tx}`); // stub into target
        }
      }
      const w = content.offsetWidth;
      const h = content.offsetHeight;
      // Only update when the lines actually change — breaks the RO feedback loop.
      const sig = `${w}x${h}|${segs.join("|")}`;
      if (sig === lastSig.current) return;
      lastSig.current = sig;
      setConns({ segs, w, h });
    };

    let raf = 0;
    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    };
    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(content);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [resolved, mounted]);

  return (
    <div>
      {/* legend */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-ink-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-emerald-600/60 bg-emerald-600/40" />
          Result (played)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-dashed border-ink-500 bg-ink-500/80" />
          Predicted
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-accent-gold/60 bg-accent-gold/25" />
          Your pick
        </span>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex rounded-lg border border-ink-700 p-0.5 text-sm"
          role="group"
          aria-label="Bracket source"
        >
          <button
            type="button"
            onClick={() => setMode("model")}
            aria-pressed={mode === "model"}
            className={`rounded-md px-3 py-1 font-medium transition ${
              mode === "model" ? "bg-ink-700 text-white" : "text-ink-400"
            }`}
          >
            🤖 Model
          </button>
          <button
            type="button"
            onClick={() => setMode("you")}
            aria-pressed={mode === "you"}
            className={`rounded-md px-3 py-1 font-medium transition ${
              mode === "you" ? "bg-ink-700 text-white" : "text-ink-400"
            }`}
          >
            ✍️ Your picks
          </button>
        </div>

        <div className="flex items-center gap-3">
          {champion && (
            <div className="flex items-center gap-2 rounded-lg bg-accent-gold/10 px-3 py-1.5 text-sm">
              <span aria-hidden>🏆</span>
              <TeamFlag flag={champion.flag} alt={champion.name} size={18} decorative />
              <span className="font-semibold">{champion.name}</span>
            </div>
          )}
          {mode === "you" && overrideCount > 0 && (
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-ink-700 px-3 py-1.5 text-sm text-ink-400 transition hover:text-slate-200"
            >
              Reset ({overrideCount})
            </button>
          )}
        </div>
      </div>

      <p className="mb-4 text-xs text-ink-400">
        {playedCount > 0
          ? "Played knockout matches show the real result (green); the rest is predicted."
          : "No knockout matches have been played yet — every tie below is a prediction."}{" "}
        {mode === "you" &&
          "Tap any unplayed team to send them through; your picks recompute the rounds ahead and are saved on this device."}
      </p>

      {/* horizontal scroller with a right-edge fade cue for later rounds */}
      <div className="relative">
        <div className="scroll-slim overflow-x-auto pb-4">
          <div ref={contentRef} className="relative flex gap-6">
            {/* connector lines, drawn behind the cards */}
            <svg
              className="pointer-events-none absolute left-0 top-0 z-0 text-ink-500"
              width={conns.w}
              height={conns.h}
              aria-hidden
            >
              {conns.segs.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeOpacity={0.7}
                />
              ))}
            </svg>
            {resolved.rounds.map((round, ri) => (
              <div
                key={ri}
                className="relative z-10 flex flex-col"
                role="group"
                aria-label={round[0]?.round}
              >
                <h3 className="mb-3 whitespace-nowrap text-center text-[11px] font-semibold uppercase tracking-wide text-ink-300">
                  {round[0]?.round}
                </h3>
                <div className="flex flex-1 flex-col justify-around gap-3">
                  {round.map((m, mi) => (
                    <div key={m.id} ref={setCardRef(ri, mi)}>
                      <MatchupCard
                        m={m}
                        override={overrides[m.id]}
                        result={playedNodes[m.id] ?? null}
                        interactive={mode === "you"}
                        isFinal={ri === lastRound}
                        onPick={(teamId) => mode === "you" && pick(m.id, teamId)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-ink-900 to-transparent"
          aria-hidden
        />
      </div>
    </div>
  );
}
