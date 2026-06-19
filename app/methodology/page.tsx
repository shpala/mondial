import Link from "next/link";
import {
  DRAW_NU,
  ELO_K,
  HOST_ADVANTAGE,
  LOGISTIC_SCALE,
  WC_PREDICTION_SCALE,
} from "@/lib/model/constants";
import { GOAL_BASE, GOAL_GAMMA, GOAL_RHO } from "@/lib/scoreline";
import { winProbability } from "@/lib/prediction";

export const metadata = {
  title: "How predictions are calculated",
  description:
    "A detailed walk-through of Mondial's prediction model: Elo ratings, the win/draw/away model, exact scorelines, qualification, the knockout bracket and Monte Carlo title odds.",
};

// Static explainer — no data fetching. Numbers are read live from the model's
// single source of truth so the page can never drift from the shipped model.
export const dynamic = "force-static";

const pct = (p: number) => `${Math.round(p * 100)}%`;

/* A worked example of the win-probability curve at the two logistic scales, so
   the flattening is tangible. Computed from the shipped winProbability. */
const GAPS = [0, 50, 100, 200, 300];
const curve = GAPS.map((g) => ({
  gap: g,
  rating: winProbability(g, 0, LOGISTIC_SCALE),
  wc: winProbability(g, 0, WC_PREDICTION_SCALE),
}));

function Section({
  n,
  id,
  title,
  lead,
  children,
}: {
  n: number;
  id: string;
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-10 scroll-mt-[calc(var(--header-h)+1rem)]">
      <h2 className="mb-2 flex items-center gap-3 font-display text-xl font-bold">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-ink-700 text-sm font-extrabold text-accent-gold">
          {n}
        </span>
        {title}
      </h2>
      {lead && <p className="mb-4 max-w-2xl text-sm text-ink-400">{lead}</p>}
      <div className="space-y-3 text-sm leading-relaxed text-ink-300">
        {children}
      </div>
    </section>
  );
}

/** A labelled formula / constant callout. */
function Formula({ children }: { children: React.ReactNode }) {
  return (
    <div className="card my-3 overflow-x-auto p-4">
      <code className="block whitespace-pre font-mono text-[13px] text-ink-100">
        {children}
      </code>
    </div>
  );
}

function K({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-ink-700/70 px-1.5 py-0.5 font-mono text-[12px] text-accent-gold">
      {children}
    </span>
  );
}

const TOC = [
  ["ratings", "Team strength (Elo)"],
  ["live", "Updating after results"],
  ["winprob", "Win probability"],
  ["draws", "Draws: the group model"],
  ["scorelines", "Exact scorelines"],
  ["qualifying", "Tables & qualification"],
  ["bracket", "The knockout bracket"],
  ["odds", "Title odds (Monte Carlo)"],
  ["honesty", "Keeping ourselves honest"],
  ["data", "Where the data comes from"],
  ["caveats", "What the model can’t see"],
] as const;

