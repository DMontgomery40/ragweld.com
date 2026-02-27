# DeepSeek Remote MCP Server - Implementation Handoff Prompt (Corrected v4)

You are taking over a dual-repo task to deliver a real hosted remote MCP server for DeepSeek on
ragweld-owned domain infrastructure, while preserving local install mode.

## Strategic context (why this matters)

This is the ONLY DeepSeek MCP server listed on:
- DeepSeek official GitHub (`deepseek-ai/awesome-deepseek-integration`) - merged as PR #145
- Anthropic official MCP registry (`registry.modelcontextprotocol.io`) - the only result for "deepseek"
- npm as `deepseek-mcp-server` with active adoption

Adding remote support makes this the definitive DeepSeek MCP server across all three distribution
modes: local stdio (npm), container (OCI image), and remote (Streamable HTTP).
Do not break what is already working. Do NOT bump to version 1.0 - use semver minor/patch only
(target: `0.4.0`).

## Hard requirements from user

- Keep local install support (stdio package install) AND add remote support (Streamable HTTP).
- Do NOT use placeholder remote URLs in official registry metadata.
- Do NOT use `mcp.ragweld.com` for DeepSeek (reserved for future Ragweld product MCP server).
- Use `deepseek-mcp.ragweld.com` as the remote endpoint domain.
- Prefer official docs/sources for infra constraints.

## Current date/context

- Today: 2026-02-23.
- Primary repo cwd: `/Users/davidmontgomery/deepseek-mcp-server`
- Secondary repo: `/Users/davidmontgomery/ragweld.com`

## Current verified state (as of 2026-02-23)

- Official registry publication exists for DeepSeek package mode:
  - Name: `io.github.DMontgomery40/deepseek`
  - Version: `0.3.1`
  - Query: `https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.DMontgomery40/deepseek`
  - Current listing has `packages` only, no `remotes`.
- npm published: `deepseek-mcp-server@0.3.1` with `mcpName: io.github.DMontgomery40/deepseek`.
- GitHub release exists: `v0.3.1 - Official MCP Registry Publication`.
- Registry submission flow is CLI/API (`mcp-publisher`), not PR for server listings.
- Previous local WIP remote refactor/failing test state was reverted and pushed by user.
- DeepSeek repo tests currently pass:
  - `npm run build` passes
  - `npm test` passes (3 files / 15 tests)
- DeepSeek repo currently has additional local uncommitted changes from tool-definition hardening:
  - `README.md`
  - `src/deepseek/schemas.ts`
  - `src/mcp-server.ts`
  - `test/mcp-server.test.ts`
  - `test/schemas.test.ts`
- DeepSeek repo still has untracked `implementations/` directory artifact. Do not delete/reset silently.
- Remote endpoint is live and externally reachable:
  - `GET https://deepseek-mcp.ragweld.com/mcp` -> `405`
  - `POST` without auth -> `401`
  - `POST` with valid bearer token supports `initialize`, `tools/list`, and `tools/call`
- Current deployed remote runtime reports server version `0.3.0` in `initialize`:
  - this is expected until `deepseek-mcp-server@0.4.0` is published and `ragweld.com` updates its dependency, then redeploys.

## Netlify environment facts (verified)

- `ragweld.com` repo is linked to Netlify project:
  - Site: `ragweld`
  - URL: `https://ragweld.com`
  - Project ID: `8195c3ab-d116-467d-9fee-981ad143ebc4`
- DNS for `ragweld.com` is managed by Netlify DNS.
- `deepseek-mcp.ragweld.com` is attached to the same Netlify site and routed to the function path.
- Existing hosted demo already uses Netlify functions under `/api/*`.
- Note: `netlify dns:list` is not a valid command in this CLI version. Use `netlify api ...`.

## What ragweld.com is (for context)

- `ragweld.com` is the public product site + hosted demo for ragweld.
- Current site serves Astro pages and Netlify function API at `/api/*`.
- Existing hosted demo reports MCP server not running there (`/api/mcp/status` says local stack only).

## Architecture decision: Netlify Functions are correct for v1 remote

The old "Netlify unsuitable" argument was based on deprecated HTTP+SSE assumptions.
Streamable HTTP is current MCP transport and supports stateless request/response.

### Transport decision (locked for v1)

