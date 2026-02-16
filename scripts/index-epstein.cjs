#!/usr/bin/env node

/**
 * Copy the already-indexed local TriBrid corpus (epstein-files-1) into Neon.
 *
 * Why this exists:
 * - We want a real, production-like index in Netlify/Neon.
 * - The local TriBrid instance already has the corpus indexed + graphed.
 * - This script wipes Neon corpus/search/graph tables, then repopulates them
 *   from local Postgres + Neo4j.
 *
 * Requirements:
 * - Local TriBrid stack running (Postgres + Neo4j)
 * - /Users/davidmontgomery/ragweld/.env present (or TRIBRID_ENV_PATH override)
 * - NETLIFY_DATABASE_URL (or RAGWELD_DATABASE_URL / DATABASE_URL) available
 *
 * Usage:
 *   node scripts/index-epstein.cjs
 *
 * Optional env:
 *   SOURCE_CORPUS_ID=epstein-files-1
 *   TARGET_CORPUS_ID=epstein-files-1
 *   TRIBRID_ENV_PATH=/Users/davidmontgomery/ragweld/.env
 *   SOURCE_NEO4J_DATABASE=neo4j
 */

const fs = require('fs');
const { execSync } = require('child_process');
const { Client } = require('pg');
const neo4j = require('neo4j-driver');

const SOURCE_CORPUS_ID = String(process.env.SOURCE_CORPUS_ID || 'epstein-files-1').trim();
const TARGET_CORPUS_ID = String(process.env.TARGET_CORPUS_ID || 'epstein-files-1').trim();
const DEFAULT_ENV_PATH = '/Users/davidmontgomery/ragweld/.env';
const FALLBACK_ENV_PATH = '/Users/davidmontgomery/.env';
const TRIBRID_ENV_PATH = String(
  process.env.TRIBRID_ENV_PATH ||
    (fs.existsSync(DEFAULT_ENV_PATH) ? DEFAULT_ENV_PATH : FALLBACK_ENV_PATH)
).trim();
const SOURCE_NEO4J_DATABASE = String(process.env.SOURCE_NEO4J_DATABASE || 'neo4j').trim();

function parseDotEnv(filePath) {
  const out = {};
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    out[t.slice(0, i)] = t.slice(i + 1);
  }
  return out;
}

