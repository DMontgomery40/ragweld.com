/**
 * MSW request handlers for ragweld demo
 *
 * These handlers intercept API requests and return mock responses
 * to simulate a fully functional backend.
 */

import { http, HttpResponse, delay, passthrough } from 'msw';
import {
  mockCorpora,
  mockChatModels,
  mockConfig,
  mockChunkMatches,
  mockGraphByCorpus,
  mockHealthResponse,
  generateChatChunks,
} from './data';

const getGraph = (corpusId: string) => {
  const key = String(corpusId || '').trim();
  return mockGraphByCorpus[key] || null;
};

export const handlersFull = [
  // Health check
  http.get('/api/health', async () => {
    await delay(100);
    return HttpResponse.json(mockHealthResponse);
  }),

  // Configuration endpoints
  http.get('/api/config', async () => {
    await delay(150);
    return HttpResponse.json(mockConfig);
  }),

  http.put('/api/config', async ({ request }) => {
    await delay(200);
    const body = await request.json();
    return HttpResponse.json({ ...mockConfig, ...(body as object) });
  }),

  http.patch('/api/config/:section', async ({ request, params }) => {
    await delay(150);
    const body = await request.json();
    const section = params.section as string;
    return HttpResponse.json({
      ...mockConfig,
      [section]: { ...(mockConfig as any)[section], ...(body as object) },
    });
  }),

  // Corpus endpoints (app uses both /api/corpora and /api/corpus)
  http.get('/api/corpora', async () => {
    await delay(100);
    return HttpResponse.json(mockCorpora);
  }),

  http.get('/api/repos', async () => {
    await delay(100);
    return HttpResponse.json(mockCorpora);
  }),

  http.get('/api/corpus', async () => {
    await delay(100);
    return HttpResponse.json(mockCorpora);
  }),

  http.get('/api/corpus/:id', async ({ params }) => {
    await delay(100);
    const corpus = mockCorpora.find((c) => c.corpus_id === params.id);
    if (!corpus) {
      return new HttpResponse(null, { status: 404 });
    }
    return HttpResponse.json(corpus);
  }),

  // Models endpoints (app uses /api/models)
  http.get('/api/models', async () => {
    await delay(200);
    return HttpResponse.json(mockChatModels);
  }),

  http.get('/api/chat/models', async () => {
    await delay(200);
    return HttpResponse.json(mockChatModels);
  }),

  // Chat streaming endpoint - the core demo feature
  http.post('/api/chat/stream', async ({ request }) => {
    const body = (await request.json()) as {
      message: string;
      sources?: { corpus_ids?: string[] };
      conversation_id?: string;
      stream?: boolean;
      model_override?: string;
      include_vector?: boolean;
      include_sparse?: boolean;
      include_graph?: boolean;
    };

    const chunks = generateChatChunks(body.message);
    const encoder = new TextEncoder();
    const startedAtMs = Date.now();

    const stream = new ReadableStream({
      async start(controller) {
        // Stream text chunks with delays
        for (const chunk of chunks) {
          await delay(chunk.delay);
          const data = JSON.stringify({ type: 'text', content: chunk.text });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        }

        // Send done event with sources
        await delay(50);
        const endedAtMs = Date.now();
        const doneEvent = JSON.stringify({
          type: 'done',
          sources: mockChunkMatches,
          conversation_id: body.conversation_id || `demo-${Date.now()}`,
          run_id: `demo-run-${Date.now()}`,
          started_at_ms: startedAtMs,
          ended_at_ms: endedAtMs,
          debug: {
            confidence: 0.85,
            include_vector: body.include_vector ?? true,
            include_sparse: body.include_sparse ?? true,
            include_graph: body.include_graph ?? true,
            vector_enabled: true,
            sparse_enabled: true,
            graph_enabled: true,
            fusion_method: 'rrf',
            rrf_k: 60,
            normalize_scores: true,
            final_k_used: 10,
            vector_results: 5,
            sparse_results: 4,
            graph_entity_hits: 3,
            graph_hydrated_chunks: 3,
            final_results: 10,
            top1_score: 0.92,
            avg5_score: 0.87,
          },
        });
        controller.enqueue(encoder.encode(`data: ${doneEvent}\n\n`));

        controller.close();
      },
    });

    return new HttpResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }),

  // Non-streaming chat endpoint (fallback path when streaming is disabled)
  http.post('/api/chat', async ({ request }) => {
    await delay(350);
    const body = (await request.json()) as {
      message: string;
      sources?: { corpus_ids?: string[] };
      conversation_id?: string;
      stream?: boolean;
      model_override?: string;
      include_vector?: boolean;
      include_sparse?: boolean;
      include_graph?: boolean;
    };
    const startedAtMs = Date.now();
    const endedAtMs = startedAtMs + 250;
    const content = generateChatChunks(body.message)
      .map((c) => c.text)
      .join('');
    return HttpResponse.json({
      run_id: `demo-run-${Date.now()}`,
      started_at_ms: startedAtMs,
      ended_at_ms: endedAtMs,
      debug: {
        confidence: 0.85,
        include_vector: body.include_vector ?? true,
        include_sparse: body.include_sparse ?? true,
        include_graph: body.include_graph ?? true,
        vector_enabled: true,
        sparse_enabled: true,
        graph_enabled: true,
        fusion_method: 'rrf',
        rrf_k: 60,
        normalize_scores: true,
        final_k_used: 10,
        vector_results: 5,
        sparse_results: 4,
        graph_entity_hits: 3,
        graph_hydrated_chunks: 3,
        final_results: 10,
        top1_score: 0.92,
        avg5_score: 0.87,
      },
      conversation_id: body.conversation_id || `demo-${Date.now()}`,
      message: {
        role: 'assistant',
        content,
        timestamp: new Date().toISOString(),
      },
      sources: mockChunkMatches,
      tokens_used: 0,
    });
  }),

  // Search endpoint
  http.post('/api/search', async ({ request }) => {
    await delay(300);
    const body = (await request.json()) as { query: string; corpus_id?: string; top_k?: number; k?: number };
    return HttpResponse.json({
      query: body.query,
      matches: mockChunkMatches.slice(0, body.top_k || body.k || 10),
      fusion_method: 'rrf',
      reranker_mode: 'none',
      latency_ms: 150 + Math.random() * 100,
      debug: {
        corpus_id: body.corpus_id || 'faxbot',
        include_vector: true,
        include_sparse: true,
        include_graph: true,
      },
    });
  }),

  // Graph endpoints (for offline / ?mock=1 mode)
  http.get('/api/graph/:corpusId/stats', async ({ params }) => {
    await delay(80);
    const g = getGraph(String(params.corpusId));
    if (!g) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(g.stats);
  }),

  http.get('/api/graph/:corpusId/communities', async ({ params }) => {
    await delay(80);
    const g = getGraph(String(params.corpusId));
    if (!g) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json(g.communities);
  }),

  http.get('/api/graph/:corpusId/entities', async ({ params, request }) => {
    await delay(100);
    const g = getGraph(String(params.corpusId));
    if (!g) return new HttpResponse(null, { status: 404 });

    const url = new URL(request.url);
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const limitRaw = Number.parseInt(String(url.searchParams.get('limit') || '50'), 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 50;

    let ents = g.entities;
    if (q) {
      ents = ents.filter((e: any) => {
        const name = String(e?.name || '').toLowerCase();
        const fp = String(e?.file_path || '').toLowerCase();
        const desc = String(e?.description || '').toLowerCase();
        return name.includes(q) || fp.includes(q) || desc.includes(q);
      });
    }

    return HttpResponse.json(ents.slice(0, limit));
  }),

  http.get('/api/graph/:corpusId/entity/:entityId/neighbors', async ({ params }) => {
    await delay(120);
    const g = getGraph(String(params.corpusId));
    if (!g) return new HttpResponse(null, { status: 404 });

    const entityId = String(params.entityId || '').trim();
    const center = g.entities.find((e: any) => String(e?.entity_id) === entityId);
    if (!center) return new HttpResponse(null, { status: 404 });

    const rels = g.relationships.filter((r: any) => r?.source_id === entityId || r?.target_id === entityId);
    const ids = new Set<string>([entityId]);
    for (const r of rels) {
      ids.add(String(r.source_id));
      ids.add(String(r.target_id));
    }
    const ents = g.entities.filter((e: any) => ids.has(String(e?.entity_id)));
    return HttpResponse.json({ entities: ents, relationships: rels });
  }),

  http.get('/api/graph/:corpusId/community/:communityId/members', async ({ params }) => {
    await delay(120);
    const g = getGraph(String(params.corpusId));
    if (!g) return new HttpResponse(null, { status: 404 });

    const communityId = String(params.communityId || '').trim();
    const community = g.communities.find((c: any) => String(c?.community_id) === communityId);
    if (!community) return new HttpResponse(null, { status: 404 });

    const members = new Set<string>(Array.isArray(community.member_ids) ? community.member_ids.map(String) : []);
    const ents = g.entities.filter((e: any) => members.has(String(e?.entity_id)));
    return HttpResponse.json(ents);
  }),

  http.get('/api/graph/:corpusId/community/:communityId/subgraph', async ({ params }) => {
    await delay(140);
    const g = getGraph(String(params.corpusId));
    if (!g) return new HttpResponse(null, { status: 404 });

    const communityId = String(params.communityId || '').trim();
    const community = g.communities.find((c: any) => String(c?.community_id) === communityId);
    if (!community) return new HttpResponse(null, { status: 404 });

    const members = new Set<string>(Array.isArray(community.member_ids) ? community.member_ids.map(String) : []);
    const ents = g.entities.filter((e: any) => members.has(String(e?.entity_id)));
    const rels = g.relationships.filter((r: any) => members.has(String(r?.source_id)) && members.has(String(r?.target_id)));

    return HttpResponse.json({ entities: ents, relationships: rels });
  }),

  // Docker status endpoints
  http.get('/api/docker/status', async () => {
    await delay(100);
    return HttpResponse.json({
      status: 'running',
      containers: {
        postgres: { status: 'running', port: 5432 },
        neo4j: { status: 'running', port: 7687 },
        api: { status: 'running', port: 8012 },
      },
    });
  }),

  http.get('/api/docker/containers', async () => {
    await delay(100);
    return HttpResponse.json({
      containers: [
        {
          id: 'tribrid-postgres-000000000000000000000000000000000000000000000000000000000000',
          short_id: 'tribrid-postg',
          name: 'tribrid-postgres',
          image: 'postgres:16',
          state: 'running',
          status: 'Up 5 minutes',
          ports: '5432->5432/tcp',
          compose_project: 'tribrid',
          compose_service: 'postgres',
          tribrid_managed: true,
        },
        {
          id: 'tribrid-neo4j-00000000000000000000000000000000000000000000000000000000000000',
          short_id: 'tribrid-neo4',
          name: 'tribrid-neo4j',
          image: 'neo4j:5',
          state: 'running',
          status: 'Up 5 minutes',
          ports: '7687->7687/tcp',
          compose_project: 'tribrid',
          compose_service: 'neo4j',
          tribrid_managed: true,
        },
        {
          id: 'tribrid-api-000000000000000000000000000000000000000000000000000000000000000',
          short_id: 'tribrid-api',
          name: 'tribrid-api',
          image: 'tribrid/api:dev',
          state: 'running',
          status: 'Up 5 minutes',
          ports: '8012->8012/tcp',
          compose_project: 'tribrid',
          compose_service: 'api',
          tribrid_managed: true,
        },
      ],
    });
  }),

  // Back-compat: newer frontend expects /api/docker/containers/all
  http.get('/api/docker/containers/all', async () => {
    await delay(100);
    return HttpResponse.json({
      containers: [
        {
          id: 'tribrid-postgres-000000000000000000000000000000000000000000000000000000000000',
          short_id: 'tribrid-postg',
          name: 'tribrid-postgres',
          image: 'postgres:16',
          state: 'running',
          status: 'Up 5 minutes',
          ports: '5432->5432/tcp',
          compose_project: 'tribrid',
          compose_service: 'postgres',
          tribrid_managed: true,
        },
        {
          id: 'tribrid-neo4j-00000000000000000000000000000000000000000000000000000000000000',
          short_id: 'tribrid-neo4',
          name: 'tribrid-neo4j',
          image: 'neo4j:5',
          state: 'running',
          status: 'Up 5 minutes',
          ports: '7687->7687/tcp',
          compose_project: 'tribrid',
          compose_service: 'neo4j',
          tribrid_managed: true,
        },
        {
          id: 'tribrid-api-000000000000000000000000000000000000000000000000000000000000000',
          short_id: 'tribrid-api',
          name: 'tribrid-api',
          image: 'tribrid/api:dev',
          state: 'running',
          status: 'Up 5 minutes',
          ports: '8012->8012/tcp',
          compose_project: 'tribrid',
          compose_service: 'api',
          tribrid_managed: true,
        },
      ],
    });
  }),

  http.get('/api/docker/redis/ping', async () => {
    await delay(50);
    return HttpResponse.json({ status: 'ok', pong: true });
  }),

  // Indexing status endpoints
  http.get('/api/index/status', async () => {
    await delay(100);
    return HttpResponse.json({
      status: 'complete',
      progress: 100,
      chunks_indexed: 1847,
      files_processed: 156,
      last_updated: new Date().toISOString(),
    });
  }),

  http.get('/api/index/status/:corpus_id', async ({ params }) => {
    await delay(100);
    const corpus = mockCorpora.find((c) => c.corpus_id === params.corpus_id);
    return HttpResponse.json({
      corpus_id: params.corpus_id,
      status: 'complete',
      progress: 100,
      chunks_indexed: corpus?.chunk_count || 0,
      files_processed: corpus?.file_count || 0,
      last_updated: corpus?.last_indexed || new Date().toISOString(),
    });
  }),

  http.get('/api/index/stats', async () => {
    await delay(100);
    return HttpResponse.json({
      total_chunks: 3981,
      total_files: 359,
      total_corpora: 2,
      embedding_model: 'text-embedding-3-small',
      last_indexed: new Date().toISOString(),
    });
  }),

  // Eval datasets (empty for demo)
  http.get('/api/eval/datasets', async () => {
    await delay(100);
    return HttpResponse.json([]);
  }),

  // Recall (conversation memory) - always returns empty for demo
  http.get('/api/recall/search', async () => {
    await delay(100);
    return HttpResponse.json({ matches: [], query: '', corpus_id: 'recall_default' });
  }),

  // MCP status
  http.get('/api/mcp/status', async () => {
    await delay(100);
    return HttpResponse.json({
      status: 'demo',
      servers: [],
      message: 'MCP not available in demo mode',
    });
  }),

  // Monitoring/observability status
  http.get('/api/loki/status', async () => {
    await delay(100);
    return HttpResponse.json({ status: 'demo', available: false });
  }),

  http.get('/api/webhooks/alertmanager/status', async () => {
    await delay(100);
    return HttpResponse.json({ status: 'demo', configured: false });
  }),

  http.get('/api/traces', async () => {
    await delay(100);
    return HttpResponse.json({ traces: [], total: 0 });
  }),

  http.get('/api/dev/status', async () => {
    await delay(100);
    return HttpResponse.json({
      mode: 'demo',
      env: 'production',
      version: '0.1.0-demo',
    });
  }),

  // Keywords
  http.get('/api/keywords', async () => {
    await delay(100);
    return HttpResponse.json([]);
  }),

  http.post('/api/keywords', async ({ request }) => {
    await delay(100);
    const body = await request.json();
    return HttpResponse.json(body);
  }),

  // Env reload (no-op in demo)
  http.post('/api/env/reload', async () => {
    await delay(100);
    return HttpResponse.json({ status: 'ok', message: 'Demo mode - no reload needed' });
  }),

  // Grafana (not available in demo)
  http.get('/api/grafana/status', async () => {
    await delay(100);
    return HttpResponse.json({ status: 'demo', available: false });
  }),

  // Catch-all for unhandled API routes - return demo message
  http.get('/api/*', async ({ request }) => {
    console.log('[MSW] Unhandled GET:', new URL(request.url).pathname);
    await delay(50);
    return HttpResponse.json({
      status: 'demo',
      message: 'This endpoint is not mocked in demo mode'
    });
  }),

  http.post('/api/*', async ({ request }) => {
    console.log('[MSW] Unhandled POST:', new URL(request.url).pathname);
    await delay(50);
    return HttpResponse.json({
      status: 'demo',
      message: 'This endpoint is not mocked in demo mode'
    });
  }),
];

// Partial mocks: keep demo-only tabs working, but let core RAG endpoints hit the real backend.
// Used when running /demo without ?mock=1.
const passthroughHandlers = [
  // Core: real backend
  http.get('/api/health', () => passthrough()),
  http.get('/api/corpora', () => passthrough()),
  http.get('/api/repos', () => passthrough()),
  http.get('/api/corpus', () => passthrough()),
  http.get('/api/corpus/:id', () => passthrough()),
  // Config + provider metadata are supported by the ragweld demo backend.
  http.get('/api/config', () => passthrough()),
  http.put('/api/config', () => passthrough()),
  http.patch('/api/config/:section', () => passthrough()),
  http.post('/api/config/reset', () => passthrough()),
  http.post('/api/config/reload', () => passthrough()),
  http.get('/api/secrets/check', () => passthrough()),
  http.get('/api/chat/models', () => passthrough()),
  http.get('/api/chat/health', () => passthrough()),
  http.post('/api/search', () => passthrough()),
  http.post('/api/chat', () => passthrough()),
  http.post('/api/chat/stream', () => passthrough()),
  http.get('/api/graph/*', () => passthrough()),
];

const LIVE_HANDLER_PATHS = new Set([
  '/api/health',
  '/api/corpora',
  '/api/repos',
  '/api/corpus',
  '/api/corpus/:id',
  '/api/config',
  '/api/config/:section',
  '/api/config/reset',
  '/api/config/reload',
  '/api/chat/models',
  '/api/search',
  '/api/chat',
  '/api/chat/stream',
]);

export const handlersPartial = [
  ...passthroughHandlers,
  ...handlersFull.filter((h: any) => !LIVE_HANDLER_PATHS.has(String(h?.info?.path || ''))),
];

// Back-compat: some code may still import `handlers`.
export const handlers = handlersFull;
