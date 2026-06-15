# Mondial — 2026 World Cup Companion

A polished web app for the 2026 FIFA World Cup: current squads, per-match
starting lineups on a pitch, group standings, and an **interactive prediction
bracket** that combines a model baseline with your own picks.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

The app fetches **live 2026 data with no key required**. A "sample data" banner
appears only if the live spine is unreachable, in which case it falls back to a
bundled snapshot.

For fuller squads/lineups, set a TheSportsDB Patreon key (optional):

```bash
cp .env.example .env.local
# edit .env.local and set THESPORTSDB_KEY=<your patreon key>
```

## Scripts

| Command         | Description                          |
| --------------- | ------------------------------------ |
| `npm run dev`   | Start the dev server                 |
| `npm run build` | Production build                     |
| `npm run start` | Run the production build             |
| `npm test`      | Run the Vitest unit tests            |

## How it works

Data comes from **multiple free origins, routed by capability** through one
facade (`lib/data/index.ts`):

| Capability | Primary origin | Fallback |
| --- | --- | --- |
| Fixtures, groups, standings | **openfootball/worldcup.json** (public domain, no key) | snapshot |
| Live score, match minute, goal timeline | **ESPN** free site API (undocumented, no key) | openfootball status |
| Starting XI — live & finished games | **ESPN** match summary (real XI + formation, no key) | TheSportsDB → generated |
| Starting XI — upcoming games, full squads | **TheSportsDB** (free key `3`, or Patreon key) | generated / snapshot |
| Everything | — | bundled snapshot (`lib/data/snapshot.ts`) |

- **`lib/teams/registry.ts`** — canonical 48-country registry (code, flag,
  rating, name aliases). The reconciliation layer that joins origins which spell
  countries differently (e.g. "South Korea" vs "Korea Republic").
- **`lib/api/sources/*`** — one adapter per origin, each mapping into the domain
  types in `lib/types.ts`. Screens never see raw provider JSON.
  `espn.ts` overlays live scores/goals **and** parses real starting line-ups
  from the match-summary endpoint for games that have kicked off.
- **`lib/standings.ts`** — pure standings computation from results (origin-agnostic).
- **`lib/prediction.ts`** — pure, unit-tested model: Elo-style win probabilities
  and single-elimination bracket resolution.
- **`lib/qualifiers.ts`** — derives the 32 knockout teams (12 winners, 12
  runners-up, 8 best thirds) from the group tables.
- **`store/bracket.ts`** — Zustand + localStorage; holds your bracket overrides.
- **`components/PitchLineup.tsx`** — SVG pitch that places the starting XI from
  each team's formation/grid.

## Data notes

- **Fixtures, groups, standings and scores are real, live 2026 data** —
  openfootball for the daily spine (no key), with **ESPN's free site API**
  overlaid for the live score, match minute and goal timeline.
- **The bracket and the upcoming-match line-ups are modelled, not official.**
  The tournament is still in the group stage, so those parts are filled in by a
  prediction/estimate and flagged as such in the UI. Exactly which parts are real
  vs. modelled is spelled out below.

## Why the bracket and line-ups always look complete

Mid-group-stage, the app still shows a full Round-of-32 → Final tree and a full
XI for every match. **None of that knockout detail is decided yet** — the gaps
are filled by a model and clearly labelled, never presented as fact.

### The prediction bracket

The bracket is a **projection recomputed on every load**, not an official draw.
Three steps (`lib/qualifiers.ts` + `lib/prediction.ts`):

1. **Qualifiers from current standings.** `qualificationBreakdown` reads the 12
   live group tables and takes today's **12 group winners + 12 runners-up + 8
   best third-placed teams = 32**. Best-thirds rank by points → goal difference →
   rating. Each carries `confirmed = played >= 3`, so a slot only becomes final
   once all three group games are played; until then it's "who would go through
   if the table froze right now."
2. **Seeding.** `buildBracket` orders those 32 strongest-first by rating and
   places them in a standard single-elimination seed order (the top two seeds can
   only meet in the Final).
3. **Resolving every tie.** `resolveBracket` computes an **Elo-style win
   probability** for each matchup and advances the more likely team, round by
   round to the Final:

   ```
   P(A beats B) = 1 / (1 + 10^((ratingB − ratingA) / 400))
   ```

   Equal ratings → 50/50; a ~100-point edge → ~64%; ~400 points → ~91%. The
   favourite (probability ≥ 0.5) advances. It is **deterministic** — no
   simulation or randomness — so the bracket is simply "the higher-rated team
   wins each round," and the predicted champion is the strongest team its seeding
   path lets reach the Final.

**Real results override the model.** When an actual knockout match finishes (real
teams, decisive full-time score), `buildResultMap` forces that winner into the
tree — it locks green and cascades downstream (`app/bracket/page.tsx`). In **Your
picks** mode you can override any *unplayed* tie; the rounds ahead recompute and
your picks persist on the device (`store/bracket.ts`).

### Where the ratings come from

Every nation has one **`rating`** constant in `lib/teams/registry.ts` (Spain 2129
… Curaçao 1427), seeded from **World Football Elo ratings** (eloratings.net,
snapshot June 2026) rather than hand-authored guesses. They are **not** updated
by results, so a 7–1 win changes a team's *qualification position* but never its
predicted strength.

**Host advantage.** The three co-hosts (USA, Mexico, Canada) carry a `host` flag
and get a **+100 Elo home-field bump** (`HOST_ADVANTAGE` in `lib/prediction.ts`)
applied at prediction time — eloratings.net's standard home constant, worth ~+14
percentage points between otherwise-even sides. The stored `rating` stays the
team's true strength; the bump is layered on only when computing a win
probability (`predictWinProbability`). Beyond that the model uses nothing but the
two ratings: no current form, injuries, head-to-head or live data.

Two deliberate simplifications: seeding is by rating (not FIFA's fixed
group-position → slot mapping), and the third-place tiebreak is points → GD →
rating (not FIFA's full chain). So even once teams lock in, the matchups won't
necessarily mirror the official bracket structure.

### The starting line-ups

Every match shows a full XI on the pitch, but only some of it is real:

| Match state | Line-up source | UI label |
| --- | --- | --- |
| **Live / finished** | **Real XI + formation from ESPN's match summary** (no key) | "Line-ups" |
| **Upcoming** | **Estimated** — a deterministic generated XI in a plausible formation | "Estimated" badge + notice |

So an upcoming game's pitch is a **placeholder prediction**, not a real team
sheet — hence the **Estimated** tag. The moment a match kicks off, the real names
replace it automatically. A paid TheSportsDB key additionally fills fuller
pre-match squads/line-ups where ESPN has none yet; the free test key returns
sparse rosters, so a completeness gate falls back to the generated XI rather than
show broken data.
