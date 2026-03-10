import type {
  CostComparisonEntry,
  EstimateRequest,
  FitStatus,
  PricingFreshness,
  PricingTier,
  ProviderPricing,
  Range3,
  TrainingEstimate,
} from '../types/index'
import { resolveGPUType } from './gpu-specs'
import { estimateTrainingHoursForGPU } from './training'
import { assessProviderSupport } from './provider-support'
import { buildRangeFromTypical, rangeFromTriplet } from './ranges'

const LIVE_ROW_STALE_AFTER_MS = 6 * 60 * 60 * 1000
const STATIC_ROW_STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000

export interface CostComparisonResult {
  entries: CostComparisonEntry[]
  intermediates: Record<string, number>
  warnings: string[]
}

// Sanitizes numeric user/provider inputs so the math layer never receives NaN/Infinity/negative values.
function asNonNegative(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) {
    return fallback
  }
  return value < 0 ? 0 : value
}

// Pricing tiers can arrive with duplicates or empty values (UI sync + URL state round-trips).
// We keep the request order but remove duplicates, then force at least one valid tier.
function normalizeTierSelection(tiers: PricingTier[]): PricingTier[] {
  const deduped = Array.from(new Set(tiers))
  return deduped.length > 0 ? deduped : ['on_demand']
}

function hasTierPrice(pricingEntry: ProviderPricing, tier: PricingTier): boolean {
  switch (tier) {
    case 'spot':
      return (
        typeof pricingEntry.spot_price_cents === 'number' &&
        Number.isFinite(pricingEntry.spot_price_cents) &&
        pricingEntry.spot_price_cents > 0
      )
    case 'reserved_1mo':
      return (
        typeof pricingEntry.reserved_1mo_price_cents === 'number' &&
        Number.isFinite(pricingEntry.reserved_1mo_price_cents) &&
        pricingEntry.reserved_1mo_price_cents > 0
      )
    case 'reserved_3mo':
      return (
        typeof pricingEntry.reserved_3mo_price_cents === 'number' &&
        Number.isFinite(pricingEntry.reserved_3mo_price_cents) &&
        pricingEntry.reserved_3mo_price_cents > 0
      )
    case 'on_demand':
    default:
      return (
        typeof pricingEntry.hourly_price_cents === 'number' &&
        Number.isFinite(pricingEntry.hourly_price_cents) &&
        pricingEntry.hourly_price_cents > 0
      )
  }
}

// Billing inputs are stored as cents/hour in pricing payloads.
// We convert to USD and scale by estimated wall clock hours and run count.
function costFromHourlyRate(
  hourlyPriceCents: number | null | undefined,
  hours: number,
  runs: number,
  nodes: number,
): number | null {
  if (hourlyPriceCents === null || hourlyPriceCents === undefined) {
    return null
  }
  if (!Number.isFinite(hours)) {
    return null
  }
  return (hourlyPriceCents / 100) * hours * runs * Math.max(1, nodes)
}

type TierCostMap = Record<PricingTier, number | null>

// If users select multiple tiers, we model "best available selected tier" for this row.
// This avoids a silent bug where only the first selected tier influenced all results.
function pickBestSelectedTierCost(
  selectedTiers: PricingTier[],
  tierCosts: TierCostMap,
): { cost: number | null; tier: PricingTier | null } {
  let bestCost: number | null = null
  let bestTier: PricingTier | null = null

  for (const tier of selectedTiers) {
    const tierCost = tierCosts[tier]
    if (tierCost === null) {
      continue
    }
    if (bestCost === null || tierCost < bestCost) {
      bestCost = tierCost
      bestTier = tier
    }
  }

  return { cost: bestCost, tier: bestTier }
}

