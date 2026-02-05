#!/usr/bin/env node

/**
 * Index the Faxbot corpora into Neon (Netlify DB):
 * - faxbot (GitHub repo)
 * - faxbot_docs (published docs site)
 *
 * Usage:
 *   RAGWELD_DATABASE_URL=... node scripts/index-faxbot.cjs
 *
 * Notes:
 * - This script is designed for CI (GitHub Actions) and local runs.
 * - It does NOT require Netlify CLI; it connects directly via a Postgres URL.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { Client } = require('pg');

const DB_URL =
  process.env.RAGWELD_DATABASE_URL ||
  process.env.NETLIFY_DATABASE_URL ||
  process.env.DATABASE_URL ||
  '';

const FAXBOT_REPO_URL = process.env.FAXBOT_REPO_URL || 'https://github.com/dmontgomery40/faxbot.git';
const FAXBOT_REPO_REF = process.env.FAXBOT_REPO_REF || 'main';
const FAXBOT_REPO_PATH = process.env.FAXBOT_REPO_PATH || '';

const DOCS_SITEMAP_URL = process.env.FAXBOT_DOCS_SITEMAP || 'https://docs.faxbot.net/latest/sitemap.xml';
const DOCS_LIMIT = Number(process.env.FAXBOT_DOCS_LIMIT || '250');

const MAX_FILE_BYTES = Number(process.env.RAGWELD_MAX_FILE_BYTES || String(2 * 1024 * 1024)); // 2MB

// -----------------------------------------------------------------------------
// Semantic KG (Concepts + Relations) — heuristic mode
// -----------------------------------------------------------------------------
// Enables extra concept nodes + RELATED_TO edges (and module->concept references)
// derived from chunk text, with strict caps to avoid graph blowups.
const SEMANTIC_KG_ENABLED = String(process.env.RAGWELD_SEMANTIC_KG || '0').trim() === '1';
const SEMANTIC_KG_MODE = String(process.env.RAGWELD_SEMANTIC_KG_MODE || 'heuristic').trim().toLowerCase();
const SEMANTIC_KG_MAX_CHUNKS = Math.max(0, Number(process.env.RAGWELD_SEMANTIC_KG_MAX_CHUNKS || '200') || 200);
const SEMANTIC_KG_MAX_CONCEPTS_PER_CHUNK = Math.max(
  0,
  Number(process.env.RAGWELD_SEMANTIC_KG_MAX_CONCEPTS_PER_CHUNK || '8') || 8
);

const STOPWORDS = new Set([
  'a','an','and','are','as','at','be','but','by','can','could','did','do','does','for','from','has','have','how','if','in','into',
  'is','it','its','may','more','most','no','not','of','on','or','our','out','should','so','some','such','than','that','the','their',
  'then','there','these','this','those','to','was','we','were','what','when','where','which','who','why','will','with','you','your',
  // code-ish / noise
  'true','false','null','none','undefined','return','async','await','import','export','default','const','let','var','class','function',
  'def','self','new','type','types','string','number','bool','int','float','dict','list','set','tuple','object','json','http','https',
  'get','post','put','patch','delete','select','insert','update','create','table',
]);

function canonicalConcept(s) {
  return String(s || '').trim().toLowerCase();
}

function extractConceptsHeuristic(text, maxConcepts) {
  const s = String(text || '');
  const counts = new Map();
  const re = /[A-Za-z][A-Za-z0-9_]{2,}/g;
  let m;
  while ((m = re.exec(s))) {
    const raw = m[0];
    const tok = canonicalConcept(raw);
    if (!tok) continue;
    if (tok.length < 3 || tok.length > 32) continue;
    if (STOPWORDS.has(tok)) continue;
    // Avoid near-pure numeric identifiers.
    if (/^\d+$/.test(tok)) continue;
    counts.set(tok, (counts.get(tok) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, Math.max(0, maxConcepts || 0))
    .map(([tok]) => tok);
}

function sha1(input) {
  return crypto.createHash('sha1').update(String(input)).digest('hex');
}

function langFromPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.ts':
    case '.tsx':
      return 'typescript';
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
      return 'javascript';
    case '.py':
      return 'python';
    case '.md':
    case '.mdx':
      return 'markdown';
    case '.yml':
    case '.yaml':
      return 'yaml';
    case '.json':
      return 'json';
    case '.sql':
      return 'sql';
    case '.sh':
      return 'bash';
    default:
      return null;
  }
}

function shouldIndexFile(relPath) {
  const p = relPath.replace(/\\/g, '/');
  if (!p || p.startsWith('.git/')) return false;
  if (p.includes('/node_modules/')) return false;
  if (p.includes('/dist/')) return false;
  if (p.includes('/build/')) return false;
  if (p.includes('/.next/')) return false;
  if (p.includes('/.venv/')) return false;
  if (p.includes('/.cache/')) return false;
  if (p.includes('/coverage/')) return false;
  if (p.includes('/__pycache__/')) return false;
  if (p.endsWith('.lock')) return false;
  if (p.endsWith('.png') || p.endsWith('.jpg') || p.endsWith('.jpeg') || p.endsWith('.gif') || p.endsWith('.svg')) return false;
  if (p.endsWith('.woff') || p.endsWith('.woff2') || p.endsWith('.ttf') || p.endsWith('.otf')) return false;
  if (p.endsWith('.pdf')) return false;
  return true;
}

function walkFiles(rootDir) {
  const out = [];
  const stack = ['.'];
  while (stack.length) {
    const rel = stack.pop();
    const abs = path.join(rootDir, rel);
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const relChild = path.join(rel, ent.name);
      const absChild = path.join(rootDir, relChild);
      const relPosix = relChild.replace(/\\/g, '/').replace(/^\.\//, '');
      if (!shouldIndexFile(relPosix)) continue;
      if (ent.isDirectory()) {
        stack.push(relChild);
      } else if (ent.isFile()) {
        out.push({ rel: relPosix, abs: absChild });
      }
    }
  }
  return out;
}

function chunkByLines(text, opts) {
  const chunkSize = Math.max(20, Math.min(200, opts.chunkSize || 80));
  const overlap = Math.max(0, Math.min(chunkSize - 1, opts.overlap || 20));
  const lines = String(text || '').split(/\r?\n/);
  const chunks = [];
  if (!lines.length) return chunks;

  for (let start = 0; start < lines.length; ) {
    const end = Math.min(lines.length, start + chunkSize);
    const content = lines.slice(start, end).join('\n').trim();
    if (content) {
      chunks.push({
        start_line: start + 1,
        end_line: end,
        content,
      });
    }
    if (end >= lines.length) break;
    start = Math.max(0, end - overlap);
  }

  return chunks;
}

function stripHtmlToText(html) {
  let s = String(html || '');
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<\/(p|div|li|h1|h2|h3|h4|h5|h6|br|hr)>/gi, '\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/&nbsp;/g, ' ');
  s = s.replace(/&amp;/g, '&');
  s = s.replace(/&lt;/g, '<');
  s = s.replace(/&gt;/g, '>');
  s = s.replace(/&quot;/g, '"');
  s = s.replace(/&#39;/g, "'");
  s = s.replace(/\r/g, '');
  s = s.replace(/[ \t]+\n/g, '\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

function chunkTextByChars(text, opts) {
  const maxChars = Math.max(300, Math.min(4000, opts.maxChars || 1200));
  const overlap = Math.max(0, Math.min(maxChars - 50, opts.overlap || 200));
  const s = String(text || '').trim();
  const chunks = [];
  if (!s) return chunks;
  for (let i = 0; i < s.length; ) {
    const end = Math.min(s.length, i + maxChars);
    const piece = s.slice(i, end).trim();
    if (piece) chunks.push(piece);
    if (end >= s.length) break;
    i = Math.max(0, end - overlap);
  }
  return chunks;
}

function extractJsSymbols(text) {
  const out = { functions: new Set(), classes: new Set(), imports: [] };
  const lines = String(text || '').split(/\r?\n/);
  for (const line of lines) {
    const mFn = line.match(/\bfunction\s+([A-Za-z0-9_]+)\s*\(/);
    if (mFn) out.functions.add(mFn[1]);
    const mClass = line.match(/\bclass\s+([A-Za-z0-9_]+)\b/);
    if (mClass) out.classes.add(mClass[1]);
    const mConstFn = line.match(/\bconst\s+([A-Za-z0-9_]+)\s*=\s*(async\s*)?\(/);
    if (mConstFn) out.functions.add(mConstFn[1]);

    const mImport = line.match(/\bimport\b[\s\S]*?\bfrom\s+['"]([^'"]+)['"]/);
    if (mImport) out.imports.push(mImport[1]);
    const mImportSide = line.match(/^\s*import\s+['"]([^'"]+)['"]\s*;?\s*$/);
    if (mImportSide) out.imports.push(mImportSide[1]);
    const mRequire = line.match(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/);
    if (mRequire) out.imports.push(mRequire[1]);
  }
  return out;
}

function extractPySymbols(text) {
  const out = { functions: new Set(), classes: new Set(), imports: [] };
  const lines = String(text || '').split(/\r?\n/);
  for (const line of lines) {
    const mDef = line.match(/^\s*def\s+([A-Za-z0-9_]+)\s*\(/);
    if (mDef) out.functions.add(mDef[1]);
    const mClass = line.match(/^\s*class\s+([A-Za-z0-9_]+)\b/);
    if (mClass) out.classes.add(mClass[1]);
    const mFrom = line.match(/^\s*from\s+([A-Za-z0-9_\.]+)\s+import\s+/);
    if (mFrom) out.imports.push(mFrom[1]);
    const mImport = line.match(/^\s*import\s+([A-Za-z0-9_\.]+)/);
    if (mImport) out.imports.push(mImport[1]);
  }
  return out;
}

function resolveJsImport(fromRelPath, spec, knownFiles) {
  const fromDir = path.posix.dirname(fromRelPath);
  const s = String(spec || '').trim();
  if (!s) return null;

  if (s.startsWith('.') || s.startsWith('/')) {
    const base = s.startsWith('/') ? s.slice(1) : path.posix.normalize(path.posix.join(fromDir, s));
    const candidates = [];
    if (path.posix.extname(base)) {
      candidates.push(base);
    } else {
      const exts = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py'];
      for (const ext of exts) candidates.push(base + ext);
      for (const ext of exts) candidates.push(path.posix.join(base, 'index' + ext));
    }
    for (const c of candidates) {
      if (knownFiles.has(c)) return c;
    }
    return null;
  }

  // Package import: keep as a concept node.
  return { concept: s.split('/')[0] };
}

async function ensureSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS corpora (
      corpus_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      slug TEXT,
      branch TEXT,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_indexed TIMESTAMPTZ,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS chunks (
      chunk_id TEXT PRIMARY KEY,
      corpus_id TEXT NOT NULL REFERENCES corpora(corpus_id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      language TEXT,
      content TEXT NOT NULL,
      content_tsv TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('english', coalesce(content, ''))
      ) STORED
    );
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS chunks_corpus_file_idx ON chunks (corpus_id, file_path);`);
  await client.query(`CREATE INDEX IF NOT EXISTS chunks_corpus_tsv_idx ON chunks USING GIN (content_tsv);`);

  await client.query(`
    CREATE TABLE IF NOT EXISTS graph_entities (
      corpus_id TEXT NOT NULL REFERENCES corpora(corpus_id) ON DELETE CASCADE,
      entity_id TEXT NOT NULL,
      name TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      file_path TEXT,
      description TEXT,
      properties JSONB NOT NULL DEFAULT '{}'::jsonb,
      PRIMARY KEY (corpus_id, entity_id)
    );
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS graph_edges (
      corpus_id TEXT NOT NULL REFERENCES corpora(corpus_id) ON DELETE CASCADE,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      relation_type TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 1.0,
      properties JSONB NOT NULL DEFAULT '{}'::jsonb,
      PRIMARY KEY (corpus_id, source_id, target_id, relation_type)
    );
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS graph_entities_name_idx ON graph_entities (corpus_id, name);`);
  await client.query(`CREATE INDEX IF NOT EXISTS graph_edges_source_idx ON graph_edges (corpus_id, source_id);`);
  await client.query(`CREATE INDEX IF NOT EXISTS graph_edges_target_idx ON graph_edges (corpus_id, target_id);`);
}

async function seedCorpora(client) {
  await client.query(
    `
      INSERT INTO corpora (corpus_id, name, path, slug, branch, description)
      VALUES
        ('faxbot', 'Faxbot (Repo)', $1, 'faxbot', $2, 'Faxbot open-source repository'),
        ('faxbot_docs', 'Faxbot (Docs)', $3, 'faxbot_docs', NULL, 'Faxbot published documentation')
      ON CONFLICT (corpus_id) DO NOTHING;
    `,
    [
      FAXBOT_REPO_URL.replace(/\.git$/, ''),
      FAXBOT_REPO_REF,
      'https://docs.faxbot.net/latest/',
    ]
  );
}

async function insertChunks(client, rows) {
  if (!rows.length) return;
  const cols = ['chunk_id', 'corpus_id', 'file_path', 'start_line', 'end_line', 'language', 'content'];
  const batchSize = 200;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values = [];
    const params = [];
    let p = 1;
    for (const r of batch) {
      values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
      params.push(r.chunk_id, r.corpus_id, r.file_path, r.start_line, r.end_line, r.language, r.content);
    }
    await client.query(
      `INSERT INTO chunks (${cols.join(',')}) VALUES ${values.join(',')};`,
      params
    );
  }
}

async function insertGraphEntities(client, rows) {
  if (!rows.length) return;
  const cols = ['corpus_id', 'entity_id', 'name', 'entity_type', 'file_path', 'description', 'properties'];
  const batchSize = 500;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values = [];
    const params = [];
    let p = 1;
    for (const r of batch) {
      values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
      params.push(
        r.corpus_id,
        r.entity_id,
        r.name,
        r.entity_type,
        r.file_path,
        r.description,
        JSON.stringify(r.properties || {})
      );
    }
    await client.query(
      `INSERT INTO graph_entities (${cols.join(',')}) VALUES ${values.join(',')};`,
      params
    );
  }
}

async function insertGraphEdges(client, rows) {
  if (!rows.length) return;
  const cols = ['corpus_id', 'source_id', 'target_id', 'relation_type', 'weight', 'properties'];
  const batchSize = 1000;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values = [];
    const params = [];
    let p = 1;
    for (const r of batch) {
      values.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
      params.push(
        r.corpus_id,
        r.source_id,
        r.target_id,
        r.relation_type,
        r.weight == null ? 1.0 : r.weight,
        JSON.stringify(r.properties || {})
      );
    }
    await client.query(
      `INSERT INTO graph_edges (${cols.join(',')}) VALUES ${values.join(',')};`,
      params
    );
  }
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'ragweld-indexer/1.0 (+https://ragweld.com)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

async function indexDocsCorpus(client) {
  console.log(`Fetching docs sitemap: ${DOCS_SITEMAP_URL}`);
  let sitemap;
  try {
    sitemap = await fetchText(DOCS_SITEMAP_URL);
  } catch (e) {
    console.warn(`Docs sitemap fetch failed; skipping docs indexing: ${e.message || e}`);
    return { pages: 0, chunks: 0 };
  }

  const urls = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let m;
  while ((m = re.exec(sitemap))) {
    const u = String(m[1] || '').trim();
    if (u) urls.push(u);
  }

  const uniqueUrls = Array.from(new Set(urls)).slice(0, Math.max(1, DOCS_LIMIT));
  console.log(`Docs pages: ${uniqueUrls.length}`);

  await client.query(`DELETE FROM chunks WHERE corpus_id = 'faxbot_docs';`);

  const chunkRows = [];
  let pageCount = 0;
  for (const u of uniqueUrls) {
    let html;
    try {
      html = await fetchText(u);
    } catch {
      continue;
    }
    pageCount += 1;
    const text = stripHtmlToText(html);
    const pieces = chunkTextByChars(text, { maxChars: 1400, overlap: 250 });
    const filePath = u;
    for (let i = 0; i < pieces.length; i++) {
      const content = pieces[i];
      const chunkId = `faxbot_docs:${sha1(`${filePath}:${i}`)}`;
      chunkRows.push({
        chunk_id: chunkId,
        corpus_id: 'faxbot_docs',
        file_path: filePath,
        start_line: 1,
        end_line: 1,
        language: 'markdown',
        content,
      });
    }
  }

  console.log(`Docs chunks: ${chunkRows.length}`);
  await insertChunks(client, chunkRows);
  await client.query(`UPDATE corpora SET last_indexed = now() WHERE corpus_id = 'faxbot_docs';`);
  return { pages: pageCount, chunks: chunkRows.length };
}

function cloneRepoToTemp(url, ref) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ragweld-faxbot-'));
  console.log(`Cloning ${url} -> ${dir}`);
  execSync(`git clone --depth 1 --branch "${ref}" "${url}" "${dir}"`, { stdio: 'inherit' });
  return dir;
}

async function indexRepoCorpus(client) {
  const repoDir = FAXBOT_REPO_PATH ? path.resolve(FAXBOT_REPO_PATH) : cloneRepoToTemp(FAXBOT_REPO_URL, FAXBOT_REPO_REF);
  console.log(`Indexing repo from: ${repoDir}`);

  const files = walkFiles(repoDir);
  const knownFiles = new Set(files.map((f) => f.rel));

  await client.query(`DELETE FROM chunks WHERE corpus_id = 'faxbot';`);
  await client.query(`DELETE FROM graph_edges WHERE corpus_id = 'faxbot';`);
  await client.query(`DELETE FROM graph_entities WHERE corpus_id = 'faxbot';`);

  const chunkRows = [];
  const entityRows = [];

  const seenEntities = new Set();

  const edgeAgg = new Map();
  const addEdge = (row) => {
    const key = `${row.corpus_id}|${row.source_id}|${row.target_id}|${row.relation_type}`;
    const existing = edgeAgg.get(key);
    if (!existing) {
      edgeAgg.set(key, {
        ...row,
        weight: row.weight == null ? 1.0 : row.weight,
        properties: row.properties || {},
      });
      return;
    }

    // Default: keep first row (historical behavior) unless explicitly additive.
    const additive = row.relation_type === 'related_to' || row.relation_type === 'references';
    if (!additive) return;

    existing.weight = (Number(existing.weight) || 0) + (Number(row.weight) || 1.0);
    const props = existing.properties || {};
    const next = row.properties || {};

    const mergeList = (k, max = 25) => {
      const a = Array.isArray(props[k]) ? props[k].map(String) : [];
      const b = Array.isArray(next[k]) ? next[k].map(String) : [];
      if (!a.length && !b.length) return;
      const out = Array.from(new Set([...a, ...b])).slice(0, max);
      props[k] = out;
    };

    mergeList('chunk_ids', 25);
    mergeList('file_paths', 25);
    existing.properties = props;
  };

  const moduleEntityIdForFile = (rel) => `module:${rel}`;

  let semanticChunksSeen = 0;

  for (const f of files) {
    const rel = f.rel;
    const language = langFromPath(rel);
    if (!language) continue;

    let stat;
    try {
      stat = fs.statSync(f.abs);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_FILE_BYTES) continue;

    let text;
    try {
      text = fs.readFileSync(f.abs, 'utf8');
    } catch {
      continue;
    }
    if (!text.trim()) continue;

    // Chunks
    const chunks = chunkByLines(text, { chunkSize: 90, overlap: 25 });
    for (const c of chunks) {
      const chunkId = `faxbot:${sha1(`${rel}:${c.start_line}:${c.end_line}`)}`;
      chunkRows.push({
        chunk_id: chunkId,
        corpus_id: 'faxbot',
        file_path: rel,
        start_line: c.start_line,
        end_line: c.end_line,
        language,
        content: c.content,
      });

      // Semantic KG: concept extraction + RELATED_TO edges (and module->concept references)
      if (
        SEMANTIC_KG_ENABLED &&
        SEMANTIC_KG_MODE === 'heuristic' &&
        semanticChunksSeen < SEMANTIC_KG_MAX_CHUNKS
      ) {
        semanticChunksSeen += 1;

        const moduleId = moduleEntityIdForFile(rel);
        const concepts = extractConceptsHeuristic(c.content, SEMANTIC_KG_MAX_CONCEPTS_PER_CHUNK);
        if (concepts.length) {
          const conceptIds = [];
          for (const concept of concepts) {
            const conceptId = `concept:${concept}`;
            conceptIds.push(conceptId);

            if (!seenEntities.has(conceptId)) {
              seenEntities.add(conceptId);
              entityRows.push({
                corpus_id: 'faxbot',
                entity_id: conceptId,
                name: concept,
                entity_type: 'concept',
                file_path: null,
                description: null,
                properties: { kind: 'semantic_kg' },
              });
            }

            addEdge({
              corpus_id: 'faxbot',
              source_id: moduleId,
              target_id: conceptId,
              relation_type: 'references',
              weight: 1.0,
              properties: { chunk_ids: [chunkId], file_paths: [rel] },
            });
          }

          for (let i = 0; i < conceptIds.length; i++) {
            for (let j = i + 1; j < conceptIds.length; j++) {
              const a = conceptIds[i];
              const b = conceptIds[j];
              addEdge({
                corpus_id: 'faxbot',
                source_id: a,
                target_id: b,
                relation_type: 'related_to',
                weight: 1.0,
                properties: { chunk_ids: [chunkId], file_paths: [rel] },
              });
            }
          }
        }
      }
    }

    // Graph entities (module + symbols)
    const moduleId = moduleEntityIdForFile(rel);
    if (!seenEntities.has(moduleId)) {
      seenEntities.add(moduleId);
      entityRows.push({
        corpus_id: 'faxbot',
        entity_id: moduleId,
        name: path.posix.basename(rel),
        entity_type: 'module',
        file_path: rel,
        description: null,
        properties: { kind: 'file' },
      });
    }

    let symbols = null;
    if (language === 'typescript' || language === 'javascript') {
      symbols = extractJsSymbols(text);
    } else if (language === 'python') {
      symbols = extractPySymbols(text);
    }

    if (symbols) {
      for (const fn of symbols.functions) {
        const id = `function:${rel}:${fn}`;
        if (!seenEntities.has(id)) {
          seenEntities.add(id);
          entityRows.push({
            corpus_id: 'faxbot',
            entity_id: id,
            name: fn,
            entity_type: 'function',
            file_path: rel,
            description: null,
            properties: {},
          });
        }
        addEdge({
          corpus_id: 'faxbot',
          source_id: moduleId,
          target_id: id,
          relation_type: 'contains',
          weight: 1.0,
          properties: {},
        });
      }

      for (const cls of symbols.classes) {
        const id = `class:${rel}:${cls}`;
        if (!seenEntities.has(id)) {
          seenEntities.add(id);
          entityRows.push({
            corpus_id: 'faxbot',
            entity_id: id,
            name: cls,
            entity_type: 'class',
            file_path: rel,
            description: null,
            properties: {},
          });
        }
        addEdge({
          corpus_id: 'faxbot',
          source_id: moduleId,
          target_id: id,
          relation_type: 'contains',
          weight: 1.0,
          properties: {},
        });
      }

      if (symbols.imports && symbols.imports.length) {
        for (const spec of symbols.imports) {
          let target = null;
          if (language === 'typescript' || language === 'javascript') {
            target = resolveJsImport(rel, spec, knownFiles);
          } else {
            // Python: treat as concept node
            target = { concept: String(spec).split('.')[0] };
          }

          let targetId = null;
          if (typeof target === 'string') {
            targetId = moduleEntityIdForFile(target);
          } else if (target && target.concept) {
            const name = canonicalConcept(target.concept);
            if (!name) continue;
            targetId = `concept:${name}`;
            if (!seenEntities.has(targetId)) {
              seenEntities.add(targetId);
              entityRows.push({
                corpus_id: 'faxbot',
                entity_id: targetId,
                name,
                entity_type: 'concept',
                file_path: null,
                description: null,
                properties: { kind: 'package' },
              });
            }
          } else {
            continue;
          }

          addEdge({
            corpus_id: 'faxbot',
            source_id: moduleId,
            target_id: targetId,
            relation_type: 'imports',
            weight: 1.0,
            properties: { spec },
          });
        }
      }
    }
  }

  const edgeRows = Array.from(edgeAgg.values());

  console.log(`Repo chunks: ${chunkRows.length}`);
  console.log(`Graph entities: ${entityRows.length}`);
  console.log(`Graph edges: ${edgeRows.length}`);

  await insertChunks(client, chunkRows);
  await insertGraphEntities(client, entityRows);
  await insertGraphEdges(client, edgeRows);

  await client.query(`UPDATE corpora SET last_indexed = now() WHERE corpus_id = 'faxbot';`);
  return { files: files.length, chunks: chunkRows.length, entities: entityRows.length, edges: edgeRows.length };
}

async function main() {
  if (!DB_URL) {
    console.error('Missing database URL. Set RAGWELD_DATABASE_URL (recommended) or NETLIFY_DATABASE_URL/DATABASE_URL.');
    process.exit(2);
  }

  const client = new Client({ connectionString: DB_URL });
  await client.connect();

  try {
    await ensureSchema(client);
    await seedCorpora(client);

    console.log('--- Index: Faxbot repo ---');
    const repoStats = await indexRepoCorpus(client);

    console.log('--- Index: Faxbot docs ---');
    const docsStats = await indexDocsCorpus(client);

    console.log('Done.');
    console.log({ repo: repoStats, docs: docsStats });
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