- Do NOT implement deprecated HTTP+SSE transport endpoints.
- Use Streamable HTTP only (`remotes[].type = "streamable-http"`).
- Choose JSON-only response behavior for v1:
  - POST `/mcp` handles JSON-RPC
  - GET `/mcp` returns `405 Method Not Allowed` (no SSE stream for v1)

### Key transport constraints

- MCP Streamable HTTP replaced old HTTP+SSE transport in spec `2025-03-26`.
- Streamable HTTP endpoint semantics require POST and GET method handling on the MCP endpoint.
- For servers that do not offer SSE on GET, returning `405 Method Not Allowed` is spec-aligned.
- Stateless mode is valid and appropriate for this workload.
- JSON-only stateless behavior (POST JSON, GET 405) is explicitly supported by SDK/docs.

### Netlify fit

- Netlify synchronous function execution limit is 60 seconds by default.
- Netlify background functions support up to 15 minutes (not needed for initial v1 path).
- This DeepSeek MCP workload is request/response and typically within synchronous limits.

### Deployment shape

- Host remote endpoint as Netlify function in `ragweld.com`.
- Route `https://deepseek-mcp.ragweld.com/mcp` to that function.
- Keep DeepSeek MCP core logic in `deepseek-mcp-server`; Netlify function is a thin adapter.

## Research constraints to treat as hard

- Registry remotes:
  - Remote URL must be publicly accessible.
  - `packages` and `remotes` can coexist in one `server.json`.
  - `remotes[].type` must be `"streamable-http"` or `"sse"`.
  - Remote header metadata is declared via `remotes[].headers` (no `auth` object in schema).
  - Remote URLs must be valid HTTPS URLs and not localhost.
- Namespace rule:
  - For `io.github.<user>/...`, strict domain-match constraint used for `com.<domain>/...` does not apply.
- Package types:
  - Docker images are represented as OCI packages (`registryType: "oci"`), not `"docker"`.
  - OCI identifier format: `registry/namespace/repo:tag` (or digest).
  - OCI package validation requires image label:
    - `io.modelcontextprotocol.server.name="io.github.DMontgomery40/deepseek"`
  - OCI images must be publicly accessible for registry validation.

## Code-execution readiness constraints (new, required)

- Code-mode MCP clients (Cloudflare code mode pattern and codemode-mcp style execution) rely heavily on tool metadata quality for correct autonomous tool use.
- Tool definitions must be optimized for execution clients:
  - Descriptions must clearly state when to use the tool, required inputs, defaults, and side effects.
  - Every tool should provide an explicit input schema. For no-arg tools, use empty-object schema instead of omitting schema.
  - Prefer explicit shapes/enums for known complex fields (tool definitions, tool choice, stream options) instead of broad untyped maps.
  - Keep default outputs token-efficient (`structuredContent` should prioritize essential fields); expose full raw provider payload only as opt-in.
  - Error results should include machine-readable metadata (status/retryability/suggestion) in addition to text.
- Keep tool names compatible with JS identifier constraints used by some code-mode runtimes. Existing names (`chat_completion`, etc.) are compatible.

## Source references

- Context7 library IDs:
  - `/modelcontextprotocol/registry`
  - `/modelcontextprotocol/typescript-sdk`
- Codemode MCP note:
  - This environment has codemode-mcp configured as the tool gateway.
  - Prefer codemode `search` + `exec` to call Context7 and other MCP tools during implementation.
- Primary docs/spec:
  - `https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/remote-servers.mdx`
  - `https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/package-types.mdx`
  - `https://github.com/modelcontextprotocol/registry/blob/main/docs/reference/server-json/official-registry-requirements.md`
  - `https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json`
  - `https://github.com/modelcontextprotocol/specification/blob/main/docs/specification/2025-03-26/basic/transports.mdx`
  - `https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md`
- Code execution + tool quality references:
  - `https://www.anthropic.com/engineering/code-execution-with-mcp`
  - `https://www.anthropic.com/engineering/writing-tools-for-agents`
  - `https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/implement-tool-use`
  - `https://developers.cloudflare.com/agents/model-context-protocol/codemode/`
  - `https://blog.cloudflare.com/model-context-protocol-code-mode/`
  - `https://developers.cloudflare.com/agents/model-context-protocol/client/`
