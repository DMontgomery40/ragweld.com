import { describe, expect, it } from 'vitest'
import { computeEstimate } from '../index'
import { makeEstimateRequest, makePricing, makePricingFreshness } from './helpers'

describe('computeEstimate', () => {
  it('returns full estimate payload with math and meta', () => {
    const params = makeEstimateRequest()
    const result = computeEstimate(
      params,
      [
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
      ],
      makePricingFreshness({
        fetched_at: '2026-03-01T03:00:00.000Z',
      }),
    )

    expect(result.vram_estimate_gb).toBe(result.vram_estimate_bands_gb.typical)
    expect(result.vram_range_gb.typical).toBe(result.vram_estimate_bands_gb.typical)
    expect(result.hours_range.typical).toBeGreaterThan(0)
    expect(result.cost_range_dollars.typical).toBeGreaterThan(0)
    expect(result.training_estimate.total_steps).toBeGreaterThan(0)
    expect(result.cost_comparison).toHaveLength(2)
    expect(result.math.vram.model_total_params).toBe(70_600_000_000)
    expect(result.math.training.total_tokens).toBe(30_000_000)
    expect(result.math.cost.num_pricing_entries).toBe(2)
    expect(result.meta.prices_fetched_at).toBe('2026-03-01T03:00:00.000Z')
    expect(result.meta.framework_used).toBe('Unsloth')
    expect(result.meta.workflow_mode).toBe('custom_pipeline')
    expect(result.meta.support_tier).toBe('inferred')
    expect(result.meta.source_ledger_version).toBe('2026-03-05')
    expect(result.support_tier).toBe('inferred')
    expect(result.pricing_freshness.source).toBe('shadeform')
  })

  it('summarizes the cheapest viable row even when provider ranking sorts it later', () => {
    const params = makeEstimateRequest({
      target_gpu: ['H100'],
      num_gpus: 1,
      num_nodes: 1,
    })

    const result = computeEstimate(
      params,
      [
        makePricing({
          provider: 'runpod',
          source: 'shadeform',
          gpu: 'H100',
          num_gpus: 1,
          cloud_instance_type: 'H100-1x',
          hourly_price_cents: 500,
        }),
        makePricing({
          provider: 'aws',
          source: 'static',
          gpu: 'H100',
          num_gpus: 1,
          cloud_instance_type: 'p5.48xlarge',
          hourly_price_cents: 50,
        }),
      ],
      makePricingFreshness({
        source: 'shadeform+static',
      }),
    )

    const cheapestEntry = [...result.cost_comparison].sort(
      (left, right) => left.total_cost_dollars - right.total_cost_dollars,
    )[0]

    expect(result.cost_comparison[0].provider).toBe('runpod')
    expect(cheapestEntry.provider).toBe('aws')
    expect(result.cost_range_dollars.typical).toBeCloseTo(cheapestEntry.cost_range_dollars.typical, 5)
    expect(result.hours_range.typical).toBeCloseTo(cheapestEntry.estimated_hours_range.typical, 5)
  })
})
