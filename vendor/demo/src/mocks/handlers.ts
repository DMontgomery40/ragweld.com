/**
 * MSW request handlers for ragweld demo
 *
 * These handlers intercept API requests and return mock responses
 * to simulate a fully functional backend.
 */

import { http, HttpResponse, delay } from 'msw';
import {
  mockCorpora,
  mockChatModels,
  mockConfig,
  mockChunkMatches,
  mockHealthResponse,
  generateChatChunks,
} from './data';

export const handlers = [
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
    const corpus = mockCorpora.find((c) => c.id === params.id);
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

  // Search endpoint
  http.post('/api/search', async ({ request }) => {
    await delay(300);
    const body = (await request.json()) as { query: string; repo_id?: string; k?: number };
    return HttpResponse.json({
      matches: mockChunkMatches.slice(0, body.k || 10),
      query: body.query,
      repo_id: body.repo_id || 'faxbot',
      latency_ms: 150 + Math.random() * 100,
    });
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
    return HttpResponse.json([
      { name: 'tribrid-postgres', status: 'running', port: 5432 },
      { name: 'tribrid-neo4j', status: 'running', port: 7687 },
      { name: 'tribrid-api', status: 'running', port: 8012 },
    ]);
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
    const corpus = mockCorpora.find((c) => c.id === params.corpus_id);
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
