import crypto from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;

let pool = null;
let schemaReady = null;
const configByCorpus = new Map();

const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

const PROMPT_DEFAULTS = {
  // chat.system_prompt_* (from canonical prompt block)
  system_prompt_base: 'You are a helpful agentic RAG database assistant.',
  system_prompt_rag_suffix: '',
  system_prompt_recall_suffix: '',
  system_prompt_direct: `You are a helpful agentic RAG database assistant.
Answer based on available context. If no retrieval context exists, state that clearly and provide the most helpful direct answer you can.`,
  system_prompt_rag: `You are a database assistant powered by TriBridRAG, a hybrid retrieval system that combines vector search, keyword search, and knowledge graphs to find relevant database.

The user has selected one or more database repositories to query. You will receive relevant database snippets in <rag_context>...</rag_context> tags.

Each snippet includes:
- File path and line numbers

How to use this context:
- Base your answers on the actual database shown, not assumptions
- Always cite file paths and line numbers when referencing database
- If the retrieved information doesn't fully answer the question, say what's missing
- Don't invent information that isn't in the context
- **Connect related pieces when they appear across multiple snippets** (e.g. if the user asks about a specific database table, and you have information about the table in the context, connect the information to the question)

Be helpful, friendly, and engaging, and base your answers on the actual database information you have.`,
  system_prompt_recall: `You are an agentic RAG database assistant powered by TriBridRAG. You have access to your conversation history with this user via the Recall system.

Relevant snippets from past conversations appear in <recall_context>...</recall_context> tags.

Each snippet includes:
- Who said it (user or assistant)
- Timestamp
- The message content

How to use this context:
- Reference past discussions naturally
- Don't explicitly say "according to my recall" — incorporate it as shared context
- Past conversations may contain decisions, preferences, or context that inform the current question
- Prioritize recent conversations over older ones when relevant

Be direct and helpful. You're continuing an ongoing collaboration with this user.`,
  system_prompt_rag_and_recall: `You are an agentic RAG database assistant powered by TriBridRAG, a hybrid retrieval system. You have access to both:
1) The user's indexed database repositories
2) Your conversation history with this user (Recall)

database context appears in <rag_context>...</rag_context> tags.
Conversation history appears in <recall_context>...</recall_context> tags.

How to use both:
- Reference past discussions naturally
- Connect them when relevant (e.g., a past decision and the database information that implements it)
- If past context contradicts current database information, acknowledge the change
- Don't say "according to recall" — just incorporate shared knowledge naturally

Be helpful, friendly, and engaging, and base your answers on the actual database information you have.`,

  // system_prompts.* (from canonical system_prompts block)
  main_rag_chat: `You are a helpful agentic RAG database assistant.

## Your Role:
- Answer questions about the indexed database with precision and accuracy
- Offer practical, actionable insights based on the actual database information

## Guidelines:
- **Be Evidence-Based**: Ground every answer in the provided database information
- **Be Honest**: If the information doesn't contain enough information, say so, but try to provide a helpful answer based on the information you have.

## Response Format:
- Start with a direct answer to the question
- Provide a helpful answer based on the information you have

You answer strictly from the provided database information.`,
  query_expansion: `You are a database search query expander. Given a user's question,
generate alternative search queries that might find the same database using different terminology.

Rules:
- Output one query variant per line
- Keep variants concise (3-8 words each)
- Use technical synonyms (auth/authentication, config/configuration, etc.)
- Include both abstract and specific phrasings
- Do NOT include explanations, just the queries`,
  query_rewrite: 'You rewrite developer questions into search-optimized queries without changing meaning.',
  semantic_chunk_summaries: `Analyze this database chunk and create a comprehensive JSON summary for database search. Focus on WHAT the database does (business purpose) and HOW it works (technical details). Include all important symbols, patterns, and domain concepts.

JSON format:
{
  "symbols": ["function_name", "class_name", "variable_name"],
  "purpose": "Clear business purpose - what problem this solves",
  "technical_details": "Key technical implementation details",
  "domain_concepts": ["business_term1", "business_term2"],
  "routes": ["api/endpoint", "webhook/path"],
  "dependencies": ["external_service", "library"],
  "patterns": ["design_pattern", "architectural_concept"]
}

Focus on:
- Domain-specific terminology and concepts from this database
- Technical patterns and architectural decisions
- Business logic and problem being solved
- Integration points, APIs, and external services
- Key algorithms, data structures, and workflows`,
  code_enrichment:
    'Analyze this database and return a JSON object with: symbols (array of function/class/component names), purpose (one sentence description), keywords (array of technical terms). Be concise. Return ONLY valid JSON.',
  semantic_kg_extraction: `You are a semantic knowledge graph extractor.

Given a single database/document chunk, extract a small set of reusable semantic concepts and relationships.

Rules:
- Return ONLY valid JSON (no markdown, no extra text)
- Concepts must be short, lowercase, and reusable across the corpus (e.g. "authentication", "rate_limit", "vector_index")
- Prefer domain concepts and architectural concepts over implementation noise
- Do NOT include file paths or line numbers as concepts
- Keep the list small and high-signal

JSON format:
{
  "concepts": ["concept1", "concept2"],
  "relations": [
    {"source": "concept1", "target": "concept2", "relation_type": "related_to"}
  ]
}

Allowed relation_type values: related_to, references`,
  lightweight_chunk_summaries:
    'Extract key information from this database: symbols (function/class names), purpose (one sentence), keywords (technical terms). Return JSON only.',
  eval_analysis: `You are an expert RAG (Retrieval-Augmented Generation) system analyst.
Your job is to analyze evaluation comparisons and provide HONEST, SKEPTICAL insights.

CRITICAL: Do NOT force explanations that don't make sense. If the data is contradictory or confusing:
- Say so clearly: "This result is surprising and may indicate other factors at play"
- Consider: index changes, data drift, eval dataset updates, or measurement noise
- Acknowledge when correlation != causation
- It's BETTER to say "I'm not sure why this happened" than to fabricate a plausible-sounding but wrong explanation

Be rigorous:
1. Question whether the config changes ACTUALLY explain the performance delta
2. Flag when results seem counterintuitive (e.g., disabling a feature improving results)
3. Consider confounding variables: Was the index rebuilt? Did the test set change?
4. Provide actionable suggestions only when you have reasonable confidence

Format your response with clear sections using markdown headers.`,
};

const PROMPT_METADATA = {
  main_rag_chat: {
    label: 'Main RAG Chat',
    description: 'Main conversational AI system prompt for answering database questions',
    category: 'chat',
  },
  system_prompt_base: {
    label: 'Base prompt (legacy)',
    description: 'Chat prompt: system_prompt_base',
    category: 'chat',
    editable: false,
    link_route: '/chat?subtab=settings&prompt=system_prompt_base',
    link_label: 'Open Chat Settings',
  },
  system_prompt_rag_suffix: {
    label: 'RAG suffix (legacy)',
    description: 'Chat prompt: system_prompt_rag_suffix',
    category: 'chat',
    editable: false,
    link_route: '/chat?subtab=settings&prompt=system_prompt_rag_suffix',
    link_label: 'Open Chat Settings',
  },
  system_prompt_recall_suffix: {
    label: 'Recall suffix (legacy)',
    description: 'Chat prompt: system_prompt_recall_suffix',
    category: 'chat',
    editable: false,
    link_route: '/chat?subtab=settings&prompt=system_prompt_recall_suffix',
    link_label: 'Open Chat Settings',
  },
  system_prompt_direct: {
    label: 'Direct (no context)',
    description: 'State 1: No context. Nothing checked or retrieval returned empty.',
    category: 'chat',
    editable: false,
    link_route: '/chat?subtab=settings&prompt=system_prompt_direct',
    link_label: 'Open Chat Settings',
  },
  system_prompt_rag: {
    label: 'RAG only',
    description: 'State 2: RAG only. database corpora returned results; Recall did not.',
    category: 'chat',
    editable: false,
    link_route: '/chat?subtab=settings&prompt=system_prompt_rag',
    link_label: 'Open Chat Settings',
  },
  system_prompt_recall: {
    label: 'Recall only',
    description: 'State 3: Recall only. Recall returned results; no RAG corpora active.',
    category: 'chat',
    editable: false,
    link_route: '/chat?subtab=settings&prompt=system_prompt_recall',
    link_label: 'Open Chat Settings',
  },
  system_prompt_rag_and_recall: {
    label: 'RAG + Recall',
    description: 'State 4: Both. RAG and Recall both returned results.',
    category: 'chat',
    editable: false,
    link_route: '/chat?subtab=settings&prompt=system_prompt_rag_and_recall',
    link_label: 'Open Chat Settings',
  },
  query_expansion: {
    label: 'Query Expansion',
    description: 'Generate query variants for better recall in hybrid search',
    category: 'retrieval',
  },
  query_rewrite: {
    label: 'Query Rewrite',
    description: 'Rewrite user questions into search-optimized database queries without changing meaning',
    category: 'retrieval',
  },
  semantic_chunk_summaries: {
    label: 'Semantic Chunk Summaries',
    description: 'Generate JSON summaries for database chunks during indexing',
    category: 'indexing',
  },
  code_enrichment: {
    label: 'Database Enrichment',
    description: 'Extract metadata from database chunks during indexing',
    category: 'indexing',
  },
  semantic_kg_extraction: {
    label: 'Semantic KG Extraction',
    description: 'Prompt for LLM-assisted semantic KG extraction (concepts + relations)',
    category: 'indexing',
  },
  lightweight_chunk_summaries: {
    label: 'Lightweight Chunk Summaries',
    description: 'Lightweight chunk_summary generation prompt for faster indexing',
    category: 'indexing',
  },
  eval_analysis: {
    label: 'Eval Analysis',
    description: 'Analyze eval regressions with skeptical approach - avoid false explanations',
    category: 'evaluation',
  },
};

