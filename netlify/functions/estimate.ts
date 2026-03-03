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
const QUANTIZATION_PROFILE_VALUES = new Set([
  'nf4',
  'fp4',
  'mxfp4',
  'dynamic_4bit',
  'dynamic_2_0',
  'int8',
  'int16',
  'int32',
])

export const config = { path: '/crucible/api/v1/estimate' }

// Lightweight shape validation only. Domain rules are applied later in normalization + filtering.
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

// GPU aliases in provider feeds can differ from UI names (for example A100-80GB vs A100_80G).
// Normalize into a canonical form before any set-based matching.
function normalizeGpuValue(value: string): string {
  const resolved = resolveGPUType(value)
  return normalizeLower(resolved ?? value)
}

// Defensive parsing for request arrays coming from URL state and free-form JSON clients.
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

function normalizeQuantizationBits(value: number): EstimateRequest['quantization_bits'] {
  if (value === 4 || value === 8 || value === 16 || value === 32) {
    return value
  }
  return 4
}

function defaultQuantizationProfileForBits(
  bits: EstimateRequest['quantization_bits'],
): EstimateRequest['quantization_profile'] {
  if (bits === 8) {
    return 'int8'
  }
  if (bits === 16) {
    return 'int16'
  }
  if (bits === 32) {
    return 'int32'
  }
  return 'nf4'
}

function normalizeQuantizationProfile(
  value: unknown,
  bits: EstimateRequest['quantization_bits'],
): EstimateRequest['quantization_profile'] {
  if (typeof value !== 'string' || !QUANTIZATION_PROFILE_VALUES.has(value)) {
    return defaultQuantizationProfileForBits(bits)
  }

  if (bits === 4) {
    if (
      value === 'nf4' ||
      value === 'fp4' ||
      value === 'mxfp4' ||
      value === 'dynamic_4bit' ||
      value === 'dynamic_2_0'
    ) {
      return value
    }
    return 'nf4'
  }

  return defaultQuantizationProfileForBits(bits)
}

function normalizeEstimateRequest(request: EstimateRequest): EstimateRequest {
  const normalizedQuantizationBits = normalizeQuantizationBits(request.quantization_bits)
  return {
    ...request,
    quantization_bits: normalizedQuantizationBits,
    quantization_profile: normalizeQuantizationProfile(
      (request as Partial<EstimateRequest>).quantization_profile,
      normalizedQuantizationBits,
    ),
    target_gpu: normalizeStringArray(request.target_gpu) as EstimateRequest['target_gpu'],
    target_providers: normalizeStringArray((request as Partial<EstimateRequest>).target_providers),
    target_regions: normalizeStringArray((request as Partial<EstimateRequest>).target_regions),
    target_interconnects: normalizeStringArray((request as Partial<EstimateRequest>).target_interconnects),
    target_instance_types: normalizeStringArray((request as Partial<EstimateRequest>).target_instance_types),
    pricing_tier: normalizePricingTiers(request.pricing_tier),
  }
}

// "Tier support" means the provider row has a concrete price for that billing tier.
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
    return typeof row.spot_price_cents === 'number' && Number.isFinite(row.spot_price_cents) && row.spot_price_cents > 0
  }
  if (tier === 'reserved_1mo') {
    return (
      typeof row.reserved_1mo_price_cents === 'number' &&
      Number.isFinite(row.reserved_1mo_price_cents) &&
      row.reserved_1mo_price_cents > 0
    )
  }
  return (
    typeof row.reserved_3mo_price_cents === 'number' &&
    Number.isFinite(row.reserved_3mo_price_cents) &&
    row.reserved_3mo_price_cents > 0
  )
}

function rowMatchesRequestFilters(
  request: EstimateRequest,
  row: {
    provider: string
    gpu: string
    num_gpus: number
    cloud_instance_type: string
    interconnect?: string
    availability: Array<{ region: string; available?: boolean }>
  },
): boolean {
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
    if (row.availability.length === 0) {
      if (!selectedRegions.has('any')) {
        return false
      }
    } else {
      const matchingAvailability = row.availability.filter((regionEntry) => {
        const normalizedRegion = normalizeLower(regionEntry.region || 'any')
        return selectedRegions.has('any') || selectedRegions.has(normalizedRegion)
      })
      if (matchingAvailability.length === 0) {
        return false
      }
      if (!matchingAvailability.some((regionEntry) => regionEntry.available !== false)) {
        return false
      }
    }
  }

  if (request.target_regions.length === 0 && row.availability.length > 0) {
    // Keep globally unavailable rows out of normal estimate requests even without region filters.
    if (!row.availability.some((regionEntry) => regionEntry.available !== false)) {
      return false
    }
  }

  return true
}

function summarizeTierSupport(
  pricing: Array<{
    hourly_price_cents: number
    spot_price_cents?: number | null
    reserved_1mo_price_cents?: number | null
    reserved_3mo_price_cents?: number | null
  }>,
) {
  return {
    on_demand: pricing.filter((row) => rowSupportsTier(row, 'on_demand')).length,
    spot: pricing.filter((row) => rowSupportsTier(row, 'spot')).length,
    reserved_1mo: pricing.filter((row) => rowSupportsTier(row, 'reserved_1mo')).length,
    reserved_3mo: pricing.filter((row) => rowSupportsTier(row, 'reserved_3mo')).length,
  }
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
  // OPTIONS handles CORS preflights for browser-based clients.
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
  // From here on, use a normalized request to avoid repeated type/shape checks.
  const normalizedRequest = normalizeEstimateRequest(requestBody)

  let pricing
  try {
    pricing = await getPricingPayload()
  } catch (error) {
    return errorResponse(503, 'PRICING_UNAVAILABLE', 'Failed to fetch pricing data.', responseHeaders, {
      reason: normalizeErrorMessage(error),
    })
  }

  const rowsMatchingFilters = pricing.pricing.filter((row) =>
    rowMatchesRequestFilters(normalizedRequest, row),
  )

  if (rowsMatchingFilters.length === 0) {
    return errorResponse(
      422,
      'UNSUPPORTED_PROVIDER_PARAMS',
      'No pricing entries match the selected provider capabilities.',
      responseHeaders,
      {
        selected: {
          target_providers: normalizedRequest.target_providers,
          target_gpu: normalizedRequest.target_gpu,
          target_regions: normalizedRequest.target_regions,
          target_interconnects: normalizedRequest.target_interconnects,
          target_instance_types: normalizedRequest.target_instance_types,
          num_gpus: normalizedRequest.num_gpus,
          pricing_tier: normalizedRequest.pricing_tier,
        },
        available_capabilities: summarizeCapabilities(pricing.pricing),
      },
    )
  }

  const selectedTiers = normalizedRequest.pricing_tier.length > 0 ? normalizedRequest.pricing_tier : ['on_demand']
  const rowsMatchingTierSupport = rowsMatchingFilters.filter((row) =>
    selectedTiers.some((tier) => rowSupportsTier(row, tier)),
  )

  if (rowsMatchingTierSupport.length === 0) {
    return errorResponse(
      422,
      'UNSUPPORTED_PRICING_TIERS',
      `No pricing entries match selected pricing tiers: ${selectedTiers.join(', ')}.`,
      responseHeaders,
      {
        selected_pricing_tiers: selectedTiers,
        matching_rows_before_tier_filter: rowsMatchingFilters.length,
        available_tier_counts: summarizeTierSupport(rowsMatchingFilters),
        pricing_meta: {
          source: pricing.source,
          fetched_at: pricing.fetchedAt,
          cached: pricing.cached,
          fallback_reason: pricing.fallbackReason ?? null,
        },
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
