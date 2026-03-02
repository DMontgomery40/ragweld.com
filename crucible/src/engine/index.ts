import type { EstimateRequest, EstimateResponse, ProviderPricing } from '../types/index'
import { estimateCostComparison } from './cost'
import { estimateTraining } from './training'
import { estimateVRAM } from './vram'

const COMPUTATION_VERSION = '1.0.0'

function latestFetchedAt(pricing: ProviderPricing[]): string {
  const latestTimestamp = pricing.reduce((maxTimestamp, entry) => {
    const timestamp = Date.parse(entry.fetched_at)
    if (!Number.isFinite(timestamp)) {
      return maxTimestamp
    }
    return Math.max(maxTimestamp, timestamp)
  }, 0)

  if (latestTimestamp === 0) {
    return new Date(0).toISOString()
  }
  return new Date(latestTimestamp).toISOString()
}

function dedupeWarnings(warnings: string[]): string[] {
  return Array.from(new Set(warnings))
}

export function computeEstimate(
  params: EstimateRequest,
  pricing: ProviderPricing[],
): EstimateResponse {
  const vram = estimateVRAM(params)
  const training = estimateTraining(params)
  const cost = estimateCostComparison(params, pricing, training, vram.bands_gb.typical)

  return {
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
    warnings: dedupeWarnings([...vram.warnings, ...training.warnings, ...cost.warnings]),
    meta: {
      prices_fetched_at: latestFetchedAt(pricing),
      framework_used: params.framework,
      computation_version: COMPUTATION_VERSION,
      model_name: params.model_name,
    },
  }
}

export { estimateVRAM } from './vram'
export { estimateTraining, estimateTrainingHoursForGPU } from './training'
export { estimateCostComparison } from './cost'
export { MODEL_CONFIGS, getModelConfig, resolveModuleShape } from './models'
export { GPU_SPECS, getGPUTFlops, getGPUVRAMGB, resolveGPUType } from './gpu-specs'