export default function MethodologyPage() {
  return (
    <div className="animate-fade-up">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h1 className="font-display text-2xl font-extrabold">
          How predictions are calculated
        </h1>
        <span className="rounded-full bg-ink-700 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink-300">
          Methodology
        </span>
      </div>
      <p className="mb-6 max-w-2xl text-sm text-ink-400">
        Every win probability, scoreline, qualification chance and title odd on
        Mondial comes from one transparent statistical model — no black box, no
        hand-tuned favourites. Here is the whole pipeline, from a team&rsquo;s
        rating to the trophy lift. The constants shown below are read straight
        from the live model, so this page always matches what you see.
      </p>

      {/* Table of contents */}
      <nav aria-label="Contents" className="card mb-8 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
          On this page
        </p>
        <ol className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {TOC.map(([id, label], i) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="text-ink-300 transition hover:text-accent-gold"
              >
                <span className="mr-2 font-mono text-xs text-ink-500">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <Section
        n={1}
        id="ratings"
        title="Team strength (Elo)"
        lead="Everything starts with a single number per team: an Elo rating, where a bigger gap means a more lopsided match."
      >
        <p>
          Each of the 48 finalists is seeded from its{" "}
          <strong className="text-ink-100">World Football Elo</strong> rating —
          the same family of ratings used by eloratings.net, built from decades
          of international results. A stronger team carries a higher number; the
          <em> difference</em> between two ratings is what drives every
          probability on the site.
        </p>
        <p>
          The three 2026 co-hosts (USA, Mexico, Canada) get a{" "}
          <strong className="text-ink-100">home-field bump</strong> of{" "}
          <K>+{HOST_ADVANTAGE}</K> Elo points whenever they play — close to
          eloratings.net&rsquo;s standard ~100, tuned down for the
          strength-compressed World Cup field, and worth roughly{" "}
          {pct(winProbability(HOST_ADVANTAGE, 0, LOGISTIC_SCALE) - 0.5)} of extra
          win probability between otherwise even sides. The bump travels with the
          host flag; it is never baked into the stored rating.
        </p>
      </Section>

      <Section
        n={2}
        id="live"
        title="Updating after results"
        lead="Ratings are not frozen at kick-off. Every finished match nudges both teams, so an upset or a thrashing immediately changes later predictions."
      >
        <p>
          After each completed match we fold the result back into the two
          ratings with the classic{" "}
          <strong className="text-ink-100">World Football Elo</strong> update:
        </p>
        <Formula>{`R'  =  R  +  K · G · (W − We)

K   = ${ELO_K}        (World Cup finals weight)
G   = goal-difference multiplier  (1, 1.5, then (11+d)/8 …)
W   = actual result   (1 win / ½ draw / 0 loss)
We  = expected result (the win probability below)`}</Formula>
        <p>
          <K>K = {ELO_K}</K> sets how much one game moves a rating; the{" "}
          <strong className="text-ink-100">goal-difference multiplier</strong>{" "}
          means a 4–0 shifts ratings more than a 1–0. Because the move is
          proportional to <em>W − We</em>, an <strong>upset</strong> (beating a
          stronger side) is rewarded far more than an expected win. Updates are
          applied in true kick-off order, so no match is ever scored using
          information from its own or a later result.
        </p>
      </Section>

      <Section
        n={3}
        id="winprob"
        title="Win probability"
        lead="A rating gap becomes a probability through a logistic (Elo) curve."
      >
        <p>
          The chance team A beats team B is the standard Elo logistic on the
          rating difference:
        </p>
        <Formula>{`P(A beats B)  =  1 / (1 + 10^( (Rb − Ra) / scale ))`}</Formula>
        <p>
          The <K>scale</K> controls how sharply a rating gap turns into
          confidence — a smaller scale makes the favourite&rsquo;s edge steeper.
          Mondial uses <strong className="text-ink-100">two</strong> scales on
          purpose:
        </p>
        <ul className="ml-4 list-disc space-y-1 marker:text-ink-600">
          <li>
            <K>{LOGISTIC_SCALE}</K> — the <strong>rating-system</strong> scale,
            used to update ratings after results (and to calibrate against
            decades of all internationals).
          </li>
          <li>
            <K>{WC_PREDICTION_SCALE}</K> — the flatter{" "}
            <strong>World Cup display</strong> scale, used for every probability
            you actually see (bracket, match cards, title odds).
          </li>
        </ul>
        <p>
          Why flatter for the World Cup? Because only qualified sides are here,
          the field is strength-compressed and single matches are high-variance
          (fatigue, neutral venues, cagey knockouts), so favourites win{" "}
          <em>less</em> often than a curve fitted to friendly-heavy data implies.
          This was found empirically: tuned on the 2022 World Cup, the flatter
          scale also improved out-of-sample predictions of the already-played
          2026 games. The effect on a single match:
        </p>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-700 text-left text-ink-400">
                <th className="px-4 py-2 font-medium">Rating gap</th>
                <th className="px-4 py-2 text-right font-medium">
                  Win prob @ {LOGISTIC_SCALE}
                </th>
                <th className="px-4 py-2 text-right font-medium">
                  Shown @ {WC_PREDICTION_SCALE}
                </th>
              </tr>
            </thead>
            <tbody>
              {curve.map((r) => (
                <tr
                  key={r.gap}
                  className="border-b border-ink-700/50 last:border-0"
                >
                  <td className="px-4 py-2 text-ink-300">
                    {r.gap === 0 ? "even" : `+${r.gap}`}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink-400">
                    {pct(r.rating)}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums text-white">
                    {pct(r.wc)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink-400">
          A clear favourite that the rating curve would call ~
          {pct(curve[3].rating)} is shown as the more honest ~{pct(curve[3].wc)}.
        </p>
      </Section>

      <Section
        n={4}
        id="draws"
        title="Draws: the group model"
        lead="Group games can end level, so they use a three-outcome model that a two-way win probability can’t express."
      >
        <p>
          For matches that can be drawn we use the{" "}
          <strong className="text-ink-100">Davidson</strong> model, which adds a
          draw term to the Elo logistic:
        </p>
        <Formula>{`a = 10^(Ra/scale)   b = 10^(Rb/scale)   d = ν · √(a·b)

P(home) = a/(a+b+d)   P(draw) = d/(a+b+d)   P(away) = b/(a+b+d)`}</Formula>
        <p>
          The draw weight <K>ν = {DRAW_NU}</K> is calibrated so two evenly-matched
          teams draw about{" "}
          <strong className="text-ink-100">
            {pct(DRAW_NU / (2 + DRAW_NU))}
          </strong>{" "}
          of the time. Conditional on a decisive result, the model collapses
          exactly back to the two-way win probability above, so the group and
          knockout views always agree. Knockout ties, which can&rsquo;t end
          level, simply drop the draw term (extra time / penalties decide).
        </p>
      </Section>

      <Section
        n={5}
        id="scorelines"
        title="Exact scorelines"
        lead="The match page predicts actual scores — 2–1, 0–0 — not just who wins."
      >
        <p>
          Each side&rsquo;s expected goals come from a rating-aware{" "}
          <strong className="text-ink-100">Poisson</strong> model: a base scoring
          rate scaled up or down by the rating gap.
        </p>
        <Formula>{`λ_home = base · 10^( (Ra − Rb) / (2·γ) )      base = ${GOAL_BASE}
λ_away = base · 10^( (Rb − Ra) / (2·γ) )      γ    = ${GOAL_GAMMA}`}</Formula>
        <p>
          Two independent Poissons under-count low draws, so we apply a{" "}
          <strong className="text-ink-100">Dixon–Coles</strong> low-score
          correction (<K>ρ = {GOAL_RHO}</K>) that nudges scoreline mass toward
          0–0 and 1–1 and away from 1–0 / 0–1. The full grid is then{" "}
          <em>conditioned</em> on the calibrated win/draw/away split from step 4,
          which fixes the overall draw rate — so Dixon–Coles reshapes the scores{" "}
          <em>within</em> each outcome region rather than changing how often a
          draw happens, and the most-likely scores always line up with the win
          probability shown elsewhere. The same grid powers the over/under and
          both-teams-to-score numbers; in knockout (decisive) mode the draw
          scorelines are removed and the rest renormalised.
        </p>
      </Section>

      <Section
        n={6}
        id="qualifying"
        title="Tables & qualification"
        lead="Group tables follow the real tie-break ladder; 32 teams reach the knockouts."
      >
        <p>
          Group standings are ranked by the usual ladder —{" "}
          <strong className="text-ink-100">
            points → goal difference → goals scored → rating
          </strong>{" "}
          (rating stands in for FIFA&rsquo;s head-to-head steps as a
          deterministic deep tie-break). From the 12 four-team groups, the
          knockout field of 32 is:
        </p>
        <Formula>{`12 group winners  +  12 runners-up  +  8 best third-placed  =  32`}</Formula>
        <p>
          The eight best third-placed teams are then compared across all 12
          groups by <strong className="text-ink-100">points → goal difference →
          rating</strong> (this cross-group ranking skips the goals-scored step
          the in-group ladder uses). Until a group has played all its games, the
          model shows each team as a live candidate to finish 1st / 2nd / 3rd
          rather than a certainty.
        </p>
      </Section>

      <Section
        n={7}
        id="bracket"
        title="The knockout bracket"
        lead="The Round of 32 is slotted by the official 2026 template — not re-seeded by rating."
      >
        <p>
          The 2026 knockout bracket is <strong className="text-ink-100">fixed
          by group position</strong>: the Round of 32 pairs specific
          winner / runner-up / best-third slots, so two teams from the same group
          can&rsquo;t meet early and every team&rsquo;s path is the real one.
          Rating only feeds each tie&rsquo;s win probability, never the seeding.
        </p>
        <p>Each matchup then resolves in priority order:</p>
        <ol className="ml-4 list-decimal space-y-1 marker:text-ink-500">
          <li>
            A <strong className="text-pitch-500">real result</strong>, once
            played, replaces the prediction and locks in green.
          </li>
          <li>
            Otherwise <strong className="text-accent-gold">your pick</strong>, if
            you&rsquo;ve overridden the tie (saved on your device).
          </li>
          <li>
            Otherwise the <strong>model</strong> advances the higher win
            probability, propagating winners round by round to a predicted
            champion.
          </li>
        </ol>
      </Section>

      <Section
        n={8}
        id="odds"
        title="Title odds (Monte Carlo)"
        lead="“Brazil 14% to win it” comes from simulating the whole tournament thousands of times."
      >
        <p>
          A single bracket only shows the most-likely path. To get each
          team&rsquo;s chance of reaching every round we run a{" "}
          <strong className="text-ink-100">Monte Carlo</strong> simulation —
          thousands of full tournaments:
        </p>
        <ol className="ml-4 list-decimal space-y-1 marker:text-ink-500">
          <li>
            Sample every unplayed group game (Davidson outcome, then a Poisson
            margin consistent with it) and rebuild the tables.
          </li>
          <li>Work out who qualifies, and slot the official bracket.</li>
          <li>
            Play the knockouts as weighted coin-flips on each tie&rsquo;s win
            probability, through to a champion.
          </li>
          <li>
            Tally how often each team escapes its group, reaches the final and
            lifts the trophy.
          </li>
        </ol>
        <p>
          Already-finished results are held fixed in every run, and the random
          draw is seeded from the current results state — so the odds are{" "}
          <strong className="text-ink-100">deterministic</strong> (the same
          state always gives the same numbers) and only move when real results
          do.
        </p>
      </Section>

      <Section
        n={9}
        id="honesty"
        title="Keeping ourselves honest"
        lead="The model grades itself against reality, out-of-sample."
      >
        <p>
          The{" "}
          <Link href="/model" className="text-accent-gold hover:underline">
            model report card
          </Link>{" "}
          scores every call from only what was known <em>before</em> each match,
          using <strong className="text-ink-100">log-loss</strong> and{" "}
          <strong className="text-ink-100">Brier</strong> score (both reward
          being confident and right, punish being confident and wrong) against a
          no-skill baseline of <K>ln 3 ≈ 1.099</K>. A reliability table checks
          that, when the model says 70%, those teams really win about 70% of the
          time.
        </p>
        <p>
          The constants above weren&rsquo;t guessed. The goal model was fit on
          ~8,000 pre-2022 internationals and checked{" "}
          <strong className="text-ink-100">out-of-sample</strong> on the held-out
          2022 World Cup; the World Cup flattening was tuned on that 2022
          tournament and then validated out-of-sample on the already-played 2026
          games. Each was graded on results it was never fitted to.
        </p>
      </Section>

      <Section
        n={10}
        id="data"
        title="Where the data comes from"
        lead="Free, public sources, with graceful fallbacks."
      >
        <p>
          Fixtures, groups and final results come from the public-domain{" "}
          <strong className="text-ink-100">openfootball</strong> dataset; live
          in-play scores, the match minute and the goal timeline are overlaid
          from <strong className="text-ink-100">ESPN</strong>&rsquo;s free API.
          Squads are enriched from{" "}
          <strong className="text-ink-100">TheSportsDB</strong> when the roster
          looks complete; starting line-ups come from ESPN once a match kicks
          off, with TheSportsDB (and, failing that, a generated XI) filling any
          gaps. If a source is unavailable the app falls back to illustrative
          data and labels it as such, so the model always has something to reason
          over.
        </p>
      </Section>

      <Section
        n={11}
        id="caveats"
        title="What the model can’t see"
        lead="A rating-based model is powerful but deliberately simple."
      >
        <p>
          Predictions are driven by team strength and results alone. The model
          does <strong className="text-ink-100">not</strong> know about specific
          injuries or suspensions, the announced starting XI, weather, travel and
          rest, or a team&rsquo;s motivation once it has already qualified. It
          assumes ratings capture current strength and that matches are
          independent. Treat every number as a calibrated estimate of
          uncertainty — not a forecast of certainty. That is exactly why upsets
          are not bugs: a 30% underdog is supposed to win roughly three times in
          ten.
        </p>
      </Section>

      <div className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="text-sm text-ink-300">
          See it in action — the model&rsquo;s predicted knockout path and live
          title odds.
        </p>
        <div className="flex gap-2">
          <Link
            href="/bracket"
            className="rounded-lg bg-ink-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink-600"
          >
            Prediction bracket →
          </Link>
          <Link
            href="/model"
            className="rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-ink-200 transition hover:text-white"
          >
            Model report card
          </Link>
        </div>
      </div>
    </div>
  );
}
