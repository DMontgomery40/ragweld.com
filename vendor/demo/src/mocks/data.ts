/**
 * Mock data for the ragweld demo
 *
 * This file contains seed data for the MSW handlers to return
 * in the live demo mode.
 */

import type { TriBridConfig, ChunkMatch, ChatModelInfo, Entity, Relationship, Community, GraphStats } from '@/types/generated';

// Sample corpora (cross-promotion for faxbot.net and vivified)
export const mockCorpora = [
  {
    corpus_id: 'faxbot',
    name: 'Faxbot',
    path: 'https://github.com/dmontgomery40/faxbot',
    description: 'Faxbot codebase - modern fax automation platform',
    slug: 'faxbot',
    branch: 'main',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
    last_indexed: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(), // 2 days ago
    // Mock-only fields (used by demo-only endpoints)
    chunk_count: 1847,
    file_count: 156,
  },
  {
    corpus_id: 'vivified',
    name: 'Vivified',
    path: 'https://vivified.example.com',
    description: 'Vivified documentation and code samples',
    slug: 'vivified',
    branch: null,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
    last_indexed: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
    // Mock-only fields (used by demo-only endpoints)
    chunk_count: 2134,
    file_count: 203,
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
    default_corpus_ids: ['recall_default', 'faxbot'],
    system_prompt_base: 'You are a helpful assistant.',
    system_prompt_recall_suffix: ' You have access to conversation history. Refer to it when relevant.',
    system_prompt_rag_suffix: ' Answer questions using the provided code context and cite sources.',
    system_prompt_direct: 'You are a code assistant powered by TriBridRAG. If context is missing, say what is missing.',
    system_prompt_rag: 'You are a code assistant powered by TriBridRAG. Use the provided code context and cite sources.',
    system_prompt_recall: 'You are a code assistant powered by TriBridRAG. Use conversation history when relevant.',
    system_prompt_rag_and_recall:
      'You are a code assistant powered by TriBridRAG. Use both code context and conversation history; cite sources.',
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

const faxbotGraphEntities: Entity[] = [
  {
    entity_id: 'fx:authMiddleware',
    name: 'authMiddleware',
    entity_type: 'function',
    file_path: 'src/middleware/auth.ts',
    description: 'Validates JWTs and attaches the user to the request.',
  },
  {
    entity_id: 'fx:authenticateUser',
    name: 'authenticateUser',
    entity_type: 'function',
    file_path: 'src/auth/authenticate.ts',
    description: 'Validates credentials and issues a JWT.',
  },
  {
    entity_id: 'fx:AuthConfig',
    name: 'AuthConfig',
    entity_type: 'concept',
    file_path: 'src/auth/config.ts',
    description: 'Authentication settings such as token expiry and bcrypt rounds.',
  },
  {
    entity_id: 'fx:auth',
    name: 'auth',
    entity_type: 'module',
    file_path: 'src/auth/index.ts',
    description: 'Authentication module entrypoint.',
  },
];

const faxbotGraphRelationships: Relationship[] = [
  { source_id: 'fx:auth', target_id: 'fx:authenticateUser', relation_type: 'contains', weight: 1.0 },
  { source_id: 'fx:auth', target_id: 'fx:authMiddleware', relation_type: 'contains', weight: 1.0 },
  { source_id: 'fx:authenticateUser', target_id: 'fx:AuthConfig', relation_type: 'references', weight: 0.7 },
  { source_id: 'fx:authMiddleware', target_id: 'fx:AuthConfig', relation_type: 'references', weight: 0.6 },
  { source_id: 'fx:authenticateUser', target_id: 'fx:authMiddleware', relation_type: 'calls', weight: 0.5 },
];

const faxbotGraphCommunities: Community[] = [
  {
    community_id: 'fx:community:auth',
    name: 'Auth + Identity',
    summary: 'Login, tokens, and request authentication.',
    member_ids: ['fx:auth', 'fx:authenticateUser', 'fx:authMiddleware', 'fx:AuthConfig'],
    level: 0,
  },
];

const vivifiedGraphEntities: Entity[] = [
  {
    entity_id: 'vv:Quickstart',
    name: 'Quickstart',
    entity_type: 'concept',
    file_path: 'docs/quickstart.md',
    description: 'High-level getting-started guide.',
  },
  {
    entity_id: 'vv:Cli',
    name: 'cli',
    entity_type: 'module',
    file_path: 'src/cli/index.ts',
    description: 'CLI entrypoints and argument parsing.',
  },
  {
    entity_id: 'vv:run',
    name: 'run',
    entity_type: 'function',
    file_path: 'src/cli/run.ts',
    description: 'Primary CLI command implementation.',
  },
];

const vivifiedGraphRelationships: Relationship[] = [
  { source_id: 'vv:Cli', target_id: 'vv:run', relation_type: 'contains', weight: 1.0 },
  { source_id: 'vv:run', target_id: 'vv:Quickstart', relation_type: 'references', weight: 0.6 },
];

const vivifiedGraphCommunities: Community[] = [
  {
    community_id: 'vv:community:docs',
    name: 'Docs + CLI',
    summary: 'Docs pages and their corresponding CLI entrypoints.',
    member_ids: ['vv:Quickstart', 'vv:Cli', 'vv:run'],
    level: 0,
  },
];

export const mockGraphByCorpus: Record<string, MockGraphData> = {
  faxbot: {
    entities: faxbotGraphEntities,
    relationships: faxbotGraphRelationships,
    communities: faxbotGraphCommunities,
    stats: buildStats('faxbot', faxbotGraphEntities, faxbotGraphRelationships, faxbotGraphCommunities),
  },
  vivified: {
    entities: vivifiedGraphEntities,
    relationships: vivifiedGraphRelationships,
    communities: vivifiedGraphCommunities,
    stats: buildStats('vivified', vivifiedGraphEntities, vivifiedGraphRelationships, vivifiedGraphCommunities),
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
5. Reranks with a cross-encoder
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
