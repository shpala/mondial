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
| Fixtures, groups, standings, scores | **openfootball/worldcup.json** (public domain, no key) | snapshot |
| Squads, starting lineups | **TheSportsDB** (free key `3`, or Patreon key) | generated / snapshot |
| Everything | — | bundled snapshot (`lib/data/snapshot.ts`) |

- **`lib/teams/registry.ts`** — canonical 48-country registry (code, flag,
  rating, name aliases). The reconciliation layer that joins origins which spell
  countries differently (e.g. "South Korea" vs "Korea Republic").
- **`lib/api/sources/*`** — one adapter per origin, each mapping into the domain
  types in `lib/types.ts`. Screens never see raw provider JSON.
- **`lib/standings.ts`** — pure standings computation from results (origin-agnostic).
- **`lib/prediction.ts`** — pure, unit-tested model: Elo-style win probabilities
  and single-elimination bracket resolution.
- **`lib/qualifiers.ts`** — derives the 32 knockout teams (12 winners, 12
  runners-up, 8 best thirds) from the group tables.
- **`store/bracket.ts`** — Zustand + localStorage; holds your bracket overrides.
- **`components/PitchLineup.tsx`** — SVG pitch that places the starting XI from
  each team's formation/grid.

## Data notes

- **Fixtures/groups/standings/results are real, live 2026 data** from
  openfootball (updated ~daily, no key).
- **Squads and lineups need a paid TheSportsDB key to be complete.** The free
  test key returns sparse rosters (often no goalkeeper) and ≤5-player lineups, so
  a completeness gate falls back to a generated XI rather than show broken data.
  A Patreon `THESPORTSDB_KEY` unlocks full squads/lineups automatically.
