import type { Handler } from '@netlify/functions'
import {
  applyRateLimit,
  buildCorsHeaders,
  errorResponse,
  filterPricingRows,
  getPricingPayload,
  jsonResponse,
  optionsResponse,
  parseBooleanQuery,
} from './crucible-shared'

const ALLOW_METHODS = 'GET, OPTIONS'

export const config = { path: '/crucible/api/v1/prices' }

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error.'
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return optionsResponse(ALLOW_METHODS)
  }

  const corsHeaders = buildCorsHeaders(ALLOW_METHODS)
  if (event.httpMethod !== 'GET') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Use GET for this endpoint.', corsHeaders)
  }

  const rateLimit = applyRateLimit(event, 'prices')
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
        endpoint: 'prices',
        retry_after_seconds: rateLimit.retryAfterSeconds,
      },
    )
  }

  try {
    const forceRefresh = parseBooleanQuery(event.queryStringParameters?.force_refresh)
    const pricing = await getPricingPayload(forceRefresh === true)
    const gpuType = event.queryStringParameters?.gpu_type?.trim()
    const provider = event.queryStringParameters?.provider?.trim()
    const availableOnly = parseBooleanQuery(event.queryStringParameters?.available_only)

    const filteredRows = filterPricingRows(pricing.pricing, {
      gpuType: gpuType || undefined,
      provider: provider || undefined,
      availableOnly,
    })

    return jsonResponse(
      200,
      {
        data: filteredRows,
        meta: {
          count: filteredRows.length,
          source: pricing.source,
          fetched_at: pricing.fetchedAt,
          cached: pricing.cached,
          fallback_reason: pricing.fallbackReason ?? null,
          filters: {
            gpu_type: gpuType ?? null,
            provider: provider ?? null,
            available_only: availableOnly ?? false,
            force_refresh: forceRefresh ?? false,
          },
        },
      },
      {
        ...responseHeaders,
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=120',
      },
    )
  } catch (error) {
    return errorResponse(503, 'PRICING_UNAVAILABLE', 'Failed to fetch pricing data.', responseHeaders, {
      reason: normalizeErrorMessage(error),
    })
  }
}

