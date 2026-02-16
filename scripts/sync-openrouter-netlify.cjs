#!/usr/bin/env node

/**
 * Sync OPENROUTER_API_KEY from ../ragweld/.env into the linked Netlify site.
 *
 * This avoids copying secrets into this repo (even gitignored).
 *
 * Usage:
 *   node scripts/sync-openrouter-netlify.cjs [path/to/ragweld/.env]
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function parseDotenvValue(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function extractEnvKey(envText, key) {
  const lines = String(envText || '').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = String(line || '').trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const k = trimmed.slice(0, idx).trim();
    if (k !== key) continue;
    const v = trimmed.slice(idx + 1);
    return parseDotenvValue(v);
  }
  return '';
}

function main() {
  const repoRoot = process.cwd();
  const envPath =
    process.argv[2] ||
    process.env.TRIBRID_ENV_PATH ||
    path.resolve(repoRoot, '..', 'ragweld', '.env');

  if (!fs.existsSync(envPath)) {
    console.error(`Could not find .env file at: ${envPath}`);
    process.exit(1);
  }

  const envText = fs.readFileSync(envPath, 'utf8');
  const key = extractEnvKey(envText, 'OPENROUTER_API_KEY');
  if (!key) {
    console.error(`OPENROUTER_API_KEY not found in ${envPath}`);
    process.exit(1);
  }

  const args = [
    'env:set',
    'OPENROUTER_API_KEY',
    key,
    '--context',
    'production',
    '--scope',
    'functions',
    '--secret',
    '--force',
  ];

  const result = spawnSync('netlify', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    const stdout = String(result.stdout || '').replaceAll(key, '[REDACTED]');
    const stderr = String(result.stderr || '').replaceAll(key, '[REDACTED]');
    console.error('Failed to set Netlify env var OPENROUTER_API_KEY.');
    if (stdout.trim()) console.error(stdout.trim());
    if (stderr.trim()) console.error(stderr.trim());
    process.exit(result.status || 1);
  }

  console.log('Netlify env var set: OPENROUTER_API_KEY (production/functions scope, secret).');
}

main();

