"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Team } from "@/lib/types";
import {
  resolveBracket,
  winnerProb,
  type Bracket,
  type Matchup,
} from "@/lib/prediction";
import { bracketStorageOk, useBracketStore } from "@/store/bracket";
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

// Short labels for the phone round pager (one per round, R32 → Final).
const SHORT_ROUNDS = ["R32", "R16", "QF", "SF", "Final"];

// Stable empty-overrides reference for model mode / pre-hydration, so the resolve
// memo and the connector-measuring effect don't re-run on every unrelated render.
const NO_OVERRIDES: Record<string, number> = {};

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
  compact = false,
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
  compact?: boolean;
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
      : isWinner && winnerTone === "model" && prob != null
        ? `, ${Math.round(prob * 100)} percent model win probability`
        : "";
  const label = clickable
    ? `${team.name}, ${stateWord}${metric}, activate to pick as winner`
    : `${team.name}, ${stateWord}${metric}`;
  const className = `flex h-11 w-full items-center text-left transition sm:h-9 ${
    compact ? "gap-1 px-1.5 sm:gap-1.5 sm:px-2" : "gap-1.5 px-2"
  } ${
    clickable
      ? "cursor-pointer hover:bg-ink-700/60 active:bg-ink-600"
      : "cursor-default"
  } ${isWinner ? WINNER_CLASS[winnerTone] : dimmed ? "text-ink-400" : ""}`;

  const content = (
    <>
      <TeamFlag flag={team.flag} alt={team.name} size={16} decorative />
      {/* team code is always 2-3 chars — never truncate it */}
      <span className="shrink-0 text-xs">{team.code}</span>
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
    </>
  );

  // Only a pickable slot is a <button>. Played ties are wrapped in a <Link>, so
  // a nested <button> there would be invalid HTML (a double tab stop, broken
  // activation); model-mode slots aren't actionable either. Render those static.
  if (!clickable) {
    return (
      <div className={className} aria-label={label} title={team.name}>
        {content}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={label}
      title={team.name}
      className={className}
    >
      {content}
    </button>
  );
}

