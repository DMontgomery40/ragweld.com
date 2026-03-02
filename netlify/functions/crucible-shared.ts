import type { HandlerEvent, HandlerResponse } from '@netlify/functions'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { ErrorResponse, ProviderPricing } from '../../crucible/src/types/index'

type EndpointKey = 'estimate' | 'prices' | 'models' | 'health' | 'resolve_model' | 'default'

interface RateLimitConfig {
  max: number
  windowMs: number
}

interface RateLimitState {
  count: number
  resetAt: number
}

interface RateLimitResult {
  allowed: boolean
  headers: Record<string, string>
  retryAfterSeconds: number
}

export interface PricingPayload {
  pricing: ProviderPricing[]
  fetchedAt: string
  source: ProviderPricing['source']
  cached: boolean
  fallbackReason?: string
}

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000
const SHADEFORM_PRICING_URL = 'https://api.shadeform.ai/v1/instances/types'

const PROJECT_ROOT = process.cwd()
const FUNCTION_DIR = typeof __dirname === 'string' ? __dirname : PROJECT_ROOT

const STATIC_PRICING_PATH_CANDIDATES = [
  path.resolve(FUNCTION_DIR, '../../crucible/data/static-pricing.json'),
  path.resolve(FUNCTION_DIR, '../crucible/data/static-pricing.json'),
  path.resolve('/var/task/crucible/data/static-pricing.json'),
  path.resolve(PROJECT_ROOT, 'crucible/data/static-pricing.json'),
  path.resolve(PROJECT_ROOT, '../crucible/data/static-pricing.json'),
]

const MODELS_PATH_CANDIDATES = [
  path.resolve(FUNCTION_DIR, '../../crucible/data/models.json'),
  path.resolve(FUNCTION_DIR, '../crucible/data/models.json'),
  path.resolve('/var/task/crucible/data/models.json'),
  path.resolve(PROJECT_ROOT, 'crucible/data/models.json'),
  path.resolve(PROJECT_ROOT, '../crucible/data/models.json'),
]

const BASE_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
}

const endpointRateLimits: Record<EndpointKey, RateLimitConfig> = {
  estimate: { max: 30, windowMs: 60_000 },
  prices: { max: 120, windowMs: 60_000 },
  models: { max: 120, windowMs: 60_000 },
  health: { max: 300, windowMs: 60_000 },
  resolve_model: { max: 40, windowMs: 60_000 },
  default: { max: 90, windowMs: 60_000 },
}

const rateLimitStore = new Map<string, RateLimitState>()

let pricingCache:
  | {
      expiresAt: number
      payload: Omit<PricingPayload, 'cached'>
    }
  | null = null

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toStringValue(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function toNumberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return null
}

function toBooleanValue(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'y'].includes(normalized)) {
      return true
    }
    if (['false', '0', 'no', 'n'].includes(normalized)) {
      return false
    }
  }
  return null
}

function maybeCents(value: unknown): number | null {
  const parsed = toNumberValue(value)
  if (parsed === null || parsed < 0) {
    return null
  }
  if (Number.isInteger(parsed)) {
    return Math.round(parsed)
  }
  return Math.round(parsed * 100)
}

function dollarsToCents(value: unknown): number | null {
  const parsed = toNumberValue(value)
  if (parsed === null || parsed < 0) {
    return null
  }
  return Math.round(parsed * 100)
}

function normalizeAvailability(value: unknown): ProviderPricing['availability'] {
  if (!Array.isArray(value)) {
    return []
  }
  const normalized: ProviderPricing['availability'] = []
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue
    }
    const region = toStringValue(entry.region) ?? 'unknown'
    const available = toBooleanValue(entry.available) ?? false
    normalized.push({ region, available })
  }
  return normalized
}

function readRequestHeader(event: HandlerEvent, headerName: string): string | null {
  const expected = headerName.toLowerCase()
  for (const [name, value] of Object.entries(event.headers)) {
    if (name.toLowerCase() === expected && typeof value === 'string' && value.length > 0) {
      return value
    }
  }
  return null
}

function firstArray<T>(value: T[] | undefined): T | undefined {
  if (!value || value.length === 0) {
    return undefined
  }
  return value[0]
}

export function parseBooleanQuery(value: string | undefined | null): boolean | undefined {
  if (value == null || value.trim().length === 0) {
    return undefined
  }
  return toBooleanValue(value) ?? undefined
}

export function buildCorsHeaders(allowMethods: string): Record<string, string> {
  return {
    ...BASE_CORS_HEADERS,
    'Access-Control-Allow-Methods': allowMethods,
  }
}