function selectedTierHourlyRate(
  entry: ProviderPricing,
  selectedTier: PricingTier | null,
): number | null {
  switch (selectedTier) {
    case 'spot':
      return entry.spot_price_cents ?? null
    case 'reserved_1mo':
      return entry.reserved_1mo_price_cents ?? null
    case 'reserved_3mo':
      return entry.reserved_3mo_price_cents ?? null
    case 'on_demand':
      return entry.hourly_price_cents
    case null:
    default:
      return entry.hourly_price_cents
  }
}

function deriveEntryHours(
  params: EstimateRequest,
  training: TrainingEstimate,
  pricingEntry: ProviderPricing,
): number {
  // Request and provider rows can represent different cluster sizes.
  // We normalize wall clock estimates by GPU-count ratio so rows remain comparable.
  const requestedGPUCount = Math.max(1, asNonNegative(params.num_gpus, 1))
  const nodeCount = Math.max(1, asNonNegative(params.num_nodes, 1))
  const providerGPUCount = Math.max(1, asNonNegative(pricingEntry.num_gpus, 1))
  const providerTotalGPUCount = providerGPUCount * nodeCount
  const normalizedGPU = resolveGPUType(String(pricingEntry.gpu))
  const trainingHoursFromTargetMap =
    (normalizedGPU && training.estimated_hours_by_gpu[normalizedGPU]) ||
    training.estimated_hours_by_gpu[String(pricingEntry.gpu)]
  const interconnectMultiplier = deriveInterconnectMultiplier(pricingEntry.interconnect)
  const hostFeedMultiplier = deriveHostFeedMultiplier(pricingEntry)

  if (trainingHoursFromTargetMap !== undefined) {
    return (
      trainingHoursFromTargetMap *
      (requestedGPUCount / providerTotalGPUCount) *
      interconnectMultiplier *
      hostFeedMultiplier
    )
  }

  const derivedHours = estimateTrainingHoursForGPU(
    params,
    training.total_flops,
    String(pricingEntry.gpu),
    providerTotalGPUCount,
  )
  if (derivedHours === null) {
    return Number.POSITIVE_INFINITY
  }
  return derivedHours * interconnectMultiplier * hostFeedMultiplier
}

function deriveEntryHoursRange(
  params: EstimateRequest,
  training: TrainingEstimate,
  pricingEntry: ProviderPricing,
): Range3 {
  const requestedGPUCount = Math.max(1, asNonNegative(params.num_gpus, 1))
  const nodeCount = Math.max(1, asNonNegative(params.num_nodes, 1))
  const providerGPUCount = Math.max(1, asNonNegative(pricingEntry.num_gpus, 1))
  const providerTotalGPUCount = providerGPUCount * nodeCount
  const normalizedGPU = resolveGPUType(String(pricingEntry.gpu))
  const trainingHoursRangeFromTargetMap =
    (normalizedGPU && training.estimated_hours_by_gpu_range[normalizedGPU]) ||
    training.estimated_hours_by_gpu_range[String(pricingEntry.gpu)]
  const interconnectMultiplier = deriveInterconnectMultiplier(pricingEntry.interconnect)
  const hostFeedMultiplier = deriveHostFeedMultiplier(pricingEntry)
  const scale = (requestedGPUCount / providerTotalGPUCount) * interconnectMultiplier * hostFeedMultiplier

  if (trainingHoursRangeFromTargetMap) {
    return {
      optimistic: trainingHoursRangeFromTargetMap.optimistic * scale,
      typical: trainingHoursRangeFromTargetMap.typical * scale,
      conservative: trainingHoursRangeFromTargetMap.conservative * scale,
    }
  }

  const typicalHours = deriveEntryHours(params, training, pricingEntry)
  const optimisticSpread = training.assumptions.optimistic_spread ?? 0.12
  const conservativeSpread = training.assumptions.conservative_spread ?? 0.2
  return buildRangeFromTypical(typicalHours, {
    optimisticSpread,
    conservativeSpread,
  })
}

function normalizeLower(value: string): string {
  return value.trim().toLowerCase()
}

