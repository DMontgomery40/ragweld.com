import type {
  CostComparisonEntry,
  EstimateRequest,
  PricingTier,
  ProviderPricing,
  TrainingEstimate,
} from '../types/index'
import { resolveGPUType } from './gpu-specs'
import { estimateTrainingHoursForGPU } from './training'

export interface CostComparisonResult {
  entries: CostComparisonEntry[]
  intermediates: Record<string, number>
  warnings: string[]
}

function asNonNegative(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) {
    return fallback
  }
  return value < 0 ? 0 : value
}

function tierPriority(tiers: PricingTier[]): PricingTier {
  return tiers[0] ?? 'on_demand'
}

function hasTierPrice(pricingEntry: ProviderPricing, tier: PricingTier): boolean {
  switch (tier) {
    case 'spot':
      return pricingEntry.spot_price_cents !== null && pricingEntry.spot_price_cents !== undefined
    case 'reserved_1mo':
      return (
        pricingEntry.reserved_1mo_price_cents !== null &&
        pricingEntry.reserved_1mo_price_cents !== undefined
      )
    case 'reserved_3mo':
      return (
        pricingEntry.reserved_3mo_price_cents !== null &&
        pricingEntry.reserved_3mo_price_cents !== undefined
      )
    case 'on_demand':
    default:
      return (
        pricingEntry.hourly_price_cents !== null &&
        pricingEntry.hourly_price_cents !== undefined
      )
  }
}

function costFromHourlyRate(
  hourlyPriceCents: number | null | undefined,
  hours: number,
  runs: number,
): number | null {
  if (hourlyPriceCents === null || hourlyPriceCents === undefined) {
    return null
  }
  if (!Number.isFinite(hours)) {
    return null
  }
  return (hourlyPriceCents / 100) * hours * runs
}

function pickSelectedTierCost(
  tier: PricingTier,
  onDemand: number | null,
  spot: number | null,
  reserved1mo: number | null,
  reserved3mo: number | null,
): number | null {
  switch (tier) {
    case 'spot':
      return spot ?? onDemand
    case 'reserved_1mo':
      return reserved1mo ?? onDemand
    case 'reserved_3mo':
      return reserved3mo ?? onDemand
    case 'on_demand':
    default:
      return onDemand
  }
}

