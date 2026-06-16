# Monte Carlo Title Odds — Design

**Date:** 2026-06-15
**Status:** Approved
**App:** `/home/shpala/dev/mondial`

## Goal

Replace the single deterministic bracket path with a Monte Carlo simulation of
the whole tournament, producing per-team probabilities — chance to win the cup,
reach the final, and escape the group — surfaced on `/bracket` and team pages.
This is item #2 on the prediction roadmap; it pulls in item #3 (a three-outcome
group model) as its group engine.

## Model

### Three-outcome group matches (the draw engine)

Group games need win/draw/loss. Use the **Davidson model** on host-adjusted Elo:

```
P(home) ∝ 10^(Aeff/400)
P(away) ∝ 10^(Beff/400)
P(draw) ∝ ν · 10^((Aeff + Beff)/800)
```

`Aeff`/`Beff` are `effectiveRating` (live Elo + host bump). Chosen because,
conditional on a decisive result, this collapses *exactly* to the existing
`winProbability` — the simulation and the match-card win % stay consistent.
`ν ≈ 0.63` yields ~24% draws between even sides, decaying as the gap widens.

Knockouts remain two-outcome (`predictWinProbability`, extra-time/pens implied),
so every knockout sim produces a winner — no shootout logic.

### One simulated tournament

1. **Groups:** keep all *finished* real results fixed; sample each *unplayed*
   group game (Davidson outcome + a light goals model used only for GD /
   goals-for tiebreaks). Rebuild standings with the existing
   `computeGroupStandings`, then `qualifiedTeams` → the 32 seeds (real "8 best
   third-placed" + seeding logic reused unchanged).
2. **Knockouts:** `buildBracket(qualified)`, walk the rounds flipping a weighted
   coin on `predictWinProbability` — except already-finished knockout ties, which
   lock to the real winner (keyed by sorted team-id pair). Record each team's
   deepest round + champion.

### Aggregate

Run **N = 10,000** sims with a seeded RNG (mulberry32). The seed derives from the
current results state (finished count + goals), so odds are stable between
renders and change only when results change. Tally per team → `% champion`,
`% finalist`, `% qualified (escape group)`, plus intermediate rounds.

## Surfaces

- **`/bracket`** — a compact `TitleOddsTable` (top ~12 by win %, columns Win /
  Final), placed above the candidates/tree columns.
- **`/teams/[id]`** — a one-line readout in the header area:
  *"12% to win the cup · 24% to reach the final · 71% to escape the group"*.

Both call one shared `simulateTournament(fixtures)` so the numbers always agree.

## Files

- `lib/montecarlo.ts` (new) — `outcomeProbs`, score sampling, `simulateTournament`,
  seeded RNG. Pure; reuses `prediction.ts`, `standings.ts`, `qualifiers.ts`.
- `components/TitleOddsTable.tsx` (new).
- `app/bracket/page.tsx` — compute odds, render table.
- `app/teams/[id]/page.tsx` — compute odds, render the per-team line.
- `tests/montecarlo.test.ts` (new).
- `README.md` — document the draw model + title odds.

## Honesty / scope

The draw constant `ν` and the tiebreak goals model are sensible but
**uncalibrated** — that is what the backtest harness (item #4) would later tune.
Documented as a model, consistent with the existing "Predicted" labelling. Live
group games (in play, not finished) are treated as unplayed and re-simulated.

## Verification

- Unit tests: `outcomeProbs` sums to 1; draw % peaks at equal ratings and decays
  with the gap; a finished knockout result is never reversed; champion odds sum
  to ~100% over all teams.
- `npm test` green, `npm run build` clean.
- Both pages render live numbers; sim runtime acceptable on the dynamic pages.
