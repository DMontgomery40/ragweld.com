# AGENTS.md

## Scope
This file applies to `/Users/davidmontgomery/ragweld.com/netlify/functions` and its subdirectories.

## Project
Netlify Functions backend for the ragweld site.

Current surfaces:
- Main API: `/api/*` -> `api.js`
- DeepSeek MCP endpoint:
  - `https://deepseek-mcp.ragweld.com/mcp`
  - `/api/deepseek-mcp/mcp`
  - both route to `deepseek-mcp.js` via `netlify.toml`
- Crucible API endpoints:
  - `/crucible/api/v1/estimate` -> `estimate.ts`
  - `/crucible/api/v1/prices` -> `prices.ts`
  - `/crucible/api/v1/models` -> `models.ts`
  - `/crucible/api/v1/health` -> `health.ts`
  - `/crucible/api/v1/resolve-model` -> `resolve-model.ts`
  - shared code in `crucible-shared.ts`

## Edit Rules
- Keep route contracts and response shapes backward compatible unless a coordinated frontend change is included.
- Keep CORS/auth behavior explicit for public endpoints.
- Reuse `crucible-shared.ts` for shared crucible logic instead of duplicating constants/validation.
- When changing deepseek MCP behavior, verify both host-based and path-based routes still work.

## Validation Expectations
- Run `netlify dev` from repo root and hit affected endpoints.
- For crucible changes, also verify the UI integration under `/crucible`.
- For demo/API changes, verify `/demo` flows that call `/api/*`.
