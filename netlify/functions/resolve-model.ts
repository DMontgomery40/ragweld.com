import type { Handler } from '@netlify/functions'
import {
  applyRateLimit,
  buildCorsHeaders,
  errorResponse,
  jsonResponse,
  optionsResponse,
  parseJsonBody,
} from './crucible-shared'
import { parseHuggingFaceRepoId, resolveModelReference } from './crucible-model-resolution'

const ALLOW_METHODS = 'POST, OPTIONS'

export const config = { path: '/crucible/api/v1/resolve-model' }

interface ResolveRequest {
  input?: unknown
}

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error.'
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return optionsResponse(ALLOW_METHODS)
  }

  const corsHeaders = buildCorsHeaders(ALLOW_METHODS)
  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Use POST for this endpoint.', corsHeaders)
  }

  const rateLimit = applyRateLimit(event, 'resolve_model')
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
        endpoint: 'resolve_model',
        retry_after_seconds: rateLimit.retryAfterSeconds,
      },
    )
  }

  let requestBody: ResolveRequest
  try {
    requestBody = parseJsonBody(event) as ResolveRequest
  } catch (error) {
    return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON.', responseHeaders, {
      reason: normalizeErrorMessage(error),
    })
  }

  const input = typeof requestBody.input === 'string' ? requestBody.input.trim() : ''
  if (!input) {
    return errorResponse(400, 'INVALID_MODEL_REFERENCE', 'Provide a model id or URL to resolve.', responseHeaders)
  }

  try {
    const resolved = await resolveModelReference(input)
    if (!resolved) {
      const repoId = parseHuggingFaceRepoId(input)
      return errorResponse(
        400,
        'INVALID_MODEL_REFERENCE',
        repoId
          ? 'Model could not be resolved from the Crucible catalog or Hugging Face metadata.'
          : 'Provide a Hugging Face URL or repo id in the form org/model.',
        responseHeaders,
        repoId ? { repo_id: repoId } : undefined,
      )
    }

    return jsonResponse(
      200,
      {
        model: resolved.model,
        resolution: resolved,
      },
      responseHeaders,
    )
  } catch (error) {
    const repoId = parseHuggingFaceRepoId(input)
    return errorResponse(
      502,
      'MODEL_RESOLUTION_FAILED',
      'Could not resolve model metadata from Hugging Face.',
      responseHeaders,
      {
        reason: normalizeErrorMessage(error),
        repo_id: repoId,
      },
    )
  }
}
