#!/usr/bin/env node

/**
 * Check/fix parity between ragweld/web (source) and ragweld.com/vendor/demo (target),
 * excluding explicit demo-only allowlisted paths.
 *
 * Usage:
 *   node scripts/check-demo-parity.cjs --source ../ragweld/web
 *   node scripts/check-demo-parity.cjs --source ../ragweld/web --fix
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const targetDir = path.join(root, 'vendor', 'demo');
const allowlistPath = path.join(__dirname, 'demo-parity-allowlist.json');

const SKIP_PREFIXES = ['node_modules/', 'dist/', '.tests/'];

function parseArgs(argv) {
  const out = {
    source: null,
    fix: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--source') {
      out.source = argv[++i] || null;
      continue;
    }
    if (arg === '--fix') {
      out.fix = true;
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

function normalizeRel(p) {
  return String(p || '').replace(/\\/g, '/');
}

function shouldSkip(relPath) {
  const rel = normalizeRel(relPath);
  if (!rel) return false;
  return SKIP_PREFIXES.some((prefix) => rel === prefix.slice(0, -1) || rel.startsWith(prefix));
}

function loadAllowlist() {
  if (!fs.existsSync(allowlistPath)) {
    throw new Error(`Allowlist file missing: ${allowlistPath}`);
  }
  const parsed = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));
  const allowed = Array.isArray(parsed?.allowed_paths) ? parsed.allowed_paths : [];
  return allowed.map((v) => String(v || '').trim()).filter(Boolean);
}

function matchesAllowed(relPath, pattern) {
  const rel = normalizeRel(relPath);
  const pat = normalizeRel(pattern);
  if (!pat) return false;
  if (pat.endsWith('/**')) {
    const prefix = pat.slice(0, -3);
    return rel.startsWith(prefix);
  }
  return rel === pat;
}

function isAllowed(relPath, allowedPatterns) {
  return allowedPatterns.some((pattern) => matchesAllowed(relPath, pattern));
}

function collectFiles(baseDir) {
  const out = new Map();

  function walk(curDir) {
    for (const entry of fs.readdirSync(curDir, { withFileTypes: true })) {
      const absPath = path.join(curDir, entry.name);
      const relPath = normalizeRel(path.relative(baseDir, absPath));
      if (shouldSkip(relPath)) continue;

      if (entry.isDirectory()) {
        walk(absPath);
        continue;
      }

      if (entry.isFile() || entry.isSymbolicLink()) {
        out.set(relPath, absPath);
      }
    }
  }

  walk(baseDir);
  return out;
}

function fileBuffersEqual(a, b) {
  const aBuf = fs.readFileSync(a);
  const bBuf = fs.readFileSync(b);
  return aBuf.equals(bBuf);
}

function computeDiffs(sourceFiles, targetFiles, allowedPatterns) {
  const allPaths = new Set([...sourceFiles.keys(), ...targetFiles.keys()]);
  const diffs = [];

  for (const relPath of [...allPaths].sort()) {
    if (isAllowed(relPath, allowedPatterns)) continue;

    const sourcePath = sourceFiles.get(relPath) || null;
    const targetPath = targetFiles.get(relPath) || null;

    if (!sourcePath && targetPath) {
      diffs.push({ kind: 'extra_in_target', relPath, sourcePath, targetPath });
      continue;
    }
    if (sourcePath && !targetPath) {
      diffs.push({ kind: 'missing_in_target', relPath, sourcePath, targetPath });
      continue;
    }
    if (sourcePath && targetPath && !fileBuffersEqual(sourcePath, targetPath)) {
      diffs.push({ kind: 'content_mismatch', relPath, sourcePath, targetPath });
    }
  }

  return diffs;
}

function applyFixes(diffs, sourceDir, targetDir) {
  let fixed = 0;

  for (const diff of diffs) {
    const targetPath = path.join(targetDir, diff.relPath);
    const sourcePath = path.join(sourceDir, diff.relPath);

    if (diff.kind === 'extra_in_target') {
      fs.rmSync(targetPath, { recursive: true, force: true });
      fixed += 1;
      continue;
    }

    if (diff.kind === 'missing_in_target' || diff.kind === 'content_mismatch') {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(sourcePath, targetPath);
      fixed += 1;
    }
  }

  return fixed;
}

function printDiffs(diffs) {
  console.error('Unexpected demo parity drift detected (non-allowlisted paths):');
  for (const diff of diffs) {
    console.error(`- [${diff.kind}] ${diff.relPath}`);
  }
}

function main() {
  const args = parseArgs(process.argv);
  const sourceDir = path.resolve(process.cwd(), args.source);
  const allowedPatterns = loadAllowlist();

  if (!fs.existsSync(sourceDir)) {
    console.error(`Source directory not found: ${sourceDir}`);
    process.exit(1);
  }
  if (!fs.existsSync(targetDir)) {
    console.error(`Target directory not found: ${targetDir}`);
    process.exit(1);
  }

  let sourceFiles = collectFiles(sourceDir);
  let targetFiles = collectFiles(targetDir);
  let diffs = computeDiffs(sourceFiles, targetFiles, allowedPatterns);

  if (!args.fix) {
    if (diffs.length > 0) {
      printDiffs(diffs);
      process.exit(1);
    }
    console.log('Demo parity check passed (no non-allowlisted drift).');
    return;
  }

  if (diffs.length > 0) {
    const fixed = applyFixes(diffs, sourceDir, targetDir);
    console.log(`Applied ${fixed} parity fix(es).`);
  }

  sourceFiles = collectFiles(sourceDir);
  targetFiles = collectFiles(targetDir);
  diffs = computeDiffs(sourceFiles, targetFiles, allowedPatterns);

  if (diffs.length > 0) {
    printDiffs(diffs);
    process.exit(1);
  }

  console.log('Demo parity fix complete (no non-allowlisted drift remains).');
}

main();
