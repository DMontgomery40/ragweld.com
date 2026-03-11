# TypeScript Anti-Slop Stack (March 10, 2026)

This is a concrete tool stack for `ragweld.com`, not a generic TypeScript wishlist.

## Repo Shape

- Root Astro site
- `crucible/` React + TypeScript + Vite app
- `netlify/functions/` serverless TypeScript
- `vendor/demo/` separate frontend with parity drift concerns
- Shared types currently cross-imported between client and functions

That means the real problems are:

- architectural drift between root, `crucible`, `vendor/demo`, and functions
- dead files/exports/deps from rapid iteration
- duplicate helpers and copy-paste logic
- request/response contract drift
- package/dependency drift across multiple package roots

## Selected Stack For This Repo

Ordered by a mix of GitHub stars, current activity, and fit for this repository.

## Implemented Now

These are now wired at the repo root:

- `dependency-cruiser`
- `Knip`
- `jscpd`
- `madge`

Top-level scripts:

- `npm run anti-slop`
- `npm run anti-slop:deps`
- `npm run anti-slop:cycles`
- `npm run anti-slop:duplicates`
- `npm run anti-slop:unused`
- `npm run anti-slop:site`
- `npm run anti-slop:crucible`
- `npm run anti-slop:demo`

Coverage intent:

- root app + scripts + functions
- `crucible`
- `vendor/demo`

Current implementation details:

- `dependency-cruiser` now scans `src`, `scripts`, `netlify/functions`, `crucible/src`, `vendor/demo/src`, and `demo-overrides`
- `vendor/demo` cycle prevention is enforced with `madge`, and the subtab metadata has been split out of `routes.ts` so route hooks do not depend on the component registry
- `crucible/knip.json` and `vendor/demo/knip.json` keep unused-code audits focused on real source instead of build/test output noise
- `anti-slop:unused` remains audit-only for now; it prints current dead-code and duplicate-export debt without failing the aggregate command

### Phase 1: install first

1. `dependency-cruiser`
   Repo: <https://github.com/sverweij/dependency-cruiser>
   Stars: `6452`
   Last push checked: `2026-03-05`
   Why here:
   - best fit for enforcing boundaries between `crucible`, `netlify/functions`, `vendor/demo`, and root code
   - catches cycles, forbidden imports, and accidental cross-layer reach-through
   Start with rules for:
   - `vendor/demo` may not import from root app code
   - `crucible/src/components` may not import from `netlify/functions`
   - `netlify/functions` may only import shared types/helpers from an allowlisted shared area

2. `Knip`
   Repo: <https://github.com/webpro-nl/knip>
   Stars: `10480`
   Last push checked: `2026-03-09`
   Why here:
   - best modern tool for unused files, exports, and dependencies in TS repos
   - especially useful after AI-assisted churn and parity drift work

3. `ast-grep`
   Repo: <https://github.com/ast-grep/ast-grep>
   Stars: `12835`
   Last push checked: `2026-03-10`
   Why here:
   - structural rules and rewrites are far better than string grep for anti-slop cleanup
   - use it for repo-specific rules like duplicate fetch wrappers, direct `window` access outside hooks, or repeated request-normalization helpers

4. `jscpd`
   Repo: <https://github.com/kucherenko/jscpd>
   Stars: `5412`
   Last push checked: `2026-03-09`
   Why here:
   - catches copy-paste duplication that review misses
   - useful across `crucible`, `vendor/demo`, and functions

5. `Zod`
   Repo: <https://github.com/colinhacks/zod>
   Stars: `42076`
   Last push checked: `2026-02-15`
   Why here:
   - already present in `crucible/package.json`
   - should be expanded from “available dependency” to “required boundary contract” for Netlify request parsing, query parsing, and config validation

6. `ts-morph`
   Repo: <https://github.com/dsherret/ts-morph>
   Stars: `5974`
   Last push checked: `2025-10-12`
   Why here:
   - best TS-native codemod/static-analysis tool for cleanup passes
   - use it for deduping helper families and normalizing imports or type aliases

7. `syncpack`
   Repo: <https://github.com/JamieMason/syncpack>
   Stars: `1948`
   Last push checked: `2026-03-08`
   Why here:
   - helps keep root, `crucible`, and `vendor/demo` dependency versions aligned
   - particularly helpful when multiple package roots drift under AI edits

