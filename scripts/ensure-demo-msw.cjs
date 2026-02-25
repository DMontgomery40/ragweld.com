#!/usr/bin/env node

/**
 * Ensure vendor/demo has a working MSW setup.
 *
 * Why this exists:
 * - `src/mocks/browser.ts` imports `msw/browser`, so `msw` must be installed.
 * - Runtime mock mode expects `public/mockServiceWorker.js` to exist.
 * - Fresh `npm ci` runs used by Playwright/Netlify have repeatedly failed when
 *   either precondition drifted.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const demoRoot = path.join(root, 'vendor', 'demo');
const pkgPath = path.join(demoRoot, 'package.json');
const workerDest = path.join(demoRoot, 'public', 'mockServiceWorker.js');
const workerCandidates = [
  path.join(demoRoot, 'node_modules', 'msw', 'lib', 'mockServiceWorker.js'),
  path.join(demoRoot, 'node_modules', 'msw', 'src', 'mockServiceWorker.js'),
];

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

if (!fs.existsSync(pkgPath)) {
  fail(`Demo package.json not found: ${pkgPath}`);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const hasMswDependency = Boolean(pkg?.devDependencies?.msw || pkg?.dependencies?.msw);
if (!hasMswDependency) {
  fail('vendor/demo/package.json is missing `msw` dependency.');
}

const workerSource = workerCandidates.find((p) => fs.existsSync(p));
if (!workerSource) {
  fail(
    'MSW worker source not found in node_modules. Run `npm --prefix vendor/demo install` to install demo deps first.',
  );
}

const sourceBuf = fs.readFileSync(workerSource);
const sourceHash = sha256(sourceBuf);
let destHash = null;
if (fs.existsSync(workerDest)) {
  destHash = sha256(fs.readFileSync(workerDest));
}

if (destHash !== sourceHash) {
  fs.mkdirSync(path.dirname(workerDest), { recursive: true });
  fs.writeFileSync(workerDest, sourceBuf);
  console.log(`Updated MSW worker: ${path.relative(root, workerDest)}`);
} else {
  console.log(`MSW worker already up-to-date: ${path.relative(root, workerDest)}`);
}