function deriveInterconnectMultiplier(interconnect: string | undefined): number {
  const normalized = normalizeLower(interconnect ?? 'unknown')
  if (normalized.includes('infiniband')) {
    return 0.96
  }
  if (normalized.includes('nvlink') || normalized.includes('sxm') || normalized.includes('xgmi')) {
    return 1
  }
  if (normalized.includes('pcie')) {
    return 1.08
  }
  return 1.03
}

function deriveHostFeedMultiplier(entry: ProviderPricing): number {
  const vcpus = entry.vcpus
  if (vcpus === undefined || vcpus === null || !Number.isFinite(vcpus) || vcpus <= 0) {
    return 1
  }

  const gpus = Math.max(1, asNonNegative(entry.num_gpus, 1))
  const vcpusPerGPU = vcpus / gpus

  if (vcpusPerGPU < 8) {
    return 1.1
  }
  if (vcpusPerGPU < 12) {
    return 1.05
  }
  if (vcpusPerGPU > 24) {
    return 0.95
  }
  if (vcpusPerGPU > 16) {
    return 0.98
  }
  return 1
}

function normalizeGPUName(value: string): string {
  return normalizeLower(resolveGPUType(value) ?? value)
}

function summarizeRegionMatch(
  entry: ProviderPricing,
  selectedRegions: Set<string>,
): { matchesFilter: boolean; availableInScope: boolean } {
  const selectedAny = selectedRegions.has('any')
  const hasRegionFilter = selectedRegions.size > 0

  if (entry.availability.length === 0) {
    return {
      matchesFilter: !hasRegionFilter || selectedAny,
      availableInScope: entry.available,
    }
  }

  if (!hasRegionFilter) {
    return {
      matchesFilter: true,
      availableInScope: entry.availability.some((availability) => availability.available),
    }
  }

  const matchingRows = entry.availability.filter((availability) => {
    const normalizedRegion = normalizeLower(availability.region)
    return selectedAny || selectedRegions.has(normalizedRegion)
  })

  if (matchingRows.length === 0) {
    return { matchesFilter: false, availableInScope: false }
  }

  return {
    matchesFilter: true,
    availableInScope: matchingRows.some((availability) => availability.available),
  }
}

function fitStatusForRow(
  entry: ProviderPricing,
  requiredVRAMRange: Range3,
  minRequiredVRAM: number,
): FitStatus {
  const vramPerGpu = asNonNegative(entry.vram_per_gpu_in_gb)
  const likelyFitThreshold = Math.max(minRequiredVRAM, requiredVRAMRange.conservative)
  const borderlineThreshold = Math.max(minRequiredVRAM, requiredVRAMRange.typical)

  if (vramPerGpu >= likelyFitThreshold) {
    return 'likely_fit'
  }
  if (vramPerGpu >= borderlineThreshold) {
    return 'borderline'
  }
  return 'likely_oom'
}

function toTimestamp(value: string | null | undefined): number | null {
  if (!value) {
    return null
  }
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) {
    return null
  }
  return parsed
}

function addDurationIso(value: string | null | undefined, durationMs: number): string | null {
  const parsed = toTimestamp(value)
  if (parsed === null) {
    return null
  }
  return new Date(parsed + durationMs).toISOString()
}

function deriveRowPricingFreshness(
  pricingEntry: ProviderPricing,
  feedFreshness: PricingFreshness,
): PricingFreshness {
  const now = Date.now()
  const staleAfter =
    pricingEntry.source === 'static'
      ? addDurationIso(pricingEntry.fetched_at, STATIC_ROW_STALE_AFTER_MS)
      : addDurationIso(pricingEntry.fetched_at, LIVE_ROW_STALE_AFTER_MS)
  const staleAt = toTimestamp(staleAfter)
  const fetchedAt = toTimestamp(pricingEntry.fetched_at)

  return {
    source: pricingEntry.source,
    fetched_at: pricingEntry.fetched_at,
    stale_after: staleAfter ?? feedFreshness.stale_after,
    is_stale: staleAt === null ? feedFreshness.is_stale : now > staleAt,
    fallback_reason: pricingEntry.source === 'static' ? feedFreshness.fallback_reason : null,
    cached: feedFreshness.cached,
    cache_ttl_ms: feedFreshness.cache_ttl_ms,
    snapshot_updated_at: feedFreshness.snapshot_updated_at,
    data_age_ms: fetchedAt === null ? null : Math.max(0, now - fetchedAt),
    snapshot_age_ms: feedFreshness.snapshot_age_ms,
  }
}

