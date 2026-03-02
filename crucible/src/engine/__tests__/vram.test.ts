import { describe, expect, it } from 'vitest'
import { estimateVRAM } from '../vram'
import { makeEstimateRequest } from './helpers'

describe('estimateVRAM', () => {
  it('returns deterministic VRAM bands and intermediates for 70B QLoRA', () => {
    const result = estimateVRAM(makeEstimateRequest())

    expect(result.bands_gb.tight).toBeCloseTo(39.46, 1)
    expect(result.bands_gb.typical).toBeCloseTo(43.21, 1)
    expect(result.bands_gb.conservative).toBeCloseTo(46.97, 1)

    expect(result.breakdown_gb.model_weights).toBeCloseTo(32.88, 1)
    expect(result.breakdown_gb.quant_metadata).toBeCloseTo(3.29, 1)
    expect(result.intermediates.model_total_params).toBe(70_600_000_000)
    expect(result.warnings.some((warning) => warning.includes('Unsloth reference'))).toBe(false)
  })

  it('adds calibration warning when comparable Unsloth estimate differs >25%', () => {
    const result = estimateVRAM(
      makeEstimateRequest({
        model_name: 'Custom-3B',
        model_params_billions: 3,
      }),
    )

    expect(result.intermediates.unsloth_reference_vram_gb).toBe(4)
    expect(result.intermediates.unsloth_reference_diff_ratio).toBeGreaterThan(0.25)
    expect(result.warnings.some((warning) => warning.includes('Unsloth reference'))).toBe(true)
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
})
