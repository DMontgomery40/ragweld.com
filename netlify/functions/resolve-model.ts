import type { Handler } from '@netlify/functions'
import type { ResolvedModelPayload } from '../../crucible/src/types/index'
import {
  applyRateLimit,
  buildCorsHeaders,
  errorResponse,
  jsonResponse,
  optionsResponse,
  parseJsonBody,
} from './crucible-shared'

const ALLOW_METHODS = 'POST, OPTIONS'
const HF_HOST = 'huggingface.co'

export const config = { path: '/crucible/api/v1/resolve-model' }

interface ResolveRequest {
  input?: unknown
}

interface HuggingFaceModelInfo {
  id?: unknown
  safetensors?: {
    total?: unknown
  }
}

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error.'
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return null
}

function asPositiveInt(value: unknown): number | null {
  const parsed = asNumber(value)
  if (parsed === null || parsed <= 0) {
    return null
  }
  return Math.trunc(parsed)
}

function slugify(repoId: string): string {
  return repoId.toLowerCase().replaceAll('/', '-').replaceAll('_', '-')
}

function humanizeName(repoId: string): string {
  const name = repoId.split('/').pop() ?? repoId
  return name
    .replaceAll('-', ' ')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function tryParseURL(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function parseHuggingFaceRepoId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }

  const url = tryParseURL(trimmed)
  if (url) {
    if (url.hostname !== HF_HOST) {
      return null
    }
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length < 2) {
      return null
    }
    if (parts[0] === 'models' && parts.length >= 3) {
      return `${parts[1]}/${parts[2]}`
    }
    return `${parts[0]}/${parts[1]}`
  }

  const candidate = trimmed.replace(/^hf:\/\//i, '')
  const parts = candidate.split('/').filter(Boolean)
  if (parts.length !== 2) {
    return null
  }
  return `${parts[0]}/${parts[1]}`
}

function kvHeadDim(hiddenSize: number, numAttentionHeads: number, numKVHeads: number): number {
  if (numAttentionHeads <= 0 || numKVHeads <= 0) {
    return hiddenSize
  }
  const ratio = hiddenSize / numAttentionHeads
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return hiddenSize
  }
  return Math.max(1, Math.round(ratio * numKVHeads))
}

