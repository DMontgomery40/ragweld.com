#!/usr/bin/env node

/**
 * Deterministic sync from ragweld/web -> ragweld.com/vendor/demo.
 *
 * Pipeline:
 * 1) Mirror source web tree into vendor/demo (excluding build/runtime artifacts)
 * 2) Apply demo-owned overlays from demo-overrides/
 * 3) Ensure mockServiceWorker.js is present/up-to-date (best-effort)
 * 4) Sync glossary fallback for Astro pages (public/glossary.json)
 * 5) Write sync metadata to vendor/demo/.parity.json
 * 6) Run parity check (non-allowlisted drift fails)
 *
 * Usage:
 *   node scripts/sync-demo.cjs --source ../ragweld/web --source-sha <sha> --source-repo DMontgomery40/ragweld
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const targetDir = path.join(root, 'vendor', 'demo');
const overlaysDir = path.join(root, 'demo-overrides');
const ensureMswScript = path.join(__dirname, 'ensure-demo-msw.cjs');
const parityScript = path.join(__dirname, 'check-demo-parity.cjs');

function parseArgs(argv) {
  const out = {
    source: null,
    sourceSha: null,
    sourceRepo: 'DMontgomery40/ragweld',
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--source') {
      out.source = argv[++i] || null;
      continue;
    }
    if (arg === '--source-sha') {
      out.sourceSha = argv[++i] || null;
      continue;
    }
    if (arg === '--source-repo') {
      out.sourceRepo = argv[++i] || out.sourceRepo;
      continue;
    }
    if (!arg.startsWith('--') && !out.source) {
      // Backward-compatible positional source argument.
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

function shouldSkipRel(relPath) {
  const rel = normalizeRel(relPath);
  if (!rel) return false;
  if (rel === '.DS_Store' || rel.endsWith('/.DS_Store')) return true;
  if (rel === 'node_modules' || rel.startsWith('node_modules/')) return true;
  if (rel === 'dist' || rel.startsWith('dist/')) return true;
  if (rel === '.tests' || rel.startsWith('.tests/')) return true;
  return false;
}

function shouldSkipOverlayRel(relPath) {
  const rel = normalizeRel(relPath);
  if (!rel) return false;

  // Keep repo-local instructions in demo-overrides only; copying them into
  // vendor/demo creates immediate parity drift against the source web app.
  return rel === 'AGENTS.md' || rel.endsWith('/AGENTS.md');
}

function removeContentsExcept(dir, keep) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  for (const entry of fs.readdirSync(dir)) {
    if (keep.has(entry)) continue;
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
}

function copyTreeFiltered(srcRoot, dstRoot, options = {}) {
  const skipRel = typeof options.skipRel === 'function' ? options.skipRel : null;

  function walk(curSrc) {
    const entries = fs.readdirSync(curSrc, { withFileTypes: true });
    for (const entry of entries) {
      const srcAbs = path.join(curSrc, entry.name);
      const rel = normalizeRel(path.relative(srcRoot, srcAbs));
      if (shouldSkipRel(rel)) continue;
      if (skipRel && skipRel(rel, srcAbs, entry)) continue;

      const dstAbs = path.join(dstRoot, rel);
      if (entry.isDirectory()) {
        fs.mkdirSync(dstAbs, { recursive: true });
        walk(srcAbs);
        continue;
      }
      if (entry.isSymbolicLink()) {
        const linkTarget = fs.readlinkSync(srcAbs);
        fs.mkdirSync(path.dirname(dstAbs), { recursive: true });
        try {
          fs.rmSync(dstAbs, { force: true });
        } catch {
          // ignore
        }
        fs.symlinkSync(linkTarget, dstAbs);
        continue;
      }
      if (entry.isFile()) {
        fs.mkdirSync(path.dirname(dstAbs), { recursive: true });
        fs.copyFileSync(srcAbs, dstAbs);
      }
    }
  }

  walk(srcRoot);
}

function detectSourceSha(sourceDir) {
  const guessedRepoRoot = path.resolve(sourceDir, '..');
  const result = spawnSync('git', ['-C', guessedRepoRoot, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) return null;
  const sha = String(result.stdout || '').trim();
  return sha || null;
}

function syncGlossary(sourceDir) {
  const sourceGlossaryPath = path.join(sourceDir, 'public', 'glossary.json');
  const targetGlossaryPath = path.join(root, 'public', 'glossary.json');

  if (!fs.existsSync(sourceGlossaryPath)) {
    console.warn(`Warning: source glossary not found at ${sourceGlossaryPath}`);
    return;
  }

  fs.mkdirSync(path.dirname(targetGlossaryPath), { recursive: true });
  fs.copyFileSync(sourceGlossaryPath, targetGlossaryPath);
  console.log(`Synced glossary fallback: ${targetGlossaryPath}`);
}

function writeParityMetadata({ sourceRepo, sourceSha }) {
  const parityMetaPath = path.join(targetDir, '.parity.json');
  const payload = {
    schema_version: 1,
    source_repo: sourceRepo,
    source_path: 'web',
    source_sha: sourceSha || 'unknown',
    overlays_dir: 'demo-overrides',
    allowlist_file: 'scripts/demo-parity-allowlist.json',
  };
  fs.writeFileSync(parityMetaPath, JSON.stringify(payload, null, 2) + '\n');
  console.log(`Wrote parity metadata: ${parityMetaPath}`);
}

function main() {
  const args = parseArgs(process.argv);
  const sourceDir = path.resolve(process.cwd(), args.source);
  const sourceSha = args.sourceSha || detectSourceSha(sourceDir);

  if (!fs.existsSync(sourceDir)) {
    console.error(`Source directory not found: ${sourceDir}`);
    process.exit(1);
  }

  removeContentsExcept(targetDir, new Set(['node_modules']));
  copyTreeFiltered(sourceDir, targetDir);
  console.log(`Mirrored source: ${sourceDir} -> ${targetDir}`);

  if (fs.existsSync(overlaysDir)) {
    copyTreeFiltered(overlaysDir, targetDir, { skipRel: shouldSkipOverlayRel });
    console.log(`Applied overlays: ${overlaysDir} -> ${targetDir}`);
  } else {
    console.log(`No overlays found at ${overlaysDir} (continuing)`);
  }

  try {
    execSync(`node "${ensureMswScript}"`, { cwd: root, stdio: 'inherit' });
  } catch (e) {
    console.warn(`Warning: ensure-demo-msw failed (continuing): ${e?.message || e}`);
  }

  const workerPath = path.join(targetDir, 'public', 'mockServiceWorker.js');
  if (!fs.existsSync(workerPath)) {
    console.error(`Missing required demo worker file: ${workerPath}`);
    process.exit(1);
  }

  syncGlossary(sourceDir);
  writeParityMetadata({
    sourceRepo: args.sourceRepo,
    sourceSha,
  });

  execSync(`node "${parityScript}" --source "${sourceDir}"`, {
    cwd: root,
    stdio: 'inherit',
  });

  console.log('Demo sync complete.');
}

main();
