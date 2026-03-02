import type { Handler } from '@netlify/functions'
import { applyRateLimit, buildCorsHeaders, errorResponse, jsonResponse, optionsResponse } from './crucible-shared'

const ALLOW_METHODS = 'GET, OPTIONS'

export const config = { path: '/crucible/api/v1/health' }

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return optionsResponse(ALLOW_METHODS)
  }

  const corsHeaders = buildCorsHeaders(ALLOW_METHODS)
  if (event.httpMethod !== 'GET') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Use GET for this endpoint.', corsHeaders)
  }

  const rateLimit = applyRateLimit(event, 'health')
  const responseHeaders = { ...corsHeaders, ...rateLimit.headers }
  if (!rateLimit.allowed) {
    return errorResponse(
      429,
      'RATE_LIMITED',
      'Rate limit exceeded for this endpoint.',
      {
        ...responseHeaders,
        'Retry-After': String(rateLimit.retryAfterSeconds),
      },
      {
        endpoint: 'health',
        retry_after_seconds: rateLimit.retryAfterSeconds,
      },
    )
  }

  return jsonResponse(
    200,
    {
      status: 'ok',
      timestamp: new Date().toISOString(),
    },
    {
      ...responseHeaders,
      'Cache-Control': 'no-store',
    },
  )
}