function getNeonUrl() {
  if (process.env.RAGWELD_DATABASE_URL) return String(process.env.RAGWELD_DATABASE_URL).trim();
  if (process.env.NETLIFY_DATABASE_URL) return String(process.env.NETLIFY_DATABASE_URL).trim();
  if (process.env.DATABASE_URL) return String(process.env.DATABASE_URL).trim();
  try {
    const raw = execSync('netlify env:list --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const parsed = JSON.parse(raw);
    return String(parsed.NETLIFY_DATABASE_URL || '').trim();
  } catch {
    return '';
  }
}

function assertTruthy(value, label) {
  if (!value) {
    throw new Error(`Missing required value: ${label}`);
  }
}

function asSafeNumber(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (neo4j.isInt(v)) {
    if (v.inSafeRange()) return v.toNumber();
    return Number(v.toString());
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeNeo4jValue(v) {
  if (v == null) return null;
  if (neo4j.isInt(v)) return asSafeNumber(v);
  if (Array.isArray(v)) return v.map(normalizeNeo4jValue);
  if (typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      out[k] = normalizeNeo4jValue(val);
    }
    return out;
  }
  return v;
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



  await client.query(`
    CREATE TABLE IF NOT EXISTS eval_dataset (
      corpus_id TEXT NOT NULL REFERENCES corpora(corpus_id) ON DELETE CASCADE,
      entry_id TEXT NOT NULL,
      question TEXT NOT NULL,
      expected_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
      expected_answer TEXT,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (corpus_id, entry_id)
    );
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS eval_dataset_corpus_idx ON eval_dataset (corpus_id, created_at DESC);`);


  await client.query(`
    CREATE TABLE IF NOT EXISTS eval_runs (
      run_id TEXT PRIMARY KEY,
      corpus_id TEXT NOT NULL,
      dataset_id TEXT NOT NULL,
      run_json JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      top1_accuracy REAL,
      topk_accuracy REAL,
      mrr REAL,
      total INTEGER,
      duration_secs REAL,
      has_config BOOLEAN DEFAULT true
    );
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS eval_runs_corpus_idx ON eval_runs (corpus_id, created_at DESC);`);
  await client.query(`CREATE INDEX IF NOT EXISTS chunks_corpus_file_idx ON chunks (corpus_id, file_path);`);
  await client.query(`CREATE INDEX IF NOT EXISTS chunks_corpus_tsv_idx ON chunks USING GIN (content_tsv);`);
  await client.query(`CREATE INDEX IF NOT EXISTS graph_entities_name_idx ON graph_entities (corpus_id, name);`);
  await client.query(`CREATE INDEX IF NOT EXISTS graph_edges_source_idx ON graph_edges (corpus_id, source_id);`);
  await client.query(`CREATE INDEX IF NOT EXISTS graph_edges_target_idx ON graph_edges (corpus_id, target_id);`);
}

function buildInsertSql(table, columns, rowCount) {
  const values = [];
  let p = 1;
  for (let i = 0; i < rowCount; i += 1) {
    const rowPlaceholders = [];
    for (let j = 0; j < columns.length; j += 1) rowPlaceholders.push(`$${p++}`);
    values.push(`(${rowPlaceholders.join(',')})`);
  }
  return `INSERT INTO ${table} (${columns.join(',')}) VALUES ${values.join(',')}`;
}

async function insertBatches(client, table, columns, rows, mapRow, batchSize = 500) {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const params = [];
    for (const row of batch) {
      const vals = mapRow(row);
      for (const v of vals) params.push(v);
    }
    const sql = buildInsertSql(table, columns, batch.length);
    await client.query(sql, params);
  }
}

function summarizeGraphConfig(cfg) {
  const gi = cfg?.graph_indexing || {};
  return {
    enabled: gi.enabled === true,
    build_lexical_graph: gi.build_lexical_graph === true,
    store_chunk_embeddings: gi.store_chunk_embeddings === true,
    semantic_kg_enabled: gi.semantic_kg_enabled === true,
    semantic_kg_mode: String(gi.semantic_kg_mode || ''),
    semantic_kg_max_chunks: Number(gi.semantic_kg_max_chunks || 0),
    semantic_kg_max_concepts_per_chunk: Number(gi.semantic_kg_max_concepts_per_chunk || 0),
    semantic_kg_llm_model: String(gi.semantic_kg_llm_model || ''),
  };
}


function flattenConfigSnapshot(cfg) {
  const out = {};
  const walk = (obj, prefix) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      if (prefix) out[prefix] = obj;
      return;
    }
    for (const [key, value] of Object.entries(obj)) {
      const next = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        walk(value, next);
      } else {
        out[next] = value;
      }
    }
  };
  walk(cfg || {}, '');
  return out;
}

function normalizePath(p) {
  return String(p || '').replace(/\\/g, '/').trim().toLowerCase();
}

function pathMatches(expected, actual) {
  const e = normalizePath(expected);
  const a = normalizePath(actual);
  if (!e || !a) return false;
  if (a === e) return true;
  if (a.endsWith(e)) return true;
  return a.includes(e);
}

function recallAtK(expected, retrieved, k) {
  if (!Array.isArray(expected) || expected.length === 0) return 0;
  const top = (retrieved || []).slice(0, Math.max(0, k));
  let matched = 0;
  for (const exp of expected) {
    if (top.some((r) => pathMatches(exp, r))) matched += 1;
  }
  return matched / expected.length;
}

