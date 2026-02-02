#!/usr/bin/env node

/**
 * Validate that the demo was built and copied correctly
 * Run as part of Netlify build to fail fast on broken demos
 */

const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist');
const demoDir = path.join(distDir, 'demo');

const requiredFiles = [
  'index.html',
  'mockServiceWorker.js',
];

let hasErrors = false;

// Check dist exists
if (!fs.existsSync(distDir)) {
  console.error('ERROR: dist/ directory not found');
  process.exit(1);
}

// Check demo exists
if (!fs.existsSync(demoDir)) {
  console.error('ERROR: dist/demo/ directory not found');
  console.error('Run npm run build:demo and npm run copy:demo first');
  process.exit(1);
}

// Check required files
for (const file of requiredFiles) {
  const filePath = path.join(demoDir, file);
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: Missing required file: dist/demo/${file}`);
    hasErrors = true;
  } else {
    console.log(`OK: dist/demo/${file}`);
  }
}

// Check for assets
const assetsDir = path.join(demoDir, 'assets');
if (!fs.existsSync(assetsDir)) {
  console.warn('Warning: dist/demo/assets/ not found (may be expected)');
} else {
  const assetFiles = fs.readdirSync(assetsDir);
  console.log(`OK: dist/demo/assets/ (${assetFiles.length} files)`);
}

if (hasErrors) {
  console.error('\nValidation failed!');
  process.exit(1);
}

console.log('\nDemo validation passed!');