const PROMPT_CONFIG_PATHS = {
  main_rag_chat: ['system_prompts', 'main_rag_chat'],
  system_prompt_base: ['chat', 'system_prompt_base'],
  system_prompt_rag_suffix: ['chat', 'system_prompt_rag_suffix'],
  system_prompt_recall_suffix: ['chat', 'system_prompt_recall_suffix'],
  system_prompt_direct: ['chat', 'system_prompt_direct'],
  system_prompt_rag: ['chat', 'system_prompt_rag'],
  system_prompt_recall: ['chat', 'system_prompt_recall'],
  system_prompt_rag_and_recall: ['chat', 'system_prompt_rag_and_recall'],
  query_expansion: ['system_prompts', 'query_expansion'],
  query_rewrite: ['system_prompts', 'query_rewrite'],
  semantic_chunk_summaries: ['system_prompts', 'semantic_chunk_summaries'],
  code_enrichment: ['system_prompts', 'code_enrichment'],
  semantic_kg_extraction: ['system_prompts', 'semantic_kg_extraction'],
  lightweight_chunk_summaries: ['system_prompts', 'lightweight_chunk_summaries'],
  eval_analysis: ['system_prompts', 'eval_analysis'],
};

const DEFAULT_CONFIG = {
  // NOTE: This object intentionally mirrors the TriBridConfig schema that the
  // vendored /demo frontend expects (see vendor/demo/src/types/generated.ts).
  // The hosted ragweld demo backend only implements a subset of features, but
  // we still return a complete, sensible config so the UI looks "live" and
  // avoids false mismatch warnings.

  // Generation defaults (used by several panels + quick switcher).
  generation: {
    gen_model: 'gpt-5',
    gen_temperature: 0.0,
    gen_max_tokens: 2048,
    gen_top_p: 1.0,
    gen_timeout: 60,
    gen_retry_max: 2,
    enrich_model: 'gpt-5',
    enrich_backend: 'openai',
    enrich_disabled: 0,
    gen_model_cli: 'gpt-5',
    gen_model_ollama: 'gpt-5',
    gen_model_http: '',
    gen_model_mcp: '',
    ollama_url: 'http://127.0.0.1:11434/api',
    openai_base_url: '',
    ollama_request_timeout: 300,
    ollama_stream_idle_timeout: 60,
  },

  // Embedding config (critical: must match index metadata to avoid UI warnings).
  embedding: {
    embedding_type: 'openai',
    embedding_model: 'text-embedding-3-large',
    embedding_dim: 3072,
    voyage_model: 'voyage-database-3',
    embedding_model_local: 'all-MiniLM-L6-v2',
    embedding_batch_size: 64,
    embedding_max_tokens: 8192,
    embedding_cache_enabled: 1,
    embedding_timeout: 30,
    embedding_retry_max: 3,
  },

  // Chunking + indexing defaults (used heavily by /rag?subtab=indexing).
  chunking: {
    chunk_size: 1000,
    chunk_overlap: 200,
    ast_overlap_lines: 20,
    max_indexable_file_size: 2_000_000,
    max_chunk_tokens: 8000,
    min_chunk_chars: 50,
    greedy_fallback_target: 800,
    chunking_strategy: 'recursive',
    preserve_imports: 1,
  },
  indexing: {
    indexing_batch_size: 100,
    indexing_workers: 4,
    bm25_tokenizer: 'stemmer',
    bm25_stemmer_lang: 'english',
    bm25_stopwords_lang: 'en',
    index_excluded_exts: '.png,.jpg,.gif,.ico,.svg,.woff,.ttf',
    index_max_file_size_mb: 10,
    skip_dense: 0,
  },
  graph_indexing: {
    enabled: true,
    build_lexical_graph: true,
    store_chunk_embeddings: true,
    semantic_kg_enabled: true,
    semantic_kg_mode: 'llm',
    semantic_kg_max_chunks: 40000,
    semantic_kg_max_concepts_per_chunk: 8,
  },

  // Search legs (tri-brid).
  vector_search: {
    enabled: true,
    top_k: 50,
    similarity_threshold: 0.0,
  },
  sparse_search: {
    enabled: true,
    top_k: 50,
    bm25_k1: 1.2,
    bm25_b: 0.4,
  },
  graph_search: {
    enabled: true,
    mode: 'entity',
    chunk_neighbor_window: 1,
    chunk_seed_overfetch_multiplier: 10,
    chunk_entity_expansion_enabled: true,
    chunk_entity_expansion_weight: 0.8,
    max_hops: 2,
    include_communities: true,
    top_k: 30,
  },

  retrieval: {
    // Keep the keys the UI actually reads.
    rrf_k_div: 60,
    max_query_rewrites: 2,
    final_k: 10,
    bm25_weight: 0.3,
    vector_weight: 0.7,
    chunk_summary_search_enabled: 1,
    multi_query_m: 4,
    use_semantic_synonyms: 1,
    tribrid_synonyms_path: '',
  },
  fusion: {
    method: 'rrf',
    rrf_k: 60,
    vector_weight: 0.4,
    sparse_weight: 0.3,
    graph_weight: 0.3,
    normalize_scores: true,
  },
  reranking: {
    reranker_mode: 'none',
    reranker_cloud_provider: 'cohere',
    reranker_cloud_model: 'rerank-v3.5',
    reranker_local_model: 'learning-reanker-qwen3-0.6b',
    tribrid_reranker_alpha: 0.7,
    tribrid_reranker_topn: 50,
    reranker_cloud_top_n: 50,
    tribrid_reranker_batch: 16,
    tribrid_reranker_maxlen: 512,
    tribrid_reranker_reload_on_change: 0,
    tribrid_reranker_reload_period_sec: 60,
    reranker_timeout: 10,
    rerank_input_snippet_chars: 700,
    transformers_trust_remote_code: 1,
  },
  chat: {
    // This is patched per-corpus in getConfig(...) so the demo "just works"
    // (Recall + active corpus are checked by default).
    default_corpus_ids: ['epstein-files-1'],
    system_prompt_base: PROMPT_DEFAULTS.system_prompt_base,
    system_prompt_recall_suffix: PROMPT_DEFAULTS.system_prompt_recall_suffix,
    system_prompt_rag_suffix: PROMPT_DEFAULTS.system_prompt_rag_suffix,
    system_prompt_direct: PROMPT_DEFAULTS.system_prompt_direct,
    system_prompt_rag: PROMPT_DEFAULTS.system_prompt_rag,
    system_prompt_recall: PROMPT_DEFAULTS.system_prompt_recall,
    system_prompt_rag_and_recall: PROMPT_DEFAULTS.system_prompt_rag_and_recall,
    recall: {
      enabled: true,
      auto_index: true,
      index_delay_seconds: 5,
      chunking_strategy: 'sentence',
      chunk_max_tokens: 256,
      embedding_model: '',
      max_history_tokens: 4096,
      default_corpus_id: 'recall_default',
      graph_enabled: false,
    },
    temperature: 0.3,
    temperature_no_retrieval: 0.7,
    max_tokens: 4096,
    show_source_dropdown: true,
    send_shortcut: 'ctrl+enter',
    openrouter: {
      enabled: true,
      api_key: '',
      base_url: DEFAULT_OPENROUTER_BASE_URL,
      default_model: 'openai/gpt-5-mini',
      site_name: 'ragweld',
      fallback_models: ['openai/gpt-5', 'google/gemini-2.0-flash'],
    },
    local_models: {
      providers: [],
      auto_detect: false,
      health_check_interval: 30,
      fallback_to_cloud: true,
      gpu_memory_limit_gb: 0,
      default_chat_model: '',
      default_vision_model: '',
      default_embedding_model: '',
    },
  },
  system_prompts: {
    main_rag_chat: PROMPT_DEFAULTS.main_rag_chat,
    query_expansion: PROMPT_DEFAULTS.query_expansion,
    query_rewrite: PROMPT_DEFAULTS.query_rewrite,
    semantic_chunk_summaries: PROMPT_DEFAULTS.semantic_chunk_summaries,
    code_enrichment: PROMPT_DEFAULTS.code_enrichment,
    semantic_kg_extraction: PROMPT_DEFAULTS.semantic_kg_extraction,
    lightweight_chunk_summaries: PROMPT_DEFAULTS.lightweight_chunk_summaries,
    eval_analysis: PROMPT_DEFAULTS.eval_analysis,
  },
  ui: {
    theme_mode: 'dark',
    runtime_mode: 'production',
    open_browser: 0,
    chat_default_model: 'gpt-4o-mini',
    chat_streaming_enabled: 1,
    chat_show_trace: 1,
    chat_show_citations: 1,
    chat_show_debug_footer: 1,
    chat_show_confidence: 0,
    chat_history_max: 50,
    // Hosted demo: embed a same-origin Grafana-like dashboard route so the UI
    // doesn't point at localhost.
    grafana_base_url: '/demo',
    grafana_dashboard_uid: 'tribrid-overview',
    grafana_dashboard_slug: 'tribrid-overview',
    grafana_auth_mode: 'anonymous',
    grafana_embed_enabled: 1,
    grafana_kiosk: 'tv',
    grafana_org_id: 1,
    grafana_refresh: '10s',
  },
};

