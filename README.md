# ragweld.com

Landing page for [ragweld](https://github.com/DMontgomery40/tribrid-rag) - the tribrid RAG engine.

## Features

- Minimal landing page built with Astro + Tailwind
- Live demo with the full tribrid-rag GUI
- MSW (Mock Service Worker) mocks API responses for demo mode

## Development

```bash
# Install dependencies
npm install

# Install demo dependencies
npm --prefix vendor/demo install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npx serve dist
```

## Demo

The demo at `/demo/` runs the actual tribrid-rag React app with MSW intercepting all API calls to provide simulated responses.

### Mock Data

- **Corpora**: Faxbot, Vivified (cross-promotion)
- **Models**: GPT-4o, Claude 3.5 Sonnet, Ollama local
- **Chat**: Streaming responses with simulated latency

## Deployment

Deployed to Netlify with automatic builds on push to main.

```bash
# Initial setup
gh repo create ragweld.com --public
netlify init
git push -u origin main
```

## Syncing Demo

To sync changes from tribrid-rag:

```bash
node scripts/sync-demo.cjs ../tribrid-rag/web
npm --prefix vendor/demo install
npm run build
```

## License

MIT
