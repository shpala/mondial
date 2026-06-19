import Link from "next/link";
import { getRawFixtures, getGroups } from "@/lib/data";
import { gradeOutcomes, gradeQualification } from "@/lib/modelreport";
import { simulateTournament } from "@/lib/montecarlo";
import { SampleDataBanner } from "@/components/ui/SampleDataBanner";
import { TeamFlag } from "@/components/ui/TeamFlag";

export const dynamic = "force-dynamic";

export const metadata = { title: "Model report card" };

const pct = (p: number) => `${(p * 100).toFixed(0)}%`;
const num3 = (x: number) => x.toFixed(3);

export default async function ModelPage() {
  const [fixtures, groups] = await Promise.all([getRawFixtures(), getGroups()]);
  const report = gradeOutcomes(fixtures);

  // Pre-tournament odds: strip all group results back to seeds and simulate the
  // whole tournament ONCE. Reused for both the qualification grade (escapeGroup)
  // and the title favourites (top 5 by championship probability).
  const stripped = fixtures
    .filter((f) => f.stage === "Group Stage")
    .map((f) => ({
      ...f,
      status: "scheduled" as const,
      homeGoals: null,
      awayGoals: null,
    }));
  const preOdds = stripped.length ? simulateTournament(stripped) : [];
  const qual = gradeQualification(fixtures, groups, preOdds);
  const favourites = preOdds.slice(0, 5);

  const edge = report.baselineLogLoss - report.logLoss; // >0 = beats a coin flip

  return (
    <div className="animate-fade-up">
      <SampleDataBanner />
      <h1 className="mb-1 font-display text-2xl font-extrabold">
        Model report card
      </h1>
      <p className="mb-6 max-w-2xl text-sm text-ink-400">
        How Mondial’s prediction model is doing against the real 2026 results —
        every call is scored from what the model knew <em>before</em> each match.{" "}
        <Link
          href="/methodology"
          className="font-medium text-accent-gold hover:underline"
        >
          How the model works →
        </Link>
      </p>

      {/* ── Plain headline ─────────────────────────────────────────────── */}
      {report.n === 0 ? (
        <div className="card mb-6 p-5">
          <p className="text-sm text-ink-300">
            No results scored yet — the model’s calls will be graded here as
            group-stage matches finish.
          </p>
        </div>
      ) : (
        <div className="card mb-6 p-5">
          <p className="text-lg font-semibold text-white">
            Called {report.hits} of {report.n} group results
          </p>
          <p className="mt-1 text-sm text-ink-300">
            {edge >= 0 ? (
              <>
                Beating a blind guess by{" "}
                <span className="font-semibold text-pitch-500">
                  {num3(edge)}
                </span>{" "}
                log-loss.
              </>
            ) : (
              <>
                Trailing a blind guess by{" "}
                <span className="font-semibold text-accent-ember">
                  {num3(Math.abs(edge))}
                </span>{" "}
                log-loss.
              </>
            )}
          </p>
        </div>
      )}

      {/* ── Outcome rigour ─────────────────────────────────────────────── */}
      {report.n > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 font-display text-lg font-bold">
            Outcome rigour
          </h2>
          <p className="mb-1 text-sm text-ink-400">
            log-loss{" "}
            <span className="font-semibold text-white">
              {num3(report.logLoss)}
            </span>{" "}
            vs {num3(report.baselineLogLoss)} baseline · Brier{" "}
            <span className="font-semibold text-white">
              {num3(report.brier)}
            </span>{" "}
            · lower is better.
          </p>
          <p className="mb-4 max-w-2xl text-xs text-ink-400">
            Log-loss and Brier both reward being confident <em>and</em> right
            and punish being confident and wrong — lower scores mean sharper,
            better-calibrated calls. The baseline is a no-skill guess from the
            base rates.
          </p>

          <h3 className="mb-1 text-sm font-semibold text-ink-300">Reliability</h3>
          <p className="mb-2 max-w-2xl text-xs text-ink-400">
            When the model says 70%, those teams should win about 70% of the
            time. Compare <strong>Predicted</strong> against{" "}
            <strong>Observed</strong> in each band — the closer they track, the
            better-calibrated the model.
          </p>
          {/* Reliability — are 70%-calls right ~70% of the time? */}
          <div className="card mb-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-left text-ink-400">
                  <th className="px-4 py-2 font-medium">Bucket</th>
                  <th className="px-4 py-2 text-right font-medium">Predicted</th>
                  <th className="px-4 py-2 text-right font-medium">Observed</th>
                  <th className="px-4 py-2 text-right font-medium">n</th>
                </tr>
              </thead>
              <tbody>
                {report.reliability.map((r) => (
                  <tr
                    key={r.bucket}
                    className="border-b border-ink-700/50 last:border-0"
                  >
                    <td className="px-4 py-2 text-ink-300">
                      {r.bucket * 10}–{r.bucket * 10 + 10}%
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink-300">
                      {pct(r.predicted)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-white">
                      {pct(r.observed)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink-400">
                      {r.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Per-match history */}
          <h3 className="mb-2 text-sm font-semibold text-ink-300">
            Match history
          </h3>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-left text-ink-400">
                  <th className="px-4 py-2 font-medium">Match</th>
                  <th className="px-4 py-2 text-center font-medium">Score</th>
                  <th className="px-4 py-2 text-right font-medium">Home</th>
                  <th className="px-4 py-2 text-right font-medium">Draw</th>
                  <th className="px-4 py-2 text-right font-medium">Away</th>
                  <th className="px-4 py-2 text-center font-medium">Call</th>
                </tr>
              </thead>
              <tbody>
                {report.perMatch.map((m, i) => (
                  <tr
                    key={`${m.date}-${m.home}-${m.away}-${i}`}
                    className="border-b border-ink-700/50 last:border-0"
                  >
                    <td className="px-4 py-2 text-white">
                      {m.home} <span className="text-ink-400">v</span> {m.away}
                    </td>
                    <td className="px-4 py-2 text-center tabular-nums text-ink-300">
                      {m.homeGoals}–{m.awayGoals}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink-300">
                      {pct(m.predicted.home)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink-300">
                      {pct(m.predicted.draw)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink-300">
                      {pct(m.predicted.away)}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {m.correct ? (
                        <span className="text-pitch-500">✓</span>
                      ) : (
                        <span className="text-accent-ember">✗</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Qualification (Tier B) ─────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-1 font-display text-lg font-bold">Qualification</h2>
        {qual.groupsComplete > 0 ? (
          <>
            <p className="mb-4 text-sm text-ink-400">
              Brier{" "}
              <span className="font-semibold text-white">
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
