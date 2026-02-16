/**
 * Mock data for the ragweld demo
 *
 * This file contains seed data for the MSW handlers to return
 * in the live demo mode.
 */

import type {
  TriBridConfig,
  ChunkMatch,
  ChatModelInfo,
  Entity,
  Relationship,
  Community,
  GraphStats,
  PromptMetadata,
  EvalRun,
  EvalDatasetItem,
} from '@/types/generated';

// Sample corpora for demo mode
export const mockCorpora = [
  {
    corpus_id: 'epstein-files-1',
    name: 'Epstein Files 1',
    path: 'epstein-files-1',
    description: 'Epstein files demo corpus',
    slug: 'epstein-files-1',
    branch: null,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
    last_indexed: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(), // 2 days ago
    // Mock-only fields (used by demo-only endpoints)
    chunk_count: 1847,
    file_count: 156,
  },
];

// Sample chat models
export const mockChatModels: ChatModelInfo[] = [
  {
    id: 'gpt-4o',
    provider: 'OpenAI',
    source: 'cloud_direct',
    provider_type: 'openai',
    supports_vision: true,
  },
  {
    id: 'gpt-4o-mini',
    provider: 'OpenAI',
    source: 'cloud_direct',
    provider_type: 'openai',
    supports_vision: true,
  },
  {
    id: 'openai/gpt-4o-mini',
    provider: 'OpenAI (via OpenRouter)',
    source: 'openrouter',
    provider_type: 'openrouter',
    base_url: 'https://openrouter.ai/api/v1',
    supports_vision: true,
  },
  {
    id: 'openai/gpt-4o',
    provider: 'OpenAI (via OpenRouter)',
    source: 'openrouter',
    provider_type: 'openrouter',
    base_url: 'https://openrouter.ai/api/v1',
    supports_vision: true,
  },
  {
    id: 'anthropic/claude-3.5-sonnet',
    provider: 'Anthropic (via OpenRouter)',
    source: 'openrouter',
    provider_type: 'openrouter',
    base_url: 'https://openrouter.ai/api/v1',
    supports_vision: true,
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    provider: 'Anthropic',
    source: 'cloud_direct',
    provider_type: 'anthropic',
    supports_vision: true,
  },
  {
    id: 'claude-3-5-haiku-20241022',
    provider: 'Anthropic',
    source: 'cloud_direct',
    provider_type: 'anthropic',
    supports_vision: false,
  },
  {
    id: 'llama3.2:latest',
    provider: 'Ollama (Local)',
    source: 'local',
    provider_type: 'ollama',
    base_url: 'http://localhost:11434',
    supports_vision: false,
  },
];