export function jsonResponse(
  statusCode: number,
  payload: unknown,
  headers: Record<string, string> = {},
): HandlerResponse {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers,
    },
    body: JSON.stringify(payload),
  }
}

export function errorResponse(
  statusCode: number,
  code: string,
  message: string,
  headers: Record<string, string>,
  details?: unknown,
): HandlerResponse {
  const body: ErrorResponse = details === undefined ? { error: message, code } : { error: message, code, details }
  return jsonResponse(statusCode, body, headers)
}

export function optionsResponse(allowMethods: string): HandlerResponse {
  return {
    statusCode: 204,
    headers: buildCorsHeaders(allowMethods),
    body: '',
  }
}

function getClientIp(event: HandlerEvent): string {
  const forwardedFor = readRequestHeader(event, 'x-forwarded-for')
  if (forwardedFor) {
    const first = firstArray(forwardedFor.split(',').map((entry) => entry.trim()).filter(Boolean))
    if (first) {
      return first
    }
  }

  const netlifyIp = readRequestHeader(event, 'x-nf-client-connection-ip')
  if (netlifyIp) {
    return netlifyIp
  }

  const realIp = readRequestHeader(event, 'x-real-ip')
  if (realIp) {
    return realIp
  }

  return 'unknown'
}

function sweepRateLimits(now: number): void {
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetAt <= now) {
      rateLimitStore.delete(key)
    }
  }
}

export function applyRateLimit(event: HandlerEvent, endpoint: EndpointKey): RateLimitResult {
  const config = endpointRateLimits[endpoint] ?? endpointRateLimits.default
  const now = Date.now()
  if (rateLimitStore.size > 4_000) {
    sweepRateLimits(now)
  }

  const key = `${endpoint}:${getClientIp(event)}`
  const current = rateLimitStore.get(key)

  if (!current || now >= current.resetAt) {
    const resetAt = now + config.windowMs
    const nextState: RateLimitState = { count: 1, resetAt }
    rateLimitStore.set(key, nextState)

    return {
      allowed: true,
      retryAfterSeconds: Math.ceil(config.windowMs / 1000),
      headers: {
        'X-RateLimit-Limit': String(config.max),
        'X-RateLimit-Remaining': String(config.max - 1),
        'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
      },
    }
  }

  current.count += 1
  rateLimitStore.set(key, current)

  const remaining = Math.max(0, config.max - current.count)
  const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000))

  return {
    allowed: current.count <= config.max,
    retryAfterSeconds,
    headers: {
      'X-RateLimit-Limit': String(config.max),
      'X-RateLimit-Remaining': String(remaining),
      'X-RateLimit-Reset': String(Math.ceil(current.resetAt / 1000)),
    },
  }
}

export function parseJsonBody(event: HandlerEvent): unknown {
  if (!event.body) {
    throw new Error('Request body is empty.')
  }

  const bodyText = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body
  if (bodyText.trim().length === 0) {
    throw new Error('Request body is empty.')
  }

  return JSON.parse(bodyText)
}

