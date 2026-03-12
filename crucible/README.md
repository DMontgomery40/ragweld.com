# Crucible

> Operator range planner for training cost, VRAM fit, and GPU availability.

Crucible is the estimator workbench behind [ragweld.com/crucible](https://ragweld.com/crucible/). It combines model metadata, hardware reference data, provider pricing, and planning heuristics so you can compare likely training ranges before you commit a run.

## What This Mirror Contains

- React + TypeScript + Vite application shell
- estimator logic, normalization rules, and planner math in `src/engine/`
- reference datasets in `data/`
- unit tests for estimator logic, inputs, and sharing/export flows
- the math code workbench route used to inspect the implementation behind the planner

## Public Mirror Note

This repository is a public mirror of the `crucible/` subtree from the larger `ragweld.com` site repo.

It includes the front-end app, estimator logic, data catalogs, and tests. The live production surface at `ragweld.com/crucible` also depends on Netlify Functions that live outside this subtree in the larger Ragweld repo, so a fresh clone of this mirror is best treated as the public app source rather than a full reproduction of the hosted backend.

## Local Development

```bash
npm install
npm run dev
```

Useful commands:

- `npm run build` builds the Vite app
- `npm test` runs the Vitest suite
- `npm run lint` runs ESLint
- `npm run refresh:models` refreshes the model catalog with `--apply`

## Project Layout

- `src/` application UI, hooks, estimator logic, and tests
- `data/` model catalogs, GPU specs, and pricing fallback data
- `docs/` source ledgers and implementation notes
- `scripts/` maintenance utilities
- `netlify.toml` redirects for the hosted Crucible surface

## Live Surface

- Hosted estimator: [https://ragweld.com/crucible/](https://ragweld.com/crucible/)
- Math code workbench: [https://ragweld.com/crucible/math-code](https://ragweld.com/crucible/math-code)
