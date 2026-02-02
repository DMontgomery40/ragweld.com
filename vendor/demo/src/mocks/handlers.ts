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

  // Corpus/Repo endpoints (repo_id is actually corpus_id per CLAUDE.md)
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

  // Chat models endpoint
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

  // Docker status (for the demo, show as running)
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

  // Indexing status (show as complete for demo)
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
];
