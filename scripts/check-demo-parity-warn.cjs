#!/usr/bin/env node

/**
 * Warn-only parity wrapper for build environments.
 *
 * Behavior:
 * - If source directory exists, run strict parity check and print warnings on drift.
 * - If source directory is missing, print a warning and skip.
 * - Never exits non-zero.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const parityScript = path.join(__dirname, 'check-demo-parity.cjs');

function parseArgs(argv) {
  const out = {
    source: null,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--source') {
      out.source = argv[++i] || null;
      continue;
    }
    if (!arg.startsWith('--') && !out.source) {
      out.source = arg;
      continue;
    }
  }

  if (!out.source) out.source = '../ragweld/web';
  return out;
}

function printPrefixed(block) {
  const text = String(block || '').trim();
  if (!text) return;
  for (const line of text.split(/\r?\n/)) {
    console.warn(`[demo-parity:warn] ${line}`);
  }
}

function main() {
  const args = parseArgs(process.argv);
  const sourceDir = path.resolve(process.cwd(), args.source);

  if (!fs.existsSync(sourceDir)) {
    console.warn(
      `[demo-parity:warn] Source directory not found at ${sourceDir}; skipping strict parity check.`
    );
    process.exit(0);
  }

  const result = spawnSync(process.execPath, [parityScript, '--source', sourceDir], {
    cwd: root,
    encoding: 'utf8',
  });

  if (result.error) {
    console.warn(`[demo-parity:warn] Failed to run strict parity check: ${result.error.message}`);
    process.exit(0);
  }

  if (result.status === 0) {
    printPrefixed(result.stdout);
    console.log('[demo-parity:warn] Demo parity check is clean.');
    process.exit(0);
  }

  console.warn('[demo-parity:warn] Demo parity drift detected (non-blocking):');
  printPrefixed(result.stdout);
  printPrefixed(result.stderr);
  console.warn('[demo-parity:warn] Continuing build. Run `npm run sync:demo` to reconcile drift.');
  process.exit(0);
}

main();
