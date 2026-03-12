# AGENTS.md

## Scope
This file applies to `/Users/davidmontgomery/ragweld.com`, except where a deeper `AGENTS.md` exists.

Subproject overrides:
- `crucible/AGENTS.md`
- `vendor/demo/AGENTS.md`
- `netlify/functions/AGENTS.md`
- `demo-overrides/AGENTS.md`

## Bird Data Subdomain
`bird-data.ragweld.com` is an operations-managed subdomain for the feeder-bird annotation service.

Ownership and change boundaries:
- Service code lives in `/Users/davidmontgomery/annotation-util`.
- Local reverse proxy config lives in `/opt/homebrew/etc/Caddyfile`.
- Local service boot config lives in `/Users/davidmontgomery/Library/LaunchAgents/com.ragweld.annotation-util.plist`.
- DNS for `ragweld.com`/`bird-data.ragweld.com` is managed outside this repo (Netlify DNS zone and network edge config).

When asked to modify `bird-data.ragweld.com` behavior:
- Edit code/scripts in `/Users/davidmontgomery/annotation-util`.
- Edit Caddy/LaunchAgent only if routing or process management needs changes.
- Do not add bird-data runtime logic to this Astro/Netlify codebase unless explicitly requested.

## Project
This repository contains:
- Astro site and content in `src/`
- Netlify Functions in `netlify/functions/`
- Build/sync scripts in `scripts/`
- Vendored demo app in `vendor/demo/` (served at `/demo`)
- Hosted demo customizations in `demo-overrides/`
- Crucible app in `crucible/` (built separately and copied during root build)

## Setup
- `npm install`
- `npm run deps:demo`
- `npm run deps:crucible`

## Daily Commands
- `npm run dev` for Astro development
- `netlify dev` for Astro + Netlify Functions
- `npm run build` for full production build pipeline
- `npm run preview` to preview the production output
- `npm run test:e2e` for Playwright end-to-end tests

## Demo Parity Workflow
- Source of truth for `vendor/demo` is `../ragweld/web`.
- Sync demo from source: `npm run sync:demo`
- Strict parity check: `npm run check:demo-parity`
- Warn-only parity check: `npm run check:demo-parity:warn`
- For hosted-only UI differences, prefer `demo-overrides/` instead of direct edits in `vendor/demo/`.

## Demo Eval Compromise
- The hosted `/demo` Eval Analysis experience intentionally uses backend-seeded synthetic eval datasets/runs plus cached real model analyses.
- This is an accepted visual-demo compromise, not an accidental parity bug.
- Do not flag the synthetic nature of the hosted eval history itself as a defect unless the user explicitly asks to revisit that tradeoff.
- Still flag real issues in that path: stale caches, broken route contracts, parity drift outside the allowlisted overlay, misleading UI behavior beyond the accepted compromise, or invalid model/runtime wiring.

## Edit Boundaries
Avoid manual edits in generated directories:
- `dist/`
- `.astro/`
- `.netlify/`
- `node_modules/`

Keep the `/api/*` route contract stable unless a coordinated backend/client change is intended.

## Validation Expectations
- Site/content/layout changes: run `npm run build`.
- API/function changes: run `netlify dev` and verify affected endpoints.
- Demo integration changes: run `npm run check:demo-parity` plus relevant build/test commands.
