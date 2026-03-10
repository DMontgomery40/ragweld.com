import { describe, expect, it } from 'vitest'
import { applyCompatibilityGuards, SOURCE_LEDGER_VERSION } from '../compatibility'
import { makeEstimateRequest } from './helpers'

describe('applyCompatibilityGuards', () => {
  it('forces QLoRA back to 4-bit planning', () => {
    const result = applyCompatibilityGuards(
      makeEstimateRequest({
        method: 'QLoRA',
        quantization_bits: 8,
        quantization_profile: 'int8',
      }),
    )

    expect(result.normalized.quantization_bits).toBe(4)
    expect(result.normalized.quantization_profile).toBe('nf4')
    expect(result.warnings.some((warning) => warning.includes('QLoRA is modeled as 4-bit'))).toBe(true)
    expect(result.normalizations.some((event) => event.field === 'quantization_bits')).toBe(true)
  })

  it('promotes 4-bit full fine-tunes to 8-bit planning', () => {
    const result = applyCompatibilityGuards(
      makeEstimateRequest({
        method: 'Full Fine-Tune',
        full_finetuning: true,
        quantization_bits: 4,
        quantization_profile: 'nf4',
      }),
    )

    expect(result.normalized.quantization_bits).toBe(8)
    expect(result.normalized.quantization_profile).toBe('int8')
    expect(
      result.warnings.some((warning) => warning.includes('4-bit full fine-tuning is not source-backed')),
    ).toBe(true)
  })

  it('downgrades guided Unsloth multi-GPU runs to custom support', () => {
    const result = applyCompatibilityGuards(
      makeEstimateRequest({
        workflow_mode: 'guided',
        framework: 'Unsloth',
        num_gpus: 4,
      }),
    )

    expect(result.support_tier).toBe('custom')
    expect(result.warnings.some((warning) => warning.includes('manual Accelerate/DeepSpeed/FSDP/DDP'))).toBe(
      true,
    )
    expect(SOURCE_LEDGER_VERSION).toBe('2026-03-05')
  })

  it('keeps guided single-GPU runs documented when no provider filter is selected', () => {
    const result = applyCompatibilityGuards(
      makeEstimateRequest({
        workflow_mode: 'guided',
        framework: 'Unsloth',
        num_gpus: 1,
        target_providers: [],
      }),
    )

    expect(result.support_tier).toBe('documented')
    expect(
      result.warnings.some((warning) => warning.includes('Specific cloud providers are not directly documented')),
    ).toBe(false)
  })
})