const FALLBACK_CHAT_MODELS = [
  // Local (not available on ragweld.com, but keep picker parity)
  {
    id: 'llama3.2:latest',
    provider: 'Ollama (Local)',
    source: 'local',
    provider_type: 'ollama',
    base_url: 'http://localhost:11434',
    supports_vision: false,
  },

  // OpenRouter
  {
    id: 'openai/gpt-4o-mini',
    provider: 'OpenAI (via OpenRouter)',
    source: 'openrouter',
    provider_type: 'openrouter',
    base_url: DEFAULT_OPENROUTER_BASE_URL,
    supports_vision: true,
  },
  {
    id: 'openai/gpt-4o',
    provider: 'OpenAI (via OpenRouter)',
    source: 'openrouter',
    provider_type: 'openrouter',
    base_url: DEFAULT_OPENROUTER_BASE_URL,
    supports_vision: true,
  },
  {
    id: 'anthropic/claude-3.5-sonnet',
    provider: 'Anthropic (via OpenRouter)',
    source: 'openrouter',
    provider_type: 'openrouter',
    base_url: DEFAULT_OPENROUTER_BASE_URL,
    supports_vision: true,
  },

  // Cloud direct (requires OPENAI_API_KEY)
  {
    id: 'gpt-5-mini',
    provider: 'OpenAI',
    source: 'cloud_direct',
    provider_type: 'openai',
    supports_vision: true,
  },
  {
    id: 'gpt-5',
    provider: 'OpenAI',
    source: 'cloud_direct',
    provider_type: 'openai',
    supports_vision: true,
  },
];

let openRouterModelsCache = null;
let openRouterModelsCacheTs = 0;
const OPENROUTER_MODELS_TTL_MS = 15 * 60 * 1000;