function derivePriceRange(
  pricingEntry: ProviderPricing,
  selectedTier: PricingTier | null,
  rowFreshness: PricingFreshness,
): Range3 {
  const hourlyCents = selectedTierHourlyRate(pricingEntry, selectedTier)
  if (hourlyCents === null || !Number.isFinite(hourlyCents)) {
    return rangeFromTriplet(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)
  }

  let optimisticSpread = 0
  let conservativeSpread = 0

  if (pricingEntry.source === 'static') {
    optimisticSpread += 0.08
    conservativeSpread += 0.14
  }

  if (selectedTier !== null && selectedTier !== 'on_demand') {
    optimisticSpread += 0.02
    conservativeSpread += 0.05
  }

  if (pricingEntry.source === 'static' && rowFreshness.fallback_reason) {
    conservativeSpread += 0.06
  }

  if (rowFreshness.is_stale) {
    optimisticSpread += 0.04
    conservativeSpread += 0.1
  }

  return buildRangeFromTypical(hourlyCents / 100, {
    optimisticSpread,
    conservativeSpread,
  })
}

function sortTierRank(tier: CostComparisonEntry['provider_support_tier']): number {
  switch (tier) {
    case 'documented':
      return 0
    case 'inferred':
      return 1
    case 'custom':
    default:
      return 2
  }
}

function fitStatusRank(status: FitStatus): number {
  switch (status) {
    case 'likely_fit':
      return 0
    case 'borderline':
      return 1
    case 'likely_oom':
    default:
      return 2
  }
}

function sourceRank(source: ProviderPricing['source']): number {
  switch (source) {
    case 'shadeform':
    case 'runpod':
    case 'vastai':
    case 'lambdalabs':
      return 0
    case 'static':
    default:
      return 1
  }
}

