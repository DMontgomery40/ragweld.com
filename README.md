# ragweld.com

Landing page for [ragweld](https://github.com/DMontgomery40/tribrid-rag) - the tribrid RAG engine.

**Live site:** https://ragweld.netlify.app

## Features

- Minimal landing page built with Astro + Tailwind
- Live demo with the full tribrid-rag GUI
- Netlify Functions + Netlify DB (Neon Postgres) back the live demo API
- MSW (Mock Service Worker) provides a demo-only fallback (`?mock=1`) and stubs non-live tabs
- Auto-sync from tribrid-rag/web via GitHub Actions

## Development

```bash
# Install dependencies
npm install

# Install demo dependencies
npm --prefix vendor/demo install

# Start dev server
npm run dev

# (Recommended) Run the full site with Functions locally
netlify dev

# Build for production
npm run build

# Preview production build
npx serve dist
```

## Demo

The demo at `/demo/` runs the actual tribrid-rag React app.

- Default: core RAG endpoints hit the live Netlify Functions backend (`/api/*`), backed by Netlify DB (Neon).
- Fallback: add `?mock=1` to force MSW full-mock mode.

### Mock Data

- **Corpora**: Faxbot, Vivified (cross-promotion)
- **Models**: GPT-4o, Claude 3.5 Sonnet, Ollama local
- **Chat**: Streaming responses with simulated latency

### MSW Mocks

The MSW handlers are in `vendor/demo/src/mocks/`:
- `browser.ts` - Worker setup
- `handlers.ts` - API endpoint handlers
- `data.ts` - Mock response data

## Netlify backend (live)

The live demo backend is implemented as a single Netlify Function:

- `netlify/functions/api.ts` (routes `/api/*`)

It serves:
- `/api/health`
- `/api/corpora` (Faxbot repo + Faxbot docs)
- `/api/search` (sparse/FTS)
- `/api/chat` and `/api/chat/stream` (RAG + citations)
- `/api/graph/*` (graph visualizer data, Neo4j-free)

### Required env vars (Netlify)
- Netlify DB injects `NETLIFY_DATABASE_URL` automatically.
- Set `OPENAI_API_KEY` (or update the function to support Anthropic) for live chat.

## Indexing (GitHub Actions → Neon)

The indexing workflow populates Neon with chunks and a repo graph:
- `.github/workflows/index-faxbot.yml`
- `scripts/index-faxbot.cjs`

You must add a GitHub Actions secret:
- `RAGWELD_DATABASE_URL` = the Neon Postgres connection string.

## CI/CD Setup

### 1. Connect Netlify to GitHub (one-time)

1. Go to https://app.netlify.com/projects/ragweld/configuration/deploys
2. Click "Link to Git provider"
3. Select GitHub and authorize
4. Choose `DMontgomery40/ragweld.com`
5. Set build command: `npm run build && node scripts/validate-demo.cjs`
6. Set publish directory: `dist`

### 2. Setup Auto-Sync from tribrid-rag (one-time)

In the **tribrid-rag** repo:

1. Create a GitHub Personal Access Token (PAT):
   - Go to https://github.com/settings/tokens
   - Generate new token (classic) with `repo` scope
   - Copy the token

2. Add the secret to tribrid-rag:
   - Go to https://github.com/DMontgomery40/tribrid-rag/settings/secrets/actions
   - Click "New repository secret"
   - Name: `RAGWELD_DEPLOY_TOKEN`
   - Value: (paste the PAT)

Now when you push changes to `tribrid-rag/web/`, the GitHub Action will:
1. Copy updated files to ragweld.com/vendor/demo/
2. Preserve MSW mocks
3. Patch paths for /demo/ base + MSW bootstrap
4. Commit and push to ragweld.com
5. Netlify auto-deploys from the push

## Manual Sync

To manually sync changes from tribrid-rag:

```bash
# From ragweld.com directory
node scripts/sync-demo.cjs ../tribrid-rag/web
npm --prefix vendor/demo install
npm run build
```

## Architecture

```
ragweld.com/
├── src/                    # Astro landing page
│   └── pages/index.astro   # Main page with iframe to /demo/
├── vendor/
│   └── demo/               # Vendored tribrid-rag/web
│       ├── src/
│       │   └── mocks/      # MSW handlers (ragweld-specific)
│       └── vite.config.ts  # Patched: base='/demo/'
└── dist/                   # Built output
    ├── index.html          # Landing page
    └── demo/               # Built React app
```

## License

MIT