- Netlify docs:
  - `https://docs.netlify.com/source-content/build/functions/overview.md`
  - `https://docs.netlify.com/source-content/build/functions/background-functions.md`
  - `https://docs.netlify.com/source-content/manage/domains/configure-domains/delegate-a-standalone-subdomain.md`

## Non-negotiable execution rules

- Keep local install mode in `server.json` (`packages`) while adding remote mode (`remotes`).
- Do not publish `remotes` metadata until endpoint is truly live and externally reachable.
- Do not commit secrets.
- Do not delete/revert unrelated local changes without explicit user approval.
- Do NOT bump to 1.0; target `0.4.0`.
- Do not add other MCP domains/projects in this task.
- Implement Origin validation and auth checks on the remote endpoint.
- Do not add deprecated HTTP+SSE transport endpoints in this task.

## Auth model (v1)

- Use static bearer token auth for now.
- Generate token with cryptographic randomness, e.g. `openssl rand -hex 32`.
- Store token in Netlify env var (e.g. `DEEPSEEK_MCP_AUTH_TOKEN`), never in git.
- Remote function must validate `Authorization: Bearer <token>` on every request.
- Return `401` for missing/invalid token.
- In `server.json`, declare required auth header metadata without embedding token.

## Directory split

- `/Users/davidmontgomery/deepseek-mcp-server`:
  - Core DeepSeek MCP server logic (tools, API client, config).
  - npm package source + versioning.
  - `server.json` metadata.
  - stdio transport and tests.
  - OCI image build/publish config.
- `/Users/davidmontgomery/ragweld.com`:
  - Netlify function adapter for remote/HTTP mode.
  - Domain/DNS routing for `deepseek-mcp.ragweld.com`.
  - Optional docs mention of hosted endpoint.

## Step-by-step plan

### 0) Preflight tooling

- Confirm `mcp-publisher` is installed and authenticated. If missing, install first.
- Confirm Netlify auth and linked project from `ragweld.com`.

### 1) Baseline sanity checks

- In deepseek repo:
  - `git status --short --branch`
  - `npm run build && npm test`
- If local uncommitted tool-definition changes are present, ask user whether to keep/commit, stash, or discard before proceeding.
- If untracked `implementations/` is not needed, ask before deleting; otherwise ignore safely.

### 2) Core package updates (`deepseek-mcp-server`)

- Ensure server core is importable as a library (not CLI-only).
- Keep stdio CLI as package default entrypoint for local install compatibility.
- Export reusable handler/runtime wiring for HTTP adapter usage.
- Keep/add health utility endpoint behavior where useful.
- Harden tool definitions for code execution clients:
  - Expand tool descriptions with usage/default/side-effect guidance.
  - Ensure no-arg tools expose explicit empty input schemas.
  - Tighten schemas for key complex fields (`tools`, `tool_choice`, `stream_options`, etc.).
  - Keep raw provider payloads opt-in to avoid token bloat by default.
  - Return machine-readable error metadata for autonomous retry/fix logic.
- Add/update tests; keep green.

### 3) OCI image path (`deepseek-mcp-server`)

- Build/publish OCI image (Docker Hub or GHCR), target name example:
  - `docker.io/dmontgomery40/deepseek-mcp-server:0.4.0`
- Ensure image has required ownership annotation:
  - `LABEL io.modelcontextprotocol.server.name="io.github.DMontgomery40/deepseek"`
- Prefer image defaults that preserve local compatibility (stdio by default), with env override for HTTP mode if needed.
- Update `server.json` package metadata using `registryType: "oci"` (not `"docker"`).

### 4) Netlify function adapter (`ragweld.com`)

- Add `deepseek-mcp-server` dependency in `ragweld.com`.
- Create function route for MCP endpoint.
- Function requirements:
  - Validate `Authorization` bearer token
  - Validate `Origin` per allowed policy
  - Accept JSON POST for MCP requests
  - Return `405` for GET `/mcp` (JSON-only mode; no SSE stream in v1)
  - Return JSON-RPC response
  - Return `401` for bad auth, `405` for unsupported methods, and clear errors
  - Apply CORS policy intentionally (not wildcard by accident)
- Configure Netlify env vars:
  - `DEEPSEEK_API_KEY`
  - `DEEPSEEK_MCP_AUTH_TOKEN`