### Phase 2: add once Phase 1 is stable

8. `jscodeshift`
   Repo: <https://github.com/facebook/jscodeshift>
   Stars: `9959`
   Last push checked: `2026-02-28`
   Why here:
   - great for large cleanup campaigns after `ast-grep` identifies recurring anti-patterns

9. `openapi-typescript`
   Repo: <https://github.com/openapi-ts/openapi-typescript>
   Stars: `7970`
   Last push checked: `2026-03-10`
   Why here:
   - use if the Netlify function surface grows and you want generated client types instead of manual shared interfaces

10. `hey-api/openapi-ts`
    Repo: <https://github.com/hey-api/openapi-ts>
    Stars: `4273`
    Last push checked: `2026-03-10`
    Why here:
    - stronger SDK-oriented OpenAPI path than types-only tools
    - especially attractive if you want generated SDKs, Zod schemas, or TanStack Query hooks

11. `ts-rest`
    Repo: <https://github.com/ts-rest/ts-rest>
    Stars: `3274`
    Last push checked: `2026-02-06`
    Why here:
    - good alternative if you want contract-first REST without a full OpenAPI-first workflow
    - strongest use case is future shared client/server contracts for `crucible`

12. `type-coverage`
    Repo: <https://github.com/plantain-00/type-coverage>
    Stars: `1335`
    Last push checked: `2024-10-25`
    Why here:
    - useful as a “no silent `any` creep” gate after the structure tools are in place

13. `tsd`
    Repo: <https://github.com/tsdjs/tsd>
    Stars: `2551`
    Last push checked: `2025-08-05`
    Why here:
    - if parts of this repo become reusable packages or shared modules, this is the cleanest type-regression test tool

### Baseline guardrails, not the whole answer

14. `Biome`
    Repo: <https://github.com/biomejs/biome>
    Stars: `24031`
    Last push checked: `2026-03-10`
    Why here:
    - good baseline formatter/linter because people actually keep it on
    - not enough by itself to stop architecture drift

15. `Oxc / Oxlint`
    Repo: <https://github.com/oxc-project/oxc>
    Stars: `19820`
    Last push checked: `2026-03-10`
    Why here:
    - same story as Biome: fast enough to stay enabled
    - worth using, but it should sit under stronger structural tooling

## Strong Tools I Would Not Make First-Class Here Yet

- `Nx`
  Repo: <https://github.com/nrwl/nx>
  Stars: `28286`
  Last push checked: `2026-03-10`
  Reason:
  - excellent and widely praised, but heavier than this repo needs right now
  - adopt it only if `ragweld.com` becomes a more explicit monorepo with many first-party packages

- `Rush Stack` as a full platform
  Repo: <https://github.com/microsoft/rushstack>
  Stars: `6424`
  Last push checked: `2026-03-10`
  Reason:
  - great for large serious TS monorepos
  - for this repo, `API Extractor` is more plausible than full Rush adoption

- `Effect`
  Repo: <https://github.com/Effect-TS/effect>
  Stars: `13458`
  Last push checked: `2026-03-05`
  Reason:
  - very powerful anti-spaghetti library
  - too much architectural churn for this repo unless you explicitly want a deeper rewrite

- `Valibot` and `ArkType`
  Repos:
  - <https://github.com/open-circle/valibot>
  - <https://github.com/arktypeio/arktype>
  Stars:
  - `8481`
  - `7652`
  Reason:
  - both are good
  - because Zod is already installed, I would standardize on Zod first before introducing another schema dialect

## Concrete Rollout Order

1. Add `dependency-cruiser` and codify repo boundaries.
2. Add `Knip` and clean dead files/exports/deps.
3. Add `jscpd` and baseline duplicate detection.
4. Add `ast-grep` rules for repo-specific slop patterns.
5. Expand Zod at request/config boundaries.
6. Add `syncpack` across package roots.
7. Use `ts-morph` or `jscodeshift` for one cleanup pass after the rules expose duplication.
8. Re-evaluate whether the API path wants `ts-rest` or OpenAPI generation.

## The Short Version

If only five things happen, they should be:

1. `dependency-cruiser`
2. `Knip`
3. `ast-grep`
4. `jscpd`
5. deeper `Zod` usage at boundaries

That combination hits architecture drift, dead code, repeated helpers, structural AI slop, and contract drift better than “more lint rules” alone.