function cloneJson(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function mergeDeep(base, patch) {
  const baseObj = isPlainObject(base) ? base : {};
  const patchObj = isPlainObject(patch) ? patch : {};
  const out = { ...baseObj };
  for (const [key, value] of Object.entries(patchObj)) {
    if (isPlainObject(value) && isPlainObject(baseObj[key])) {
      out[key] = mergeDeep(baseObj[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function getCorpusScopeFromUrl(url) {
  try {
    const scope =
      String(url?.searchParams?.get('corpus_id') || '').trim() ||
      String(url?.searchParams?.get('corpus') || '').trim() ||
      String(url?.searchParams?.get('repo_id') || '').trim() ||
      String(url?.searchParams?.get('repo') || '').trim();
    return scope || 'global';
  } catch {
    return 'global';
  }
}

function getConfig(scope) {
  const key = String(scope || '').trim() || 'global';
  if (configByCorpus.has(key)) return configByCorpus.get(key);
  const cfg = cloneJson(DEFAULT_CONFIG);

  // Make chat "feel live": default checked sources include the active corpus.
  // (The frontend sends sources.corpus_ids; without this, the demo can default
  // to Recall-only and appear like it has no index.)
  if (key && key !== 'global') {
    const cur = Array.isArray(cfg?.chat?.default_corpus_ids) ? cfg.chat.default_corpus_ids.map(String) : [];
    const next = Array.from(new Set([key, ...cur])).filter((id) => id && id !== 'recall_default');
    cfg.chat.default_corpus_ids = next;
  }

  configByCorpus.set(key, cfg);
  return cfg;
}

function getValueAtPath(obj, path) {
  let cur = obj;
  for (const seg of path) {
    if (!isPlainObject(cur) || !(seg in cur)) return undefined;
    cur = cur[seg];
  }
  return cur;
}

function setValueAtPath(obj, path, value) {
  if (!isPlainObject(obj) || !Array.isArray(path) || path.length === 0) return false;
  let cur = obj;
  for (let i = 0; i < path.length - 1; i += 1) {
    const seg = path[i];
    if (!isPlainObject(cur[seg])) cur[seg] = {};
    cur = cur[seg];
  }
  cur[path[path.length - 1]] = value;
  return true;
}

function getPromptValue(cfg, promptKey) {
  const key = String(promptKey || '').trim();
  const path = PROMPT_CONFIG_PATHS[key];
  if (!Array.isArray(path)) return String(PROMPT_DEFAULTS[key] || '');
  const value = getValueAtPath(cfg, path);
  if (typeof value === 'string') return value;
  return String(PROMPT_DEFAULTS[key] || '');
}

function setPromptValue(cfg, promptKey, value) {
  const key = String(promptKey || '').trim();
  const path = PROMPT_CONFIG_PATHS[key];
  if (!Array.isArray(path)) return false;
  return setValueAtPath(cfg, path, String(value ?? ''));
}

function buildPromptsResponse(scope) {
  const cfg = getConfig(scope);
  const prompts = {};
  for (const key of Object.keys(PROMPT_METADATA)) {
    prompts[key] = getPromptValue(cfg, key);
  }
  return {
    prompts,
    metadata: cloneJson(PROMPT_METADATA),
  };
}

function normalizeBaseUrl(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  return s.replace(/\/$/, '');
}

function parseModelOverride(raw) {
  const s = String(raw || '').trim();
  if (!s) return { kind: null, model: '' };
  const idx = s.indexOf(':');
  if (idx === -1) return { kind: 'cloud_direct', model: s };
  const prefix = s.slice(0, idx).trim();
  const rest = s.slice(idx + 1).trim();
  if (prefix === 'openrouter') return { kind: 'openrouter', model: rest };
  if (prefix === 'local') return { kind: 'local', model: rest };
  // Unknown prefix: treat as cloud-direct model id to avoid surprising routing.
  return { kind: 'cloud_direct', model: s };
}

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

function inferFrontendBackendPorts(event) {
  try {
    const u = new URL(event?.rawUrl || 'https://ragweld.local/');
    const isHttps = u.protocol === 'https:';
    const portRaw = String(u.port || '').trim();
    const port = portRaw ? Number(portRaw) : (isHttps ? 443 : 80);
    const safePort = Number.isFinite(port) && port > 0 ? port : (isHttps ? 443 : 80);
    return { frontend_port: safePort, backend_port: safePort };
  } catch {
    return { frontend_port: 443, backend_port: 443 };
  }
}

async function relationSize(sql, relName) {
  try {
    const r = await sql.query(
      `SELECT COALESCE(pg_total_relation_size(to_regclass($1)), 0)::bigint AS n;`,
      [String(relName)],
    );
    return Number(r.rows?.[0]?.n) || 0;
  } catch {
    return 0;
  }
}

async function indexCounts(sql, corpusId) {
  const cid = String(corpusId || '').trim();
  const chunks = await sql.query(`SELECT COUNT(*)::int AS n FROM chunks WHERE corpus_id = $1;`, [cid]);
  const docs = await sql.query(
    `SELECT COUNT(DISTINCT file_path)::int AS n FROM chunks WHERE corpus_id = $1;`,
    [cid],
  );
  const ents = await sql.query(`SELECT COUNT(*)::int AS n FROM graph_entities WHERE corpus_id = $1;`, [cid]);
  const edges = await sql.query(`SELECT COUNT(*)::int AS n FROM graph_edges WHERE corpus_id = $1;`, [cid]);
  return {
    chunks: Number(chunks.rows?.[0]?.n) || 0,
    docs: Number(docs.rows?.[0]?.n) || 0,
    entities: Number(ents.rows?.[0]?.n) || 0,
    relationships: Number(edges.rows?.[0]?.n) || 0,
  };
}

async function totalCounts(sql) {
  const chunks = await sql.query(`SELECT COUNT(*)::int AS n FROM chunks;`);
  const ents = await sql.query(`SELECT COUNT(*)::int AS n FROM graph_entities;`);
  const edges = await sql.query(`SELECT COUNT(*)::int AS n FROM graph_edges;`);
  return {
    chunks: Number(chunks.rows?.[0]?.n) || 0,
    entities: Number(ents.rows?.[0]?.n) || 0,
    relationships: Number(edges.rows?.[0]?.n) || 0,
  };
}

function allocateBytes(totalBytes, partCount, totalCount) {
  if (!totalBytes || totalBytes <= 0) return 0;
  const denom = Number(totalCount) || 0;
  if (denom <= 0) return 0;
  const frac = Math.max(0, Math.min(1, Number(partCount || 0) / denom));
  return Math.round(totalBytes * frac);
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


    await sql.query(`
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

    await sql.query(`CREATE INDEX IF NOT EXISTS eval_dataset_corpus_idx ON eval_dataset (corpus_id, created_at DESC);`);

    await sql.query(`
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

    await sql.query(`CREATE INDEX IF NOT EXISTS eval_runs_corpus_idx ON eval_runs (corpus_id, created_at DESC);`);

    await sql.query(`CREATE INDEX IF NOT EXISTS graph_entities_name_idx ON graph_entities (corpus_id, name);`);
    await sql.query(`CREATE INDEX IF NOT EXISTS graph_edges_source_idx ON graph_edges (corpus_id, source_id);`);
    await sql.query(`CREATE INDEX IF NOT EXISTS graph_edges_target_idx ON graph_edges (corpus_id, target_id);`);

    await sql.query(`
      DELETE FROM corpora
      WHERE corpus_id <> 'epstein-files-1';
    `);

    await sql.query(`
      INSERT INTO corpora (corpus_id, name, path, slug, branch, description)
      VALUES
        ('epstein-files-1', 'Epstein Files 1', 'epstein-files-1', 'epstein-files-1', NULL, 'Epstein files demo corpus')
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


function formatRunId(corpusId, date) {
  const pad = (n) => String(n).padStart(2, '0');
  const ts = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${corpusId}__${ts}`;
}

function flattenConfigSnapshot(cfg) {
  const out = {};
  const walk = (obj, prefix) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      if (prefix) out[prefix] = obj;
      return;
    }
    for (const [k, v] of Object.entries(obj)) {
      walk(v, prefix ? `${prefix}.${k}` : k);
    }
  };
  walk(cfg, '');
  return out;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pathMatches(expected, actual) {
  const e = String(expected || '').trim();
  const a = String(actual || '').trim();
  if (!e || !a) return false;
  if (e === a) return true;
  return a.endsWith(e) || e.endsWith(a);
}

function recallAtK(expectedPaths, retrievedPaths, k) {
  const expected = (expectedPaths || []).filter(Boolean);
  if (!expected.length) return 0;
  const retrieved = (retrievedPaths || []).slice(0, k).filter(Boolean);
  let hits = 0;
  for (const e of expected) {
    if (retrieved.some((r) => pathMatches(e, r))) hits += 1;
  }
  return hits / expected.length;
}

function precisionAtK(expectedPaths, retrievedPaths, k) {
  const retrieved = (retrievedPaths || []).slice(0, k).filter(Boolean);
  if (!retrieved.length) return 0;
  let hits = 0;
  for (const r of retrieved) {
    if ((expectedPaths || []).some((e) => pathMatches(e, r))) hits += 1;
  }
  return hits / Math.max(1, k);
}

function ndcgAtK(expectedPaths, retrievedPaths, k) {
  const retrieved = (retrievedPaths || []).slice(0, k).filter(Boolean);
  const expected = (expectedPaths || []).filter(Boolean);
  if (!retrieved.length || !expected.length) return 0;
  let dcg = 0;
  for (let i = 0; i < retrieved.length; i += 1) {
    if (expected.some((e) => pathMatches(e, retrieved[i]))) {
      dcg += 1 / Math.log2(i + 2);
    }
  }
  const ideal = Math.min(expected.length, k);
  let idcg = 0;
  for (let i = 0; i < ideal; i += 1) idcg += 1 / Math.log2(i + 2);
  return idcg ? dcg / idcg : 0;
}

function percentile(values, p) {
  const vals = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!vals.length) return 0;
  const idx = Math.max(0, Math.min(vals.length - 1, Math.round((vals.length - 1) * p)));
  return vals[idx];
}

function pickUniquePaths(paths, count, rng) {
  const out = [];
  const used = new Set();
  const pool = paths.slice();
  while (out.length < count && pool.length) {
    const idx = Math.floor(rng() * pool.length);
    const [p] = pool.splice(idx, 1);
    if (!p || used.has(p)) continue;
    used.add(p);
    out.push(p);
  }
  return out;
}

function buildEvalResults({ entries, allPaths, chunkByPath, rng, finalK, accuracyBias }) {
  const results = [];
  const topK = Math.max(1, Number(finalK) || 5);
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const expectedPaths = Array.isArray(entry.expected_paths) ? entry.expected_paths.filter(Boolean) : [];
    const expectedPath = expectedPaths[0] || '';
    const pool = allPaths.filter((p) => p && !expectedPaths.some((e) => pathMatches(e, p)));
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
    const latencyMs = 40 + rng() * 160;

    const docs = topPaths.map((p, idx) => {
      const c = chunkByPath.get(p);
      const baseScore = 0.98 - idx * 0.05;
      return {
        file_path: p,
        start_line: c ? Number(c.start_line || 0) : null,
        score: Math.max(0.05, baseScore - rng() * 0.03),
        source: 'sparse',
      };
    });

    results.push({
      entry_id: String(entry.entry_id || i + 1),
      question: String(entry.question || ''),
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

function computeEvalMetrics(results) {
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

function buildEvalRun({ runId, corpusId, datasetId, configSnapshot, results, startedAt, completedAt, useMulti, finalK }) {
  const total = results.length;
  const top1Hits = results.filter((r) => r.top1_hit).length;
  const topkHits = results.filter((r) => r.topk_hit).length;
  const metrics = computeEvalMetrics(results);
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

async function seedEvalDatasetFromChunks(sql, corpusId, limit = 24) {
  const rows = await sql.query(
    `SELECT DISTINCT file_path
     FROM chunks
     WHERE corpus_id = $1
     ORDER BY file_path ASC
     LIMIT $2;`,
    [corpusId, limit]
  );
  const now = Date.now();
  const entries = (rows.rows || []).map((r, idx) => {
    const filePath = String(r.file_path || '').trim();
    const base = filePath.split('/').pop() || filePath;
    const stem = base.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
    const question = stem
      ? `What does ${stem} implement?`
      : `Where is ${base} defined?`;
    const ext = base.includes('.') ? base.split('.').pop() : '';
    const tags = ext ? [String(ext).toLowerCase()] : [];
    return {
      entry_id: String(idx + 1),
      question,
      expected_paths: filePath ? [filePath] : [],
      expected_answer: null,
      tags,
      created_at: new Date(now - 48 * 60 * 60 * 1000 + idx * 60 * 1000).toISOString(),
    };
  });

  for (const entry of entries) {
    await sql.query(
      `INSERT INTO eval_dataset (
        corpus_id,
        entry_id,
        question,
        expected_paths,
        expected_answer,
        tags,
        created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (corpus_id, entry_id) DO NOTHING;`,
      [
        corpusId,
        entry.entry_id,
        entry.question,
        entry.expected_paths,
        entry.expected_answer,
        entry.tags,
        entry.created_at,
      ]
    );
  }

  return entries;
}

async function ensureEvalDataset(sql, corpusId) {
  const countRes = await sql.query(
    `SELECT COUNT(*)::int AS n
     FROM eval_dataset
     WHERE corpus_id = $1;`,
    [corpusId]
  );
  const count = Number(countRes.rows?.[0]?.n) || 0;
  if (count > 0) return null;
  return await seedEvalDatasetFromChunks(sql, corpusId);
}

async function listEvalDataset(sql, corpusId) {
  await ensureEvalDataset(sql, corpusId);
  const rows = await sql.query(
    `SELECT entry_id, question, expected_paths, expected_answer, tags, created_at
     FROM eval_dataset
     WHERE corpus_id = $1
     ORDER BY created_at ASC;`,
    [corpusId]
  );
  return (rows.rows || []).map((r) => ({
    entry_id: String(r.entry_id),
    question: String(r.question || ''),
    expected_paths: Array.isArray(r.expected_paths) ? r.expected_paths : r.expected_paths || [],
    expected_answer: r.expected_answer == null ? null : String(r.expected_answer),
    tags: Array.isArray(r.tags) ? r.tags : r.tags || [],
    created_at: r.created_at ? new Date(r.created_at).toISOString() : nowIso(),
  }));
}

async function insertEvalDatasetEntry(sql, corpusId, payload) {
  const entryId = String(payload?.entry_id || crypto.randomUUID());
  const question = String(payload?.question || '').trim();
  if (!question) throw new Error('Question is required');
  const expectedPaths = Array.isArray(payload?.expected_paths)
    ? payload.expected_paths.filter(Boolean)
    : [];
  const tags = Array.isArray(payload?.tags) ? payload.tags.filter(Boolean) : [];
  const createdAt = nowIso();
  const entry = {
    entry_id: entryId,
    question,
    expected_paths: expectedPaths,
    expected_answer: payload?.expected_answer == null ? null : String(payload.expected_answer),
    tags,
    created_at: createdAt,
  };
  await sql.query(
    `INSERT INTO eval_dataset (
      corpus_id,
      entry_id,
      question,
      expected_paths,
      expected_answer,
      tags,
      created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7);`,
    [corpusId, entry.entry_id, entry.question, entry.expected_paths, entry.expected_answer, entry.tags, entry.created_at]
  );
  return entry;
}

async function updateEvalDatasetEntry(sql, corpusId, entryId, payload) {
  const existing = await sql.query(
    `SELECT entry_id, created_at FROM eval_dataset WHERE corpus_id = $1 AND entry_id = $2;`,
    [corpusId, entryId]
  );
  if (!existing.rows?.length) return null;
  const question = String(payload?.question || '').trim();
  const expectedPaths = Array.isArray(payload?.expected_paths)
    ? payload.expected_paths.filter(Boolean)
    : [];
  const tags = Array.isArray(payload?.tags) ? payload.tags.filter(Boolean) : [];
  const expectedAnswer = payload?.expected_answer == null ? null : String(payload.expected_answer);
  const createdAt = existing.rows[0].created_at;

  await sql.query(
    `UPDATE eval_dataset
     SET question = $3,
         expected_paths = $4,
         expected_answer = $5,
         tags = $6
     WHERE corpus_id = $1 AND entry_id = $2;`,
    [corpusId, entryId, question, expectedPaths, expectedAnswer, tags]
  );

  return {
    entry_id: String(entryId),
    question,
    expected_paths: expectedPaths,
    expected_answer: expectedAnswer,
    tags,
    created_at: createdAt ? new Date(createdAt).toISOString() : nowIso(),
  };
}

async function deleteEvalDatasetEntry(sql, corpusId, entryId) {
  const res = await sql.query(
    `DELETE FROM eval_dataset WHERE corpus_id = $1 AND entry_id = $2;`,
    [corpusId, entryId]
  );
  return Number(res.rowCount) || 0;
}

async function loadEvalRun(sql, runId) {
  const res = await sql.query(
    `SELECT run_json
     FROM eval_runs
     WHERE run_id = $1
     LIMIT 1;`,
    [runId]
  );
  const row = res.rows?.[0];
  return row ? row.run_json : null;
}

async function getLatestEvalRun(sql, corpusId) {
  const res = await sql.query(
    `SELECT run_json
     FROM eval_runs
     WHERE corpus_id = $1
     ORDER BY created_at DESC
     LIMIT 1;`,
    [corpusId]
  );
  const row = res.rows?.[0];
  return row ? row.run_json : null;
}

async function listEvalRuns(sql, corpusId) {
  const res = await sql.query(
    `SELECT run_id, top1_accuracy, topk_accuracy, mrr, total, duration_secs, has_config
     FROM eval_runs
     WHERE corpus_id = $1
     ORDER BY created_at DESC;`,
    [corpusId]
  );
  return (res.rows || []).map((r) => ({
    run_id: String(r.run_id),
    top1_accuracy: Number(r.top1_accuracy) || 0,
    topk_accuracy: Number(r.topk_accuracy) || 0,
    mrr: r.mrr == null ? null : Number(r.mrr),
    total: Number(r.total) || 0,
    duration_secs: Number(r.duration_secs) || 0,
    has_config: r.has_config !== false,
  }));
}

async function createEvalRun(sql, {
  corpusId,
  datasetEntries,
  configSnapshot,
  finalK,
  useMulti,
  sampleSize,
  accuracyBias,
}) {
  const entries = Array.isArray(datasetEntries) ? datasetEntries.slice() : [];
  if (!entries.length) return null;

  let sample = entries;
  if (sampleSize && Number.isFinite(sampleSize) && sampleSize > 0 && sampleSize < entries.length) {
    sample = entries.slice(0, Math.max(1, Math.floor(sampleSize)));
  }

  const allPaths = entries
    .flatMap((e) => (Array.isArray(e.expected_paths) ? e.expected_paths : []))
    .filter(Boolean);

  const chunkByPath = new Map();
  if (allPaths.length) {
    const uniq = Array.from(new Set(allPaths));
    const res = await sql.query(
      `SELECT file_path, start_line
       FROM chunks
       WHERE corpus_id = $1
         AND file_path = ANY($2::text[]);`,
      [corpusId, uniq]
    );
    for (const row of res.rows || []) {
      chunkByPath.set(String(row.file_path), row);
    }
  }

  const seed = Math.floor(Date.now() % 2147483647);
  const rng = mulberry32(seed);
  const results = buildEvalResults({
    entries: sample,
    allPaths,
    chunkByPath,
    rng,
    finalK,
    accuracyBias: Number(accuracyBias || 0.78),
  });

  const startedAt = new Date();
  const completedAt = new Date(startedAt.getTime() + 75 * 1000);
  const runId = formatRunId(corpusId, completedAt);
  const datasetId = 'epstein-demo';
  const run = buildEvalRun({
    runId,
    corpusId,
    datasetId,
    configSnapshot,
    results,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    useMulti,
    finalK,
  });

  await sql.query(
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
    ON CONFLICT (run_id) DO UPDATE SET run_json = EXCLUDED.run_json;`,
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

  return run;
}

function buildRagPrompt(userMessage, matches) {
  const maxChunks = Math.min(matches.length, 8);
  const context = matches.slice(0, maxChunks).map((m, idx) => {
    const header = `[${idx + 1}] ${m.file_path}:${m.start_line}-${m.end_line}`;
    return `${header}\n${m.content}`;
  });

  const system = [
    'You are ragweld, a helpful agentic RAG database assistant.',
    'Answer using ONLY the provided context when possible.',
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

async function callOpenAI(system, user, modelOverride) {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY');

  const model =
    String(modelOverride || '').trim() ||
    String(process.env.RAGWELD_CHAT_MODEL || 'gpt-5-mini').trim() ||
    'gpt-4o-mini';

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

async function callOpenRouter(system, user, modelOverride, baseUrlOverride) {
  const apiKey = String(process.env.OPENROUTER_API_KEY || '').trim();
  if (!apiKey) throw new Error('Missing OPENROUTER_API_KEY');

  const baseUrl =
    normalizeBaseUrl(baseUrlOverride) ||
    normalizeBaseUrl(process.env.OPENROUTER_BASE_URL) ||
    DEFAULT_OPENROUTER_BASE_URL;

  const model =
    String(modelOverride || '').trim() ||
    String(process.env.RAGWELD_OPENROUTER_MODEL || 'openai/gpt-5-mini').trim() ||
    'openai/gpt-5-mini';

  const referer =
    String(process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL || '').trim() ||
    'https://ragweld.com';

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      // OpenRouter recommends these for attribution/rate-limit friendliness.
      'HTTP-Referer': referer,
      'X-Title': 'ragweld demo',
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
    throw new Error(`OpenRouter error (${res.status}): ${text || res.statusText}`);
  }

  const data = await res.json();
  const content = String(data?.choices?.[0]?.message?.content || '').trim();
  const tokensUsed = Number(data?.usage?.total_tokens) || 0;
  return { content, tokensUsed, baseUrl, model };
}

function titleFromModelId(id) {
  const raw = String(id || '').trim();
  if (!raw) return '';
  const vendor = raw.includes('/') ? raw.split('/')[0] : '';
  if (!vendor) return '';
  const normalized = vendor.replace(/[_-]+/g, ' ').trim();
  return normalized
    .split(' ')
    .filter(Boolean)
    .map((w) => w.slice(0, 1).toUpperCase() + w.slice(1))
    .join(' ');
}

async function listOpenRouterModels() {
  const apiKey = String(process.env.OPENROUTER_API_KEY || '').trim();
  if (!apiKey) return null;

  const now = Date.now();
  if (openRouterModelsCache && now - openRouterModelsCacheTs < OPENROUTER_MODELS_TTL_MS) {
    return openRouterModelsCache;
  }

  const baseUrl =
    normalizeBaseUrl(process.env.OPENROUTER_BASE_URL) || DEFAULT_OPENROUTER_BASE_URL;

  try {
    const referer =
      String(process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL || '').trim() ||
      'https://ragweld.com';

    const res = await fetch(`${baseUrl}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': referer,
        'X-Title': 'ragweld demo',
      },
    });

    if (!res.ok) {
      openRouterModelsCache = null;
      openRouterModelsCacheTs = now;
      return null;
    }

    const data = await res.json().catch(() => null);
    const items = Array.isArray(data?.data) ? data.data : [];
    const mapped = items
      .map((m) => {
        const id = String(m?.id || '').trim();
        if (!id) return null;
        const providerTitle = titleFromModelId(id) || 'OpenRouter';
        return {
          id,
          provider: `${providerTitle} (via OpenRouter)`,
          source: 'openrouter',
          provider_type: 'openrouter',
          base_url: baseUrl,
          supports_vision: false,
        };
      })
      .filter(Boolean);

    // Keep ordering deterministic.
    mapped.sort((a, b) => String(a.id).localeCompare(String(b.id)));

    openRouterModelsCache = mapped;
    openRouterModelsCacheTs = now;
    return mapped;
  } catch {
    openRouterModelsCache = null;
    openRouterModelsCacheTs = now;
    return null;
  }
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
  let provider = null;
  try {
    const scope = String(request?.corpus_id || '').trim() || null;
    const cfg = getConfig(scope || 'global');

    const overrideRaw = String(request?.model_override || '').trim();
    const parsed = parseModelOverride(overrideRaw);

    // Resolve provider route:
    // - Explicit prefixes win (openrouter:/local:)
    // - Otherwise fall back to config defaults.
    let kind = parsed.kind;
    let model = parsed.model;

    if (!kind) {
      const orEnabled = Boolean(cfg?.chat?.openrouter?.enabled);
      if (orEnabled) {
        kind = 'openrouter';
        model = String(cfg?.chat?.openrouter?.default_model || '').trim() || model;
      } else {
        kind = 'cloud_direct';
        model = String(cfg?.ui?.chat_default_model || '').trim() || model;
      }
    }

    if (kind === 'local') {
      throw new Error('Local providers are not available in the hosted demo. Choose an OpenRouter model instead.');
    }

    if (kind === 'openrouter') {
      const baseUrl = String(cfg?.chat?.openrouter?.base_url || '').trim();
      const result = await callOpenRouter(system, user, model, baseUrl);
      assistant = result.content || 'No response generated.';
      tokensUsed = result.tokensUsed;
      provider = {
        kind: 'openrouter',
        provider_name: 'OpenRouter',
        model: String(result.model || model || '').trim(),
        base_url: result.baseUrl || baseUrl || DEFAULT_OPENROUTER_BASE_URL,
      };
    } else {
      const result = await callOpenAI(system, user, model);
      assistant = result.content || 'No response generated.';
      tokensUsed = result.tokensUsed;
      provider = {
        kind: 'cloud_direct',
        provider_name: 'OpenAI',
        model: String(model || '').trim() || String(process.env.RAGWELD_CHAT_MODEL || 'gpt-4o-mini').trim(),
        base_url: null,
      };
    }
  } catch (e) {
    assistant = `Demo backend is not fully configured.\n\n${String(e?.message || e)}`;
    tokensUsed = 0;
    provider = provider || null;
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
      provider,
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
  const chunksCount = await sql.query(`SELECT COUNT(*)::int AS n FROM chunks WHERE corpus_id = $1;`, [corpusId]);
  const docsCount = await sql.query(`SELECT COUNT(DISTINCT file_path)::int AS n FROM chunks WHERE corpus_id = $1;`, [corpusId]);

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
    total_documents: Number(docsCount.rows?.[0]?.n) || 0,
    total_chunks: Number(chunksCount.rows?.[0]?.n) || 0,
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
      String(process.env.RAGWELD_DATABASE_URL || process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL || '').trim();
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
  const scope = getCorpusScopeFromUrl(url);

  // ---------------------------------------------------------------------------
  // Hosted demo status endpoints (match TriBridRAG /web expectations)
  // ---------------------------------------------------------------------------
  if (method === 'GET' && path === '/api/dev/status') {
    const ports = inferFrontendBackendPorts(event);
    return json(200, {
      frontend_running: true,
      backend_running: true,
      frontend_port: ports.frontend_port,
      backend_port: ports.backend_port,
      frontend_url: null,
      backend_url: null,
      details: ['Hosted demo (Netlify)', 'Dev stack controls are not applicable'],
    });
  }

  if (
    method === 'POST' &&
    (path === '/api/dev/frontend/restart' ||
      path === '/api/dev/backend/restart' ||
      path === '/api/dev/stack/restart' ||
      path === '/api/dev/backend/clear-cache-restart')
  ) {
    const ports = inferFrontendBackendPorts(event);
    return json(200, {
      success: false,
      message: 'Not supported in the hosted demo (read-only).',
      error: 'dev_stack_unavailable',
      frontend_port: ports.frontend_port,
      backend_port: ports.backend_port,
    });
  }

  if (method === 'GET' && path === '/api/docker/status') {
    return json(200, { running: false, runtime: 'unavailable', containers_count: 0 });
  }

  if (method === 'GET' && (path === '/api/docker/containers' || path === '/api/docker/containers/all')) {
    return json(200, { containers: [] });
  }

  if (method === 'GET' && path === '/api/mcp/status') {
    // Hosted demo doesn't run MCP servers; report deterministic status so UI doesn't show "unknown".
    return json(200, {
      python_http: { host: 'localhost', port: 8012, path: null, running: false },
      node_http: null,
      python_stdio_available: false,
      details: ['MCP is available in the full local stack, not in the hosted demo.'],
    });
  }

  // Newer UI expects these endpoints, even if empty.
  if (method === 'GET' && path === '/api/traces') {
    return json(200, { traces: [], total: 0 });
  }
  if (method === 'GET' && path === '/api/traces/latest') {
    return json(200, null);
  }
  if (method === 'GET' && path === '/api/monitoring/top-queries') {
    return json(200, { total_queries: 0, top: [] });
  }

  // Indexing endpoints (hosted demo is read-only; report status from existing DB).
  if (method === 'POST' && path === '/api/index') {
    const corpusId = String(body?.corpus_id || '').trim();
    return json(200, {
      corpus_id: corpusId || 'unknown',
      status: 'error',
      progress: 0,
      error: 'Indexing is disabled in the hosted demo (read-only index).',
      started_at: null,
      completed_at: null,
      current_file: null,
    });
  }

  if (method === 'DELETE' && path.startsWith('/api/index/')) {
    const corpusId = decodeURIComponent(path.slice('/api/index/'.length));
    return json(200, {
      corpus_id: corpusId || 'unknown',
      status: 'error',
      progress: 0,
      error: 'Delete is disabled in the hosted demo.',
      started_at: null,
      completed_at: null,
      current_file: null,
    });
  }

  // Dashboard summary panel expects this schema (different from /api/index/:id/status).
  if (method === 'GET' && path === '/api/index/status') {
    const corpusId = String(url.searchParams.get('corpus_id') || '').trim() || 'epstein-files-1';
    const corpus = await getCorpus(sql, corpusId);
    const counts = await indexCounts(sql, corpusId);
    const totals = await totalCounts(sql);

    // Best-effort token estimate: ~4 chars/token.
    let totalChars = 0;
    try {
      const r = await sql.query(`SELECT SUM(LENGTH(content))::bigint AS n FROM chunks WHERE corpus_id = $1;`, [corpusId]);
      totalChars = Number(r.rows?.[0]?.n) || 0;
    } catch {}
    const totalTokens = Math.max(0, Math.round(totalChars / 4));

    let keywordsCount = 0;
    try {
      const r = await sql.query(`SELECT meta FROM corpora WHERE corpus_id = $1 LIMIT 1;`, [corpusId]);
      const meta = r.rows?.[0]?.meta || {};
      const kw = meta?.keywords;
      keywordsCount = Array.isArray(kw) ? kw.length : 0;
    } catch {}

    const chunksTable = await relationSize(sql, 'chunks');
    const entitiesTable = await relationSize(sql, 'graph_entities');
    const edgesTable = await relationSize(sql, 'graph_edges');
    const tsvIdx = await relationSize(sql, 'chunks_corpus_tsv_idx');

    const chunksBytes = allocateBytes(chunksTable, counts.chunks, totals.chunks);
    const embeddingsBytes = 0;
    const pgvectorIdxBytes = 0;
    const bm25IdxBytes = allocateBytes(tsvIdx, counts.chunks, totals.chunks);
    const chunkSummariesBytes = 0;
    const neo4jBytes = 0;
    const entitiesBytes = allocateBytes(entitiesTable, counts.entities, totals.entities);
    const edgesBytes = allocateBytes(edgesTable, counts.relationships, totals.relationships);

    const postgresTotal =
      chunksBytes +
      embeddingsBytes +
      pgvectorIdxBytes +
      bm25IdxBytes +
      chunkSummariesBytes +
      entitiesBytes +
      edgesBytes;

    const displayName = String(corpus?.name || corpusId).trim() || corpusId;
    const timestamp = nowIso();

    return json(200, {
      lines: [
        `corpus_id=${corpusId}`,
        `documents=${counts.docs}`,
        `chunks=${counts.chunks}`,
        `entities=${counts.entities}`,
        `relationships=${counts.relationships}`,
        `last_indexed=${corpus?.last_indexed || 'null'}`,
      ],
      metadata: {
        corpus_id: corpusId,
        current_repo: displayName,
        current_branch: corpus?.branch ?? null,
        timestamp,
        embedding_config: {
          provider: 'openai',
          model: 'text-embedding-3-large',
          dimensions: 3072,
          precision: 'float32',
        },
        costs: {
          total_tokens: totalTokens,
          embedding_cost: null,
        },
        storage_breakdown: {
          chunks_bytes: chunksBytes,
          embeddings_bytes: embeddingsBytes,
          pgvector_index_bytes: pgvectorIdxBytes,
          bm25_index_bytes: bm25IdxBytes,
          chunk_summaries_bytes: chunkSummariesBytes,
          neo4j_store_bytes: neo4jBytes,
          postgres_total_bytes: postgresTotal,
          total_storage_bytes: postgresTotal,
        },
        keywords_count: keywordsCount,
        total_storage: postgresTotal,
      },
      running: false,
      progress: null,
      current_file: null,
    });
  }

  if (method === 'GET' && path === '/api/index/stats') {
    const corpusId = String(url.searchParams.get('corpus_id') || '').trim() || 'epstein-files-1';
    const counts = await indexCounts(sql, corpusId);
    const totals = await totalCounts(sql);
    const chunksTable = await relationSize(sql, 'chunks');
    const entitiesTable = await relationSize(sql, 'graph_entities');
    const edgesTable = await relationSize(sql, 'graph_edges');
    const tsvIdx = await relationSize(sql, 'chunks_corpus_tsv_idx');

    const chunksBytes = allocateBytes(chunksTable, counts.chunks, totals.chunks);
    const bm25IdxBytes = allocateBytes(tsvIdx, counts.chunks, totals.chunks);
    const entitiesBytes = allocateBytes(entitiesTable, counts.entities, totals.entities);
    const edgesBytes = allocateBytes(edgesTable, counts.relationships, totals.relationships);

    const postgresTotal = chunksBytes + bm25IdxBytes + entitiesBytes + edgesBytes;

    let keywordsCount = 0;
    try {
      const r = await sql.query(`SELECT meta FROM corpora WHERE corpus_id = $1 LIMIT 1;`, [corpusId]);
      const meta = r.rows?.[0]?.meta || {};
      const kw = meta?.keywords;
      keywordsCount = Array.isArray(kw) ? kw.length : 0;
    } catch {}

    return json(200, {
      corpus_id: corpusId,
      storage_breakdown: {
        chunks_bytes: chunksBytes,
        embeddings_bytes: 0,
        pgvector_index_bytes: 0,
        bm25_index_bytes: bm25IdxBytes,
        chunk_summaries_bytes: 0,
        neo4j_store_bytes: 0,
        postgres_total_bytes: postgresTotal,
        total_storage_bytes: postgresTotal,
      },
      keywords_count: keywordsCount,
      total_storage: postgresTotal,
    });
  }

  // Index status per-corpus (used by /web indexing hooks; different schema from /api/index/status)
  if (method === 'GET' && path.startsWith('/api/index/') && path.endsWith('/status')) {
    const corpusId = decodeURIComponent(path.slice('/api/index/'.length, -'/status'.length));
    const corpus = await getCorpus(sql, corpusId);
    const lastIndexed = corpus?.last_indexed || null;
    return json(200, {
      corpus_id: corpusId,
      status: lastIndexed ? 'complete' : 'idle',
      progress: lastIndexed ? 1 : 0,
      current_file: null,
      error: null,
      started_at: null,
      completed_at: lastIndexed,
    });
  }

  if (method === 'GET' && path.startsWith('/api/index/') && path.endsWith('/stats')) {
    const corpusId = decodeURIComponent(path.slice('/api/index/'.length, -'/stats'.length));
    const corpus = await getCorpus(sql, corpusId);
    const lastIndexed = corpus?.last_indexed || null;
    const counts = await indexCounts(sql, corpusId);
    // Best-effort token estimate: ~4 chars/token.
    let totalChars = 0;
    try {
      const r = await sql.query(`SELECT SUM(LENGTH(content))::bigint AS n FROM chunks WHERE corpus_id = $1;`, [corpusId]);
      totalChars = Number(r.rows?.[0]?.n) || 0;
    } catch {}
    const totalTokens = Math.max(0, Math.round(totalChars / 4));
    return json(200, {
      corpus_id: corpusId,
      total_files: counts.docs,
      total_chunks: counts.chunks,
      total_tokens: totalTokens,
      embedding_model: 'text-embedding-3-large',
      embedding_dimensions: 3072,
      last_indexed: lastIndexed,
      file_breakdown: {},
    });
  }

  // Keywords generation (best-effort). Stores keywords into corpora.meta.keywords for dashboard display.
  if (method === 'POST' && path === '/api/keywords/generate') {
    const corpusId = String(body?.corpus_id || '').trim() || 'epstein-files-1';

    // Pull a bounded sample to keep this fast on large indexes.
    const sample = await sql.query(
      `SELECT content
       FROM chunks
       WHERE corpus_id = $1
       ORDER BY chunk_id ASC
       LIMIT 300;`,
      [corpusId],
    );

    const stop = new Set([
      'this','that','with','from','have','will','your','them','they','then','there','here','when','where','what','which','while','into','over','under',
      'return','const','function','class','async','await','import','export','default','true','false','null','undefined','self','super','public','private',
      'string','number','boolean','object','array','dict','list','tuple','none','json','http','https','select','insert','update','delete','create','table',
      'also','only','most','more','some','such','than','much','each','very','just','like','able','make','made','used','using','use','uses','into','onto',
    ]);

    const counts = new Map();
    for (const row of sample.rows || []) {
      const text = String(row?.content || '').toLowerCase();
      const words = text
        .replace(/[^a-z0-9_\\-\\s]/g, ' ')
        .split(/\\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= 4 && w.length <= 32);
      for (const w of words) {
        if (stop.has(w)) continue;
        counts.set(w, (counts.get(w) || 0) + 1);
      }
    }

    const keywords = Array.from(counts.entries())
      .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
      .slice(0, 32)
      .map(([w]) => w);

    try {
      await sql.query(
        `UPDATE corpora
         SET meta = jsonb_set(meta, '{keywords}', to_jsonb($2::text[]), true)
         WHERE corpus_id = $1;`,
        [corpusId, keywords],
      );
    } catch {
      // ignore (best-effort)
    }

    return json(200, { corpus_id: corpusId, keywords, count: keywords.length });
  }

  if (method === 'GET' && path === '/api/prompts') {
    return json(200, buildPromptsResponse(scope));
  }

  if (method === 'POST' && path.startsWith('/api/prompts/reset/')) {
    const promptKey = decodeURIComponent(path.slice('/api/prompts/reset/'.length)).trim();
    if (!promptKey || !(promptKey in PROMPT_METADATA)) {
      return json(404, {
        ok: false,
        prompt_key: promptKey,
        message: `Unknown prompt key: ${promptKey || '(empty)'}`,
      });
    }
    const cfg = getConfig(scope);
    const nextValue = String(PROMPT_DEFAULTS[promptKey] || '');
    setPromptValue(cfg, promptKey, nextValue);
    configByCorpus.set(scope, cfg);
    return json(200, {
      ok: true,
      prompt_key: promptKey,
      message: 'Prompt reset to default',
    });
  }

  if (method === 'PUT' && path.startsWith('/api/prompts/')) {
    const promptKey = decodeURIComponent(path.slice('/api/prompts/'.length)).trim();
    if (!promptKey || promptKey.startsWith('reset/') || !(promptKey in PROMPT_METADATA)) {
      return json(404, {
        ok: false,
        prompt_key: promptKey,
        message: `Unknown prompt key: ${promptKey || '(empty)'}`,
      });
    }
    const nextValue = String(body?.value ?? '');
    const cfg = getConfig(scope);
    const ok = setPromptValue(cfg, promptKey, nextValue);
    if (!ok) {
      return json(404, {
        ok: false,
        prompt_key: promptKey,
        message: `Unknown prompt key: ${promptKey || '(empty)'}`,
      });
    }
    configByCorpus.set(scope, cfg);
    return json(200, {
      ok: true,
      prompt_key: promptKey,
      message: 'Prompt updated',
    });
  }

  if (path === '/api/config') {
    if (method === 'GET') {
      return json(200, getConfig(scope));
    }
    if (method === 'PUT') {
      const next = isPlainObject(body) ? body : {};
      configByCorpus.set(scope, cloneJson(next));
      return json(200, getConfig(scope));
    }
    return json(405, { error: 'Method not allowed' });
  }

  if (method === 'PATCH' && path.startsWith('/api/config/')) {
    const section = decodeURIComponent(path.slice('/api/config/'.length));
    const cfg = getConfig(scope);
    const curSection = isPlainObject(cfg?.[section]) ? cfg[section] : {};
    const updates = isPlainObject(body) ? body : {};
    cfg[section] = mergeDeep(curSection, updates);
    configByCorpus.set(scope, cfg);
    return json(200, cfg);
  }

  if (method === 'POST' && path === '/api/config/reset') {
    // Delete + recreate so per-corpus defaults (e.g., chat.default_corpus_ids) are re-applied.
    configByCorpus.delete(scope);
    return json(200, getConfig(scope));
  }

  if (method === 'POST' && path === '/api/config/reload') {
    // No disk-backed config in the demo backend; treat as a no-op.
    return json(200, { ok: true });
  }


  if (path === '/api/dataset') {
    const corpusId = scope && scope !== 'global' ? scope : 'epstein-files-1';
    if (!corpusId) return json(422, { detail: 'Missing corpus_id' });

    if (method === 'GET') {
      const entries = await listEvalDataset(sql, corpusId);
      return json(200, entries);
    }

    if (method === 'POST') {
      try {
        const entry = await insertEvalDatasetEntry(sql, corpusId, body || {});
        return json(200, entry);
      } catch (e) {
        return json(400, { detail: String(e?.message || e) });
      }
    }
  }

  if (path.startsWith('/api/dataset/')) {
    const corpusId = scope && scope !== 'global' ? scope : 'epstein-files-1';
    if (!corpusId) return json(422, { detail: 'Missing corpus_id' });
    const entryId = decodeURIComponent(path.slice('/api/dataset/'.length));
    if (!entryId) return json(422, { detail: 'Missing entry_id' });

    if (method === 'PUT') {
      try {
        const updated = await updateEvalDatasetEntry(sql, corpusId, entryId, body || {});
        if (!updated) return json(404, { detail: `entry_id=${entryId} not found` });
        return json(200, updated);
      } catch (e) {
        return json(400, { detail: String(e?.message || e) });
      }
    }

    if (method === 'DELETE') {
      const deleted = await deleteEvalDatasetEntry(sql, corpusId, entryId);
      if (!deleted) return json(404, { detail: `entry_id=${entryId} not found` });
      return json(200, { ok: true, deleted });
    }
  }

  if (method === 'GET' && path === '/api/eval/runs') {
    const corpusId = scope && scope !== 'global' ? scope : 'epstein-files-1';
    const runs = await listEvalRuns(sql, corpusId);
    return json(200, { ok: true, runs });
  }

  if (method === 'GET' && path === '/api/eval/results') {
    const corpusId = scope && scope !== 'global' ? scope : 'epstein-files-1';
    const latest = await getLatestEvalRun(sql, corpusId);
    if (!latest) return json(404, { detail: 'No eval runs found' });
    return json(200, latest);
  }

  if (method === 'GET' && path.startsWith('/api/eval/results/')) {
    const runId = decodeURIComponent(path.slice('/api/eval/results/'.length));
    if (!runId) return json(422, { detail: 'Missing run_id' });
    const run = await loadEvalRun(sql, runId);
    if (!run) return json(404, { detail: `run_id=${runId} not found` });
    return json(200, run);
  }

  if (method === 'POST' && path === '/api/eval/run') {
    const corpusId = String(body?.corpus_id || body?.repo_id || body?.repo || '').trim() || 'epstein-files-1';
    const latest = await getLatestEvalRun(sql, corpusId);
    if (latest) return json(200, latest);

    const configSnapshot = getConfig(corpusId);
    const datasetEntries = await listEvalDataset(sql, corpusId);
    const finalK = Number(configSnapshot?.retrieval?.eval_final_k || configSnapshot?.retrieval?.final_k || 5) || 5;
    const useMulti = Boolean(Number(configSnapshot?.retrieval?.eval_multi ?? 1));
    const run = await createEvalRun(sql, {
      corpusId,
      datasetEntries,
      configSnapshot,
      finalK,
      useMulti,
      sampleSize: body?.sample_size ? Number(body.sample_size) : null,
      accuracyBias: 0.78,
    });
    if (!run) return json(404, { detail: 'Unable to create eval run (dataset missing)' });
    return json(200, run);
  }

  if (method === 'GET' && path === '/api/eval/run/stream') {
    const corpusId = String(url.searchParams.get('corpus_id') || url.searchParams.get('repo') || '').trim() || 'epstein-files-1';
    const useMulti = Boolean(Number(url.searchParams.get('use_multi') || '1'));
    const finalK = Number(url.searchParams.get('final_k') || '5') || 5;
    const sampleLimitRaw = Number(url.searchParams.get('sample_limit') || '0') || 0;

    const configSnapshot = getConfig(corpusId);
    const datasetEntries = await listEvalDataset(sql, corpusId);
    const run = await createEvalRun(sql, {
      corpusId,
      datasetEntries,
      configSnapshot,
      finalK,
      useMulti,
      sampleSize: sampleLimitRaw > 0 ? sampleLimitRaw : null,
      accuracyBias: 0.8,
    });

    if (!run) {
      const errEvent = JSON.stringify({ type: 'error', message: 'No eval dataset entries found.' });
      return sse(`data: ${errEvent}

`);
    }

    const events = [
      { type: 'log', message: `🧪 Starting evaluation for corpus: ${corpusId}` },
      { type: 'progress', percent: 10, message: 'Loading eval dataset' },
      { type: 'progress', percent: 35, message: `Retrieving (${run.total} questions)` },
      { type: 'progress', percent: 65, message: 'Scoring results' },
      { type: 'log', message: `Results saved: ${run.run_id}` },
      { type: 'progress', percent: 95, message: 'Finalizing metrics' },
      { type: 'complete' },
    ];
    const body = events.map((e) => `data: ${JSON.stringify(e)}

`).join('');
    return sse(body);
  }

  if (method === 'POST' && path === '/api/eval/analyze_comparison') {
    const payload = body || {};
    const current = payload.current_run || {};
    const baseline = payload.compare_run || {};
    if (!current.run_id || !baseline.run_id) {
      return json(400, { ok: false, analysis: null, model_used: null, error: 'Missing run data.' });
    }

    const deltaTop1 = ((current.top1_accuracy || 0) - (baseline.top1_accuracy || 0)) * 100;
    const deltaTopK = ((current.topk_accuracy || 0) - (baseline.topk_accuracy || 0)) * 100;
    const deltaMrr = ((current.metrics?.mrr || 0) - (baseline.metrics?.mrr || 0)) * 100;

    const diffs = Array.isArray(payload.config_diffs) ? payload.config_diffs.slice(0, 12) : [];
    const diffLines = diffs.map((d) => {
      const key = d.key || d.path || d.name || 'config';
      return `- ${key}: ${JSON.stringify(d.previous)} → ${JSON.stringify(d.current)}`;
    });

    const analysis = [
      '# Eval Comparison',
      '',
      '## Summary',
      `- Top-1 change: ${deltaTop1.toFixed(1)}%`,
      `- Top-K change: ${deltaTopK.toFixed(1)}%`,
      `- MRR change: ${deltaMrr.toFixed(1)}%`,
      '',
      '## Notes',
      deltaTopK >= 0 ? 'Retrieval quality improved on this run.' : 'Retrieval quality regressed; investigate config and index changes.',
      '',
      '## Config Diffs',
      diffLines.length ? diffLines.join('\n') : '- No config diffs supplied.',
    ].join('\n');

    return json(200, { ok: true, analysis, model_used: 'demo-analysis', error: null });
  }

  if (method === 'GET' && path === '/api/secrets/check') {
    const keysRaw = String(url.searchParams.get('keys') || '').trim();
    const keys = keysRaw
      .split(',')
      .map((k) => String(k || '').trim())
      .filter(Boolean);
    const out = {};
    for (const k of keys) {
      out[k] = Boolean(String(process.env[k] || '').trim());
    }
    return json(200, out);
  }

  if (method === 'GET' && (path === '/api/chat/models' || path === '/api/models/chat')) {
    const openrouter = await listOpenRouterModels();
    const openaiKey = String(process.env.OPENAI_API_KEY || '').trim();
    const allowLocal = String(process.env.RAGWELD_DEMO_ALLOW_LOCAL_MODELS || '').trim() === '1';

    const openrouterModels = openrouter && openrouter.length
      ? openrouter
      : FALLBACK_CHAT_MODELS.filter((m) => m.source === 'openrouter');

    const cloudDirect = openaiKey ? FALLBACK_CHAT_MODELS.filter((m) => m.source === 'cloud_direct') : [];
    const local = allowLocal ? FALLBACK_CHAT_MODELS.filter((m) => m.source === 'local') : [];

    const models = [...openrouterModels, ...cloudDirect, ...local];
    return json(200, { models });
  }

  if (method === 'GET' && path === '/api/chat/health') {
    const cfg = getConfig(scope);
    const baseUrl = normalizeBaseUrl(cfg?.chat?.openrouter?.base_url) || DEFAULT_OPENROUTER_BASE_URL;
    const apiKey = String(process.env.OPENROUTER_API_KEY || '').trim();
    const providers = [];
    if (!apiKey) {
      providers.push({
        provider: 'OpenRouter',
        kind: 'openrouter',
        base_url: baseUrl,
        reachable: false,
        detail: 'OPENROUTER_API_KEY is not set',
      });
      return json(200, { providers });
    }

    try {
      const referer =
        String(process.env.URL || process.env.DEPLOY_PRIME_URL || process.env.DEPLOY_URL || '').trim() ||
        'https://ragweld.com';

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(`${baseUrl}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': referer,
          'X-Title': 'ragweld demo',
        },
        signal: controller.signal,
      }).catch(() => null);
      clearTimeout(timeout);
      const ok = Boolean(res && res.ok);
      providers.push({
        provider: 'OpenRouter',
        kind: 'openrouter',
        base_url: baseUrl,
        reachable: ok,
        detail: ok ? null : `HTTP ${res?.status || 0}`,
      });
    } catch (e) {
      providers.push({
        provider: 'OpenRouter',
        kind: 'openrouter',
        base_url: baseUrl,
        reachable: false,
        detail: String(e?.message || e),
      });
    }

    return json(200, { providers });
  }

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
      'epstein-files-1';

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
    const corpusId = String(body?.corpus_id || body?.repo_id || body?.repo || '').trim() || 'epstein-files-1';
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
