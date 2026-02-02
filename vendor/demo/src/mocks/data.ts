/**
 * Mock data for the ragweld demo
 *
 * This file contains seed data for the MSW handlers to return
 * in the live demo mode.
 */

import type { TriBridConfig, ChunkMatch, ChatModelInfo } from '@/types/generated';

// Sample corpora (cross-promotion for faxbot.net and vivified)
export const mockCorpora = [
  {
    id: 'faxbot',
    name: 'Faxbot',
    description: 'Faxbot codebase - modern fax automation platform',
    indexed: true,
    chunk_count: 1847,
    file_count: 156,
    last_indexed: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(), // 2 days ago
  },
  {
    id: 'vivified',
    name: 'Vivified',
    description: 'Vivified documentation and code samples',
    indexed: true,
    chunk_count: 2134,
    file_count: 203,
    last_indexed: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(), // 1 day ago
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
  retrieval: {
    default_k: 10,
    max_k: 50,
    enable_vector: true,
    enable_sparse: true,
    enable_graph: true,
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
    enabled: true,
    mode: 'local',
    local_model: 'cross-encoder/ms-marco-MiniLM-L-6-v2',
    top_n: 10,
  },
  chat: {
    default_corpus_ids: ['recall_default'],
    system_prompt_base: 'You are a helpful assistant.',
    temperature: 0.3,
    max_tokens: 4096,
    show_source_dropdown: true,
    send_shortcut: 'ctrl+enter',
  },
  ui: {
    theme: 'dark',
    show_tooltips: true,
    compact_mode: false,
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