### 5) DNS + domain routing

- Add/attach `deepseek-mcp.ragweld.com` to Netlify site.
- Configure routing so `deepseek-mcp.ragweld.com/mcp` reaches function endpoint.
- Verify TLS and propagation.

### 6) External runtime validation

Validate from outside deploy context:
- Unauthorized `POST https://deepseek-mcp.ragweld.com/mcp` -> `401`
- `GET https://deepseek-mcp.ragweld.com/mcp` -> `405` (expected in v1 JSON-only mode)
- Authorized `initialize` succeeds
- Authorized `tools/list` returns expected tools
- At least one authorized `tools/call` succeeds

Add smoke test script in deepseek repo (`scripts/remote-smoke.mjs`) using
`StreamableHTTPClientTransport` with URL/token from env vars.

### 7) Registry metadata update (only after step 6 passes)

- Update `server.json` to include:
  - npm package entry (existing)
  - OCI package entry (new)
  - remotes entry (new)
- Correct remotes shape example:
  ```json
  "remotes": [
    {
      "type": "streamable-http",
      "url": "https://deepseek-mcp.ragweld.com/mcp",
      "headers": [
        {
          "name": "Authorization",
          "description": "Bearer token for hosted DeepSeek MCP access",
          "isRequired": true,
          "isSecret": true
        }
      ]
    }
  ]
  ```
- Bump version to `0.4.0`.
- Publish artifacts first (npm + OCI), then:
  - `mcp-publisher validate`
  - `mcp-publisher publish`
- After npm publish of `0.4.0`, update `ragweld.com` dependency to `deepseek-mcp-server@^0.4.0` and redeploy so hosted `initialize.serverInfo.version` matches release.

### 8) Documentation updates

- DeepSeek README:
  - Document npm/stdin mode
  - Document OCI image mode
  - Document hosted remote mode with real URL and auth expectations
  - No placeholder URLs
- ragweld.com docs mention is optional; minimal code comment is fine.

### 9) Final verification + operator handoff

- Registry query shows `packages` + `remotes`.
- Local install still works:
  - `npx -y deepseek-mcp-server`
- OCI image works:
  - `docker run --rm -e DEEPSEEK_API_KEY=... docker.io/dmontgomery40/deepseek-mcp-server:0.4.0`
- Remote endpoint verified with auth.
- Provide:
  - exact token rotation command
  - exact deploy command
  - env var update locations

## Acceptance criteria

- [ ] Public HTTPS endpoint live at `https://deepseek-mcp.ragweld.com/mcp`
- [ ] Endpoint returns `401` without valid bearer token
- [ ] Endpoint uses Streamable HTTP JSON-only mode: POST MCP flow works and GET `/mcp` returns `405`
- [ ] Registry entry contains `packages` (npm + OCI) and `remotes`
- [ ] Local stdio install via npx still works
- [ ] OCI image published and runnable
- [ ] Remote smoke tests pass against deployed URL
- [ ] README updated with all three modes documented
- [ ] Tool definitions pass code-execution quality bar (clear descriptions, explicit schemas, token-efficient default outputs, machine-readable errors)
- [ ] No placeholder URLs in committed code/metadata
- [ ] No secrets in git
- [ ] Version is `0.4.0` (not `1.0.0`)
- [ ] No deprecated HTTP+SSE transport endpoints are added

## Current-state command checklist

```bash
# DeepSeek repo state
cd /Users/davidmontgomery/deepseek-mcp-server
git status --short --branch
npm run build && npm test

# Netlify auth/status
cd /Users/davidmontgomery/ragweld.com
netlify status

# Current registry listing
curl -fsSL 'https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.DMontgomery40/deepseek' | jq

# Netlify DNS/site records via API (CLI-friendly)
netlify api getDNSForSite --data '{"site_id":"8195c3ab-d116-467d-9fee-981ad143ebc4"}' | jq
netlify api getDnsZones | jq
```

## Explicitly out of scope

- Ragweld product MCP server (`mcp.ragweld.com`) - separate future task
- OAuth/OIDC auth - bearer token is sufficient for v1
- Advanced rate limiting beyond defaults
- Monitoring/alerting build-out
- Additional language re-implementations

Focus on correctness over speed. Do not ship a fake remote listing.
