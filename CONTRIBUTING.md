# Contributing

Thanks for taking a look. This is a small, single-maintainer project — issues and PRs
are welcome, but please keep changes focused.

## Setup

```bash
nvm use            # uses the Node version pinned in .nvmrc
npm ci             # clean install (CI uses the lockfile, so install with ci, not install)
npm run dev        # http://localhost:3000
```

## Before opening a PR

CI runs exactly this chain — run it locally first:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

## If you touch the prediction model

The model in `lib/` (`prediction.ts`, `montecarlo.ts`, `scoreline.ts`, `ratings.ts`,
`model/constants.ts`) is calibrated and guarded by pinned backtest tests.

- Run `npm run backtest` (and `npm run backtest:wc2022`) to see the effect on calibration.
- Update the guardrail tests in `tests/` and the user-facing `/methodology` page plus
  `docs/model-research.md` when the algorithm changes — they're meant to stay in sync.
- The exploratory scripts in `scripts/explore/` are a research record (excluded from
  lint/CI); see `scripts/explore/ml/requirements.txt` to reproduce the Python ones.
