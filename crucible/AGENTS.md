# AGENTS.md

## Scope
This file applies to `/Users/davidmontgomery/ragweld.com/crucible` and its subdirectories.

## Project
`crucible` is a React + TypeScript + Vite app.

Key paths:
- `src/` application code
- `scripts/` maintenance/utility scripts
- `data/` local data assets
- `netlify.toml` deployment/runtime config

## Setup
- `npm install`

## Daily Commands
- `npm run dev`
- `npm run build`
- `npm test`
- `npm run test:watch`
- `npm run lint`
- `npm run preview`
- `npm run refresh:models` (updates model catalog with `--apply`)

## Edit Boundaries
Avoid manual edits in generated directories:
- `dist/`
- `coverage/`
- `node_modules/`

## Validation Expectations
- UI or logic changes: run `npm run build` and `npm test`.
- Lint-sensitive changes: run `npm run lint`.
- If the change affects root integration, also run from repo root: `npm run build:crucible`.