export const mockPromptDefaults: Record<string, string> = {
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

export const mockPromptMetadata: Record<string, PromptMetadata> = {
  main_rag_chat: {
    label: 'Main RAG Chat',
    description: 'Main conversational AI system prompt for answering codebase questions',
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
    description: 'State 2: RAG only. Database corpora returned results; Recall did not.',
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

// Default TriBridConfig
export const mockConfig: TriBridConfig = {
  generation: {
    gen_model: 'gpt-4o-mini',
    gen_temperature: 0.0,
    gen_max_tokens: 2048,
    gen_top_p: 1.0,
    gen_timeout: 60,
    gen_retry_max: 2,
    enrich_model: 'gpt-4o-mini',
    enrich_backend: 'openai',
    enrich_disabled: 0,
    gen_model_cli: 'qwen3-coder:14b',
    gen_model_ollama: 'qwen3-coder:30b',
    gen_model_http: '',
    gen_model_mcp: '',
    ollama_url: 'http://127.0.0.1:11434/api',
    openai_base_url: '',
    ollama_request_timeout: 300,
    ollama_stream_idle_timeout: 60,
  },
  embedding: {
    embedding_type: 'openai',
    embedding_model: 'text-embedding-3-large',
    embedding_dim: 3072,
    voyage_model: 'voyage-code-3',
    embedding_model_local: 'all-MiniLM-L6-v2',
    embedding_batch_size: 64,
    embedding_max_tokens: 8000,
    embedding_cache_enabled: 1,
    embedding_timeout: 30,
    embedding_retry_max: 3,
  },
  chunking: {
    chunk_size: 1000,
    chunk_overlap: 200,
    ast_overlap_lines: 20,
    max_indexable_file_size: 2_000_000,
    max_chunk_tokens: 8000,
    min_chunk_chars: 50,
    greedy_fallback_target: 800,
    chunking_strategy: 'ast',
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
    out_dir_base: './out',
    rag_out_base: '',
    repos_file: './repos.json',
  },
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
    reranker_local_model: 'cross-encoder/ms-marco-MiniLM-L-12-v2',
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
    default_corpus_ids: ['epstein-files-1'],
    system_prompt_base: mockPromptDefaults.system_prompt_base,
    system_prompt_recall_suffix: mockPromptDefaults.system_prompt_recall_suffix,
    system_prompt_rag_suffix: mockPromptDefaults.system_prompt_rag_suffix,
    system_prompt_direct: mockPromptDefaults.system_prompt_direct,
    system_prompt_rag: mockPromptDefaults.system_prompt_rag,
    system_prompt_recall: mockPromptDefaults.system_prompt_recall,
    system_prompt_rag_and_recall: mockPromptDefaults.system_prompt_rag_and_recall,
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
      base_url: 'https://openrouter.ai/api/v1',
      default_model: 'openai/gpt-4o-mini',
      site_name: 'ragweld',
      fallback_models: ['openai/gpt-4o', 'google/gemini-2.0-flash'],
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
    main_rag_chat: mockPromptDefaults.main_rag_chat,
    query_expansion: mockPromptDefaults.query_expansion,
    query_rewrite: mockPromptDefaults.query_rewrite,
    semantic_chunk_summaries: mockPromptDefaults.semantic_chunk_summaries,
    code_enrichment: mockPromptDefaults.code_enrichment,
    semantic_kg_extraction: mockPromptDefaults.semantic_kg_extraction,
    lightweight_chunk_summaries: mockPromptDefaults.lightweight_chunk_summaries,
    eval_analysis: mockPromptDefaults.eval_analysis,
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

// Sample chunk matches for search results
export const mockChunkMatches: ChunkMatch[] = [
  {
    chunk_id: 'chunk_auth_001',
    content: `async function authenticateUser(credentials: UserCredentials): Promise<AuthResult> {
  // Validate credentials format
  if (!credentials.email || !credentials.password) {
    throw new AuthError('Missing required credentials');
  }

  // Hash password and compare
  const hashedPassword = await bcrypt.hash(credentials.password, 10);
  const user = await db.users.findByEmail(credentials.email);

  if (!user || !await bcrypt.compare(credentials.password, user.passwordHash)) {
    throw new AuthError('Invalid credentials');
  }

  // Generate JWT token
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
    expiresIn: '24h'
  });

  return { user, token };
}`,
    file_path: 'src/auth/authenticate.ts',
    start_line: 15,
    end_line: 35,
    language: 'typescript',
    score: 0.92,
    source: 'vector',
  },
  {
    chunk_id: 'chunk_auth_002',
    content: `export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as JWTPayload;
    req.user = await db.users.findById(decoded.userId);
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};`,
    file_path: 'src/middleware/auth.ts',
    start_line: 8,
    end_line: 26,
    language: 'typescript',
    score: 0.88,
    source: 'sparse',
  },
  {
    chunk_id: 'chunk_auth_003',
    content: `// Authentication flow overview
// 1. User submits credentials via /api/auth/login
// 2. Server validates credentials against database
// 3. On success, JWT token is generated and returned
// 4. Client stores token in httpOnly cookie
// 5. Subsequent requests include token in Authorization header
// 6. authMiddleware verifies token on protected routes

interface AuthConfig {
  jwtSecret: string;
  tokenExpiry: string;
  refreshTokenExpiry: string;
  bcryptRounds: number;
}`,
    file_path: 'src/auth/config.ts',
    start_line: 1,
    end_line: 14,
    language: 'typescript',
    score: 0.85,
    source: 'graph',
  },
];

type MockGraphData = {
  stats: GraphStats;
  entities: Entity[];
  relationships: Relationship[];
  communities: Community[];
};

const countBy = <T extends Record<string, unknown>>(items: T[], key: keyof T): Record<string, number> => {
  return items.reduce((acc, item) => {
    const k = String(item[key] ?? 'unknown');
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
};

const buildStats = (corpus_id: string, entities: Entity[], relationships: Relationship[], communities: Community[]): GraphStats => ({
  corpus_id,
  total_entities: entities.length,
  total_relationships: relationships.length,
  total_communities: communities.length,
  entity_breakdown: countBy(entities as unknown as Record<string, unknown>[], 'entity_type'),
  relationship_breakdown: countBy(relationships as unknown as Record<string, unknown>[], 'relation_type'),
});

const epsteinGraphEntities: Entity[] = [
  {
    entity_id: 'ef:authMiddleware',
    name: 'authMiddleware',
    entity_type: 'function',
    file_path: 'src/middleware/auth.ts',
    description: 'Validates JWTs and attaches the user to the request.',
  },
  {
    entity_id: 'ef:authenticateUser',
    name: 'authenticateUser',
    entity_type: 'function',
    file_path: 'src/auth/authenticate.ts',
    description: 'Validates credentials and issues a JWT.',
  },
  {
    entity_id: 'ef:AuthConfig',
    name: 'AuthConfig',
    entity_type: 'concept',
    file_path: 'src/auth/config.ts',
    description: 'Authentication settings such as token expiry and bcrypt rounds.',
  },
  {
    entity_id: 'ef:auth',
    name: 'auth',
    entity_type: 'module',
    file_path: 'src/auth/index.ts',
    description: 'Authentication module entrypoint.',
  },
];

const epsteinGraphRelationships: Relationship[] = [
  { source_id: 'ef:auth', target_id: 'ef:authenticateUser', relation_type: 'contains', weight: 1.0 },
  { source_id: 'ef:auth', target_id: 'ef:authMiddleware', relation_type: 'contains', weight: 1.0 },
  { source_id: 'ef:authenticateUser', target_id: 'ef:AuthConfig', relation_type: 'references', weight: 0.7 },
  { source_id: 'ef:authMiddleware', target_id: 'ef:AuthConfig', relation_type: 'references', weight: 0.6 },
  { source_id: 'ef:authenticateUser', target_id: 'ef:authMiddleware', relation_type: 'calls', weight: 0.5 },
];

const epsteinGraphCommunities: Community[] = [
  {
    community_id: 'ef:community:auth',
    name: 'Auth + Identity',
    summary: 'Login, tokens, and request authentication.',
    member_ids: ['ef:auth', 'ef:authenticateUser', 'ef:authMiddleware', 'ef:AuthConfig'],
    level: 0,
  },
];

export const mockGraphByCorpus: Record<string, MockGraphData> = {
  'epstein-files-1': {
    entities: epsteinGraphEntities,
    relationships: epsteinGraphRelationships,
    communities: epsteinGraphCommunities,
    stats: buildStats('epstein-files-1', epsteinGraphEntities, epsteinGraphRelationships, epsteinGraphCommunities),
  },
};

// Response generators for chat streaming
export interface ChatChunk {
  text: string;
  delay: number; // ms between chunks
}

const authResponse = `Based on the codebase, authentication works through a **JWT-based flow**:

## Authentication Flow

1. **Login Request** - User submits credentials to \`/api/auth/login\`
2. **Credential Validation** - The \`authenticateUser\` function in \`src/auth/authenticate.ts:15\` validates the email and password
3. **Password Comparison** - Uses bcrypt to compare the submitted password with the stored hash
4. **Token Generation** - On success, a JWT token is generated with 24-hour expiry
5. **Token Storage** - Client stores the token in an httpOnly cookie for security

## Middleware Protection

Protected routes use the \`authMiddleware\` from \`src/middleware/auth.ts:8\` which:
- Extracts the Bearer token from the Authorization header
- Verifies the JWT signature
- Attaches the user object to the request

## Key Files
- \`src/auth/authenticate.ts\` - Core authentication logic
- \`src/middleware/auth.ts\` - Request protection middleware
- \`src/auth/config.ts\` - Authentication configuration`;

const generalResponse = `I can help you explore the codebase. Based on your query, here's what I found:

## Overview

The tribrid RAG system combines three retrieval methods:
1. **Vector Search** - Semantic similarity using embeddings
2. **Sparse Search** - BM25 keyword matching
3. **Graph Search** - Entity and relationship traversal

## How It Works

When you ask a question, the system:
1. Converts your query to embeddings (vector)
2. Tokenizes for BM25 matching (sparse)
3. Extracts entities for graph lookup (graph)
4. Fuses results using RRF or weighted fusion
5. Reranks with the configured learning/local reranker
6. Generates a response with citations

Try asking about specific features like authentication, configuration, or API endpoints!`;

export function generateChatChunks(message: string): ChatChunk[] {
  // Select response based on message content
  let response = generalResponse;

  if (message.toLowerCase().includes('auth') ||
      message.toLowerCase().includes('login') ||
      message.toLowerCase().includes('password')) {
    response = authResponse;
  }

  // Split into chunks for streaming effect
  const chunks: ChatChunk[] = [];
  const words = response.split(/(\s+)/);
  let buffer = '';

  for (let i = 0; i < words.length; i++) {
    buffer += words[i];

    // Emit chunk every 3-5 words or at newlines
    if ((i > 0 && i % 4 === 0) || buffer.includes('\n\n')) {
      chunks.push({
        text: buffer,
        delay: 20 + Math.random() * 40, // 20-60ms delay
      });
      buffer = '';
    }
  }

  // Emit remaining buffer
  if (buffer) {
    chunks.push({
      text: buffer,
      delay: 20 + Math.random() * 40,
    });
  }

  return chunks;
}

// Health check response
export const mockHealthResponse = {
  status: 'ok',
  version: '0.1.0',
  postgres: 'connected',
  neo4j: 'connected',
  embedding_model: 'loaded',
  demo_mode: true,
};


// Eval dataset + run mocks
export const mockEvalDataset: EvalDatasetItem[] = [
  {
    entry_id: '1',
    question: 'Where are the 1996 flight logs documented?',
    expected_paths: ['records/flight-logs/1996-09-03.md'],
    expected_answer: null,
    tags: ['md'],
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
  },
  {
    entry_id: '2',
    question: 'Which file contains the 1997 phone log entries?',
    expected_paths: ['records/phone-logs/1997-02-11.md'],
    expected_answer: null,
    tags: ['md'],
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 71).toISOString(),
  },
  {
    entry_id: '3',
    question: 'Where is the 1998 passenger manifest recorded?',
    expected_paths: ['records/manifest/1998-04-12.csv'],
    expected_answer: null,
    tags: ['csv'],
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 70).toISOString(),
  },
  {
    entry_id: '4',
    question: 'Which document covers the 2007 settlement summary?',
    expected_paths: ['records/legal/settlement-2007.pdf'],
    expected_answer: null,
    tags: ['pdf'],
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 69).toISOString(),
  },
];

const baselineResults = [
  {
    entry_id: '1',
    question: mockEvalDataset[0].question,
    retrieved_paths: ['records/flight-logs/1996-09-03.md', 'records/legal/settlement-2007.pdf', 'records/manifest/1998-04-12.csv'],
    expected_paths: mockEvalDataset[0].expected_paths,
    top_paths: ['records/flight-logs/1996-09-03.md', 'records/legal/settlement-2007.pdf', 'records/manifest/1998-04-12.csv'],
    top1_path: ['records/flight-logs/1996-09-03.md'],
    top1_hit: true,
    topk_hit: true,
    reciprocal_rank: 1,
    recall: 1,
    latency_ms: 118,
    duration_secs: 0.118,
    docs: [
      { file_path: 'records/flight-logs/1996-09-03.md', start_line: 1, score: 0.92, source: 'sparse' },
      { file_path: 'records/legal/settlement-2007.pdf', start_line: 1, score: 0.61, source: 'graph' },
    ],
  },
  {
    entry_id: '2',
    question: mockEvalDataset[1].question,
    retrieved_paths: ['records/flight-logs/1996-09-03.md', 'records/phone-logs/1997-02-11.md', 'records/manifest/1998-04-12.csv'],
    expected_paths: mockEvalDataset[1].expected_paths,
    top_paths: ['records/flight-logs/1996-09-03.md', 'records/phone-logs/1997-02-11.md', 'records/manifest/1998-04-12.csv'],
    top1_path: ['records/flight-logs/1996-09-03.md'],
    top1_hit: false,
    topk_hit: true,
    reciprocal_rank: 0.5,
    recall: 1,
    latency_ms: 132,
    duration_secs: 0.132,
    docs: [
      { file_path: 'records/flight-logs/1996-09-03.md', start_line: 1, score: 0.87, source: 'sparse' },
      { file_path: 'records/phone-logs/1997-02-11.md', start_line: 1, score: 0.77, source: 'vector' },
    ],
  },
  {
    entry_id: '3',
    question: mockEvalDataset[2].question,
    retrieved_paths: ['records/manifest/1998-04-12.csv', 'records/phone-logs/1997-02-11.md', 'records/legal/settlement-2007.pdf'],
    expected_paths: mockEvalDataset[2].expected_paths,
    top_paths: ['records/manifest/1998-04-12.csv', 'records/phone-logs/1997-02-11.md', 'records/legal/settlement-2007.pdf'],
    top1_path: ['records/manifest/1998-04-12.csv'],
    top1_hit: true,
    topk_hit: true,
    reciprocal_rank: 1,
    recall: 1,
    latency_ms: 109,
    duration_secs: 0.109,
    docs: [
      { file_path: 'records/manifest/1998-04-12.csv', start_line: 1, score: 0.9, source: 'sparse' },
      { file_path: 'records/phone-logs/1997-02-11.md', start_line: 1, score: 0.62, source: 'graph' },
    ],
  },
  {
    entry_id: '4',
    question: mockEvalDataset[3].question,
    retrieved_paths: ['records/phone-logs/1997-02-11.md', 'records/legal/settlement-2007.pdf', 'records/manifest/1998-04-12.csv'],
    expected_paths: mockEvalDataset[3].expected_paths,
    top_paths: ['records/phone-logs/1997-02-11.md', 'records/legal/settlement-2007.pdf', 'records/manifest/1998-04-12.csv'],
    top1_path: ['records/phone-logs/1997-02-11.md'],
    top1_hit: false,
    topk_hit: true,
    reciprocal_rank: 0.5,
    recall: 1,
    latency_ms: 141,
    duration_secs: 0.141,
    docs: [
      { file_path: 'records/phone-logs/1997-02-11.md', start_line: 1, score: 0.74, source: 'sparse' },
      { file_path: 'records/legal/settlement-2007.pdf', start_line: 1, score: 0.69, source: 'vector' },
    ],
  },
];

const currentResults = [
  {
    entry_id: '1',
    question: mockEvalDataset[0].question,
    retrieved_paths: ['records/flight-logs/1996-09-03.md', 'records/manifest/1998-04-12.csv', 'records/legal/settlement-2007.pdf'],
    expected_paths: mockEvalDataset[0].expected_paths,
    top_paths: ['records/flight-logs/1996-09-03.md', 'records/manifest/1998-04-12.csv', 'records/legal/settlement-2007.pdf'],
    top1_path: ['records/flight-logs/1996-09-03.md'],
    top1_hit: true,
    topk_hit: true,
    reciprocal_rank: 1,
    recall: 1,
    latency_ms: 101,
    duration_secs: 0.101,
    docs: [
      { file_path: 'records/flight-logs/1996-09-03.md', start_line: 1, score: 0.94, source: 'sparse' },
      { file_path: 'records/manifest/1998-04-12.csv', start_line: 1, score: 0.7, source: 'graph' },
    ],
  },
  {
    entry_id: '2',
    question: mockEvalDataset[1].question,
    retrieved_paths: ['records/phone-logs/1997-02-11.md', 'records/flight-logs/1996-09-03.md', 'records/manifest/1998-04-12.csv'],
    expected_paths: mockEvalDataset[1].expected_paths,
    top_paths: ['records/phone-logs/1997-02-11.md', 'records/flight-logs/1996-09-03.md', 'records/manifest/1998-04-12.csv'],
    top1_path: ['records/phone-logs/1997-02-11.md'],
    top1_hit: true,
    topk_hit: true,
    reciprocal_rank: 1,
    recall: 1,
    latency_ms: 115,
    duration_secs: 0.115,
    docs: [
      { file_path: 'records/phone-logs/1997-02-11.md', start_line: 1, score: 0.9, source: 'vector' },
      { file_path: 'records/flight-logs/1996-09-03.md', start_line: 1, score: 0.62, source: 'sparse' },
    ],
  },
  {
    entry_id: '3',
    question: mockEvalDataset[2].question,
    retrieved_paths: ['records/manifest/1998-04-12.csv', 'records/flight-logs/1996-09-03.md', 'records/phone-logs/1997-02-11.md'],
    expected_paths: mockEvalDataset[2].expected_paths,
    top_paths: ['records/manifest/1998-04-12.csv', 'records/flight-logs/1996-09-03.md', 'records/phone-logs/1997-02-11.md'],
    top1_path: ['records/manifest/1998-04-12.csv'],
    top1_hit: true,
    topk_hit: true,
    reciprocal_rank: 1,
    recall: 1,
    latency_ms: 96,
    duration_secs: 0.096,
    docs: [
      { file_path: 'records/manifest/1998-04-12.csv', start_line: 1, score: 0.93, source: 'sparse' },
      { file_path: 'records/flight-logs/1996-09-03.md', start_line: 1, score: 0.63, source: 'graph' },
    ],
  },
  {
    entry_id: '4',
    question: mockEvalDataset[3].question,
    retrieved_paths: ['records/legal/settlement-2007.pdf', 'records/phone-logs/1997-02-11.md', 'records/manifest/1998-04-12.csv'],
    expected_paths: mockEvalDataset[3].expected_paths,
    top_paths: ['records/legal/settlement-2007.pdf', 'records/phone-logs/1997-02-11.md', 'records/manifest/1998-04-12.csv'],
    top1_path: ['records/legal/settlement-2007.pdf'],
    top1_hit: true,
    topk_hit: true,
    reciprocal_rank: 1,
    recall: 1,
    latency_ms: 108,
    duration_secs: 0.108,
    docs: [
      { file_path: 'records/legal/settlement-2007.pdf', start_line: 1, score: 0.88, source: 'sparse' },
      { file_path: 'records/phone-logs/1997-02-11.md', start_line: 1, score: 0.67, source: 'vector' },
    ],
  },
];

export const mockEvalRuns: EvalRun[] = [
  {
    run_id: 'epstein-files-1__20260216_080000',
    corpus_id: 'epstein-files-1',
    dataset_id: 'epstein-demo',
    config_snapshot: { retrieval: { final_k: 5 }, fusion: { method: 'rrf' } },
    config: { 'retrieval.final_k': 5, 'fusion.method': 'rrf' },
    total: currentResults.length,
    top1_hits: 4,
    topk_hits: 4,
    top1_accuracy: 1,
    topk_accuracy: 1,
    duration_secs: 0.42,
    use_multi: true,
    final_k: 5,
    metrics: {
      mrr: 1,
      recall_at_5: 1,
      recall_at_10: 1,
      recall_at_20: 1,
      precision_at_5: 0.8,
      ndcg_at_10: 1,
      latency_p50_ms: 108,
      latency_p95_ms: 118,
    },
    results: currentResults,
    started_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    completed_at: new Date(Date.now() - 1000 * 60 * 60 * 2 + 75000).toISOString(),
  },
  {
    run_id: 'epstein-files-1__20260214_090000',
    corpus_id: 'epstein-files-1',
    dataset_id: 'epstein-demo',
    config_snapshot: { retrieval: { final_k: 5 }, fusion: { method: 'rrf' } },
    config: { 'retrieval.final_k': 5, 'fusion.method': 'rrf' },
    total: baselineResults.length,
    top1_hits: 2,
    topk_hits: 4,
    top1_accuracy: 0.5,
    topk_accuracy: 1,
    duration_secs: 0.5,
    use_multi: false,
    final_k: 5,
    metrics: {
      mrr: 0.75,
      recall_at_5: 1,
      recall_at_10: 1,
      recall_at_20: 1,
      precision_at_5: 0.7,
      ndcg_at_10: 0.82,
      latency_p50_ms: 120,
      latency_p95_ms: 141,
    },
    results: baselineResults,
    started_at: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(),
    completed_at: new Date(Date.now() - 1000 * 60 * 60 * 36 + 90000).toISOString(),
  },
];