function normalizeShadeformPricing(raw: unknown): ProviderPricing[] {
  const fetchedAt = new Date().toISOString()
  const rows = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw.data)
      ? raw.data
      : isRecord(raw) && Array.isArray(raw.results)
        ? raw.results
        : isRecord(raw) && Array.isArray(raw.instances)
          ? raw.instances
          : isRecord(raw) && Array.isArray(raw.instance_types)
            ? raw.instance_types
          : []

  const pricing: ProviderPricing[] = []

  for (const row of rows) {
    if (!isRecord(row)) {
      continue
    }

    const config = isRecord(row.configuration) ? row.configuration : {}
    const availability = normalizeAvailability(row.availability)
    const available =
      toBooleanValue(row.available) ??
      availability.some((entry) => entry.available) ??
      toBooleanValue(config.available) ??
      false
    const hourlyPriceCents = maybeCents(row.hourly_price ?? row.hourly_price_cents ?? row.price)

    if (hourlyPriceCents === null) {
      continue
    }

    const normalized: ProviderPricing = {
      provider: toStringValue(row.cloud) ?? toStringValue(row.provider) ?? 'unknown',
      source: 'shadeform',
      shade_instance_type: toStringValue(row.shade_instance_type) ?? undefined,
      cloud_instance_type:
        toStringValue(row.cloud_instance_type) ?? toStringValue(row.instance_type) ?? toStringValue(row.name) ?? 'unknown',
      gpu: toStringValue(config.gpu_type) ?? toStringValue(row.gpu_type) ?? toStringValue(row.gpu) ?? 'unknown',
      num_gpus: Math.max(1, Math.trunc(toNumberValue(config.num_gpus ?? row.num_gpus) ?? 1)),
      vram_per_gpu_in_gb: Math.max(0, toNumberValue(config.vram_per_gpu_in_gb ?? row.vram_per_gpu_in_gb) ?? 0),
      memory_in_gb: toNumberValue(config.memory_in_gb ?? row.memory_in_gb) ?? undefined,
      storage_in_gb: toNumberValue(config.storage_in_gb ?? row.storage_in_gb) ?? undefined,
      vcpus: toNumberValue(config.vcpus ?? row.vcpus) ?? undefined,
      interconnect: toStringValue(config.interconnect ?? row.interconnect) ?? undefined,
      hourly_price_cents: hourlyPriceCents,
      spot_price_cents: maybeCents(row.spot_price ?? row.spot_hourly_price ?? row.spot_price_cents),
      reserved_1mo_price_cents: maybeCents(row.reserved_1mo_price ?? row.reserved_1mo_price_cents),
      reserved_3mo_price_cents: maybeCents(row.reserved_3mo_price ?? row.reserved_3mo_price_cents),
      availability: availability.length > 0 ? availability : [{ region: 'any', available }],
      available,
      fetched_at: toStringValue(row.fetched_at) ?? fetchedAt,
    }

    pricing.push(normalized)
  }

  return pricing
}

function normalizeStaticPricing(raw: unknown): ProviderPricing[] {
  const fallbackFetchedAt = new Date().toISOString()

  if (Array.isArray(raw)) {
    return raw
      .map((entry) => normalizeStaticArrayEntry(entry, fallbackFetchedAt))
      .filter((entry): entry is ProviderPricing => entry !== null)
  }

  if (!isRecord(raw)) {
    return []
  }

  if (isRecord(raw.providers)) {
    const fetchedAt = toStringValue(raw.last_updated) ?? toStringValue(raw.updated_at) ?? fallbackFetchedAt
    const pricing: ProviderPricing[] = []

    for (const [provider, providerDetails] of Object.entries(raw.providers)) {
      if (!isRecord(providerDetails)) {
        continue
      }

      if (Array.isArray(providerDetails.instances)) {
        for (const instance of providerDetails.instances) {
          if (!isRecord(instance)) {
            continue
          }
          const normalized = normalizeStaticArrayEntry({ ...instance, provider }, fetchedAt)
          if (normalized) {
            pricing.push(normalized)
          }
        }
        continue
      }

      for (const [instanceType, details] of Object.entries(providerDetails)) {
        if (!isRecord(details)) {
          continue
        }
        const normalized = normalizeStaticProviderEntry(provider, instanceType, details, fetchedAt)
        if (normalized) {
          pricing.push(normalized)
        }
      }
    }

    return pricing
  }

  if (Array.isArray(raw.pricing)) {
    const fetchedAt = toStringValue(raw.last_updated) ?? toStringValue(raw.updated_at) ?? fallbackFetchedAt
    return raw.pricing
      .map((entry) => normalizeStaticArrayEntry(entry, fetchedAt))
      .filter((entry): entry is ProviderPricing => entry !== null)
  }

  const fetchedAt = toStringValue(raw.last_updated) ?? toStringValue(raw.updated_at) ?? fallbackFetchedAt
  const pricing: ProviderPricing[] = []

  for (const [provider, instances] of Object.entries(raw)) {
    if (provider === 'last_updated' || provider === 'updated_at' || provider === 'pricing') {
      continue
    }
    if (!isRecord(instances)) {
      continue
    }
    for (const [instanceType, details] of Object.entries(instances)) {
      if (!isRecord(details)) {
        continue
      }
      const normalized = normalizeStaticProviderEntry(provider, instanceType, details, fetchedAt)
      if (normalized) {
        pricing.push(normalized)
      }
    }
  }

  return pricing
}

