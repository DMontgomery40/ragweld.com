import type { Handler } from '@netlify/functions'
import { resolveGPUType } from '../../crucible/src/engine/gpu-specs'
import type { EstimateRequest } from '../../crucible/src/types/index'
import {
  applyRateLimit,
  buildCorsHeaders,
  errorResponse,
  getPricingPayload,
  jsonResponse,
  optionsResponse,
  parseJsonBody,
} from './crucible-shared'

const ALLOW_METHODS = 'POST, OPTIONS'
const PRICING_TIER_VALUES = new Set(['on_demand', 'spot', 'reserved_1mo', 'reserved_3mo'])

export const config = { path: '/crucible/api/v1/estimate' }

function isEstimateRequest(value: unknown): value is EstimateRequest {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Partial<EstimateRequest>
  return (
    typeof candidate.model_name === 'string' &&
    typeof candidate.model_params_billions === 'number' &&
    typeof candidate.method === 'string' &&
    typeof candidate.framework === 'string' &&
    typeof candidate.dataset_tokens === 'number' &&
    typeof candidate.num_epochs === 'number' &&
    typeof candidate.batch_size === 'number' &&
    Array.isArray(candidate.target_gpu) &&
    Array.isArray(candidate.pricing_tier) &&
    typeof candidate.num_gpus === 'number'
  )
}

function normalizeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error.'
}

function normalizeLower(value: string): string {
  return value.trim().toLowerCase()
}

function normalizeGpuValue(value: string): string {
  const resolved = resolveGPUType(value)
  return normalizeLower(resolved ?? value)
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0)
}

function normalizePricingTiers(value: unknown): EstimateRequest['pricing_tier'] {
  const normalized = normalizeStringArray(value).filter((tier) => PRICING_TIER_VALUES.has(tier))
  if (normalized.length === 0) {
    return ['on_demand']
  }
  return normalized as EstimateRequest['pricing_tier']
}

function normalizeEstimateRequest(request: EstimateRequest): EstimateRequest {
  return {
    ...request,
    target_gpu: normalizeStringArray(request.target_gpu) as EstimateRequest['target_gpu'],
    target_providers: normalizeStringArray((request as Partial<EstimateRequest>).target_providers),
    target_regions: normalizeStringArray((request as Partial<EstimateRequest>).target_regions),
    target_interconnects: normalizeStringArray((request as Partial<EstimateRequest>).target_interconnects),
    target_instance_types: normalizeStringArray((request as Partial<EstimateRequest>).target_instance_types),
    pricing_tier: normalizePricingTiers(request.pricing_tier),
  }
}

function rowSupportsTier(
  row: {
    hourly_price_cents: number
    spot_price_cents?: number | null
    reserved_1mo_price_cents?: number | null
    reserved_3mo_price_cents?: number | null
  },
  tier: EstimateRequest['pricing_tier'][number],
): boolean {
  if (tier === 'on_demand') {
    return row.hourly_price_cents > 0
  }
  if (tier === 'spot') {
    return row.spot_price_cents !== null && row.spot_price_cents !== undefined
  }
  if (tier === 'reserved_1mo') {
    return row.reserved_1mo_price_cents !== null && row.reserved_1mo_price_cents !== undefined
  }
  return row.reserved_3mo_price_cents !== null && row.reserved_3mo_price_cents !== undefined
}

function hasIntersection(left: string[], rightSet: Set<string>): boolean {
  for (const entry of left) {
    if (rightSet.has(normalizeLower(entry))) {
      return true
    }
  }
  return false
}

function matchesRequestPricingRow(
  request: EstimateRequest,
  row: {
    provider: string
    gpu: string
    num_gpus: number
    cloud_instance_type: string
    interconnect?: string
    availability: Array<{ region: string }>
    hourly_price_cents: number
    spot_price_cents?: number | null
    reserved_1mo_price_cents?: number | null
    reserved_3mo_price_cents?: number | null
  },
): boolean {
  const selectedTier = request.pricing_tier[0] ?? 'on_demand'

  if (request.target_providers.length > 0) {
    const providerSet = new Set(request.target_providers.map((provider) => normalizeLower(provider)))
    if (!providerSet.has(normalizeLower(row.provider))) {
      return false
    }
  }

  if (request.target_gpu.length > 0) {
    const gpuSet = new Set(request.target_gpu.map((gpu) => normalizeGpuValue(String(gpu))))
    if (!gpuSet.has(normalizeGpuValue(row.gpu))) {
      return false
    }
  }

  if (request.num_gpus > 0 && row.num_gpus !== request.num_gpus) {
    return false
  }

  if (request.target_instance_types.length > 0) {
    const instanceTypeSet = new Set(
      request.target_instance_types.map((instanceType) => normalizeLower(instanceType)),
    )
    if (!instanceTypeSet.has(normalizeLower(row.cloud_instance_type))) {
      return false
    }
  }

  if (request.target_interconnects.length > 0) {
    const interconnectSet = new Set(
      request.target_interconnects.map((interconnect) => normalizeLower(interconnect)),
    )
    const rowInterconnect = normalizeLower(row.interconnect ?? 'unknown')
    if (!interconnectSet.has(rowInterconnect)) {
      return false
    }
  }

  if (request.target_regions.length > 0) {
    const selectedRegions = new Set(request.target_regions.map((region) => normalizeLower(region)))
    const rowRegions = row.availability.map((regionEntry) => regionEntry.region || 'any')
    if (!hasIntersection(rowRegions, selectedRegions)) {
      return false
    }
  }

  return rowSupportsTier(row, selectedTier)
}