function MatchupCard({
  m,
  override,
  result,
  interactive,
  isFinal,
  fullWidth = false,
  onPick,
}: {
  m: Matchup;
  override: number | undefined;
  result: PlayedResult | null;
  interactive: boolean;
  isFinal: boolean;
  fullWidth?: boolean;
  onPick: (teamId: number) => void;
}) {
  const wp = winnerProb(m);
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

  const winnerIsTop = m.winnerId != null && m.winnerId === m.top?.id;
  // Number shown next to the winner: a user pick is decided (100%) in your
  // bracket; a model winner shows the model's head-to-head probability.
  const displayProb = winnerTone === "pick" ? 1 : wp;
  // Probability bar fills from the WINNER's side so it never contradicts the pick.
  const winnerPct =
    winnerTone === "model" ? (wp != null ? Math.round(wp * 100) : 50) : 100;
  const barColor =
    winnerTone === "result"
      ? "bg-emerald-500/70"
      : winnerTone === "pick"
        ? "bg-accent-gold/70"
        : "bg-pitch-500/70";
  const showBar = m.winnerId != null && m.top != null && m.bottom != null;

  const border = played
    ? "border-emerald-600/60"
    : isOverridden
      ? "border-accent-gold/60"
      : "border-dashed border-ink-600";

  const widthCls = fullWidth
    ? "w-full"
    : isFinal
      ? "w-32 sm:w-40 md:w-44"
      : "w-28 sm:w-32 md:w-36";
  const finalRing =
    isFinal && !fullWidth ? "ring-1 ring-accent-gold/50 shadow-lg shadow-black/40" : "";

  const card = (
    <div
      className={`relative overflow-hidden rounded-lg border bg-ink-800 ${border} ${widthCls} ${finalRing}`}
    >
      {played && (
        <span
          className="absolute right-1 top-1 z-10 text-[10px] leading-none text-emerald-400/90"
          aria-hidden
        >
          ↗
        </span>
      )}
      <Slot
        team={m.top}
        isWinner={m.winnerId != null && m.winnerId === m.top?.id}
        winnerTone={winnerTone}
        prob={m.winnerId === m.top?.id ? displayProb : null}
        score={topScore}
        dimmed={m.winnerId != null && m.winnerId !== m.top?.id}
        locked={played}
        interactive={interactive}
        compact={!fullWidth}
        onPick={() => m.top && onPick(m.top.id)}
      />
      <div className="relative h-1.5 bg-ink-700">
        {showBar && (
          <div
            className={`absolute inset-y-0 ${winnerIsTop ? "left-0" : "right-0"} ${barColor}`}
            style={{ width: `${winnerPct}%` }}
            aria-hidden
          />
        )}
      </div>
      <Slot
        team={m.bottom}
        isWinner={m.winnerId != null && m.winnerId === m.bottom?.id}
        winnerTone={winnerTone}
        prob={m.winnerId === m.bottom?.id ? displayProb : null}
        score={bottomScore}
        dimmed={m.winnerId != null && m.winnerId !== m.bottom?.id}
        locked={played}
        interactive={interactive}
        compact={!fullWidth}
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
  skeleton,
  results = {},
}: {
  skeleton: Bracket;
  results?: ResultMap;
}) {
  const { overrides, pick, reset, undoReset } = useBracketStore();
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<"you" | "model">("you");
  const [undoToast, setUndoToast] = useState(false); // transient "cleared · undo"
  const [restored, setRestored] = useState(0); // transient "restored N picks" note
  const [selectedRound, setSelectedRound] = useState(0); // phone round pager
  // Default phones to the full connector tree (it scrolls horizontally, with a
  // right-edge fade cueing the pan); the one-round "Rounds" pager stays a tap away
  // for anyone who prefers it.
  const [mobileView, setMobileView] = useState<"tree" | "rounds">("tree");

  // On mount, acknowledge any picks restored from localStorage (the bracket
  // re-resolves into them once `mounted` flips — see the fade below).
  useEffect(() => {
    // Hydration flag: SSR renders the model baseline, the client flips to saved
    // picks after mount (avoids an SSR/client mismatch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    const n = Object.keys(useBracketStore.getState().overrides).length;
    if (n === 0) return;
    setRestored(n);
    const id = setTimeout(() => setRestored(0), 5000);
    return () => clearTimeout(id);
  }, []);

  // Auto-dismiss the "Bracket cleared · Undo" toast a few seconds after a reset.
  useEffect(() => {
    if (!undoToast) return;
    const id = setTimeout(() => setUndoToast(false), 6000);
    return () => clearTimeout(id);
  }, [undoToast]);

  const effectiveOverrides = mode === "you" && mounted ? overrides : NO_OVERRIDES;

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

  // Team lookup for the champion badge, drawn from the placed R32 field.
  const teamsById = useMemo(() => {
    const m = new Map<number, Team>();
    for (const mt of skeleton.rounds[0]) {
      if (mt.top) m.set(mt.top.id, mt.top);
      if (mt.bottom) m.set(mt.bottom.id, mt.bottom);
    }
    return m;
  }, [skeleton]);
  const champion =
    resolved.championId != null
      ? teamsById.get(resolved.championId) ?? null
      : null;

  const overrideCount = Object.keys(overrides).length;
  const playedCount = Object.keys(playedNodes).length;
  const lastRound = resolved.rounds.length - 1;

  // --- SVG connector lines between rounds (measured from the laid-out cards) ---
  const contentRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[][]>([]);
  // Round-pager buttons, for roving-tabindex arrow-key navigation.
  const roundTabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const setCardRef =
    (r: number, i: number) => (el: HTMLDivElement | null) => {
      if (!cardRefs.current[r]) cardRefs.current[r] = [];
      cardRefs.current[r][i] = el;
    };
  // A connector segment carries the model's flow: stroke class (emerald=played,
  // pitch=predicted, ink=structural), width and opacity scaled by confidence.
  type Conn = { d: string; cls: string; w: number; o: number };
  const [conns, setConns] = useState<{ segs: Conn[]; w: number; h: number }>({
    segs: [],
    w: 0,
    h: 0,
  });
  const lastSig = useRef("");

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    const compute = () => {
      // When the phone view is on the "Rounds" pager this tree is display:none,
      // so every rect measures 0. Bail rather than clobber good lines with a
      // degenerate 0×0 SVG — otherwise switching back to Tree can race the
      // recompute and leave the connectors stuck invisible (mobile especially).
      if (content.scrollWidth === 0 || content.scrollHeight === 0) return;
      const crect = content.getBoundingClientRect();
      const refs = cardRefs.current;
      const segs: Conn[] = [];
      // The flow through a connector = the team that ADVANCED from a source match.
      // Colour each outgoing stub by how the model called that match.
      const NEUTRAL = { cls: "stroke-ink-600", w: 1.5, o: 1 };
      const PLAYED = { cls: "stroke-emerald-500", w: 2.6, o: 0.9 };
      const modelFlow = (p: number | null) => {
        const k = Math.max(0, Math.min(1, ((p ?? 0.5) - 0.5) / 0.5)); // 0..1 confidence
        return { cls: "stroke-pitch-500", w: 1.6 + 1.3 * k, o: 0.35 + 0.5 * k };
      };
      // Each matchup i in round r+1 is fed by matchups 2i and 2i+1 in round r.
      for (let r = 0; r < refs.length - 1; r++) {
        const cur = refs[r];
        const nxt = refs[r + 1];
        const mr = resolved.rounds[r];
        if (!cur || !nxt) continue;
        for (let i = 0; i < nxt.length; i++) {
          const A = cur[2 * i];
          const B = cur[2 * i + 1];
          const T = nxt[i];
          if (!A || !B || !T) continue;
          const a = A.getBoundingClientRect();
          const b = B.getBoundingClientRect();
          const tr = T.getBoundingClientRect();
          const ay = Math.round(a.top - crect.top + a.height / 2);
          const by = Math.round(b.top - crect.top + b.height / 2);
          const ty = Math.round(tr.top - crect.top + tr.height / 2);
          const ax = Math.round(a.right - crect.left);
          const bx = Math.round(b.right - crect.left);
          const tx = Math.round(tr.left - crect.left);
          const midX = Math.round((Math.max(ax, bx) + tx) / 2);
          const mA = mr?.[2 * i];
          const mB = mr?.[2 * i + 1];
          const sA = !mA || mA.winnerId == null ? NEUTRAL : playedNodes[mA.id] ? PLAYED : modelFlow(winnerProb(mA));
          const sB = !mB || mB.winnerId == null ? NEUTRAL : playedNodes[mB.id] ? PLAYED : modelFlow(winnerProb(mB));
          segs.push({ d: `M${ax},${ay} H${midX}`, ...sA }); // top source winner advances
          segs.push({ d: `M${bx},${by} H${midX}`, ...sB }); // bottom source winner advances
          segs.push({ d: `M${midX},${ay} V${by}`, ...NEUTRAL }); // vertical join (structural)
          segs.push({ d: `M${midX},${ty} H${tx}`, ...NEUTRAL }); // stub into target
        }
      }
      // scrollWidth/Height, not offsetWidth/Height: on a phone the tree overflows
      // the scroller, so offsetWidth is the clipped box and would cut off the
      // right-most connectors (into the Final).
      const w = content.scrollWidth;
      const h = content.scrollHeight;
      // Only update when the lines actually change — breaks the RO feedback loop.
      const sig = `${w}x${h}|${segs.map((s) => `${s.d}:${s.cls}:${s.w}:${s.o}`).join("|")}`;
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
  }, [resolved, playedNodes, mounted, mobileView]);

  // Soften the post-hydration swap: in "your picks" mode the bracket first
  // renders the model baseline, then re-resolves into saved picks once mounted.
  // A brief fade reads as "restoring" rather than a glitchy jump.
  const settle = `transition-opacity duration-300 ${
    mode === "you" && !mounted ? "opacity-60" : "opacity-100"
  }`;

  return (
    <div>
      {/* legend */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-ink-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-emerald-600/60 bg-emerald-600/40" />
          Result
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-dashed border-ink-500 bg-ink-500/80" />
          Predicted
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm border border-accent-gold/60 bg-accent-gold/25" />
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
            className={`inline-flex min-h-11 items-center justify-center rounded-md px-3 py-1 font-medium transition md:min-h-0 ${
              mode === "model" ? "bg-ink-700 text-white" : "text-ink-400"
            }`}
          >
            🤖 Model
          </button>
          <button
            type="button"
            onClick={() => setMode("you")}
            aria-pressed={mode === "you"}
            className={`inline-flex min-h-11 items-center justify-center rounded-md px-3 py-1 font-medium transition md:min-h-0 ${
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
              onClick={() => {
                reset();
                setUndoToast(true);
              }}
              className="rounded-lg border border-ink-700 px-3 py-1.5 text-sm text-ink-400 transition hover:text-ink-100"
            >
              Reset ({overrideCount})
            </button>
          )}
        </div>
      </div>

      <p className="mb-1 text-xs text-ink-400">
        {playedCount > 0
          ? "Played knockout matches show the real result (green); the rest is predicted."
          : "No knockout matches have been played yet — every tie below is a prediction."}{" "}
        {mode === "you" &&
          (bracketStorageOk()
            ? "Tap any unplayed team to send them through (tap a winner again to undo); your picks recompute the rounds ahead and are saved on this device."
            : "Tap any unplayed team to send them through (tap a winner again to undo); your picks recompute the rounds ahead but can’t be saved here (private mode?).")}
      </p>
      {mode === "you" && restored > 0 && (
        <p className="mb-4 text-xs text-pitch-500" role="status">
          Restored your {restored} saved pick{restored === 1 ? "" : "s"}.
        </p>
      )}
      {!(mode === "you" && restored > 0) && <div className="mb-4" />}

      {/* PHONE: choose the compact scrollable tree or a one-round pager */}
      <div className="mb-3 md:hidden">
        <div
          className="inline-flex rounded-lg border border-ink-700 p-0.5 text-sm"
          role="group"
          aria-label="Bracket view"
        >
          <button
            type="button"
            onClick={() => setMobileView("tree")}
            aria-pressed={mobileView === "tree"}
            className={`inline-flex min-h-11 items-center justify-center rounded-md px-3 py-1 font-medium transition ${
              mobileView === "tree" ? "bg-ink-700 text-white" : "text-ink-400"
            }`}
          >
            🌳 Tree
          </button>
          <button
            type="button"
            onClick={() => setMobileView("rounds")}
            aria-pressed={mobileView === "rounds"}
            className={`inline-flex min-h-11 items-center justify-center rounded-md px-3 py-1 font-medium transition ${
              mobileView === "rounds" ? "bg-ink-700 text-white" : "text-ink-400"
            }`}
          >
            ☰ Rounds
          </button>
        </div>
      </div>

      {/* PHONE pager (Rounds view): one round at a time, no horizontal panning */}
      <div
        className={`${settle} ${mobileView === "rounds" ? "md:hidden" : "hidden"}`}
      >
        <div className="sticky top-(--header-h) z-20 -mx-4 mb-3 bg-ink-900/90 px-4 py-2 backdrop-blur-sm">
          <div
            className="flex gap-1 rounded-lg border border-ink-700 p-0.5"
            role="group"
            aria-label="Bracket round"
          >
            {resolved.rounds.map((round, ri) => (
              <button
                key={ri}
                type="button"
                ref={(el) => {
                  roundTabRefs.current[ri] = el;
                }}
                aria-pressed={selectedRound === ri}
                // Roving tabindex: only the active round is in the tab order;
                // ArrowLeft/Right move between rounds (a panel switcher).
                tabIndex={selectedRound === ri ? 0 : -1}
                onClick={() => setSelectedRound(ri)}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                  e.preventDefault();
                  const n = resolved.rounds.length;
                  const next =
                    e.key === "ArrowRight"
                      ? (ri + 1) % n
                      : (ri - 1 + n) % n;
                  setSelectedRound(next);
                  roundTabRefs.current[next]?.focus();
                }}
                className={`min-h-11 flex-1 whitespace-nowrap rounded-md px-1 text-xs font-semibold transition ${
                  selectedRound === ri
                    ? "bg-ink-700 text-white"
                    : "text-ink-400 active:bg-ink-800"
                }`}
              >
                {SHORT_ROUNDS[ri] ?? round[0]?.round}
              </button>
            ))}
          </div>
        </div>
        <h3 className="mb-2 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-300">
          {resolved.rounds[selectedRound]?.[0]?.round}
        </h3>
        <div className="space-y-3">
          {(resolved.rounds[selectedRound] ?? []).map((m) => (
            <MatchupCard
              key={m.id}
              m={m}
              override={overrides[m.id]}
              result={playedNodes[m.id] ?? null}
              interactive={mode === "you"}
              isFinal={selectedRound === lastRound}
              fullWidth
              onPick={(teamId) => mode === "you" && pick(m.id, teamId)}
            />
          ))}
        </div>
      </div>

      {/* TREE: full horizontal connector tree (desktop always; phone in Tree view) */}
      <div
        className={`relative md:block ${settle} ${mobileView === "tree" ? "block" : "hidden"}`}
      >
        <div className="scroll-slim overflow-x-auto pb-4">
          <div ref={contentRef} className="relative flex gap-4 md:gap-6">
            {/* connector lines, drawn behind the cards */}
            <svg
              className="pointer-events-none absolute left-0 top-0 z-0 text-ink-400"
              width={conns.w}
              height={conns.h}
              aria-hidden
            >
              {conns.segs.map((s, i) => (
                <path
                  key={i}
                  d={s.d}
                  fill="none"
                  className={s.cls}
                  strokeWidth={s.w}
                  strokeOpacity={s.o}
                  strokeLinecap="round"
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
          className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-linear-to-l from-ink-900 to-transparent"
          aria-hidden
        />
      </div>

      {undoToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-0 bottom-20 z-50 mx-auto flex w-fit animate-fade-up items-center gap-3 rounded-full border border-ink-600 bg-ink-800/95 px-4 py-2 text-sm text-ink-100 shadow-lg backdrop-blur-sm md:bottom-6"
        >
          <span>Bracket cleared</span>
          <button
            type="button"
            onClick={() => {
              undoReset();
              setUndoToast(false);
            }}
            className="font-semibold text-accent-gold hover:underline"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
