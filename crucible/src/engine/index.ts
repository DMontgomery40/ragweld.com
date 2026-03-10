import type {
  EstimateRequest,
  EstimateResponse,
  PricingFreshness,
  ProviderPricing,
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

function compareEntriesByCost(
  left: EstimateResponse['cost_comparison'][number],
  right: EstimateResponse['cost_comparison'][number],
): number {
  if (left.total_cost_dollars !== right.total_cost_dollars) {
    return left.total_cost_dollars - right.total_cost_dollars
  }
  return left.estimated_hours - right.estimated_hours
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
  const recommendedEntry =
    [...recommendedPool].sort(compareEntriesByCost)[0] ?? null

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
    support_tier: compatibility.support_tier,
    support_reasons: compatibility.support_reasons,
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
      support_tier: compatibility.support_tier,
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
