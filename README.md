# ragweld.com

> See inside your RAG pipeline. Then fix it.

This repo powers the public ragweld site and live hosted demo. It is the product-facing surface for the open-source ragweld **MLOps Engineering Platform**: tri-brid retrieval (vector + sparse + graph), synthetic data generation, dual training studios, evaluation/drilldowns, observability, routing, and ops tooling.

## Live Surfaces

- Local workspace: `../ragweld.com` or `ragweld.com`
- Live site: [https://ragweld.com/](https://ragweld.com/)
- Live demo: [https://ragweld.com/demo/](https://ragweld.com/demo/)
- Glossary: [https://ragweld.com/glossary/](https://ragweld.com/glossary/)
- Learning Ranker deep link: [https://ragweld.com/demo/rag?subtab=learning-ranker](https://ragweld.com/demo/rag?subtab=learning-ranker)
- Docs (default settings/config view): [https://dmontgomery40.github.io/ragweld/latest/configuration/](https://dmontgomery40.github.io/ragweld/latest/configuration/)

## What ragweld is (from the website)

- MLOps Engineering Platform for retrieval + agent systems.
- Three retrieval legs, independently tunable: vector + sparse (BM25) + graph.
- Synthetic Data Lab for eval datasets, semantic cards, triplets, keywords, and autotune outputs.
- Dual training studios: trainable reranker + trainable in-product agent LLM.
- Benchmark + eval workflow: run, compare, drill down, and ship changes based on evidence.
- Learning reranker: Qwen3-style yes/no logits scoring plus LoRA training from feedback.
- Embedded observability: tracing + Grafana split-view inside the workbench.
- Semantic cache + recall gating controls in the chat path.
- Model/provider routing with daily-refresh catalog and custom model registration.
- Alerting hooks: threshold-based webhook alerts for quality and latency regressions.
- MCP-native: use ragweld capabilities from IDEs, agents, and automation clients.
- Parameter glossary: searchable reference for the full config surface.

## Quickstart

```bash
# Install root dependencies
npm install

# Install demo dependencies (vendored React app)
npm run deps:demo

# Start Astro site in dev mode
npm run dev

# Run full local stack (Astro + Netlify Functions)
netlify dev

# Build demo + site for production
npm run build

# Preview production output
npm run preview
```

## Demo Behavior

The hosted demo at `/demo/` runs the vendored React app in `vendor/demo`.

- Default mode: core RAG endpoints call live backend routes under `/api/*`.
- Mock fallback: append `?mock=1` to force full MSW demo mocks.

Useful URLs:

- `/demo/?corpus=epstein-files-1`
- `/demo/rag?subtab=learning-ranker&corpus=epstein-files-1`
- `/demo/start`
- `/glossary/`

## Architecture

- Astro landing site: `src/`
- Vendored demo app: `vendor/demo/` (built with Vite, served at `/demo/`)
- Hosted API: `netlify/functions/api.js` (mapped from `/api/*`)
- Deploy/runtime config: `netlify.toml`

High-level flow:

1. Astro renders marketing pages and embeds/links the live demo.
2. `/demo/*` serves the vendored React GUI.
3. GUI calls same-origin `/api/*` endpoints.
4. Netlify Function routes and serves backend responses (Neon-backed via Netlify DB).

## Demo Sync + Parity

```bash
# Sync demo UI from sibling ragweld repo (source wins)
npm run sync:demo

# Strict parity check (fails on non-allowlisted drift)
npm run check:demo-parity

# Build demo + site
npm run build
```

Parity policy:

- Source of truth for vendored UI is `../ragweld/web`.
- Hosted-specific UI changes must be implemented in `demo-overrides/`, not by direct edits under `vendor/demo/`.
- Non-allowlisted drift in `vendor/demo/` should be reconciled with `npm run sync:demo`.

Netlify build config uses:

- Build command: `npm run build && node scripts/validate-demo.cjs`
- Publish directory: `dist`

## Quality Checks

```bash
# End-to-end tests
npm run test:e2e

# Single spec
npx playwright test tests/e2e/landing.spec.ts
```

## License

MIT