function normalizeStaticArrayEntry(entry: unknown, fetchedAt: string): ProviderPricing | null {
  if (!isRecord(entry)) {
    return null
  }

  const availability = normalizeAvailability(entry.availability)
  const availabilityStatus = availability.length > 0 ? availability.some((region) => region.available) : undefined
  const available =
    toBooleanValue(entry.available) ?? availabilityStatus ?? toBooleanValue(entry.is_available) ?? true
  const hourlyPriceCents =
    maybeCents(entry.hourly_price_cents) ??
    dollarsToCents(entry.on_demand_usd_per_hour) ??
    dollarsToCents(entry.on_demand_hourly) ??
    dollarsToCents(entry.hourly_price) ??
    maybeCents(entry.price_cents)

  if (hourlyPriceCents === null) {
    return null
  }

  return {
    provider: toStringValue(entry.provider) ?? 'static',
    source: 'static',
    shade_instance_type: toStringValue(entry.shade_instance_type) ?? undefined,
    cloud_instance_type: toStringValue(entry.cloud_instance_type) ?? toStringValue(entry.instance_type) ?? 'unknown',
    gpu: toStringValue(entry.gpu) ?? toStringValue(entry.gpu_type) ?? 'unknown',
    num_gpus: Math.max(1, Math.trunc(toNumberValue(entry.num_gpus) ?? 1)),
    vram_per_gpu_in_gb: Math.max(
      0,
      toNumberValue(
        entry.vram_per_gpu_in_gb ??
          entry.vram_per_gpu_gb ??
          entry.vram_per_gpu ??
          entry.configuration_vram_per_gpu_in_gb,
      ) ?? 0,
    ),
    memory_in_gb: toNumberValue(entry.memory_in_gb) ?? undefined,
    storage_in_gb: toNumberValue(entry.storage_in_gb) ?? undefined,
    vcpus: toNumberValue(entry.vcpus) ?? undefined,
    interconnect: toStringValue(entry.interconnect) ?? undefined,
    hourly_price_cents: hourlyPriceCents,
    spot_price_cents:
      maybeCents(entry.spot_price_cents) ??
      dollarsToCents(entry.spot_estimate_usd_per_hour) ??
      dollarsToCents(entry.spot_hourly_estimate) ??
      dollarsToCents(entry.spot_hourly) ??
      null,
    reserved_1mo_price_cents:
      maybeCents(entry.reserved_1mo_price_cents) ??
      dollarsToCents(entry.reserved_1mo_usd_per_hour) ??
      dollarsToCents(entry.reserved_1mo_hourly) ??
      null,
    reserved_3mo_price_cents:
      maybeCents(entry.reserved_3mo_price_cents) ??
      dollarsToCents(entry.reserved_3mo_usd_per_hour) ??
      dollarsToCents(entry.reserved_3mo_hourly) ??
      null,
    availability: availability.length > 0 ? availability : [{ region: 'any', available }],
    available,
    fetched_at: toStringValue(entry.fetched_at) ?? fetchedAt,
  }
}

function normalizeStaticProviderEntry(
  provider: string,
  instanceType: string,
  details: Record<string, unknown>,
  fetchedAt: string,
): ProviderPricing | null {
  const availability = normalizeAvailability(details.availability)
  const availabilityStatus = availability.length > 0 ? availability.some((region) => region.available) : undefined
  const available =
    toBooleanValue(details.available) ?? availabilityStatus ?? toBooleanValue(details.is_available) ?? true
  const hourlyPriceCents =
    maybeCents(details.hourly_price_cents) ??
    dollarsToCents(details.on_demand_usd_per_hour) ??
    dollarsToCents(details.on_demand_hourly) ??
    dollarsToCents(details.hourly_price) ??
    dollarsToCents(details.price_per_hour)

  if (hourlyPriceCents === null) {
    return null
  }

  return {
    provider,
    source: 'static',
    shade_instance_type: toStringValue(details.shade_instance_type) ?? undefined,
    cloud_instance_type: toStringValue(details.cloud_instance_type) ?? toStringValue(details.instance_type) ?? instanceType,
    gpu: toStringValue(details.gpu) ?? toStringValue(details.gpu_type) ?? 'unknown',
    num_gpus: Math.max(1, Math.trunc(toNumberValue(details.num_gpus) ?? 1)),
    vram_per_gpu_in_gb: Math.max(
      0,
      toNumberValue(details.vram_per_gpu_in_gb ?? details.vram_per_gpu_gb ?? details.vram_per_gpu) ?? 0,
    ),
    memory_in_gb: toNumberValue(details.memory_in_gb) ?? undefined,
    storage_in_gb: toNumberValue(details.storage_in_gb) ?? undefined,
    vcpus: toNumberValue(details.vcpus) ?? undefined,
    interconnect: toStringValue(details.interconnect) ?? undefined,
    hourly_price_cents: hourlyPriceCents,
    spot_price_cents:
      maybeCents(details.spot_price_cents) ??
      dollarsToCents(details.spot_estimate_usd_per_hour) ??
      dollarsToCents(details.spot_hourly_estimate) ??
      dollarsToCents(details.spot_hourly) ??
      null,
    reserved_1mo_price_cents:
      maybeCents(details.reserved_1mo_price_cents) ??
      dollarsToCents(details.reserved_1mo_usd_per_hour) ??
      dollarsToCents(details.reserved_1mo_hourly) ??
      null,
    reserved_3mo_price_cents:
      maybeCents(details.reserved_3mo_price_cents) ??
      dollarsToCents(details.reserved_3mo_usd_per_hour) ??
      dollarsToCents(details.reserved_3mo_hourly) ??
      null,
    availability: availability.length > 0 ? availability : [{ region: 'any', available }],
    available,
    fetched_at: fetchedAt,
  }
}

