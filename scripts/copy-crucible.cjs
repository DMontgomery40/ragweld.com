#!/usr/bin/env node

/**
 * Copy crucible/dist to dist/crucible/
 * Run after astro build
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const sourceDir = path.join(__dirname, '..', 'crucible', 'dist');
const targetDir = path.join(__dirname, '..', 'dist', 'crucible');

if (!fs.existsSync(sourceDir)) {
  console.error('Crucible dist not found. Run npm run build:crucible first.');
  console.error(`Expected: ${sourceDir}`);
  process.exit(1);
}

fs.mkdirSync(targetDir, { recursive: true });
execSync(`cp -R "${sourceDir}/"* "${targetDir}/"`);

console.log(`Copied crucible to ${targetDir}`);
