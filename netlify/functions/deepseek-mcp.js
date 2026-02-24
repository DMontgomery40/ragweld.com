import crypto from 'node:crypto';

import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

const DEFAULT_REQUEST_TIMEOUT_MS = 120000;
const DEFAULT_CONVERSATION_MAX_MESSAGES = 200;

let deepseekRuntimePromise;
let sharedConversationStore;

export async function handler(event) {
  const headers = normalizeHeaders(event.headers);
  const origin = headers.origin;
  const allowedOrigins = parseCsvEnv(process.env.DEEPSEEK_MCP_ALLOWED_ORIGINS);
  const corsHeaders = buildCorsHeaders(origin, allowedOrigins);

  if (event.httpMethod === 'OPTIONS') {
    if (!isOriginAllowed(origin, allowedOrigins)) {
      return jsonResponse(403, { error: 'Origin not allowed' }, corsHeaders);
    }

    return {
      statusCode: 204,
      headers: corsHeaders,
      body: '',
    };
  }

  if (origin && !isOriginAllowed(origin, allowedOrigins)) {
    return jsonResponse(403, { error: 'Origin not allowed' }, corsHeaders);
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed: use POST for MCP JSON-RPC requests' }, corsHeaders, {
      Allow: 'POST, OPTIONS',
    });
  }

  const authToken = process.env.DEEPSEEK_MCP_AUTH_TOKEN;
  if (!authToken) {
    return jsonResponse(500, { error: 'Server misconfiguration: missing DEEPSEEK_MCP_AUTH_TOKEN' }, corsHeaders);
  }

  const authHeader = headers.authorization;
  if (!isValidBearerToken(authHeader, authToken)) {
    return jsonResponse(401, { error: 'Unauthorized' }, corsHeaders, {
      'WWW-Authenticate': 'Bearer',
    });
  }

  const contentType = headers['content-type'] ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return jsonResponse(415, { error: 'Unsupported Media Type: expected application/json' }, corsHeaders);
  }

  let parsedBody;
  try {
    const rawBody = event.isBase64Encoded ? Buffer.from(event.body ?? '', 'base64').toString('utf8') : event.body ?? '';
    parsedBody = rawBody.trim() ? JSON.parse(rawBody) : undefined;
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' }, corsHeaders);
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, { error: 'Server misconfiguration: missing DEEPSEEK_API_KEY' }, corsHeaders);
  }

  const baseUrl = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com';
  const defaultModel = process.env.DEEPSEEK_DEFAULT_MODEL ?? 'deepseek-chat';
  const timeoutMs = getPositiveInt('DEEPSEEK_REQUEST_TIMEOUT_MS', DEFAULT_REQUEST_TIMEOUT_MS);
  const enableReasonerFallback = parseBoolean(process.env.DEEPSEEK_ENABLE_REASONER_FALLBACK, true);
  const fallbackModel = process.env.DEEPSEEK_FALLBACK_MODEL ?? 'deepseek-chat';
  const { DeepSeekApiClient, createDeepSeekMcpServer, ConversationStore } = await loadDeepSeekRuntime();

  if (!sharedConversationStore) {
    sharedConversationStore = new ConversationStore(getPositiveInt('CONVERSATION_MAX_MESSAGES', DEFAULT_CONVERSATION_MAX_MESSAGES));
  }

  const client = new DeepSeekApiClient({
    apiKey,
    baseUrl,
    timeoutMs,
    enableReasonerFallback,
    fallbackModel,
  });

  const mcpServer = createDeepSeekMcpServer({
    client,
    conversations: sharedConversationStore,
    defaultModel,
    version: process.env.DEEPSEEK_MCP_VERSION_OVERRIDE,
  });

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await mcpServer.connect(transport);

    const request = toWebRequest(event, headers);
    const response = await transport.handleRequest(request, {
      parsedBody,
    });

    const body = await response.text();
    const responseHeaders = Object.fromEntries(response.headers.entries());

    return {
      statusCode: response.status,
      headers: {
        ...corsHeaders,
        ...responseHeaders,
      },
      body,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse(500, { error: message }, corsHeaders);
  } finally {
    await transport.close().catch(() => {});
    await mcpServer.close().catch(() => {});
  }
}

async function loadDeepSeekRuntime() {
  if (!deepseekRuntimePromise) {
    deepseekRuntimePromise = Promise.all([
      import('deepseek-mcp-server/build/conversation-store.js'),
      import('deepseek-mcp-server/build/deepseek/client.js'),
      import('deepseek-mcp-server/build/mcp-server.js'),
    ]).then(([conversationStoreModule, clientModule, mcpServerModule]) => ({
      ConversationStore: conversationStoreModule.ConversationStore,
      DeepSeekApiClient: clientModule.DeepSeekApiClient,
      createDeepSeekMcpServer: mcpServerModule.createDeepSeekMcpServer,
    }));
  }

  return deepseekRuntimePromise;
}

function normalizeHeaders(rawHeaders) {
  const normalized = {};
  for (const [key, value] of Object.entries(rawHeaders ?? {})) {
    if (typeof value === 'string') {
      normalized[key.toLowerCase()] = value;
    }
  }
  return normalized;
}

function toWebRequest(event, normalizedHeaders) {
  const host = normalizedHeaders.host ?? 'localhost';
  const protocol = normalizedHeaders['x-forwarded-proto'] ?? 'https';
  const rawPath = event.rawPath ?? event.path ?? '/mcp';
  const rawQuery = event.rawQuery ?? buildRawQuery(event.queryStringParameters);
  const url = rawQuery ? `${protocol}://${host}${rawPath}?${rawQuery}` : `${protocol}://${host}${rawPath}`;
  const method = event.httpMethod ?? 'POST';
  const body = event.body ?? '';

  return new Request(url, {
    method,
    headers: normalizedHeaders,
    body,
  });
}

function buildRawQuery(query) {
  if (!query) {
    return '';
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  }
  return params.toString();
}

function parseCsvEnv(value) {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function isOriginAllowed(origin, allowedOrigins) {
  if (!origin) {
    return true;
  }

  if (allowedOrigins.length === 0) {
    return false;
  }

  return allowedOrigins.includes(origin);
}

function buildCorsHeaders(origin, allowedOrigins) {
  const base = {
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };

  if (origin && isOriginAllowed(origin, allowedOrigins)) {
    return {
      ...base,
      'Access-Control-Allow-Origin': origin,
    };
  }

  return base;
}

function parseBoolean(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
}

function getPositiveInt(envName, fallback) {
  const raw = process.env[envName];
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function isValidBearerToken(authHeader, expectedToken) {
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return false;
  }

  const providedToken = authHeader.slice(7).trim();
  const expectedBytes = Buffer.from(expectedToken, 'utf8');
  const providedBytes = Buffer.from(providedToken, 'utf8');

  if (expectedBytes.length !== providedBytes.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBytes, providedBytes);
}

function jsonResponse(statusCode, payload, corsHeaders, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  };
}