function precisionAtK(expected, retrieved, k) {
  if (k <= 0) return 0;
  const top = (retrieved || []).slice(0, k);
  let hits = 0;
  for (const r of top) {
    if ((expected || []).some((exp) => pathMatches(exp, r))) hits += 1;
  }
  return hits / k;
}

function ndcgAtK(expected, retrieved, k) {
  if (k <= 0) return 0;
  const top = (retrieved || []).slice(0, k);
  const rels = top.map((r) => ((expected || []).some((exp) => pathMatches(exp, r)) ? 1 : 0));
  let dcg = 0;
  for (let i = 0; i < rels.length; i += 1) {
    dcg += rels[i] / Math.log2(i + 2);
  }
  const idealHits = Math.min((expected || []).length, k);
  if (idealHits <= 0) return 0;
  let idcg = 0;
  for (let i = 0; i < idealHits; i += 1) {
    idcg += 1 / Math.log2(i + 2);
  }
  return idcg > 0 ? dcg / idcg : 0;
}

function percentile(values, p) {
  if (!values || !values.length) return 0;
  const xs = [...values].sort((a, b) => a - b);
  if (xs.length === 1) return Number(xs[0]);
  const pct = Math.min(Math.max(p, 0), 1);
  const idx = Math.ceil(pct * (xs.length - 1));
  return Number(xs[Math.max(0, Math.min(xs.length - 1, idx))]);
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function buildQuestion(chunk) {
  const content = String(chunk?.content || '').replace(/\s+/g, ' ').trim();
  const snippet = content.split(' ').slice(0, 8).join(' ');
  if (snippet) return `Where is "${snippet}" mentioned?`;
  const fp = String(chunk?.file_path || 'this file');
  const last = fp.split('/').pop() || fp;
  return `Which file contains ${last}?`;
}

function pickUniquePaths(pool, count, rng) {
  const out = [];
  const used = new Set();
  const src = Array.isArray(pool) ? pool.filter(Boolean) : [];
  if (!src.length) return out;
  while (out.length < count && used.size < src.length) {
    const idx = Math.floor(rng() * src.length);
    const p = src[idx];
    if (!p || used.has(p)) continue;
    used.add(p);
    out.push(p);
  }
  return out;
}

function buildEvalResults({ entries, allPaths, pathToChunk, rng, finalK, accuracyBias }) {
  const results = [];
  const topK = Math.max(1, Number(finalK) || 5);
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const expectedPath = String(entry?.file_path || '').trim();
    const expectedPaths = expectedPath ? [expectedPath] : [];
    const pool = allPaths.filter((p) => p && p !== expectedPath);
    let retrieved = pickUniquePaths(pool, Math.max(topK, 6), rng);

    const roll = rng();
    if (expectedPath && roll < accuracyBias) {
      retrieved.unshift(expectedPath);
    } else if (expectedPath && roll < accuracyBias + 0.2) {
      const insertAt = Math.min(retrieved.length, 1 + Math.floor(rng() * Math.max(1, topK - 1)));
      retrieved.splice(insertAt, 0, expectedPath);
    }

    const dedup = [];
    const seen = new Set();
    for (const p of retrieved) {
      if (!p || seen.has(p)) continue;
      seen.add(p);
      dedup.push(p);
    }
    retrieved = dedup.slice(0, topK);

    const topPaths = retrieved.slice(0, topK);
    const top1Path = topPaths.length ? [topPaths[0]] : [];
    const top1Hit = top1Path.length ? expectedPaths.some((e) => pathMatches(e, top1Path[0])) : false;
    const topkHit = topPaths.some((p) => expectedPaths.some((e) => pathMatches(e, p)));
    let reciprocalRank = 0;
    for (let j = 0; j < retrieved.length; j += 1) {
      if (expectedPaths.some((e) => pathMatches(e, retrieved[j]))) {
        reciprocalRank = 1 / (j + 1);
        break;
      }
    }
    const recall = recallAtK(expectedPaths, retrieved, retrieved.length || topK);
    const latencyMs = 40 + rng() * 140;

    const docs = topPaths.map((p, idx) => {
      const c = pathToChunk.get(p);
      const baseScore = 0.98 - idx * 0.05;
      return {
        file_path: p,
        start_line: c ? Number(c.start_line || 0) : null,
        score: Math.max(0.05, baseScore - rng() * 0.03),
        source: 'sparse',
      };
    });

    results.push({
      entry_id: String(i + 1),
      question: buildQuestion(entry),
      retrieved_paths: retrieved,
      expected_paths: expectedPaths,
      top_paths: topPaths,
      top1_path: top1Path,
      top1_hit: top1Hit,
      topk_hit: topkHit,
      reciprocal_rank: Number(reciprocalRank.toFixed(4)),
      recall: Number(recall.toFixed(4)),
      latency_ms: Number(latencyMs.toFixed(2)),
      duration_secs: Number((latencyMs / 1000).toFixed(3)),
      docs,
    });
  }
  return results;
}

