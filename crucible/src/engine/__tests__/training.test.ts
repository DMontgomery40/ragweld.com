import { describe, expect, it } from 'vitest'
import { estimateTraining } from '../training'
import { makeEstimateRequest } from './helpers'

describe('estimateTraining', () => {
  it('computes deterministic token, step, FLOP, and hour estimates', () => {
    const result = estimateTraining(makeEstimateRequest())

    expect(result.total_tokens).toBe(30_000_000)
    expect(result.effective_batch_tokens).toBeCloseTo(31_129.6, 2)
    expect(result.total_steps).toBe(964)
    expect(result.total_flops).toBeCloseTo(1.14372e19, -14)

    expect(result.assumptions.token_utilization).toBe(0.95)
    expect(result.assumptions.lora_compute_discount).toBe(0.9)
    expect(result.assumptions.mfu).toBe(0.45)
    expect(result.assumptions.speed_multiplier).toBeCloseTo(3.96, 2)

    expect(result.estimated_hours_by_gpu.H100).toBeCloseTo(1.8, 2)
    expect(result.estimated_hours_by_gpu.A100_80G).toBeCloseTo(5.71, 2)
  })

  it('applies long-context attention penalty warning', () => {
    const result = estimateTraining(
      makeEstimateRequest({
        max_seq_length: 65536,
      }),
    )

    expect(result.assumptions.attention_penalty).toBe(2)
    expect(result.warnings.some((warning) => warning.includes('Long context'))).toBe(true)
  })

  it('falls back to dataset_rows when dataset_tokens is not provided', () => {
    const result = estimateTraining(
      makeEstimateRequest({
        dataset_tokens: 0,
        dataset_rows: 1000,
        avg_tokens_per_row: 100,
        num_epochs: 2,
      }),
    )

    expect(result.total_tokens).toBe(200_000)
    expect(result.intermediates.dataset_tokens_used).toBe(100_000)
  })

  it('keeps MoE compute conservative instead of collapsing to active-expert ratios', () => {
    const result = estimateTraining(
      makeEstimateRequest({
        model_name: 'qwen3.5-35b-a3b',
        model_params_billions: 35.95,
        architecture: 'MoE',
        moe_total_experts: 256,
        moe_active_experts: 8,
        target_gpu: ['B200'],
        num_gpus: 4,
      }),
    )

    expect(result.assumptions.moe_compute_multiplier).toBe(1)
    expect(
      result.warnings.some((warning) =>
        warning.includes('MoE compute kept conservative (no active-expert discount)'),
      ),
    ).toBe(true)
    expect(
      result.warnings.some((warning) => warning.includes('MoE throughput capped at 1.00x peak utilization')),
    ).toBe(true)
    expect(result.estimated_hours_by_gpu.B200).toBeGreaterThan(0.15)
  })
})
