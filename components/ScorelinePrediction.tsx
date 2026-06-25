import type { Team } from "@/lib/types";
import type { ScorelinePrediction as ScorelinePredictionResult } from "@/lib/prediction";
import { bttsProb, overProb } from "@/lib/scoreline";
import { TeamFlag } from "@/components/ui/TeamFlag";

const pct = (p: number) => Math.round(p * 100);

/**
 * Server component: the model's exact-score forecast for an upcoming fixture —
 * the most likely scoreline, the top few scorelines, and a couple of derived
 * markets. Deliberately probabilistic: exact scores are noisy, so every score is
 * shown with its probability and never as a bare prediction.
 */
export function ScorelinePrediction({
  prediction,
  home,
  away,
  decisive = false,
  prematch = false,
}: {
  prediction: ScorelinePredictionResult;
  home: Team;
  away: Team;
  /** Knockout tie: no draw, so skip the 3-way bar (the header shows the 2-way win
   *  prob) and the regulation-time over/under + BTTS markets. */
  decisive?: boolean;
  /** The match is already live/finished, so this is the forecast made *before*
   *  kickoff (shown next to the real score) — label it as such. */
  prematch?: boolean;
}) {
  const { mostLikely, top, grid, outcome } = prediction;
  const over25 = pct(overProb(grid, 2.5));
  const btts = pct(bttsProb(grid));
  // Sum the *displayed* rounded values so the note matches the rows above it.
  const topCombined = top.reduce((sum, c) => sum + pct(c.p), 0);

  return (
    <section className="card mb-6 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-sm font-bold">
          {prematch ? "Pre-match predicted scoreline" : "Predicted scoreline"}
        </h2>
        <span className="rounded-full bg-accent-gold/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">
          {prematch ? "Pre-match estimate" : "Model estimate"}
        </span>
      </div>

      <div className="mb-5 text-center">
        <div className="flex items-center justify-center gap-3">
          <TeamFlag flag={home.flag} alt={home.name} size={24} decorative />
          <span
            className="font-display text-4xl font-extrabold tabular-nums text-amber-300"
            aria-label={`Most likely score: ${home.name} ${mostLikely.hg}, ${away.name} ${mostLikely.ag}, ${pct(mostLikely.p)} percent`}
          >
            {mostLikely.hg}–{mostLikely.ag}
          </span>
          <TeamFlag flag={away.flag} alt={away.name} size={24} decorative />
        </div>
        <p className="mt-1.5 text-[11px] uppercase tracking-wide text-ink-400 tabular-nums">
          most likely · {pct(mostLikely.p)}%
        </p>
      </div>

      {/* Three-way outcome — gives the draw the context a draw modal score needs.
          Green/grey/ember split = home / draw / away (the header shows the 2-way
          "if decisive" win prob; this is the full home/draw/away picture). Skipped
          for knockouts, which have no draw. */}
      {!decisive && (
        <>
          <div
            role="img"
            aria-label={`Outcome probability: ${home.name} ${pct(outcome.home)} percent, draw ${pct(outcome.draw)} percent, ${away.name} ${pct(outcome.away)} percent`}
            className="flex h-1.5 overflow-hidden rounded-full bg-ink-700"
          >
            <div className="bg-pitch-500/70" style={{ width: `${outcome.home * 100}%` }} />
            <div className="bg-ink-500" style={{ width: `${outcome.draw * 100}%` }} />
            <div className="bg-accent-ember/70" style={{ width: `${outcome.away * 100}%` }} />
          </div>
          <div className="mb-5 mt-1 flex items-center justify-between text-[10px] text-ink-400 tabular-nums">
            <span>
              {home.code} {pct(outcome.home)}%
            </span>
            <span>Draw {pct(outcome.draw)}%</span>
            <span>
              {away.code} {pct(outcome.away)}%
            </span>
          </div>
        </>
      )}

      <h3 className="mb-1.5 text-[11px] uppercase tracking-wide text-ink-400">
        {decisive ? "Most likely decisive scores" : "Most likely scores"}
      </h3>
      <ul className="space-y-1">
        {top.map((c) => (
          <li key={`${c.hg}-${c.ag}`} className="flex items-center gap-3 text-sm">
            <span className="w-10 font-display font-bold tabular-nums">
              {c.hg}–{c.ag}
            </span>
            <span
              aria-hidden
              className="h-1 flex-1 overflow-hidden rounded-full bg-ink-700"
            >
              <span
                className="block h-full rounded-full bg-accent-gold/60"
                style={{ width: `${Math.min(c.p / mostLikely.p, 1) * 100}%` }}
              />
            </span>
            <span className="w-9 text-right tabular-nums text-ink-300">
              {pct(c.p)}%
            </span>
          </li>
        ))}
      </ul>

      {!decisive && (
        <div className="mt-4 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-lg bg-ink-700/60 px-2 py-1.5">
            <div className="font-display text-sm font-bold tabular-nums">{over25}%</div>
            <div className="text-[10px] uppercase tracking-wide text-ink-400">
              Over 2.5
            </div>
          </div>
          <div className="rounded-lg bg-ink-700/60 px-2 py-1.5">
            <div className="font-display text-sm font-bold tabular-nums">{btts}%</div>
            <div className="text-[10px] uppercase tracking-wide text-ink-400">
              Both teams score
            </div>
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] leading-snug text-ink-400">
        {prematch ? "The model's forecast from before kickoff, estimated from team ratings." : "Estimated from team ratings."}{decisive ? " Knockout ties are settled in extra time or on penalties, so only decisive scores are shown." : ""} Exact scores are noisy — even the
        likeliest result is unlikely on its own; these top three together come to {topCombined}%.
      </p>
    </section>
  );
}