export function estimateCostComparison(
  params: EstimateRequest,
  pricing: ProviderPricing[],
  training: TrainingEstimate,
  requiredVRAMRange: Range3,
  pricingFreshness: PricingFreshness,
): CostComparisonResult {
  const warnings: string[] = []
  const intermediates: Record<string, number> = {}

  const runs = Math.max(1, asNonNegative(params.num_runs, 1))
  const nodes = Math.max(1, asNonNegative(params.num_nodes, 1))
  const selectedTiers = normalizeTierSelection(params.pricing_tier)
  const minRequiredVRAM = Math.max(0, asNonNegative(params.min_vram_gb ?? requiredVRAMRange.typical))
  const requestedGPUCount = Math.max(1, asNonNegative(params.num_gpus, 1))
  const requestedGPUsPerNode = requestedGPUCount / nodes
  const selectedProviders = new Set(
    params.target_providers.map(normalizeLower).filter((provider) => provider.length > 0),
  )
  const selectedGPUs = new Set(
    params.target_gpu.map((gpu) => normalizeGPUName(String(gpu))).filter((gpu) => gpu.length > 0),
  )
  const selectedRegions = new Set(
    params.target_regions.map(normalizeLower).filter((region) => region.length > 0),
  )
  const selectedInterconnects = new Set(
    params.target_interconnects.map(normalizeLower).filter((mode) => mode.length > 0),
  )
  const selectedInstanceTypes = new Set(
    params.target_instance_types
      .map((instanceType) => normalizeLower(instanceType))
      .filter((instanceType) => instanceType.length > 0),
  )

  const filteredPricing = pricing.filter((entry) => {
    if (selectedProviders.size > 0 && !selectedProviders.has(normalizeLower(entry.provider))) {
      return false
    }
    if (selectedGPUs.size > 0 && !selectedGPUs.has(normalizeGPUName(String(entry.gpu)))) {
      return false
    }
    if (entry.num_gpus * nodes !== requestedGPUCount) {
      return false
    }
    if (selectedInstanceTypes.size > 0) {
      const instanceType = normalizeLower(entry.cloud_instance_type)
      if (!selectedInstanceTypes.has(instanceType)) {
        return false
      }
    }
    if (selectedInterconnects.size > 0) {
      const interconnect = normalizeLower(entry.interconnect ?? 'unknown')
      if (!selectedInterconnects.has(interconnect)) {
        return false
      }
    }
    const regionSummary = summarizeRegionMatch(entry, selectedRegions)
    if (!regionSummary.matchesFilter) {
      return false
    }
    if (selectedRegions.size > 0 && !regionSummary.availableInScope) {
      // Region filters are operational intent filters: only keep rows available in selected regions.
      return false
    }
    if (!selectedTiers.some((tier) => hasTierPrice(entry, tier))) {
      return false
    }
    return true
  })

  if (filteredPricing.length === 0) {
    const tierLabel = selectedTiers.join(', ')
    warnings.push(
      `No pricing entries matched the selected provider capabilities (provider, GPU, region, interconnect, GPU count, and selected pricing tiers: ${tierLabel}).`,
    )
  }

  if (nodes > 1 && !Number.isInteger(requestedGPUsPerNode)) {
    warnings.push(
      `Requested GPU topology (${requestedGPUCount} GPUs across ${nodes} nodes) cannot be evenly split per node, so provider matching may be empty.`,
    )
  }

  const entries: CostComparisonEntry[] = filteredPricing.map((pricingEntry) => {
    const estimatedHours = deriveEntryHours(params, training, pricingEntry)
    const estimatedHoursRange = deriveEntryHoursRange(params, training, pricingEntry)
    const tierCosts: TierCostMap = {
      on_demand: costFromHourlyRate(pricingEntry.hourly_price_cents, estimatedHours, runs, nodes),
      spot: costFromHourlyRate(pricingEntry.spot_price_cents, estimatedHours, runs, nodes),
      reserved_1mo: costFromHourlyRate(pricingEntry.reserved_1mo_price_cents, estimatedHours, runs, nodes),
      reserved_3mo: costFromHourlyRate(pricingEntry.reserved_3mo_price_cents, estimatedHours, runs, nodes),
    }
    const selectedTierCost = pickBestSelectedTierCost(selectedTiers, tierCosts)

    if (selectedTierCost.cost === null) {
      warnings.push(
        `${pricingEntry.provider}/${pricingEntry.cloud_instance_type} has no usable price across selected tiers (${selectedTiers.join(', ')}).`,
      )
    }

    if (!Number.isFinite(estimatedHours)) {
      warnings.push(
        `Could not derive training hours for GPU ${pricingEntry.gpu}; costs may be incomplete for ${pricingEntry.provider}.`,
      )
    }

    const vramTotal = asNonNegative(pricingEntry.vram_per_gpu_in_gb) * Math.max(1, pricingEntry.num_gpus)
    const regionSummary = summarizeRegionMatch(pricingEntry, selectedRegions)
    const selectedCostOrFallback = selectedTierCost.cost ?? tierCosts.on_demand
    const providerSupport = assessProviderSupport(params, pricingEntry)
    const fitStatus = fitStatusForRow(pricingEntry, requiredVRAMRange, minRequiredVRAM)
    const rowPricingFreshness = deriveRowPricingFreshness(pricingEntry, pricingFreshness)
    const priceRange = derivePriceRange(pricingEntry, selectedTierCost.tier, rowPricingFreshness)
    const costRangeDollars = {
      optimistic:
        estimatedHoursRange.optimistic * priceRange.optimistic * runs * Math.max(1, nodes),
      typical:
        estimatedHoursRange.typical * priceRange.typical * runs * Math.max(1, nodes),
      conservative:
        estimatedHoursRange.conservative * priceRange.conservative * runs * Math.max(1, nodes),
    }

    return {
      provider: pricingEntry.provider,
      gpu: String(pricingEntry.gpu),
      cloud_instance_type: pricingEntry.cloud_instance_type,
      num_gpus: Math.max(1, pricingEntry.num_gpus),
      vram_total_gb: vramTotal,
      hourly_price_cents: pricingEntry.hourly_price_cents,
      spot_price_cents: pricingEntry.spot_price_cents ?? null,
      reserved_1mo_price_cents: pricingEntry.reserved_1mo_price_cents ?? null,
      reserved_3mo_price_cents: pricingEntry.reserved_3mo_price_cents ?? null,
      estimated_hours: estimatedHours,
      estimated_hours_range: estimatedHoursRange,
      total_cost_dollars: selectedCostOrFallback ?? Number.POSITIVE_INFINITY,
      cost_range_dollars: costRangeDollars,
      spot_cost_dollars: tierCosts.spot,
      reserved_1mo_cost_dollars: tierCosts.reserved_1mo,
      reserved_3mo_cost_dollars: tierCosts.reserved_3mo,
      available: pricingEntry.available && regionSummary.availableInScope,
      fits_in_vram: fitStatus !== 'likely_oom',
      fit_status: fitStatus,
      selected_pricing_tier: selectedTierCost.tier,
      provider_support_tier: providerSupport.tier,
      provider_support_reasons: providerSupport.reasons,
      price_source: pricingEntry.source,
      price_fetched_at: pricingEntry.fetched_at,
      price_stale_after: rowPricingFreshness.stale_after,
      fallback_reason: rowPricingFreshness.fallback_reason,
      pricing_freshness: rowPricingFreshness,
      source: pricingEntry.source,
    }
  })

  entries.sort((a, b) => {
    if (sortTierRank(a.provider_support_tier) !== sortTierRank(b.provider_support_tier)) {
      return sortTierRank(a.provider_support_tier) - sortTierRank(b.provider_support_tier)
    }
    if (fitStatusRank(a.fit_status) !== fitStatusRank(b.fit_status)) {
      return fitStatusRank(a.fit_status) - fitStatusRank(b.fit_status)
    }
    if (sourceRank(a.source) !== sourceRank(b.source)) {
      return sourceRank(a.source) - sourceRank(b.source)
    }
    if (a.total_cost_dollars !== b.total_cost_dollars) {
      return a.total_cost_dollars - b.total_cost_dollars
    }
    return a.estimated_hours - b.estimated_hours
  })

  // Retained for backward compatibility with existing math panel consumers.
  intermediates.selected_pricing_tier_rank = ['on_demand', 'spot', 'reserved_1mo', 'reserved_3mo'].indexOf(
    selectedTiers[0],
  )
  intermediates.selected_pricing_tier_count = selectedTiers.length
  intermediates.requested_num_gpus = requestedGPUCount
  intermediates.requested_num_nodes = nodes
  intermediates.required_vram_per_gpu = minRequiredVRAM
  intermediates.num_pricing_entries = filteredPricing.length
  intermediates.num_runs = runs
  intermediates.num_fit_candidates = entries.filter((entry) => entry.fit_status === 'likely_fit').length
  intermediates.num_borderline_candidates = entries.filter((entry) => entry.fit_status === 'borderline').length
  intermediates.pricing_source_is_stale = pricingFreshness.is_stale ? 1 : 0

  return {
    entries,
    intermediates,
    warnings,
  }
}
