#!/usr/bin/env node

/**
 * Copy vendor/demo/dist to dist/demo/
 * Run after astro build
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const sourceDir = path.join(__dirname, '..', 'vendor', 'demo', 'dist');
const targetDir = path.join(__dirname, '..', 'dist', 'demo');

// Ensure source exists
if (!fs.existsSync(sourceDir)) {
  console.error('Demo dist not found. Run npm run build:demo first.');
  console.error(`Expected: ${sourceDir}`);
  process.exit(1);
}

// Create target directory
fs.mkdirSync(targetDir, { recursive: true });

// Copy all files
execSync(`cp -R "${sourceDir}/"* "${targetDir}/"`);

console.log(`Copied demo to ${targetDir}`);

// Verify mockServiceWorker.js exists
const mswPath = path.join(targetDir, 'mockServiceWorker.js');
if (!fs.existsSync(mswPath)) {
  console.warn('Warning: mockServiceWorker.js not found in demo dist');
}
