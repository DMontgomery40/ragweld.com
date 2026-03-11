import type {
  EstimateRequest,
  EstimateResponse,
  PricingFreshness,
  ProviderPricing,
  SupportReason,
  SupportTier,
} from '../types/index'
import {
  applyCompatibilityGuards,
  SOURCE_LEDGER_VERSION,
} from './compatibility'
import { estimateCostComparison } from './cost'
import { estimateTraining } from './training'
import { estimateVRAM } from './vram'

const COMPUTATION_VERSION = '2.0.0'

function dedupeWarnings(warnings: string[]): string[] {
  return Array.from(new Set(warnings))
}

function supportTierRank(tier: SupportTier): number {
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

function worseSupportTier(left: SupportTier, right: SupportTier): SupportTier {
  return supportTierRank(left) >= supportTierRank(right) ? left : right
}

function dedupeSupportReasons(reasons: SupportReason[]): SupportReason[] {
  const seen = new Set<string>()
  return reasons.filter((reason) => {
    const key = `${reason.rule_id}:${reason.tier}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

export function computeEstimate(
  params: EstimateRequest,
  pricing: ProviderPricing[],
  pricingFreshness: PricingFreshness,
): EstimateResponse {
  const compatibility = applyCompatibilityGuards(params)
  const normalizedParams = compatibility.normalized
  const vram = estimateVRAM(normalizedParams, {
    supportTier: compatibility.support_tier,
  })
  const training = estimateTraining(normalizedParams, {
    supportTier: compatibility.support_tier,
  })
  const vramRange = {
    optimistic: vram.bands_gb.tight,
    typical: vram.bands_gb.typical,
    conservative: vram.bands_gb.conservative,
  }
  const cost = estimateCostComparison(
    normalizedParams,
    pricing,
    training,
    vramRange,
    pricingFreshness,
  )
  const availableCandidates = cost.entries.filter((entry) => entry.available && entry.fit_status !== 'likely_oom')
  const fitCandidates = cost.entries.filter((entry) => entry.fit_status !== 'likely_oom')
  const recommendedPool =
    availableCandidates.length > 0 ? availableCandidates : fitCandidates.length > 0 ? fitCandidates : cost.entries
  const recommendedEntry = recommendedPool[0] ?? null
  const overallSupportTier = recommendedEntry
    ? worseSupportTier(compatibility.support_tier, recommendedEntry.provider_support_tier)
    : compatibility.support_tier
  const overallSupportReasons = recommendedEntry
    ? dedupeSupportReasons([
        ...compatibility.support_reasons,
        ...recommendedEntry.provider_support_reasons,
      ])
    : compatibility.support_reasons

  return {
    vram_range_gb: vramRange,
    hours_range:
      recommendedEntry?.estimated_hours_range ?? {
        optimistic: 0,
        typical: 0,
        conservative: 0,
      },
    cost_range_dollars:
      recommendedEntry?.cost_range_dollars ?? {
        optimistic: Number.POSITIVE_INFINITY,
        typical: Number.POSITIVE_INFINITY,
        conservative: Number.POSITIVE_INFINITY,
      },
    vram_estimate_gb: vram.bands_gb.typical,
    vram_estimate_bands_gb: vram.bands_gb,
    vram_breakdown: vram.breakdown_gb,
    training_estimate: training,
    cost_comparison: cost.entries,
    math: {
      vram: vram.intermediates,
      training: training.intermediates,
      cost: cost.intermediates,
    },
    support_tier: overallSupportTier,
    support_reasons: overallSupportReasons,
    normalizations: compatibility.normalizations,
    pricing_freshness: pricingFreshness,
    source_ledger_version: SOURCE_LEDGER_VERSION,
    warnings: dedupeWarnings([
      ...compatibility.warnings,
      ...vram.warnings,
      ...training.warnings,
      ...cost.warnings,
    ]),
    meta: {
      prices_fetched_at: pricingFreshness.fetched_at,
      framework_used: normalizedParams.framework,
      workflow_mode: normalizedParams.workflow_mode,
      support_tier: overallSupportTier,
      computation_version: COMPUTATION_VERSION,
      source_ledger_version: SOURCE_LEDGER_VERSION,
      model_name: normalizedParams.model_name,
    },
  }
}

export { estimateVRAM } from './vram'
export { estimateTraining, estimateTrainingHoursForGPU } from './training'
export { estimateCostComparison } from './cost'
export { MODEL_CONFIGS, getModelConfig, resolveModuleShape } from './models'
export { GPU_SPECS, getGPUTFlops, getGPUVRAMGB, resolveGPUType } from './gpu-specs'
