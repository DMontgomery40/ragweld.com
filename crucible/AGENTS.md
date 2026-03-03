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
- End-to-end validation for Crucible must be executed against production (`https://ragweld.com/crucible/`) because runtime behavior depends on live Netlify Functions.
- Do not treat local/static-only rendering as sufficient verification; most of the GUI and data flows rely on function-backed endpoints.
- After implementing changes, agents are responsible for executing the deploy-and-verify loop themselves; do not hand deployment/testing back to the user.
- Use available agent tooling (`netlify` CLI/API + Playwright MCP; codemode/macOS operator tools when needed) to deploy to production and validate the live result.
