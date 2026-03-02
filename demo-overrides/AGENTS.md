# AGENTS.md

## Scope
This file applies to `/Users/davidmontgomery/ragweld.com/demo-overrides` and its subdirectories.

## Project
Hosted-only override layer for the vendored demo app (`vendor/demo`).

Purpose:
- Keep long-term source parity with `../ragweld/web`.
- Place site-specific mock and override behavior here instead of accumulating drift in `vendor/demo`.

Current override paths:
- `src/mocks/*`
- `public/mockServiceWorker.js`

## Edit Rules
- Prefer adding override logic here before editing vendored files in `vendor/demo`.
- Keep overrides minimal and clearly scoped to hosted/demo behavior.
- If an override becomes generally useful, migrate it upstream into source repo (`../ragweld/web`) and reduce local patching.

## Validation Expectations
- From repo root, run:
  - `npm run check:demo-parity`
  - `npm run build:demo`
- Verify runtime behavior at `/demo` with and without `?mock=1`.