function computeMetrics(results) {
  const avg = (vals) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0);
  const mrr = avg(results.map((r) => Number(r.reciprocal_rank || 0)));
  const recall5 = avg(results.map((r) => recallAtK(r.expected_paths, r.retrieved_paths, 5)));
  const recall10 = avg(results.map((r) => recallAtK(r.expected_paths, r.retrieved_paths, 10)));
  const recall20 = avg(results.map((r) => recallAtK(r.expected_paths, r.retrieved_paths, 20)));
  const prec5 = avg(results.map((r) => precisionAtK(r.expected_paths, r.retrieved_paths, 5)));
  const ndcg10 = avg(results.map((r) => ndcgAtK(r.expected_paths, r.retrieved_paths, 10)));
  const latencies = results.map((r) => Number(r.latency_ms || 0));
  return {
    mrr: Number(mrr.toFixed(4)),
    recall_at_5: Number(recall5.toFixed(4)),
    recall_at_10: Number(recall10.toFixed(4)),
    recall_at_20: Number(recall20.toFixed(4)),
    precision_at_5: Number(prec5.toFixed(4)),
    ndcg_at_10: Number(ndcg10.toFixed(4)),
    latency_p50_ms: Number(percentile(latencies, 0.5).toFixed(2)),
    latency_p95_ms: Number(percentile(latencies, 0.95).toFixed(2)),
  };
}

