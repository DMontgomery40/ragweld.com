import type { Handler } from '@netlify/functions'
import { applyRateLimit, buildCorsHeaders, errorResponse, getModelsCatalog, jsonResponse, optionsResponse } from './crucible-shared'

const ALLOW_METHODS = 'GET, OPTIONS'

export const config = { path: '/crucible/api/v1/models' }

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error.'
}

function modelCount(catalog: unknown): number | null {
  if (Array.isArray(catalog)) {
    return catalog.length
  }
  if (catalog && typeof catalog === 'object') {
    return Object.keys(catalog).length
  }
  return null
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return optionsResponse(ALLOW_METHODS)
  }

  const corsHeaders = buildCorsHeaders(ALLOW_METHODS)
  if (event.httpMethod !== 'GET') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Use GET for this endpoint.', corsHeaders)
  }

  const rateLimit = applyRateLimit(event, 'models')
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
        endpoint: 'models',
        retry_after_seconds: rateLimit.retryAfterSeconds,
      },
    )
  }

  try {
    const catalog = await getModelsCatalog()
    return jsonResponse(
      200,
      {
        data: catalog,
        meta: {
          count: modelCount(catalog),
        },
      },
      {
        ...responseHeaders,
        'Cache-Control': 'public, max-age=300',
      },
    )
  } catch (error) {
    return errorResponse(500, 'MODELS_UNAVAILABLE', 'Failed to load model catalog.', responseHeaders, {
      reason: normalizeErrorMessage(error),
    })
  }
}

