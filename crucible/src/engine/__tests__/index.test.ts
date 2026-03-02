import { describe, expect, it } from 'vitest'
import { computeEstimate } from '../index'
import { makeEstimateRequest, makePricing } from './helpers'

describe('computeEstimate', () => {
  it('returns full estimate payload with math and meta', () => {
    const params = makeEstimateRequest()
    const result = computeEstimate(params, [
      makePricing({
        provider: 'runpod',
        gpu: 'H100',
        cloud_instance_type: 'H100-1x',
        fetched_at: '2026-03-01T00:00:00Z',
      }),
      makePricing({
        provider: 'lambda',
        gpu: 'A100_80G',
        cloud_instance_type: 'A100-1x',
        fetched_at: '2026-03-01T03:00:00Z',
      }),
    ])

    expect(result.vram_estimate_gb).toBe(result.vram_estimate_bands_gb.typical)
    expect(result.training_estimate.total_steps).toBeGreaterThan(0)
    expect(result.cost_comparison).toHaveLength(2)
    expect(result.math.vram.model_total_params).toBe(70_600_000_000)
    expect(result.math.training.total_tokens).toBe(30_000_000)
    expect(result.math.cost.num_pricing_entries).toBe(2)
    expect(result.meta.prices_fetched_at).toBe('2026-03-01T03:00:00.000Z')
    expect(result.meta.framework_used).toBe('Unsloth')
  })
})