function deriveEntryHours(
  params: EstimateRequest,
  training: TrainingEstimate,
  pricingEntry: ProviderPricing,
): number {
  const requestedGPUCount = Math.max(1, asNonNegative(params.num_gpus, 1))
  const providerGPUCount = Math.max(1, asNonNegative(pricingEntry.num_gpus, 1))
  const normalizedGPU = resolveGPUType(String(pricingEntry.gpu))
  const trainingHoursFromTargetMap =
    (normalizedGPU && training.estimated_hours_by_gpu[normalizedGPU]) ||
    training.estimated_hours_by_gpu[String(pricingEntry.gpu)]
  const interconnectMultiplier = deriveInterconnectMultiplier(pricingEntry.interconnect)
  const hostFeedMultiplier = deriveHostFeedMultiplier(pricingEntry)

  if (trainingHoursFromTargetMap !== undefined) {
    return (
      trainingHoursFromTargetMap *
      (requestedGPUCount / providerGPUCount) *
      interconnectMultiplier *
      hostFeedMultiplier
    )
  }

  const derivedHours = estimateTrainingHoursForGPU(
    params,
    training.total_flops,
    String(pricingEntry.gpu),
    providerGPUCount,
  )
  if (derivedHours === null) {
    return Number.POSITIVE_INFINITY
  }
  return derivedHours * interconnectMultiplier * hostFeedMultiplier
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

export function estimateCostComparison(
  params: EstimateRequest,
  pricing: ProviderPricing[],
  training: TrainingEstimate,
  requiredVRAMPerGPU: number,
): CostComparisonResult {
  const warnings: string[] = []
  const intermediates: Record<string, number> = {}

  const runs = Math.max(1, asNonNegative(params.num_runs, 1))
  const selectedTier = tierPriority(params.pricing_tier)
  const minRequiredVRAM = Math.max(0, asNonNegative(params.min_vram_gb ?? requiredVRAMPerGPU))
  const requestedGPUCount = Math.max(1, asNonNegative(params.num_gpus, 1))
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
    if (entry.num_gpus !== requestedGPUCount) {
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
    if (selectedRegions.size > 0) {
      const entryRegions = entry.availability
        .map((availability) => normalizeLower(availability.region))
        .filter((region) => region.length > 0)
      const regionMatches =
        entryRegions.length === 0
          ? selectedRegions.has('any')
          : entryRegions.some((region) => selectedRegions.has(region))
      if (!regionMatches) {
        return false
      }
    }
    if (!hasTierPrice(entry, selectedTier)) {
      return false
    }
    return true
  })

  if (filteredPricing.length === 0) {
    warnings.push(
      'No pricing entries matched the selected provider capabilities (provider, GPU, region, interconnect, GPU count, and pricing tier).',
    )
  }

  const entries: CostComparisonEntry[] = filteredPricing.map((pricingEntry) => {
    const estimatedHours = deriveEntryHours(params, training, pricingEntry)
    const onDemandCost = costFromHourlyRate(pricingEntry.hourly_price_cents, estimatedHours, runs)
    const spotCost = costFromHourlyRate(pricingEntry.spot_price_cents, estimatedHours, runs)
    const reserved1moCost = costFromHourlyRate(
      pricingEntry.reserved_1mo_price_cents,
      estimatedHours,
      runs,
    )
    const reserved3moCost = costFromHourlyRate(
      pricingEntry.reserved_3mo_price_cents,
      estimatedHours,
      runs,
    )
    const selectedTierCost = pickSelectedTierCost(
      selectedTier,
      onDemandCost,
      spotCost,
      reserved1moCost,
      reserved3moCost,
    )

    if (selectedTierCost === null) {
      warnings.push(`${pricingEntry.provider}/${pricingEntry.cloud_instance_type} has no ${selectedTier} price.`)
    }

    if (!Number.isFinite(estimatedHours)) {
      warnings.push(
        `Could not derive training hours for GPU ${pricingEntry.gpu}; costs may be incomplete for ${pricingEntry.provider}.`,
      )
    }

    const vramTotal = asNonNegative(pricingEntry.vram_per_gpu_in_gb) * Math.max(1, pricingEntry.num_gpus)
    const availabilityByRegion =
      pricingEntry.availability.length === 0
        ? pricingEntry.available
        : pricingEntry.availability.some((entry) => entry.available)

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
      total_cost_dollars: selectedTierCost ?? onDemandCost ?? 0,
      spot_cost_dollars: spotCost,
      reserved_1mo_cost_dollars: reserved1moCost,
      reserved_3mo_cost_dollars: reserved3moCost,
      available: pricingEntry.available && availabilityByRegion,
      fits_in_vram: asNonNegative(pricingEntry.vram_per_gpu_in_gb) >= minRequiredVRAM,
      source: pricingEntry.source,
    }
  })

  entries.sort((a, b) => {
    if (a.fits_in_vram !== b.fits_in_vram) {
      return a.fits_in_vram ? -1 : 1
    }
    if (a.total_cost_dollars !== b.total_cost_dollars) {
      return a.total_cost_dollars - b.total_cost_dollars
    }
    return a.estimated_hours - b.estimated_hours
  })

  intermediates.selected_pricing_tier_rank = ['on_demand', 'spot', 'reserved_1mo', 'reserved_3mo'].indexOf(
    selectedTier,
  )
  intermediates.requested_num_gpus = requestedGPUCount
  intermediates.required_vram_per_gpu = minRequiredVRAM
  intermediates.num_pricing_entries = filteredPricing.length
  intermediates.num_runs = runs
  intermediates.num_fit_candidates = entries.filter((entry) => entry.fits_in_vram).length

  return {
    entries,
    intermediates,
    warnings,
  }
}
