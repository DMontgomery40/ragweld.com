#!/usr/bin/env node

/**
 * Patch the vendored demo entrypoint after syncing from tribrid-rag/web.
 *
 * Responsibilities:
 * - Ensure BrowserRouter basename is "/demo"
 * - Inject MSW bootstrap with partial mocks by default and full mocks via ?mock=1
 *
 * This keeps ragweld.com/vendor/demo in sync while preserving demo-specific behavior.
 */

const fs = require('fs');
const path = require('path');

const demoRoot = path.join(__dirname, '..', 'vendor', 'demo');
const mainPath = path.join(demoRoot, 'src', 'main.tsx');

if (!fs.existsSync(mainPath)) {
  console.error(`Demo entrypoint not found: ${mainPath}`);
  process.exit(1);
}

let content = fs.readFileSync(mainPath, 'utf8');

// Always force basename to /demo.
content = content.replace(/basename=\"\/web\"/g, 'basename="/demo"');
content = content.replace(/basename=\"\/demo\/\"/g, 'basename="/demo"');

const START = '// ragweld:demo:msw:start';
const END = '// ragweld:demo:msw:end';

const mswBlock = `${START}
async function enableMocking() {
  // Only enable MSW in demo mode
  if (!window.location.pathname.startsWith('/demo')) {
    return
  }

  const { worker } = await import('./mocks/browser')
  const { handlersFull, handlersPartial } = await import('./mocks/handlers')

  const params = new URLSearchParams(window.location.search || '')
  const forceMock = params.get('mock') === '1'

  // In default mode we only mock demo-only tabs; core RAG endpoints pass through to the real backend.
  worker.resetHandlers(...(forceMock ? handlersFull : handlersPartial))

  await worker.start({
    serviceWorker: {
      url: '/demo/mockServiceWorker.js',
    },
    onUnhandledRequest: 'bypass',
    quiet: true,
  })
  console.log(\`[MSW] Mock service worker started for demo mode (mode=\${forceMock ? 'full' : 'partial'})\`)
}
${END}`;

function patchRenderWrapper(src) {
  const hasEnableMocking = src.includes('async function enableMocking()');
  if (hasEnableMocking) {
    // Replace existing enableMocking() wrapper block to keep it current.
    if (src.includes(START) && src.includes(END)) {
      src = src.replace(
        new RegExp(`${START}[\\s\\S]*?${END}`),
        mswBlock
      );
    }
    return src;
  }

  // Replace the direct ReactDOM.createRoot(...).render(...) call with a wrapper that starts MSW first.
  const idx = src.indexOf('ReactDOM.createRoot');
  if (idx === -1) {
    throw new Error('Could not find ReactDOM.createRoot(...) in main.tsx');
  }

  const before = src.slice(0, idx);
  const renderCall = src.slice(idx);

  // Indent render call inside enableMocking().then(() => { ... })
  const wrapped =
    `${mswBlock}\n\n` +
    `enableMocking().then(() => {\n` +
    renderCall
      .split('\n')
      .map((line) => `  ${line}`)
      .join('\n') +
    `\n})\n`;

  return before + wrapped;
}

try {
  content = patchRenderWrapper(content);
} catch (e) {
  console.error(String(e?.message || e));
  process.exit(1);
}

fs.writeFileSync(mainPath, content);
console.log(`Patched demo entrypoint: ${mainPath}`);

