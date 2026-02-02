#!/usr/bin/env node

/**
 * Sync demo from tribrid-rag/web
 * Usage: node scripts/sync-demo.cjs ../tribrid-rag/web
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const sourceDir = process.argv[2] || '../tribrid-rag/web';
const targetDir = path.join(__dirname, '..', 'vendor', 'demo');

// Ensure source exists
if (!fs.existsSync(sourceDir)) {
  console.error(`Source directory not found: ${sourceDir}`);
  process.exit(1);
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
