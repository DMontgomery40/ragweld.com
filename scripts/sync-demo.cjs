#!/usr/bin/env node

/**
 * Sync demo from tribrid-rag/web
 * Usage: node scripts/sync-demo.cjs ../tribrid-rag/web
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const sourceDir = process.argv[2] || '../tribrid-rag/web';
const targetDir = path.join(__dirname, '..', 'vendor', 'demo');

// Ensure source exists
if (!fs.existsSync(sourceDir)) {
  console.error(`Source directory not found: ${sourceDir}`);
  process.exit(1);
}

function copyDirIfExists(src, dest) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  execSync(`cp -R "${src}" "${dest}"`);
  return true;
}

function copyFileIfExists(src, dest) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
}

// Preserve ragweld demo-only assets across sync (source repo doesn't include them).
const preserveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ragweld-demo-sync-'));
const preserved = {
  mocks: copyDirIfExists(path.join(targetDir, 'src', 'mocks'), path.join(preserveDir, 'mocks')),
  mockServiceWorker: copyFileIfExists(
    path.join(targetDir, 'public', 'mockServiceWorker.js'),
    path.join(preserveDir, 'mockServiceWorker.js')
  ),
  mswVersion: null,
};

try {
  const existingPkgPath = path.join(targetDir, 'package.json');
  if (fs.existsSync(existingPkgPath)) {
    const existingPkg = JSON.parse(fs.readFileSync(existingPkgPath, 'utf-8'));
    preserved.mswVersion =
      existingPkg?.devDependencies?.msw ||
      existingPkg?.dependencies?.msw ||
      null;
  }
} catch {
  // ignore
}

// Clean target (except node_modules)
const itemsToRemove = fs.readdirSync(targetDir).filter(item => item !== 'node_modules');
for (const item of itemsToRemove) {
  fs.rmSync(path.join(targetDir, item), { recursive: true, force: true });
}

// Copy source to target
const itemsToCopy = fs.readdirSync(sourceDir).filter(item => item !== 'node_modules' && item !== 'dist');
for (const item of itemsToCopy) {
  const src = path.join(sourceDir, item);
  const dest = path.join(targetDir, item);
  execSync(`cp -R "${src}" "${dest}"`);
}

console.log(`Synced ${sourceDir} to ${targetDir}`);

// Restore preserved demo-only assets
if (preserved.mocks) {
  copyDirIfExists(path.join(preserveDir, 'mocks'), path.join(targetDir, 'src', 'mocks'));
}
if (preserved.mockServiceWorker) {
  copyFileIfExists(path.join(preserveDir, 'mockServiceWorker.js'), path.join(targetDir, 'public', 'mockServiceWorker.js'));
}

// Ensure MSW is available when mocks are present (keeps demo fallback working after sync)
try {
  const pkgPath = path.join(targetDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const hasMocks = fs.existsSync(path.join(targetDir, 'src', 'mocks'));
    if (hasMocks) {
      const mswVersion = preserved.mswVersion || '^2.12.8';
      pkg.devDependencies = pkg.devDependencies || {};
      if (!pkg.devDependencies.msw && !(pkg.dependencies && pkg.dependencies.msw)) {
        pkg.devDependencies.msw = mswVersion;
      }
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    }
  }
} catch (e) {
  console.warn('Warning: failed to ensure MSW dependency:', e?.message || e);
}

// Sync glossary.json for ragweld.com marketing site (pinned fallback for CI/Netlify)
const sourceGlossaryPath = path.join(sourceDir, 'public', 'glossary.json');
const targetGlossaryPath = path.join(__dirname, '..', 'public', 'glossary.json');
if (fs.existsSync(sourceGlossaryPath)) {
  fs.mkdirSync(path.dirname(targetGlossaryPath), { recursive: true });
  fs.copyFileSync(sourceGlossaryPath, targetGlossaryPath);
  console.log(`Synced glossary.json to ${targetGlossaryPath}`);
} else {
  console.warn(`Warning: glossary.json not found at ${sourceGlossaryPath} (leaving existing ${targetGlossaryPath} as-is)`);
}

// Patch vite.config.ts to use /demo/ base
const viteConfigPath = path.join(targetDir, 'vite.config.ts');
if (fs.existsSync(viteConfigPath)) {
  let content = fs.readFileSync(viteConfigPath, 'utf-8');
  // Replace base: '/web/' or similar with base: '/demo/'
  content = content.replace(/base:\s*['"][^'"]*['"]/g, "base: '/demo/'");
  // If no base found, add it
  if (!content.includes("base:")) {
    content = content.replace(
      /export default defineConfig\(\{/,
      "export default defineConfig({\n  base: '/demo/',"
    );
  }
  fs.writeFileSync(viteConfigPath, content);
  console.log('Patched vite.config.ts with base: /demo/');
}

// Patch demo entrypoint (basename + MSW bootstrap)
try {
  const patchScript = path.join(__dirname, 'patch-demo-entry.cjs');
  execSync(`node "${patchScript}"`, { stdio: 'inherit' });
} catch (e) {
  console.warn('Warning: failed to patch demo entrypoint:', e?.message || e);
}

console.log('Done! Run npm --prefix vendor/demo install to install dependencies.');
