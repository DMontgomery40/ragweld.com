#!/usr/bin/env node

/**
 * Patch the vendored demo Grafana experience after syncing from tribrid-rag/web.
 *
 * Responsibilities:
 * - Ensure TabRouter serves the internal embed route: /d/:uid/:slug
 * - Ensure the Grafana iframe passes embed=1 when base URL is same-origin (/demo)
 *
 * This keeps demo parity with localhost without requiring a real Grafana instance.
 */

const fs = require('fs');
const path = require('path');

const demoRoot = path.join(__dirname, '..', 'vendor', 'demo');
const tabRouterPath = path.join(demoRoot, 'src', 'components', 'Navigation', 'TabRouter.tsx');
const grafanaDashPath = path.join(demoRoot, 'src', 'components', 'Grafana', 'GrafanaDashboard.tsx');

function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

function writeText(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

function patchTabRouter() {
  if (!fs.existsSync(tabRouterPath)) {
    console.warn(`Warning: TabRouter not found (skipping): ${tabRouterPath}`);
    return;
  }
  let src = readText(tabRouterPath);

  if (src.includes('path="/d/:uid/:slug"') || src.includes("path='/d/:uid/:slug'")) {
    return;
  }

  // Ensure import exists.
  const importLine = `import GrafanaEmbed from '@/pages/GrafanaEmbed';\n`;
  if (!src.includes("from '@/pages/GrafanaEmbed'")) {
    // Insert after existing imports (best-effort: after SubtabErrorFallback import if present).
    const marker = "from '@/components/ui/SubtabErrorFallback';";
    if (src.includes(marker)) {
      src = src.replace(marker, `${marker}\n${importLine.trimEnd()}`);
      src += '\n';
    } else {
      src = `${importLine}${src}`;
    }
  }

  // Inject route immediately after <Routes> opening tag.
  const routesOpenRe = /<Routes>\s*/m;
  if (!routesOpenRe.test(src)) {
    console.warn('Warning: could not locate <Routes> in TabRouter.tsx (skipping embed route injection)');
    return;
  }

  const routeBlock =
    `  {/* Internal embed route used by the hosted /demo Grafana tab (same-origin iframe). */}\n` +
    `  <Route\n` +
    `    path="/d/:uid/:slug"\n` +
    `    element={(\n` +
    `      <ErrorBoundary\n` +
    `        context="route:/d/:uid/:slug"\n` +
    `        fallback={({ error, reset }) => (\n` +
    `          <div className="p-6">\n` +
    `            <SubtabErrorFallback\n` +
    `              title="Grafana embed crashed"\n` +
    `              context="Route path: /d/:uid/:slug"\n` +
    `              error={error}\n` +
    `              onRetry={reset}\n` +
    `            />\n` +
    `          </div>\n` +
    `        )}\n` +
    `      >\n` +
    `        <GrafanaEmbed />\n` +
    `      </ErrorBoundary>\n` +
    `    )}\n` +
    `  />\n\n`;

  src = src.replace(routesOpenRe, (m) => `${m}${routeBlock}`);
  writeText(tabRouterPath, src);
  console.log(`Patched TabRouter embed route: ${tabRouterPath}`);
}

function patchGrafanaDashboard() {
  if (!fs.existsSync(grafanaDashPath)) {
    console.warn(`Warning: GrafanaDashboard not found (skipping): ${grafanaDashPath}`);
    return;
  }
  let src = readText(grafanaDashPath);

  if (src.includes("params.set('embed', '1')") || src.includes('params.set("embed", "1")')) {
    return;
  }

  // Locate where query params are built.
  const paramsRe = /const\s+params\s*=\s*new\s+URLSearchParams\(\{\s*[\s\S]*?\}\);\s*/m;
  const match = src.match(paramsRe);
  if (!match) {
    console.warn('Warning: could not locate URLSearchParams block in GrafanaDashboard.tsx (skipping embed param injection)');
    return;
  }

  // Insert just before the Grafana URL `return \`${base}/d/...`.
  // Prefer a simple needle to avoid brittle escaping in regex literals.
  const needle = 'return `${base}/d/';
  const idx = src.indexOf(needle);
  if (idx === -1) {
    console.warn('Warning: could not locate Grafana URL return statement (skipping embed param injection)');
    return;
  }

  const inject =
    `    // If we're pointing at a same-origin route (e.g. /demo), render the iframe in "embed mode"\n` +
    `    // so it doesn't include the TriBridRAG chrome inside itself.\n` +
    `    if (base.startsWith('/')) params.set('embed', '1');\n\n`;

  src = `${src.slice(0, idx)}${inject}${src.slice(idx)}`;

  writeText(grafanaDashPath, src);
  console.log(`Patched GrafanaDashboard embed query param: ${grafanaDashPath}`);
}

patchTabRouter();
patchGrafanaDashboard();
