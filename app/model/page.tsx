import Link from "next/link";
import {
  getRawFixtures,
  getGroups,
  getDataStatus,
  getPreTournamentOdds,
} from "@/lib/data";
import { gradeOutcomes, gradeQualification } from "@/lib/modelreport";
import { SampleDataBanner } from "@/components/ui/SampleDataBanner";
import { TeamFlag } from "@/components/ui/TeamFlag";
import { CalibrationChart } from "@/components/CalibrationChart";

export const dynamic = "force-dynamic";

export const metadata = { title: "Model report card" };

const pct = (p: number) => `${(p * 100).toFixed(0)}%`;
const num3 = (x: number) => x.toFixed(3);
const shortStage = (s: string): string =>
  s === "Group Stage" ? "Group"
  : /Round of 32/i.test(s) ? "R32"
  : /Round of 16/i.test(s) ? "R16"
  : /Quarter/i.test(s) ? "QF"
  : /Semi/i.test(s) ? "SF"
  : /third/i.test(s) ? "3rd"
  : /Final/i.test(s) ? "Final"
  : s;

export default async function ModelPage() {
  const [fixtures, groups, { usingSample }, preOdds] = await Promise.all([
    getRawFixtures(),
    getGroups(),
    getDataStatus(),
    // Cached from-seeds simulation, reused for both the qualification grade
    // (escapeGroup) and the title favourites (top 5 by championship probability).
    getPreTournamentOdds(),
  ]);
  const report = gradeOutcomes(fixtures);
  const qual = gradeQualification(fixtures, groups, preOdds);
  const favourites = preOdds.slice(0, 5);

  const ko = report.knockout;
  // Per-game skill across both tasks, each against its own no-skill baseline
  // (group ln 3, knockout ln 2) — one honest headline number.
  const edge = report.totalN
    ? ((report.baselineLogLoss - report.logLoss) * report.n +
        (ko.baselineLogLoss - ko.logLoss) * ko.n) /
      report.totalN
    : 0;
  // Every graded game, chronological, for the combined match-history table.
  const allMatches = [...report.perMatch, ...ko.perMatch].sort(
    (a, b) => Date.parse(a.date) - Date.parse(b.date),
  );

  return (
    <div className="animate-fade-up">
      <SampleDataBanner />
      <h1 className="mb-1 font-display text-2xl font-extrabold">
        Model report card
      </h1>
      <p className="mb-6 max-w-2xl text-sm text-ink-400">
        How Mondial’s prediction model is doing against{" "}
        {usingSample ? "sample 2026 fixtures" : "the real 2026 results"} — every
        call is scored from what the model knew <em>before</em> each match.
        {usingSample ? (
          <em className="text-ink-500">
            {" "}
            (The live results feed is unavailable, so these grades run on sample
            fixtures.)
          </em>
        ) : null}{" "}
        <Link
          href="/methodology"
          className="font-medium text-accent-gold hover:underline"
        >
          How the model works →
        </Link>
      </p>

      {/* ── Plain headline ─────────────────────────────────────────────── */}
      {report.totalN === 0 ? (
        <div className="card mb-6 p-5">
          <p className="text-sm text-ink-300">
            No results scored yet — the model’s calls will be graded here as
            matches finish.
          </p>
        </div>
      ) : (
        <div className="card mb-6 p-5">
          <p className="text-lg font-semibold text-white">
            Called{" "}
            <span className="font-display tabular-nums">
              {report.totalHits} of {report.totalN}
            </span>{" "}
            results, group stage to the final
          </p>
          <p className="mt-1 text-sm text-ink-300">
            <span className="tabular-nums">
              {report.hits}/{report.n}
            </span>{" "}
            group
            {ko.n > 0 ? (
              <>
                {" · "}
                <span className="tabular-nums">
                  {ko.hits}/{ko.n}
                </span>{" "}
                knockout
              </>
            ) : null}
            {" — "}
            {edge >= 0 ? (
              <>
                beating a blind guess by{" "}
                <span className="font-semibold text-pitch-500">{num3(edge)}</span>{" "}
                log-loss.
              </>
            ) : (
              <>
                trailing a blind guess by{" "}
                <span className="font-semibold text-accent-ember">
                  {num3(Math.abs(edge))}
                </span>{" "}
                log-loss.
              </>
            )}
          </p>
        </div>
      )}

      {/* ── Group-stage accuracy (3-way W/D/L) ─────────────────────────── */}
      {report.n > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 font-display text-lg font-bold">
            Group stage — win / draw / loss
          </h2>
          <p className="mb-1 text-sm text-ink-400">
            log-loss{" "}
            <span className="font-display font-semibold tabular-nums text-white">
              {num3(report.logLoss)}
            </span>{" "}
            vs {num3(report.baselineLogLoss)} baseline · Brier{" "}
            <span className="font-display font-semibold tabular-nums text-white">
              {num3(report.brier)}
            </span>{" "}
            · lower is better.
          </p>
          <p className="mb-4 max-w-2xl text-xs text-ink-400">
            Log-loss and Brier both reward being confident <em>and</em> right
            and punish being confident and wrong — lower scores mean sharper,
            better-calibrated calls. The baseline is a no-skill three-way guess
            from the base rates (ln 3).
          </p>

          <h3 className="mb-1 text-sm font-semibold text-ink-300">Reliability</h3>
          <p className="mb-2 max-w-2xl text-xs text-ink-400">
            When the model says 70%, those teams should win about 70% of the
            time. Compare <strong>Predicted</strong> against{" "}
            <strong>Observed</strong> in each band — the closer they track, the
            better-calibrated the model.
          </p>
          {/* Reliability diagram — are 70%-calls right ~70% of the time? */}
          <CalibrationChart reliability={report.reliability} perMatch={report.perMatch} />
        </section>
      )}

      {/* ── Knockout accuracy (advance calls, binary) ──────────────────── */}
      {ko.n > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 font-display text-lg font-bold">
            Knockouts — who wins
          </h2>
          <p className="mb-1 text-sm text-ink-400">
            log-loss{" "}
            <span className="font-display font-semibold tabular-nums text-white">
              {num3(ko.logLoss)}
            </span>{" "}
            vs {num3(ko.baselineLogLoss)} baseline · Brier{" "}
            <span className="font-display font-semibold tabular-nums text-white">
              {num3(ko.brier)}
            </span>{" "}
            · lower is better.
          </p>
          <p className="mb-4 max-w-2xl text-xs text-ink-400">
            Knockout matches are decisive — extra time and penalties included —
            so each is graded on <em>which side won</em>, a two-way call. The
            no-skill baseline is a coin flip (ln 2 ≈ 0.69), not the three-way
            ln 3 above.
          </p>
          <h3 className="mb-1 text-sm font-semibold text-ink-300">Reliability</h3>
          <CalibrationChart reliability={ko.reliability} perMatch={ko.perMatch} />
        </section>
      )}

      {/* ── Match history (every game, stage-tagged) ───────────────────── */}
      {report.totalN > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 font-display text-lg font-bold">Match history</h2>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-left text-ink-400">
                  <th className="px-4 py-2 font-medium">Stage</th>
                  <th className="px-4 py-2 font-medium">Match</th>
                  <th className="px-4 py-2 text-center font-medium">Score</th>
                  <th className="px-4 py-2 text-right font-medium">Home</th>
                  <th className="px-4 py-2 text-right font-medium">Draw</th>
                  <th className="px-4 py-2 text-right font-medium">Away</th>
                  <th className="px-4 py-2 text-center font-medium">Call</th>
                </tr>
              </thead>
              <tbody>
                {allMatches.map((m, i) => {
                  const isKo = m.stage !== "Group Stage";
                  // Highlight what actually happened (emerald = result) and, when
                  // it differs, the model's most-likely call (grey = prediction).
                  // For knockouts there's no draw, so the favourite is home/away.
                  const fav = (["home", "draw", "away"] as const).reduce(
                    (mx, k) => (m.predicted[k] > m.predicted[mx] ? k : mx),
                    "home" as "home" | "draw" | "away",
                  );
                  const cellCls = (key: "home" | "draw" | "away") =>
                    `px-4 py-2 text-right tabular-nums ${
                      m.actual === key
                        ? "font-semibold text-emerald-400"
                        : fav === key
                          ? "font-semibold text-ink-100"
                          : "text-ink-300"
                    }`;
                  return (
                    <tr
                      key={`${m.date}-${m.home}-${m.away}-${i}`}
                      className="border-b border-ink-700/50 last:border-0"
                    >
                      <td className="px-4 py-2">
                        <span className="rounded bg-ink-700/70 px-1.5 py-0.5 text-[10px] font-semibold text-ink-300">
                          {shortStage(m.stage)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-white">
                        {m.home} <span className="text-ink-400">v</span> {m.away}
                      </td>
                      <td className="px-4 py-2 text-center font-display tabular-nums text-ink-300">
                        {m.homeGoals}–{m.awayGoals}
                        {m.shootout ? (
                          <span className="text-[11px] font-semibold text-ink-400">
                            {" "}
                            ({m.shootout.home}–{m.shootout.away} pens)
                          </span>
                        ) : null}
                      </td>
                      <td className={cellCls("home")}>{pct(m.predicted.home)}</td>
                      {isKo ? (
                        <td className="px-4 py-2 text-right text-ink-600">—</td>
                      ) : (
                        <td className={cellCls("draw")}>{pct(m.predicted.draw)}</td>
                      )}
                      <td className={cellCls("away")}>{pct(m.predicted.away)}</td>
                      <td className="px-4 py-2 text-center">
                        <span
                          className={
                            m.correct ? "text-pitch-500" : "text-accent-ember"
                          }
                          aria-hidden
                        >
                          {m.correct ? "✓" : "✗"}
                        </span>
                        <span className="sr-only">
                          {m.correct ? "Correct call" : "Wrong call"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 max-w-2xl text-xs text-ink-400">
            Knockout matches (Round of 32 onward) are graded on which side won
            the tie — penalties included — so Home / Away are the model&rsquo;s
            two-way advance probabilities, not win / draw / loss. A shootout is
            rated a <strong>draw</strong>{" "}for team strength (penalties
            don&rsquo;t measure quality), so a side can win the tie without its
            rating rising.
          </p>
        </section>
      )}

      {/* ── Qualification (Tier B) ─────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-1 font-display text-lg font-bold">Qualification</h2>
        {qual.groupsComplete > 0 ? (
          <>
            <p className="mb-4 text-sm text-ink-400">
              Brier{" "}
              <span className="font-display font-semibold tabular-nums text-white">
                {num3(qual.brier)}
              </span>{" "}
              over {qual.n} determined team{qual.n === 1 ? "" : "s"} (
              {qual.groupsComplete} group
              {qual.groupsComplete === 1 ? "" : "s"} complete).
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="card p-4">
                <h3 className="mb-3 text-sm font-semibold text-pitch-500">
                  Notable hits
                </h3>
                {qual.notableHits.length ? (
                  <ul className="space-y-2 text-sm">
                    {qual.notableHits.map((m) => (
                      <li
                        key={m.team}
                        className="flex items-center justify-between"
                      >
                        <span className="text-white">{m.team}</span>
                        <span className="tabular-nums text-ink-400">
                          {pct(m.predicted)} ·{" "}
                          {m.advanced ? "advanced" : "out"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-ink-400">None yet.</p>
                )}
              </div>
              <div className="card p-4">
                <h3 className="mb-3 text-sm font-semibold text-accent-ember">
                  Notable misses
                </h3>
                {qual.notableMisses.length ? (
                  <ul className="space-y-2 text-sm">
                    {qual.notableMisses.map((m) => (
                      <li
                        key={m.team}
                        className="flex items-center justify-between"
                      >
                        <span className="text-white">{m.team}</span>
                        <span className="tabular-nums text-ink-400">
                          {pct(m.predicted)} ·{" "}
                          {m.advanced ? "advanced" : "out"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-ink-400">None yet.</p>
                )}
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-ink-400">
            Qualification scoring unlocks as groups finish.
          </p>
        )}
      </section>

      {/* ── Title (Tier C) ─────────────────────────────────────────────── */}
      {favourites.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 font-display text-lg font-bold">Title race</h2>
          <p className="mb-4 text-sm text-ink-400">
            The model’s pre-tournament favourites — champion odds from a
            from-seeds simulation, before a ball was kicked.
          </p>
          <div className="card overflow-hidden">
            <ol>
              {favourites.map((o, i) => (
                <li
                  key={o.team.id}
                  className="flex items-center justify-between border-b border-ink-700/50 px-4 py-2.5 text-sm last:border-0"
                >
                  <span className="flex items-center gap-3">
                    <span className="w-4 text-right tabular-nums text-ink-400">
                      {i + 1}
                    </span>
                    <TeamFlag flag={o.team.flag} alt={o.team.name} size={20} decorative />
                    <span className="text-white">{o.team.name}</span>
                  </span>
                  <span className="tabular-nums font-semibold text-accent-gold">
                    {pct(o.champion)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {/* ── Sample-size caveat ─────────────────────────────────────────── */}
      {report.n < 16 && (
        <div className="card border-accent-gold/30 bg-accent-gold/5 p-4">
          <p className="text-sm text-ink-300">
            <span className="font-semibold text-accent-gold">
              Small sample.
            </span>{" "}
            Only {report.n} match{report.n === 1 ? "" : "es"} scored so far —
            these numbers are noisy and will settle as the tournament
            progresses.
          </p>
        </div>
      )}
    </div>
  );
}