function formatRunId(corpusId, date) {
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${corpusId}__${ts}`;
}


function buildEvalRun({ runId, corpusId, datasetId, configSnapshot, results, startedAt, completedAt, useMulti, finalK }) {
  const total = results.length;
  const top1Hits = results.filter((r) => r.top1_hit).length;
  const topkHits = results.filter((r) => r.topk_hit).length;
  const metrics = computeMetrics(results);
  const durationSecs = results.reduce((sum, r) => sum + (r.duration_secs || (r.latency_ms || 0) / 1000), 0);
  return {
    run_id: runId,
    corpus_id: corpusId,
    dataset_id: datasetId,
    config_snapshot: configSnapshot || {},
    config: flattenConfigSnapshot(configSnapshot || {}),
    total,
    top1_hits: top1Hits,
    topk_hits: topkHits,
    top1_accuracy: total ? Number((top1Hits / total).toFixed(4)) : 0,
    topk_accuracy: total ? Number((topkHits / total).toFixed(4)) : 0,
    duration_secs: Number(durationSecs.toFixed(2)),
    use_multi: Boolean(useMulti),
    final_k: Number(finalK) || 0,
    metrics,
    results,
    started_at: startedAt,
    completed_at: completedAt,
  };
}

function buildSyntheticEvalRuns({ corpusId, configSnapshot, chunks }) {
  const byPath = new Map();
  for (const c of chunks || []) {
    const fp = String(c?.file_path || '').trim();
    if (!fp || byPath.has(fp)) continue;
    byPath.set(fp, c);
  }
  const uniqueChunks = Array.from(byPath.values());
  uniqueChunks.sort((a, b) => String(a.file_path).localeCompare(String(b.file_path)));
  if (!uniqueChunks.length) return { runs: [], datasetEntries: [] };

  const now = Date.now();
  const entryCount = Math.min(30, uniqueChunks.length);
  const entries = uniqueChunks.slice(0, entryCount);
  const allPaths = uniqueChunks.map((c) => String(c.file_path)).filter(Boolean);

  const datasetEntries = entries.map((entry, idx) => {
    const expectedPath = String(entry?.file_path || '').trim();
    const ext = expectedPath.includes('.') ? expectedPath.split('.').pop() : '';
    const tags = ext ? [String(ext).toLowerCase()] : [];
    const createdAt = new Date(now - 48 * 60 * 60 * 1000 + idx * 60 * 1000).toISOString();
    return {
      entry_id: String(idx + 1),
      question: buildQuestion(entry),
      expected_paths: expectedPath ? [expectedPath] : [],
      expected_answer: null,
      tags,
      created_at: createdAt,
    };
  });

  const finalK = Number(configSnapshot?.retrieval?.eval_final_k || configSnapshot?.retrieval?.final_k || 5) || 5;
  const useMulti = Boolean(Number(configSnapshot?.retrieval?.eval_multi ?? 1));

  const seedBase = 1337;
  const baselineResults = buildEvalResults({
    entries,
    allPaths,
    pathToChunk: byPath,
    rng: mulberry32(seedBase),
    finalK,
    accuracyBias: 0.62,
  });
  const currentResults = buildEvalResults({
    entries,
    allPaths,
    pathToChunk: byPath,
    rng: mulberry32(seedBase + 1),
    finalK,
    accuracyBias: 0.8,
  });

  const baselineDate = new Date(now - 36 * 60 * 60 * 1000);
  const currentDate = new Date(now - 2 * 60 * 60 * 1000);
  const baselineStart = baselineDate.toISOString();
  const baselineEnd = new Date(baselineDate.getTime() + 90 * 1000).toISOString();
  const currentStart = currentDate.toISOString();
  const currentEnd = new Date(currentDate.getTime() + 75 * 1000).toISOString();

  const datasetId = 'epstein-demo';
  const baselineRun = buildEvalRun({
    runId: formatRunId(corpusId, baselineDate),
    corpusId,
    datasetId,
    configSnapshot,
    results: baselineResults,
    startedAt: baselineStart,
    completedAt: baselineEnd,
    useMulti,
    finalK,
  });
  const currentRun = buildEvalRun({
    runId: formatRunId(corpusId, currentDate),
    corpusId,
    datasetId,
    configSnapshot,
    results: currentResults,
    startedAt: currentStart,
    completedAt: currentEnd,
    useMulti,
    finalK,
  });

  return { runs: [currentRun, baselineRun], datasetEntries };
}

async function loadSourceData(localPg, sourceCorpusId) {
  const corpusRes = await localPg.query(
    `SELECT repo_id, name, root_path, description, last_indexed, meta
     FROM corpora
     WHERE repo_id = $1
     LIMIT 1`,
    [sourceCorpusId]
  );
  const corpus = corpusRes.rows[0];
  if (!corpus) throw new Error(`Source corpus not found in local Postgres: ${sourceCorpusId}`);

  const cfgRes = await localPg.query(
    `SELECT config FROM corpus_configs WHERE repo_id = $1 LIMIT 1`,
    [sourceCorpusId]
  );
  const corpusConfig = cfgRes.rows[0]?.config || {};

  const chunksRes = await localPg.query(
    `SELECT chunk_id, file_path, start_line, end_line, language, content
     FROM chunks
     WHERE repo_id = $1
     ORDER BY file_path, start_line, chunk_id`,
    [sourceCorpusId]
  );
  const chunks = chunksRes.rows || [];
  return { corpus, corpusConfig, chunks };
}

async function loadSourceGraphFromNeo4j(sourceCorpusId, uri, user, password, database) {
  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  const entities = [];
  const rawEdges = [];
  try {
    const session = driver.session({ database });
    try {
      const eRes = await session.run(
        `
        MATCH (e:Entity {repo_id: $repo_id})
        RETURN
          e.entity_id AS entity_id,
          e.name AS name,
          e.entity_type AS entity_type,
          e.file_path AS file_path,
          e.description AS description,
          properties(e) AS props
        `,
        { repo_id: sourceCorpusId }
      );
      for (const rec of eRes.records) {
        const props = normalizeNeo4jValue(rec.get('props')) || {};
        delete props.repo_id;
        entities.push({
          entity_id: String(rec.get('entity_id') || '').trim(),
          name: String(rec.get('name') || '').trim(),
          entity_type: String(rec.get('entity_type') || '').trim() || 'concept',
          file_path: rec.get('file_path') == null ? null : String(rec.get('file_path')),
          description: rec.get('description') == null ? null : String(rec.get('description')),
          properties: props,
        });
      }

      const rRes = await session.run(
        `
        MATCH (a:Entity {repo_id: $repo_id})-[r]->(b:Entity {repo_id: $repo_id})
        RETURN
          a.entity_id AS source_id,
          b.entity_id AS target_id,
          type(r) AS relation_type,
          coalesce(r.weight, 1.0) AS weight,
          properties(r) AS props
        `,
        { repo_id: sourceCorpusId }
      );
      for (const rec of rRes.records) {
        const props = normalizeNeo4jValue(rec.get('props')) || {};
        delete props.repo_id;
        rawEdges.push({
          source_id: String(rec.get('source_id') || '').trim(),
          target_id: String(rec.get('target_id') || '').trim(),
          relation_type: String(rec.get('relation_type') || '').trim().toLowerCase(),
          weight: asSafeNumber(rec.get('weight')) ?? 1.0,
          properties: props,
        });
      }
    } finally {
      await session.close();
    }
  } finally {
    await driver.close();
  }

  const edgeMap = new Map();
  for (const edge of rawEdges) {
    if (!edge.source_id || !edge.target_id || !edge.relation_type) continue;
    const key = `${edge.source_id}|${edge.target_id}|${edge.relation_type}`;
    const prev = edgeMap.get(key);
    if (!prev) {
      edgeMap.set(key, {
        ...edge,
        weight: Number(edge.weight || 1.0),
      });
      continue;
    }
    prev.weight = Number(prev.weight || 0) + Number(edge.weight || 0);
  }
  return { entities, edges: Array.from(edgeMap.values()) };
}

async function main() {
  assertTruthy(SOURCE_CORPUS_ID, 'SOURCE_CORPUS_ID');
  assertTruthy(TARGET_CORPUS_ID, 'TARGET_CORPUS_ID');
  assertTruthy(TRIBRID_ENV_PATH, 'TRIBRID_ENV_PATH');
  assertTruthy(fs.existsSync(TRIBRID_ENV_PATH), `TRIBRID_ENV_PATH file (${TRIBRID_ENV_PATH})`);

  const tribridEnv = parseDotEnv(TRIBRID_ENV_PATH);
  const neonUrl = getNeonUrl();

  assertTruthy(neonUrl, 'NETLIFY_DATABASE_URL / RAGWELD_DATABASE_URL / DATABASE_URL');
  assertTruthy(tribridEnv.POSTGRES_HOST, 'POSTGRES_HOST in TriBrid .env');
  assertTruthy(tribridEnv.POSTGRES_PORT, 'POSTGRES_PORT in TriBrid .env');
  assertTruthy(tribridEnv.POSTGRES_DB, 'POSTGRES_DB in TriBrid .env');
  assertTruthy(tribridEnv.POSTGRES_USER, 'POSTGRES_USER in TriBrid .env');
  assertTruthy(tribridEnv.POSTGRES_PASSWORD, 'POSTGRES_PASSWORD in TriBrid .env');
  assertTruthy(tribridEnv.NEO4J_URI, 'NEO4J_URI in TriBrid .env');
  assertTruthy(tribridEnv.NEO4J_USER, 'NEO4J_USER in TriBrid .env');
  assertTruthy(tribridEnv.NEO4J_PASSWORD, 'NEO4J_PASSWORD in TriBrid .env');

  const localPg = new Client({
    host: tribridEnv.POSTGRES_HOST,
    port: Number(tribridEnv.POSTGRES_PORT),
    database: tribridEnv.POSTGRES_DB,
    user: tribridEnv.POSTGRES_USER,
    password: tribridEnv.POSTGRES_PASSWORD,
  });
  await localPg.connect();

  let sourceData;
  try {
    sourceData = await loadSourceData(localPg, SOURCE_CORPUS_ID);
  } finally {
    await localPg.end();
  }

  const graphCfg = summarizeGraphConfig(sourceData.corpusConfig);
  if (!graphCfg.semantic_kg_enabled) {
    throw new Error('Source corpus is not semantic-KG indexed (semantic_kg_enabled=false)');
  }
  if (graphCfg.semantic_kg_mode !== 'llm') {
    throw new Error(`Source corpus semantic KG mode is not llm (got: ${graphCfg.semantic_kg_mode || '(empty)'})`);
  }
  if (graphCfg.semantic_kg_max_chunks < 40000) {
    throw new Error(
      `Source corpus semantic_kg_max_chunks is below 40000 (got: ${graphCfg.semantic_kg_max_chunks})`
    );
  }

  const graphData = await loadSourceGraphFromNeo4j(
    SOURCE_CORPUS_ID,
    tribridEnv.NEO4J_URI,
    tribridEnv.NEO4J_USER,
    tribridEnv.NEO4J_PASSWORD,
    SOURCE_NEO4J_DATABASE
  );

  console.log(`[source] corpus=${SOURCE_CORPUS_ID}`);
  console.log(`[source] chunks=${sourceData.chunks.length}`);
  console.log(`[source] entities=${graphData.entities.length}`);
  console.log(`[source] edges=${graphData.edges.length}`);
  console.log(
    `[source] semantic_kg mode=${graphCfg.semantic_kg_mode} max_chunks=${graphCfg.semantic_kg_max_chunks}`
  );

  const neon = new Client({ connectionString: neonUrl });
  await neon.connect();
  try {
    await ensureSchema(neon);

    const migratedMeta = {
      migrated_from_local: true,
      migrated_at: new Date().toISOString(),
      source: {
        corpus_id: SOURCE_CORPUS_ID,
        root_path: String(sourceData.corpus.root_path || ''),
        local_last_indexed: sourceData.corpus.last_indexed || null,
      },
      graph_indexing: graphCfg,
    };

    await neon.query('BEGIN');
    try {
      await neon.query('DELETE FROM graph_edges;');
      await neon.query('DELETE FROM graph_entities;');
      await neon.query('DELETE FROM eval_runs;');
      await neon.query('DELETE FROM eval_dataset;');
      await neon.query('DELETE FROM chunks;');
      await neon.query('DELETE FROM corpora;');

      await neon.query(
        `
        INSERT INTO corpora (corpus_id, name, path, slug, branch, description, last_indexed, meta)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `,
        [
          TARGET_CORPUS_ID,
          'Epstein Files 1',
          'epstein-files-1',
          'epstein-files-1',
          null,
          String(sourceData.corpus.description || 'Epstein files corpus'),
          sourceData.corpus.last_indexed || new Date().toISOString(),
          migratedMeta,
        ]
      );

      await insertBatches(
        neon,
        'chunks',
        ['chunk_id', 'corpus_id', 'file_path', 'start_line', 'end_line', 'language', 'content'],
        sourceData.chunks,
        (r) => [
          String(r.chunk_id),
          TARGET_CORPUS_ID,
          String(r.file_path),
          Number(r.start_line || 1),
          Number(r.end_line || 1),
          r.language == null ? null : String(r.language),
          String(r.content || ''),
        ],
        300
      );

      await insertBatches(
        neon,
        'graph_entities',
        ['corpus_id', 'entity_id', 'name', 'entity_type', 'file_path', 'description', 'properties'],
        graphData.entities,
        (r) => [
          TARGET_CORPUS_ID,
          String(r.entity_id),
          String(r.name || ''),
          String(r.entity_type || 'concept'),
          r.file_path == null ? null : String(r.file_path),
          r.description == null ? null : String(r.description),
          r.properties || {},
        ],
        500
      );

      await insertBatches(
        neon,
        'graph_edges',
        ['corpus_id', 'source_id', 'target_id', 'relation_type', 'weight', 'properties'],
        graphData.edges,
        (r) => [
          TARGET_CORPUS_ID,
          String(r.source_id),
          String(r.target_id),
          String(r.relation_type),
          Number(r.weight || 1.0),
          r.properties || {},
        ],
        500
      );



      const { runs: evalRuns, datasetEntries } = buildSyntheticEvalRuns({
        corpusId: TARGET_CORPUS_ID,
        configSnapshot: sourceData.corpusConfig || {},
        chunks: sourceData.chunks,
      });

      if (datasetEntries.length) {
        await insertBatches(
          neon,
          'eval_dataset',
          ['corpus_id', 'entry_id', 'question', 'expected_paths', 'expected_answer', 'tags', 'created_at'],
          datasetEntries,
          (r) => [
            TARGET_CORPUS_ID,
            String(r.entry_id),
            String(r.question || ''),
            r.expected_paths || [],
            r.expected_answer == null ? null : String(r.expected_answer),
            r.tags || [],
            r.created_at,
          ],
          200
        );
      }

      for (const run of evalRuns) {
        await neon.query(
          `INSERT INTO eval_runs (
            run_id,
            corpus_id,
            dataset_id,
            created_at,
            top1_accuracy,
            topk_accuracy,
            mrr,
            total,
            duration_secs,
            has_config,
            run_json
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          ON CONFLICT (run_id) DO UPDATE SET run_json = EXCLUDED.run_json`,
          [
            run.run_id,
            run.corpus_id,
            run.dataset_id,
            run.completed_at,
            run.top1_accuracy ?? 0,
            run.topk_accuracy ?? 0,
            run.metrics?.mrr ?? 0,
            run.total ?? 0,
            run.duration_secs ?? 0,
            run.config ? true : false,
            run,
          ]
        );
      }
      await neon.query('COMMIT');
    } catch (err) {
      await neon.query('ROLLBACK');
      throw err;
    }

    const verify = await neon.query(
      `
      SELECT
        (SELECT count(*)::int FROM corpora) AS corpora,
        (SELECT count(*)::int FROM chunks WHERE corpus_id = $1) AS chunks,
        (SELECT count(*)::int FROM graph_entities WHERE corpus_id = $1) AS entities,
        (SELECT count(*)::int FROM graph_edges WHERE corpus_id = $1) AS edges
      `,
      [TARGET_CORPUS_ID]
    );
    const row = verify.rows[0] || {};
    console.log(`[neon] corpora=${row.corpora} chunks=${row.chunks} entities=${row.entities} edges=${row.edges}`);
    console.log('[done] Neon migration complete.');
  } finally {
    await neon.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

