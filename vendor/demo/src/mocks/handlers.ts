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
  mockPromptDefaults,
  mockPromptMetadata,
  mockChunkMatches,
  mockGraphByCorpus,
  mockHealthResponse,
  generateChatChunks,
  mockEvalDataset,
  mockEvalRuns,
} from './data';

const getGraph = (corpusId: string) => {
  const key = String(corpusId || '').trim();
  return mockGraphByCorpus[key] || null;
};

let promptValues: Record<string, string> = { ...mockPromptDefaults };

let evalDatasetEntries = [...mockEvalDataset];

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
    return HttpResponse.json({ models: mockChatModels });
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
        corpus_id: body.corpus_id || 'epstein-files-1',
        include_vector: true,
        include_sparse: true,
        include_graph: true,
      },
    });
  }),


  // Eval dataset endpoints
  http.get('/api/dataset', async () => {
    await delay(120);
    return HttpResponse.json(evalDatasetEntries);
  }),

  http.post('/api/dataset', async ({ request }) => {
    await delay(120);
    const body = await request.json();
    const entry = {
      entry_id: String(Date.now()),
      question: String(body?.question || ''),
      expected_paths: Array.isArray(body?.expected_paths) ? body.expected_paths : [],
      expected_answer: body?.expected_answer ?? null,
      tags: Array.isArray(body?.tags) ? body.tags : [],
      created_at: new Date().toISOString(),
    };
    evalDatasetEntries = [...evalDatasetEntries, entry];
    return HttpResponse.json(entry);
  }),

  http.put('/api/dataset/:entryId', async ({ request, params }) => {
    await delay(120);
    const body = await request.json();
    const entryId = String(params.entryId);
    const idx = evalDatasetEntries.findIndex((e) => e.entry_id === entryId);
    if (idx === -1) return new HttpResponse(null, { status: 404 });
    const updated = {
      ...evalDatasetEntries[idx],
      question: String(body?.question || evalDatasetEntries[idx].question),
      expected_paths: Array.isArray(body?.expected_paths) ? body.expected_paths : evalDatasetEntries[idx].expected_paths,
      expected_answer: body?.expected_answer ?? evalDatasetEntries[idx].expected_answer ?? null,
      tags: Array.isArray(body?.tags) ? body.tags : evalDatasetEntries[idx].tags,
    };
    evalDatasetEntries = [...evalDatasetEntries.slice(0, idx), updated, ...evalDatasetEntries.slice(idx + 1)];
    return HttpResponse.json(updated);
  }),

  http.delete('/api/dataset/:entryId', async ({ params }) => {
    await delay(120);
    const entryId = String(params.entryId);
    const before = evalDatasetEntries.length;
    evalDatasetEntries = evalDatasetEntries.filter((e) => e.entry_id !== entryId);
    if (evalDatasetEntries.length === before) return new HttpResponse(null, { status: 404 });
    return HttpResponse.json({ ok: true, deleted: before - evalDatasetEntries.length });
  }),

  // Eval run endpoints
  http.get('/api/eval/runs', async () => {
    await delay(150);
    const runs = mockEvalRuns.map((run) => ({
      run_id: run.run_id,
      top1_accuracy: run.top1_accuracy ?? 0,
      topk_accuracy: run.topk_accuracy ?? 0,
      mrr: run.metrics?.mrr ?? null,
      total: run.total ?? 0,
      duration_secs: run.duration_secs ?? 0,
      has_config: true,
    }));
    return HttpResponse.json({ ok: true, runs });
  }),

  http.get('/api/eval/results', async () => {
    await delay(150);
    return HttpResponse.json(mockEvalRuns[0]);
  }),

  http.get('/api/eval/results/:runId', async ({ params }) => {
    await delay(150);
    const runId = String(params.runId);
    const run = mockEvalRuns.find((r) => r.run_id === runId) || mockEvalRuns[0];
    return HttpResponse.json(run);
  }),

  http.post('/api/eval/run', async () => {
    await delay(150);
    return HttpResponse.json(mockEvalRuns[0]);
  }),

  http.get('/api/eval/run/stream', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const events = [
          { type: 'log', message: '🧪 Starting evaluation run' },
          { type: 'progress', percent: 20, message: 'Loading eval dataset' },
          { type: 'progress', percent: 60, message: 'Scoring retrieval results' },
          { type: 'log', message: `Results saved: ${mockEvalRuns[0].run_id}` },
          { type: 'progress', percent: 95, message: 'Finalizing metrics' },
          { type: 'complete' },
        ];
        for (const evt of events) {
          await delay(120);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}

`));
        }
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

  http.post('/api/eval/analyze_comparison', async () => {
    await delay(200);
    return HttpResponse.json({
      ok: true,
      analysis: [
        '# Eval Comparison',
        '',
        '## Summary',
        '- Top-1 accuracy improved by +50% (0.50 → 1.00)',
        '- MRR improved by +0.25',
        '',
        '## Config Diffs',
        '- fusion.method: "rrf" → "rrf" (no change)',
        '- retrieval.final_k: 5 → 5 (no change)',
      ].join('\n'),
      model_used: 'demo-analysis',
      error: null,
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
      running: true,
      runtime: 'docker',
      containers_count: 3,
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
  // Dashboard uses /api/index/status (DashboardIndexStatusResponse)
  http.get('/api/index/status', async ({ request }) => {
    await delay(100);
    const url = new URL(request.url);
    const corpusId = url.searchParams.get('corpus_id') || 'epstein-files-1';
    const corpus = mockCorpora.find((c) => c.corpus_id === corpusId) || mockCorpora[0];
    return HttpResponse.json({
      lines: [
        `corpus_id=${corpus?.corpus_id || corpusId}`,
        `documents=${corpus?.file_count || 0}`,
        `chunks=${corpus?.chunk_count || 0}`,
      ],
      metadata: {
        corpus_id: corpus?.corpus_id || corpusId,
        current_repo: corpus?.name || corpusId,
        current_branch: corpus?.branch ?? null,
        timestamp: new Date().toISOString(),
        embedding_config: {
          provider: 'openai',
          model: 'text-embedding-3-large',
          dimensions: 3072,
          precision: 'float32',
        },
        costs: { total_tokens: 0, embedding_cost: null },
        storage_breakdown: {
          chunks_bytes: 0,
          embeddings_bytes: 0,
          pgvector_index_bytes: 0,
          bm25_index_bytes: 0,
          chunk_summaries_bytes: 0,
          neo4j_store_bytes: 0,
          postgres_total_bytes: 0,
          total_storage_bytes: 0,
        },
        keywords_count: 0,
        total_storage: 0,
      },
      running: false,
      progress: null,
      current_file: null,
    });
  }),

  // Indexing hook uses /api/index/:corpusId/status (IndexStatus)
  http.get('/api/index/:corpusId/status', async ({ params }) => {
    await delay(100);
    const corpusId = String(params.corpusId || 'epstein-files-1');
    const corpus = mockCorpora.find((c) => c.corpus_id === corpusId) || mockCorpora[0];
    return HttpResponse.json({
      corpus_id: corpus?.corpus_id || corpusId,
      status: 'complete',
      progress: 1,
      current_file: null,
      error: null,
      started_at: null,
      completed_at: corpus?.last_indexed || new Date().toISOString(),
    });
  }),

  http.get('/api/index/:corpusId/stats', async ({ params }) => {
    await delay(100);
    const corpusId = String(params.corpusId || 'epstein-files-1');
    const corpus = mockCorpora.find((c) => c.corpus_id === corpusId) || mockCorpora[0];
    return HttpResponse.json({
      corpus_id: corpus?.corpus_id || corpusId,
      total_files: corpus?.file_count || 0,
      total_chunks: corpus?.chunk_count || 0,
      total_tokens: 0,
      embedding_model: 'text-embedding-3-large',
      embedding_dimensions: 3072,
      last_indexed: corpus?.last_indexed || new Date().toISOString(),
      file_breakdown: {},
    });
  }),

  // Dashboard storage panels use /api/index/stats (DashboardIndexStatsResponse)
  http.get('/api/index/stats', async ({ request }) => {
    await delay(100);
    const url = new URL(request.url);
    const corpusId = url.searchParams.get('corpus_id') || 'epstein-files-1';
    return HttpResponse.json({
      corpus_id: corpusId,
      storage_breakdown: {
        chunks_bytes: 0,
        embeddings_bytes: 0,
        pgvector_index_bytes: 0,
        bm25_index_bytes: 0,
        chunk_summaries_bytes: 0,
        neo4j_store_bytes: 0,
        postgres_total_bytes: 0,
        total_storage_bytes: 0,
      },
      keywords_count: 0,
      total_storage: 0,
    });
  }),

  http.post('/api/index', async ({ request }) => {
    await delay(100);
    const body = (await request.json()) as any;
    const corpusId = String(body?.corpus_id || '').trim() || 'epstein-files-1';
    return HttpResponse.json({
      corpus_id: corpusId,
      status: 'error',
      progress: 0,
      error: 'Indexing is disabled in demo mode.',
      current_file: null,
      started_at: null,
      completed_at: null,
    });
  }),

  http.delete('/api/index/:corpusId', async ({ params }) => {
    await delay(100);
    const corpusId = String(params.corpusId || 'epstein-files-1');
    return HttpResponse.json({
      corpus_id: corpusId,
      status: 'error',
      progress: 0,
      error: 'Delete is disabled in demo mode.',
      current_file: null,
      started_at: null,
      completed_at: null,
    });
  }),

  // Eval datasets (legacy alias)
  http.get('/api/eval/datasets', async () => {
    await delay(100);
    return HttpResponse.json(evalDatasetEntries);
  }),

  // System prompts editor (used by Eval → System Prompts)
  http.get('/api/prompts', async () => {
    await delay(120);
    return HttpResponse.json({
      prompts: { ...promptValues },
      metadata: mockPromptMetadata,
    });
  }),

  http.put('/api/prompts/:promptKey', async ({ params, request }) => {
    await delay(120);
    const promptKey = String(params.promptKey || '').trim();
    if (!promptKey || !(promptKey in promptValues)) {
      return HttpResponse.json(
        {
          ok: false,
          prompt_key: promptKey,
          message: `Unknown prompt key: ${promptKey || '(empty)'}`,
        },
        { status: 404 }
      );
    }
    const body = (await request.json().catch(() => ({}))) as { value?: string };
    const value = String(body?.value ?? '');
    promptValues[promptKey] = value;
    return HttpResponse.json({
      ok: true,
      prompt_key: promptKey,
      message: 'Prompt updated',
    });
  }),

  http.post('/api/prompts/reset/:promptKey', async ({ params }) => {
    await delay(120);
    const promptKey = String(params.promptKey || '').trim();
    if (!promptKey || !(promptKey in promptValues)) {
      return HttpResponse.json(
        {
          ok: false,
          prompt_key: promptKey,
          message: `Unknown prompt key: ${promptKey || '(empty)'}`,
        },
        { status: 404 }
      );
    }
    promptValues[promptKey] = mockPromptDefaults[promptKey] ?? '';
    return HttpResponse.json({
      ok: true,
      prompt_key: promptKey,
      message: 'Prompt reset to default',
    });
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
      python_http: { host: 'localhost', port: 8012, path: null, running: false },
      node_http: null,
      python_stdio_available: false,
      details: ['MCP not available in demo mode'],
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
      frontend_running: true,
      backend_running: true,
      frontend_port: 5173,
      backend_port: 8012,
      frontend_url: 'http://127.0.0.1:5173',
      backend_url: 'http://127.0.0.1:8012',
      details: ['Demo mode (mock backend)'],
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
  http.get('/api/prompts', () => passthrough()),
  http.put('/api/prompts/:promptKey', () => passthrough()),
  http.post('/api/prompts/reset/:promptKey', () => passthrough()),
  http.get('/api/secrets/check', () => passthrough()),
  http.get('/api/chat/models', () => passthrough()),
  http.get('/api/chat/health', () => passthrough()),
  // Status + dashboard (supported by the live demo backend).
  http.get('/api/dev/status', () => passthrough()),
  http.post('/api/dev/*', () => passthrough()),
  http.get('/api/docker/status', () => passthrough()),
  http.get('/api/docker/containers', () => passthrough()),
  http.get('/api/docker/containers/all', () => passthrough()),
  http.get('/api/mcp/status', () => passthrough()),
  http.get('/api/index/status', () => passthrough()),
  http.get('/api/index/stats', () => passthrough()),
  http.get('/api/index/:corpusId/status', () => passthrough()),
  http.get('/api/index/:corpusId/stats', () => passthrough()),
  http.post('/api/index', () => passthrough()),
  http.delete('/api/index/:corpusId', () => passthrough()),
  http.get('/api/monitoring/top-queries', () => passthrough()),
  http.get('/api/traces', () => passthrough()),
  http.get('/api/traces/latest', () => passthrough()),
  http.post('/api/search', () => passthrough()),
  http.post('/api/chat', () => passthrough()),
  http.post('/api/chat/stream', () => passthrough()),
  http.get('/api/graph/*', () => passthrough()),
  http.get('/api/eval/runs', () => passthrough()),
  http.get('/api/eval/results', () => passthrough()),
  http.get('/api/eval/results/:runId', () => passthrough()),
  http.post('/api/eval/run', () => passthrough()),
  http.get('/api/eval/run/stream', () => passthrough()),
  http.post('/api/eval/analyze_comparison', () => passthrough()),
  http.get('/api/dataset', () => passthrough()),
  http.post('/api/dataset', () => passthrough()),
  http.put('/api/dataset/:entryId', () => passthrough()),
  http.delete('/api/dataset/:entryId', () => passthrough()),
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
  '/api/prompts',
  '/api/prompts/:promptKey',
  '/api/prompts/reset/:promptKey',
  '/api/chat/models',
  '/api/chat/health',
  '/api/secrets/check',
  '/api/dev/status',
  '/api/dev/*',
  '/api/docker/status',
  '/api/docker/containers',
  '/api/docker/containers/all',
  '/api/mcp/status',
  '/api/index/status',
  '/api/index/stats',
  '/api/index/:corpusId/status',
  '/api/index/:corpusId/stats',
  '/api/index',
  '/api/index/:corpusId',
  '/api/monitoring/top-queries',
  '/api/traces',
  '/api/traces/latest',
  '/api/search',
  '/api/chat',
  '/api/chat/stream',
  '/api/graph/*',
  '/api/eval/runs',
  '/api/eval/results',
  '/api/eval/results/:runId',
  '/api/eval/run',
  '/api/eval/run/stream',
  '/api/eval/analyze_comparison',
  '/api/dataset',
  '/api/dataset/:entryId',
]);

export const handlersPartial = [
  ...passthroughHandlers,
  ...handlersFull.filter((h: any) => !LIVE_HANDLER_PATHS.has(String(h?.info?.path || ''))),
];

// Back-compat: some code may still import `handlers`.
export const handlers = handlersFull;