function estimateParamsBillions(input: {
  hiddenSize: number
  layers: number
  numAttentionHeads: number
  numKVHeads: number
  intermediateSize: number
  vocabSize: number
  fromHub?: number | null
}): number {
  if (input.fromHub && input.fromHub > 0) {
    return Number((input.fromHub / 1e9).toFixed(2))
  }

  const kvOut = kvHeadDim(input.hiddenSize, input.numAttentionHeads, input.numKVHeads)
  const qProj = input.hiddenSize * input.hiddenSize
  const kProj = input.hiddenSize * kvOut
  const vProj = input.hiddenSize * kvOut
  const oProj = input.hiddenSize * input.hiddenSize
  const mlp = 3 * input.hiddenSize * input.intermediateSize
  const perLayer = qProj + kProj + vProj + oProj + mlp
  const embedding = input.vocabSize * input.hiddenSize
  const totalParams = perLayer * input.layers + embedding
  return Number((totalParams / 1e9).toFixed(2))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function extractMaxPosition(config: Record<string, unknown>): number {
  const direct = asPositiveInt(config.max_position_embeddings)
  if (direct) {
    return direct
  }
  const nPositions = asPositiveInt(config.n_positions)
  if (nPositions) {
    return nPositions
  }
  const ropeScaling = config.rope_scaling
  if (isRecord(ropeScaling)) {
    const ropeMax = asPositiveInt(ropeScaling.original_max_position_embeddings)
    if (ropeMax) {
      return ropeMax
    }
  }
  return 32768
}

function buildResolvedModel(
  repoId: string,
  config: Record<string, unknown>,
  modelInfo: HuggingFaceModelInfo | null,
  configSource: string,
): ResolvedModelPayload {
  const hiddenSize = asPositiveInt(config.hidden_size) ?? asPositiveInt(config.d_model) ?? asPositiveInt(config.n_embd) ?? 4096
  const numLayers =
    asPositiveInt(config.num_hidden_layers) ?? asPositiveInt(config.n_layer) ?? asPositiveInt(config.num_layers) ?? 32
  const numAttentionHeads =
    asPositiveInt(config.num_attention_heads) ?? asPositiveInt(config.n_head) ?? asPositiveInt(config.num_heads) ?? 32
  const numKVHeads =
    asPositiveInt(config.num_key_value_heads) ??
    asPositiveInt(config.n_head_kv) ??
    asPositiveInt(config.num_kv_heads) ??
    numAttentionHeads
  const intermediateSize =
    asPositiveInt(config.intermediate_size) ?? asPositiveInt(config.ffn_dim) ?? asPositiveInt(config.n_inner) ?? hiddenSize * 4
  const vocabSize = asPositiveInt(config.vocab_size) ?? 128000
  const maxPosition = extractMaxPosition(config)

  const totalExperts = asPositiveInt(config.num_experts) ?? asPositiveInt(config.num_local_experts)
  const activeExperts =
    asPositiveInt(config.num_experts_per_tok) ?? asPositiveInt(config.num_experts_per_token) ?? asPositiveInt(config.moe_top_k)
  const architecture = totalExperts && totalExperts > 1 ? 'moe' : 'dense'

  const hubParamTotal = modelInfo?.safetensors ? asNumber(modelInfo.safetensors.total) : null
  const paramsBillions = estimateParamsBillions({
    hiddenSize,
    layers: numLayers,
    numAttentionHeads,
    numKVHeads,
    intermediateSize,
    vocabSize,
    fromHub: hubParamTotal,
  })

  const kvOut = kvHeadDim(hiddenSize, numAttentionHeads, numKVHeads)

  return {
    id: slugify(repoId),
    display_name: humanizeName(repoId),
    hf_repo_id: repoId,
    params_billions: paramsBillions,
    hidden_size: hiddenSize,
    num_layers: numLayers,
    num_attention_heads: numAttentionHeads,
    num_kv_heads: numKVHeads,
    intermediate_size: intermediateSize,
    vocab_size: vocabSize,
    max_position_embeddings: maxPosition,
    architecture,
    moe_total_experts: totalExperts ?? undefined,
    moe_active_experts: activeExperts ?? undefined,
    module_shapes: {
      q: { in_dim: hiddenSize, out_dim: hiddenSize },
      k: { in_dim: hiddenSize, out_dim: kvOut },
      v: { in_dim: hiddenSize, out_dim: kvOut },
      o: { in_dim: hiddenSize, out_dim: hiddenSize },
      gate: { in_dim: hiddenSize, out_dim: intermediateSize },
      up: { in_dim: hiddenSize, out_dim: intermediateSize },
      down: { in_dim: intermediateSize, out_dim: hiddenSize },
    },
    source: configSource,
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'crucible-model-resolver/1.0',
    },
  })

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) at ${url}`)
  }

  return response.json()
}

async function fetchConfig(repoId: string): Promise<{ config: Record<string, unknown>; source: string }> {
  const candidates = [
    `https://huggingface.co/${repoId}/raw/main/config.json`,
    `https://huggingface.co/${repoId}/resolve/main/config.json`,
  ]

  let lastError: unknown = null
  for (const candidate of candidates) {
    try {
      const payload = await fetchJson(candidate)
      if (!isRecord(payload)) {
        throw new Error('Model config response was not a JSON object.')
      }
      return { config: payload, source: candidate }
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unable to fetch model config from Hugging Face.')
}

async function fetchModelInfo(repoId: string): Promise<HuggingFaceModelInfo | null> {
  try {
    const payload = await fetchJson(`https://huggingface.co/api/models/${repoId}`)
    if (!isRecord(payload)) {
      return null
    }
    return payload as HuggingFaceModelInfo
  } catch {
    return null
  }
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

  const input = typeof requestBody.input === 'string' ? requestBody.input : ''
  const repoId = parseHuggingFaceRepoId(input)
  if (!repoId) {
    return errorResponse(
      400,
      'INVALID_MODEL_REFERENCE',
      'Provide a Hugging Face URL or repo id in the form org/model.',
      responseHeaders,
    )
  }

  try {
    const [configResult, modelInfo] = await Promise.all([fetchConfig(repoId), fetchModelInfo(repoId)])
    const resolved = buildResolvedModel(repoId, configResult.config, modelInfo, configResult.source)
    return jsonResponse(
      200,
      {
        model: resolved,
      },
      responseHeaders,
    )
  } catch (error) {
    return errorResponse(
      502,
      'MODEL_RESOLUTION_FAILED',
      'Could not resolve model metadata from Hugging Face.',
      responseHeaders,
      { reason: normalizeErrorMessage(error), repo_id: repoId },
    )
  }
}
