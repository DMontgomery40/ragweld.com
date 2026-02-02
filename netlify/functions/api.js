import pg from 'pg';

const { Pool } = pg;

let pool = null;
let schemaReady = null;

function json(statusCode, body, extraHeaders) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(extraHeaders || {}),
    },
    body: JSON.stringify(body),
  };
}

function sse(body, extraHeaders) {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      ...(extraHeaders || {}),
    },
    body,
  };
}

function safeJsonParse(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeCorpusIds(input) {
  const ids = Array.isArray(input) ? input : [];
  return ids
    .map((v) => String(v || '').trim())
    .filter(Boolean)
    .filter((v) => v !== 'recall_default');
}

function getConversationId(request) {
  const cid = String(request?.conversation_id || '').trim();
  if (cid) return cid;
  return `rw-${Date.now()}`;
}

async function ensureSchema(sql) {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await sql.query(`
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

    await sql.query(`
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

    await sql.query(`CREATE INDEX IF NOT EXISTS chunks_corpus_file_idx ON chunks (corpus_id, file_path);`);
    await sql.query(`CREATE INDEX IF NOT EXISTS chunks_corpus_tsv_idx ON chunks USING GIN (content_tsv);`);

    await sql.query(`
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

    await sql.query(`
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

    await sql.query(`CREATE INDEX IF NOT EXISTS graph_entities_name_idx ON graph_entities (corpus_id, name);`);
    await sql.query(`CREATE INDEX IF NOT EXISTS graph_edges_source_idx ON graph_edges (corpus_id, source_id);`);
    await sql.query(`CREATE INDEX IF NOT EXISTS graph_edges_target_idx ON graph_edges (corpus_id, target_id);`);

    await sql.query(`
      INSERT INTO corpora (corpus_id, name, path, slug, branch, description)
      VALUES
        ('faxbot', 'Faxbot (Repo)', 'https://github.com/dmontgomery40/faxbot', 'faxbot', 'main', 'Faxbot open-source repository'),
        ('faxbot_docs', 'Faxbot (Docs)', 'https://docs.faxbot.net/latest/', 'faxbot_docs', NULL, 'Faxbot published documentation')
      ON CONFLICT (corpus_id) DO NOTHING;
    `);
  })();
  return schemaReady;
}

async function listCorpora(sql) {
  const { rows } = await sql.query(
    `SELECT corpus_id, name, path, slug, branch, description, created_at, last_indexed
     FROM corpora
     ORDER BY corpus_id ASC;`
  );

  return (rows || []).map((r) => ({
    corpus_id: String(r.corpus_id),
    name: String(r.name),
    path: String(r.path),
    slug: r.slug == null ? null : String(r.slug),
    branch: r.branch == null ? null : String(r.branch),
    description: r.description == null ? null : String(r.description),
    created_at: r.created_at ? new Date(r.created_at).toISOString() : nowIso(),
    last_indexed: r.last_indexed ? new Date(r.last_indexed).toISOString() : null,
  }));
}

async function getCorpus(sql, corpusId) {
  const { rows } = await sql.query(
    `SELECT corpus_id, name, path, slug, branch, description, created_at, last_indexed
     FROM corpora
     WHERE corpus_id = $1
     LIMIT 1;`,
    [corpusId],
  );
  const r = rows?.[0];
  if (!r) return null;
  return {
    corpus_id: String(r.corpus_id),
    name: String(r.name),
    path: String(r.path),
    slug: r.slug == null ? null : String(r.slug),
    branch: r.branch == null ? null : String(r.branch),
    description: r.description == null ? null : String(r.description),
    created_at: r.created_at ? new Date(r.created_at).toISOString() : nowIso(),
    last_indexed: r.last_indexed ? new Date(r.last_indexed).toISOString() : null,
  };
}

async function searchChunks(sql, corpusId, query, topK) {
  const q = String(query || '').trim();
  if (!q) return [];

  const { rows } = await sql.query(
    `SELECT
       chunk_id,
       file_path,
       start_line,
       end_line,
       language,
       content,
       ts_rank_cd(content_tsv, plainto_tsquery('english', $2)) AS score
     FROM chunks
     WHERE corpus_id = $1
       AND content_tsv @@ plainto_tsquery('english', $2)
     ORDER BY score DESC
     LIMIT $3;`,
    [corpusId, q, topK],
  );

  return (rows || []).map((r) => ({
    chunk_id: String(r.chunk_id),
    content: String(r.content),
    file_path: String(r.file_path),
    start_line: Number(r.start_line) || 0,
    end_line: Number(r.end_line) || 0,
    language: r.language == null ? null : String(r.language),
    score: Number(r.score) || 0,
    source: 'sparse',
    metadata: { corpus_id: corpusId },
  }));
}

function buildRagPrompt(userMessage, matches) {
  const maxChunks = Math.min(matches.length, 8);
  const context = matches.slice(0, maxChunks).map((m, idx) => {
    const header = `[${idx + 1}] ${m.file_path}:${m.start_line}-${m.end_line}`;
    return `${header}\n${m.content}`;
  });

  const system = [
    'You are ragweld, a retrieval-augmented assistant.',
    'Answer using ONLY the provided context when possible.',
    'If the context is insufficient, say what is missing and suggest where to look.',
    'Cite sources inline by referencing the bracketed chunk numbers like [1], [2].',
  ].join('\n');

  const user = [
    `Question: ${userMessage}`,
    '',
    'Context:',
    context.length ? context.join('\n\n') : '(no retrieved context)',
  ].join('\n');

  return { system, user };
}

async function callOpenAI(system, user) {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY');

  const model = String(process.env.RAGWELD_CHAT_MODEL || 'gpt-4o-mini').trim() || 'gpt-4o-mini';

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAI error (${res.status}): ${text || res.statusText}`);
  }

  const data = await res.json();
  const content = String(data?.choices?.[0]?.message?.content || '').trim();
  const tokensUsed = Number(data?.usage?.total_tokens) || 0;
  return { content, tokensUsed };
}

async function handleChat(sql, request) {
  const startedAtMs = Date.now();
  const message = String(request?.message || '').trim();
  if (!message) return json(422, { error: 'message is required' });

  const corpusIds = normalizeCorpusIds(request?.sources?.corpus_ids);
  const fallbackCorpus = String(request?.corpus_id || '').trim();
  const effectiveCorpora = corpusIds.length ? corpusIds : (fallbackCorpus ? [fallbackCorpus] : []);

  const includeSparse = request?.include_sparse !== false;
  const topK = Number.isFinite(Number(request?.top_k)) ? Math.max(1, Math.min(50, Number(request?.top_k))) : 8;

  let matches = [];
  if (includeSparse && effectiveCorpora.length) {
    const perCorpus = Math.max(3, Math.ceil(topK / effectiveCorpora.length));
    const sets = await Promise.all(effectiveCorpora.map((cid) => searchChunks(sql, cid, message, perCorpus)));
    matches = sets.flat().sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, topK);
  }

  const { system, user } = buildRagPrompt(message, matches);

  let assistant = '';
  let tokensUsed = 0;
  try {
    const result = await callOpenAI(system, user);
    assistant = result.content || 'No response generated.';
    tokensUsed = result.tokensUsed;
  } catch (e) {
    assistant = `Demo backend is not fully configured.\n\n${String(e?.message || e)}`;
    tokensUsed = 0;
  }

  const endedAtMs = Date.now();
  const conversationId = getConversationId(request);
  const runId = `rw-run-${startedAtMs}`;

  return json(200, {
    run_id: runId,
    started_at_ms: startedAtMs,
    ended_at_ms: endedAtMs,
    debug: {
      confidence: matches.length ? 0.8 : 0.4,
      include_vector: Boolean(request?.include_vector ?? true),
      include_sparse: Boolean(request?.include_sparse ?? true),
      include_graph: Boolean(request?.include_graph ?? true),
      vector_enabled: null,
      sparse_enabled: includeSparse,
      graph_enabled: null,
      fusion_method: null,
    },
    conversation_id: conversationId,
    message: {
      role: 'assistant',
      content: assistant,
      timestamp: nowIso(),
    },
    sources: matches,
    tokens_used: tokensUsed,
  });
}

async function handleChatStream(sql, request) {
  const startedAtMs = Date.now();
  const res = await handleChat(sql, request);
  const parsed = safeJsonParse(res.body || '{}') || {};

  const assistantText = String(parsed?.message?.content || '').trim();
  const donePayload = {
    type: 'done',
    sources: Array.isArray(parsed?.sources) ? parsed.sources : [],
    conversation_id: String(parsed?.conversation_id || ''),
    run_id: String(parsed?.run_id || ''),
    started_at_ms: Number(parsed?.started_at_ms) || startedAtMs,
    ended_at_ms: Number(parsed?.ended_at_ms) || Date.now(),
    debug: parsed?.debug || null,
  };

  const textEvent = JSON.stringify({ type: 'text', content: assistantText });
  const doneEvent = JSON.stringify(donePayload);
  return sse(`data: ${textEvent}\n\n` + `data: ${doneEvent}\n\n`);
}

async function handleGraphStats(sql, corpusId) {
  const entitiesCount = await sql.query(`SELECT COUNT(*)::int AS n FROM graph_entities WHERE corpus_id = $1;`, [corpusId]);
  const edgesCount = await sql.query(`SELECT COUNT(*)::int AS n FROM graph_edges WHERE corpus_id = $1;`, [corpusId]);

  const entityBreakdownRows = await sql.query(
    `SELECT entity_type, COUNT(*)::int AS n
     FROM graph_entities
     WHERE corpus_id = $1
     GROUP BY entity_type;`,
    [corpusId],
  );

  const relBreakdownRows = await sql.query(
    `SELECT relation_type, COUNT(*)::int AS n
     FROM graph_edges
     WHERE corpus_id = $1
     GROUP BY relation_type;`,
    [corpusId],
  );

  const entity_breakdown = {};
  for (const r of entityBreakdownRows.rows || []) {
    entity_breakdown[String(r.entity_type)] = Number(r.n) || 0;
  }

  const relationship_breakdown = {};
  for (const r of relBreakdownRows.rows || []) {
    relationship_breakdown[String(r.relation_type)] = Number(r.n) || 0;
  }

  return json(200, {
    corpus_id: corpusId,
    total_entities: Number(entitiesCount.rows?.[0]?.n) || 0,
    total_relationships: Number(edgesCount.rows?.[0]?.n) || 0,
    total_communities: 0,
    entity_breakdown,
    relationship_breakdown,
  });
}

async function handleGraphEntities(sql, corpusId, q, limit) {
  const query = String(q || '').trim();
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 50));

  const like = `%${query}%`;

  // Prefer high-degree entities first so the first click tends to show a meaningful neighborhood.
  // (The UI uses the empty-query entity list as a "top entities" list, not an alphabetical directory.)
  const degreesCte = `
    WITH degrees AS (
      SELECT entity_id, COUNT(*)::int AS degree
      FROM (
        SELECT source_id AS entity_id FROM graph_edges WHERE corpus_id = $1
        UNION ALL
        SELECT target_id AS entity_id FROM graph_edges WHERE corpus_id = $1
      ) all_edges
      GROUP BY entity_id
    )
  `;

  const result = query
    ? await sql.query(
        `${degreesCte}
         SELECT ge.entity_id, ge.name, ge.entity_type, ge.file_path, ge.description, ge.properties,
                COALESCE(degrees.degree, 0)::int AS degree
         FROM graph_entities ge
         LEFT JOIN degrees ON degrees.entity_id = ge.entity_id
         WHERE ge.corpus_id = $1
           AND (ge.name ILIKE $2 OR ge.file_path ILIKE $2)
         ORDER BY degree DESC, ge.name ASC
         LIMIT $3;`,
        [corpusId, like, safeLimit],
      )
    : await sql.query(
        `${degreesCte}
         SELECT ge.entity_id, ge.name, ge.entity_type, ge.file_path, ge.description, ge.properties,
                COALESCE(degrees.degree, 0)::int AS degree
         FROM graph_entities ge
         LEFT JOIN degrees ON degrees.entity_id = ge.entity_id
         WHERE ge.corpus_id = $1
         ORDER BY degree DESC, ge.name ASC
         LIMIT $2;`,
        [corpusId, safeLimit],
      );
  const rows = result.rows || [];

  return json(
    200,
    (rows || []).map((r) => ({
      entity_id: String(r.entity_id),
      name: String(r.name),
      entity_type: String(r.entity_type),
      file_path: r.file_path == null ? null : String(r.file_path),
      description: r.description == null ? null : String(r.description),
      properties: { ...(r.properties || {}), degree: Number(r.degree) || 0 },
    })),
  );
}

async function handleGraphNeighbors(sql, corpusId, entityId, maxHops, limit) {
  const safeHops = Math.max(1, Math.min(5, Number(maxHops) || 2));
  const safeLimit = Math.max(10, Math.min(2000, Number(limit) || 200));

  const entities = await sql.query(
    `WITH RECURSIVE walk AS (
        SELECT
          $2::text AS entity_id,
          ARRAY[$2::text] AS visited,
          0::int AS depth
        UNION ALL
        SELECT
          CASE WHEN e.source_id = w.entity_id THEN e.target_id ELSE e.source_id END AS entity_id,
          w.visited || (CASE WHEN e.source_id = w.entity_id THEN e.target_id ELSE e.source_id END),
          (w.depth + 1)::int AS depth
        FROM walk w
        JOIN graph_edges e
          ON e.corpus_id = $1
         AND (e.source_id = w.entity_id OR e.target_id = w.entity_id)
        WHERE w.depth < $3
          AND NOT (
            (CASE WHEN e.source_id = w.entity_id THEN e.target_id ELSE e.source_id END) = ANY(w.visited)
          )
      ),
      nodes AS (
        SELECT DISTINCT entity_id FROM walk
      )
      SELECT ge.entity_id, ge.name, ge.entity_type, ge.file_path, ge.description, ge.properties
      FROM graph_entities ge
      JOIN nodes n ON n.entity_id = ge.entity_id
      WHERE ge.corpus_id = $1
      LIMIT 500;`,
    [corpusId, entityId, safeHops],
  );

  const relationships = await sql.query(
    `WITH RECURSIVE walk AS (
        SELECT
          $2::text AS entity_id,
          ARRAY[$2::text] AS visited,
          0::int AS depth
        UNION ALL
        SELECT
          CASE WHEN e.source_id = w.entity_id THEN e.target_id ELSE e.source_id END AS entity_id,
          w.visited || (CASE WHEN e.source_id = w.entity_id THEN e.target_id ELSE e.source_id END),
          (w.depth + 1)::int AS depth
        FROM walk w
        JOIN graph_edges e
          ON e.corpus_id = $1
         AND (e.source_id = w.entity_id OR e.target_id = w.entity_id)
        WHERE w.depth < $3
          AND NOT (
            (CASE WHEN e.source_id = w.entity_id THEN e.target_id ELSE e.source_id END) = ANY(w.visited)
          )
      ),
      nodes AS (
        SELECT DISTINCT entity_id FROM walk
      )
      SELECT e.source_id, e.target_id, e.relation_type, e.weight, e.properties
      FROM graph_edges e
      JOIN nodes n1 ON n1.entity_id = e.source_id
      JOIN nodes n2 ON n2.entity_id = e.target_id
      WHERE e.corpus_id = $1
      LIMIT $4;`,
    [corpusId, entityId, safeHops, safeLimit],
  );

  return json(200, {
    entities: (entities.rows || []).map((r) => ({
      entity_id: String(r.entity_id),
      name: String(r.name),
      entity_type: String(r.entity_type),
      file_path: r.file_path == null ? null : String(r.file_path),
      description: r.description == null ? null : String(r.description),
      properties: r.properties || {},
    })),
    relationships: (relationships.rows || []).map((r) => ({
      source_id: String(r.source_id),
      target_id: String(r.target_id),
      relation_type: String(r.relation_type),
      weight: r.weight == null ? 1.0 : Number(r.weight),
      properties: r.properties || {},
    })),
  });
}

export const handler = async (event) => {
  const method = String(event.httpMethod || 'GET').toUpperCase();
  const rawPath = String(event.path || '');
  const fnPrefix = '/.netlify/functions/api';
  const path = rawPath.startsWith(fnPrefix) ? `/api${rawPath.slice(fnPrefix.length)}` : rawPath;

  if (method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      },
      body: '',
    };
  }

  let sql;
  try {
    const connectionString =
      String(process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || '').trim();
    if (!connectionString) {
      throw new Error('Missing NETLIFY_DATABASE_URL');
    }

    const isLocal = /localhost|127\\.0\\.0\\.1/.test(connectionString);
    const ssl = isLocal ? false : { rejectUnauthorized: false };

    if (!pool) {
      pool = new Pool({
        connectionString,
        max: 1,
        ssl,
      });
    }
    sql = pool;
  } catch (e) {
    return json(500, { ok: false, error: `DB not configured: ${String(e?.message || e)}` });
  }

  try {
    await ensureSchema(sql);
  } catch (e) {
    return json(500, { ok: false, error: `DB schema init failed: ${String(e?.message || e)}` });
  }

  const url = new URL(event.rawUrl || `https://ragweld.local${path}`);
  const body = safeJsonParse(event.body || null);

  if (method === 'GET' && path === '/api/health') {
    try {
      await sql.query(`SELECT 1 AS ok;`);
      return json(200, {
        ok: true,
        status: 'healthy',
        ts: nowIso(),
        services: {
          db: { status: 'up', error: null },
          graph: { status: 'stub', error: null },
        },
      });
    } catch (e) {
      return json(200, {
        ok: false,
        status: 'unhealthy',
        ts: nowIso(),
        services: {
          db: { status: 'down', error: String(e?.message || e) },
        },
      });
    }
  }

  if (method === 'GET' && (path === '/api/corpora' || path === '/api/repos' || path === '/api/corpus')) {
    const corpora = await listCorpora(sql);
    return json(200, corpora);
  }

  if (method === 'GET' && path.startsWith('/api/corpus/')) {
    const corpusId = decodeURIComponent(path.slice('/api/corpus/'.length));
    const corpus = await getCorpus(sql, corpusId);
    if (!corpus) return json(404, { error: 'Corpus not found' });
    return json(200, corpus);
  }

  if (method === 'GET' && path === '/api/mcp/rag_search') {
    const q = String(url.searchParams.get('q') || '').trim();
    const topK = Math.max(1, Math.min(100, Number(url.searchParams.get('top_k') || '10') || 10));
    const corpusId =
      String(url.searchParams.get('corpus_id') || url.searchParams.get('repo') || url.searchParams.get('repo_id') || '').trim() ||
      'faxbot';

    if (!q) return json(200, { results: [], error: 'Query must not be empty' });

    try {
      const matches = await searchChunks(sql, corpusId, q, topK);
      return json(200, {
        results: matches.map((m) => ({
          file_path: m.file_path,
          start_line: m.start_line,
          end_line: m.end_line,
          rerank_score: m.score,
        })),
        error: null,
      });
    } catch (e) {
      return json(200, { results: [], error: String(e?.message || e) });
    }
  }

  if (method === 'POST' && path === '/api/search') {
    const query = String(body?.query || '').trim();
    const corpusId = String(body?.corpus_id || body?.repo_id || body?.repo || '').trim() || 'faxbot';
    const topK = Number.isFinite(Number(body?.top_k)) ? Math.max(1, Math.min(50, Number(body.top_k))) : 10;

    const started = Date.now();
    const matches = await searchChunks(sql, corpusId, query, topK);
    const latencyMs = Math.max(0, Date.now() - started);

    return json(200, {
      query,
      matches,
      fusion_method: 'weighted',
      reranker_mode: 'none',
      latency_ms: latencyMs,
      debug: {
        corpus_id: corpusId,
        include_vector: Boolean(body?.include_vector ?? false),
        include_sparse: Boolean(body?.include_sparse ?? true),
        include_graph: Boolean(body?.include_graph ?? false),
      },
    });
  }

  if (method === 'POST' && path === '/api/chat') {
    return await handleChat(sql, body);
  }

  if (method === 'POST' && path === '/api/chat/stream') {
    return await handleChatStream(sql, body);
  }

  if (method === 'GET' && path.startsWith('/api/graph/')) {
    const parts = path.split('/').filter(Boolean);
    const corpusId = decodeURIComponent(parts[2] || '');
    const tail = parts.slice(3);
    if (!corpusId) return json(422, { error: 'Missing corpus_id' });

    if (tail.length === 1 && tail[0] === 'stats') {
      return await handleGraphStats(sql, corpusId);
    }

    if (tail.length === 1 && tail[0] === 'entities') {
      const q = url.searchParams.get('q') || '';
      const limit = Number(url.searchParams.get('limit') || '50');
      return await handleGraphEntities(sql, corpusId, q, limit);
    }

    if (tail.length === 1 && tail[0] === 'communities') {
      return json(200, []);
    }

    if (tail.length === 3 && tail[0] === 'community' && tail[2] === 'members') {
      return json(200, []);
    }

    if (tail.length === 3 && tail[0] === 'community' && tail[2] === 'subgraph') {
      return json(200, { entities: [], relationships: [] });
    }

    if (tail.length === 3 && tail[0] === 'entity' && tail[2] === 'neighbors') {
      const entityId = decodeURIComponent(tail[1] || '');
      const maxHops = Number(url.searchParams.get('max_hops') || '2');
      const limit = Number(url.searchParams.get('limit') || '200');
      if (!entityId) return json(422, { error: 'Missing entity_id' });
      return await handleGraphNeighbors(sql, corpusId, entityId, maxHops, limit);
    }

    return json(404, { error: 'Unknown graph endpoint' });
  }

  return json(404, { error: 'Not found', path, method });
};
