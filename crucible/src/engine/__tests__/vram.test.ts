import { describe, expect, it } from 'vitest'
import { estimateVRAM } from '../vram'
import { makeEstimateRequest } from './helpers'

describe('estimateVRAM', () => {
  it('returns deterministic VRAM bands and intermediates for 70B QLoRA', () => {
    const result = estimateVRAM(makeEstimateRequest())

    expect(result.bands_gb.tight).toBeGreaterThan(0)
    expect(result.bands_gb.typical).toBeGreaterThan(result.bands_gb.tight)
    expect(result.bands_gb.conservative).toBeGreaterThan(result.bands_gb.typical)

    expect(result.breakdown_gb.model_weights).toBeCloseTo(32.88, 1)
    expect(result.breakdown_gb.quant_metadata).toBeCloseTo(3.29, 1)
    expect(result.breakdown_gb.rl_logits).toBeCloseTo(0, 6)
    expect(result.breakdown_gb.kv_cache).toBeCloseTo(0, 6)
    const breakdownTotal = Object.values(result.breakdown_gb).reduce((sum, value) => sum + value, 0)
    expect(breakdownTotal).toBeCloseTo(result.bands_gb.typical, 6)
    expect(result.intermediates.model_total_params).toBe(70_600_000_000)
    expect(result.warnings.some((warning) => warning.includes('Unsloth reference'))).toBe(false)
  })

  it('reports calibration ratio and only warns when ratio exceeds threshold', () => {
    const result = estimateVRAM(
      makeEstimateRequest({
        model_name: 'Custom-3B',
        model_params_billions: 3,
      }),
    )

    expect(result.intermediates.unsloth_reference_vram_gb).toBe(4)
    expect(result.intermediates.unsloth_reference_diff_ratio).toBeGreaterThan(0)
    const shouldWarn = result.intermediates.unsloth_reference_diff_ratio > 0.25
    expect(result.warnings.some((warning) => warning.includes('Unsloth reference'))).toBe(shouldWarn)
  })

  it('falls back to default LoRA targets if none are provided', () => {
    const result = estimateVRAM(
      makeEstimateRequest({
        lora_target_modules: [],
      }),
    )

    expect(result.intermediates.lora_target_count).toBe(4)
    expect(result.warnings.some((warning) => warning.includes('defaulting to q/k/v/o'))).toBe(true)
  })

  it('models dynamic 4-bit profile as higher metadata overhead than NF4', () => {
    const nf4 = estimateVRAM(
      makeEstimateRequest({
        quantization_bits: 4,
        quantization_profile: 'nf4',
      }),
    )
    const dynamic4 = estimateVRAM(
      makeEstimateRequest({
        quantization_bits: 4,
        quantization_profile: 'dynamic_4bit',
      }),
    )

    expect(dynamic4.breakdown_gb.quant_metadata).toBeGreaterThan(nf4.breakdown_gb.quant_metadata)
  })

  it('normalizes incompatible quantization profile selections', () => {
    const result = estimateVRAM(
      makeEstimateRequest({
        quantization_bits: 8,
        quantization_profile: 'fp4',
      }),
    )

    expect(result.warnings.some((warning) => warning.includes('incompatible with 8-bit'))).toBe(true)
    expect(result.intermediates.quantization_profile).toBe(8)
  })
})