async function readJsonFromCandidates(paths: string[]): Promise<unknown> {
  let lastError: unknown = null

  for (const candidatePath of paths) {
    try {
      const fileText = await readFile(candidatePath, 'utf8')
      return JSON.parse(fileText)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError ?? new Error('No readable JSON file path candidates were found.')
}

async function fetchShadeformPricing(): Promise<ProviderPricing[]> {
  const apiKey = process.env.SHADEFORM_API_KEY
  if (!apiKey) {
    throw new Error('SHADEFORM_API_KEY is not set.')
  }

  const response = await fetch(SHADEFORM_PRICING_URL, {
    method: 'GET',
    headers: {
      'X-API-KEY': apiKey,
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    let responseSnippet = ''
    try {
      responseSnippet = (await response.text()).slice(0, 200)
    } catch {
      responseSnippet = ''
    }
    throw new Error(`Shadeform request failed with status ${response.status}.${responseSnippet ? ` ${responseSnippet}` : ''}`)
  }

  const raw = await response.json()
  const normalized = normalizeShadeformPricing(raw)
  if (normalized.length === 0) {
    throw new Error('Shadeform response did not include any usable pricing rows.')
  }
  return normalized
}

async function fetchStaticPricing(): Promise<ProviderPricing[]> {
  const raw = await readJsonFromCandidates(STATIC_PRICING_PATH_CANDIDATES)
  const normalized = normalizeStaticPricing(raw)
  if (normalized.length === 0) {
    throw new Error('Static pricing file did not include any usable pricing rows.')
  }
  return normalized
}

export async function getPricingPayload(forceRefresh = false): Promise<PricingPayload> {
  const now = Date.now()

  if (!forceRefresh && pricingCache && pricingCache.expiresAt > now) {
    return {
      ...pricingCache.payload,
      cached: true,
    }
  }

  try {
    const shadeformPricing = await fetchShadeformPricing()
    const fetchedAt = new Date().toISOString()
    const payload: Omit<PricingPayload, 'cached'> = {
      pricing: shadeformPricing,
      fetchedAt,
      source: 'shadeform',
    }
    pricingCache = {
      expiresAt: now + FIFTEEN_MINUTES_MS,
      payload,
    }

    return {
      ...payload,
      cached: false,
    }
  } catch (shadeformError) {
    const staticPricing = await fetchStaticPricing()
    const fetchedAt = new Date().toISOString()
    const fallbackReason =
      shadeformError instanceof Error ? shadeformError.message : 'Shadeform request failed and static fallback was used.'
    const payload: Omit<PricingPayload, 'cached'> = {
      pricing: staticPricing,
      fetchedAt,
      source: 'static',
      fallbackReason,
    }
    pricingCache = {
      expiresAt: now + FIFTEEN_MINUTES_MS,
      payload,
    }

    return {
      ...payload,
      cached: false,
    }
  }
}

export interface PricingFilters {
  gpuType?: string
  provider?: string
  availableOnly?: boolean
}

export function filterPricingRows(rows: ProviderPricing[], filters: PricingFilters): ProviderPricing[] {
  const normalizedGpu = filters.gpuType?.trim().toLowerCase()
  const normalizedProvider = filters.provider?.trim().toLowerCase()

  return rows.filter((row) => {
    if (normalizedGpu && row.gpu.toLowerCase() !== normalizedGpu) {
      return false
    }
    if (normalizedProvider && row.provider.toLowerCase() !== normalizedProvider) {
      return false
    }
    if (filters.availableOnly === true && !row.available) {
      return false
    }
    return true
  })
}

export async function getModelsCatalog(): Promise<unknown> {
  return readJsonFromCandidates(MODELS_PATH_CANDIDATES)
}