function summarizeCapabilities(
  pricing: Array<{
    provider: string
    gpu: string
    num_gpus: number
    cloud_instance_type: string
    interconnect?: string
    availability: Array<{ region: string }>
  }>,
) {
  const providers = new Set<string>()
  const gpus = new Set<string>()
  const gpuCounts = new Set<number>()
  const instanceTypes = new Set<string>()
  const interconnects = new Set<string>()
  const regions = new Set<string>()

  for (const row of pricing) {
    providers.add(row.provider)
    gpus.add(row.gpu)
    gpuCounts.add(row.num_gpus)
    instanceTypes.add(row.cloud_instance_type)
    interconnects.add(row.interconnect ?? 'unknown')
    if (row.availability.length === 0) {
      regions.add('any')
    } else {
      for (const availability of row.availability) {
        regions.add(availability.region || 'any')
      }
    }
  }

  return {
    providers: Array.from(providers).sort((left, right) => left.localeCompare(right)),
    gpus: Array.from(gpus).sort((left, right) => left.localeCompare(right)),
    num_gpus: Array.from(gpuCounts).sort((left, right) => left - right),
    regions: Array.from(regions).sort((left, right) => left.localeCompare(right)),
    interconnects: Array.from(interconnects).sort((left, right) => left.localeCompare(right)),
    instance_types: Array.from(instanceTypes).sort((left, right) => left.localeCompare(right)),
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

  const rateLimit = applyRateLimit(event, 'estimate')
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
        endpoint: 'estimate',
        retry_after_seconds: rateLimit.retryAfterSeconds,
      },
    )
  }

  let requestBody: unknown
  try {
    requestBody = parseJsonBody(event)
  } catch (error) {
    return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON.', responseHeaders, {
      reason: normalizeErrorMessage(error),
    })
  }

  if (!isEstimateRequest(requestBody)) {
    return errorResponse(400, 'INVALID_REQUEST', 'Request body does not match EstimateRequest.', responseHeaders)
  }
  const normalizedRequest = normalizeEstimateRequest(requestBody)

  let pricing
  try {
    pricing = await getPricingPayload()
  } catch (error) {
    return errorResponse(503, 'PRICING_UNAVAILABLE', 'Failed to fetch pricing data.', responseHeaders, {
      reason: normalizeErrorMessage(error),
    })
  }

  const matchingPricingRows = pricing.pricing.filter((row) => matchesRequestPricingRow(normalizedRequest, row))
  if (matchingPricingRows.length === 0) {
    const selectedProviders = new Set(
      normalizedRequest.target_providers.map((provider) => normalizeLower(provider)),
    )
    const providerScopedRows =
      selectedProviders.size === 0
        ? pricing.pricing
        : pricing.pricing.filter((row) => selectedProviders.has(normalizeLower(row.provider)))
    const capabilityScope = providerScopedRows.length > 0 ? providerScopedRows : pricing.pricing

    return errorResponse(
      422,
      'UNSUPPORTED_PROVIDER_PARAMS',
      'Selected provider parameters are not currently supported by available pricing rows.',
      responseHeaders,
      {
        selected: {
          providers: normalizedRequest.target_providers,
          gpus: normalizedRequest.target_gpu,
          num_gpus: normalizedRequest.num_gpus,
          pricing_tier: normalizedRequest.pricing_tier[0] ?? 'on_demand',
          regions: normalizedRequest.target_regions,
          interconnects: normalizedRequest.target_interconnects,
          instance_types: normalizedRequest.target_instance_types,
        },
        supported: summarizeCapabilities(capabilityScope),
      },
    )
  }

  try {
    const module = await import('../../crucible/src/engine/index')
    if (typeof module.computeEstimate !== 'function') {
      throw new Error('computeEstimate export is missing from crucible/src/engine/index.ts.')
    }

    const estimate = module.computeEstimate(normalizedRequest, pricing.pricing)
    return jsonResponse(
      200,
      {
        ...estimate,
        pricing_meta: {
          source: pricing.source,
          fetched_at: pricing.fetchedAt,
          cached: pricing.cached,
          fallback_reason: pricing.fallbackReason ?? null,
        },
      },
      {
        ...responseHeaders,
        'Cache-Control': 'no-store',
      },
    )
  } catch (error) {
    return errorResponse(500, 'ESTIMATE_FAILED', 'Failed to compute estimate.', responseHeaders, {
      reason: normalizeErrorMessage(error),
    })
  }
}
