import { describe, expect, it } from 'vitest'
import { estimateCostComparison } from '../cost'
import { estimateTraining } from '../training'
import { makeEstimateRequest, makePricing } from './helpers'

describe('estimateCostComparison', () => {
  it('computes tier costs and VRAM fit flags', () => {
    const params = makeEstimateRequest({
      pricing_tier: ['on_demand'],
      target_gpu: ['H100', 'RTX_4090'],
    })
    const training = estimateTraining(params)
    const comparison = estimateCostComparison(
      params,
      [
        makePricing({
          provider: 'runpod',
          gpu: 'H100',
          cloud_instance_type: 'H100-1x',
          vram_per_gpu_in_gb: 80,
          hourly_price_cents: 300,
          spot_price_cents: 100,
        }),
        makePricing({
          provider: 'vast',
          gpu: 'RTX_4090',
          cloud_instance_type: '4090-1x',
          vram_per_gpu_in_gb: 24,
          hourly_price_cents: 55,
          spot_price_cents: 45,
        }),
      ],
      training,
      43,
    )

    const h100 = comparison.entries.find((entry) => entry.gpu === 'H100')
    const rtx4090 = comparison.entries.find((entry) => entry.gpu === 'RTX_4090')

    expect(h100).toBeDefined()
    expect(rtx4090).toBeDefined()
    expect(h100?.fits_in_vram).toBe(true)
    expect(rtx4090?.fits_in_vram).toBe(false)
    expect(h100?.total_cost_dollars).toBeCloseTo(7.1385, 3)
  })

  it('uses selected spot tier when available', () => {
    const params = makeEstimateRequest({
      pricing_tier: ['spot'],
    })
    const training = estimateTraining(params)
    const comparison = estimateCostComparison(
      params,
      [
        makePricing({
          provider: 'runpod',
          gpu: 'H100',
          cloud_instance_type: 'H100-1x',
          hourly_price_cents: 300,
          spot_price_cents: 120,
        }),
      ],
      training,
      43,
    )

    expect(comparison.entries[0].total_cost_dollars).toBeCloseTo(2.8554, 3)
  })

  it('filters out rows that do not match provider capability constraints', () => {
    const params = makeEstimateRequest({
      target_providers: ['runpod'],
      target_gpu: ['H100'],
      target_regions: ['us-west'],
      target_interconnects: ['sxm'],
      target_instance_types: ['H100-1x'],
      pricing_tier: ['spot'],
      num_gpus: 1,
    })
    const training = estimateTraining(params)
    const comparison = estimateCostComparison(
      params,
      [
        makePricing({
          provider: 'runpod',
          gpu: 'H100',
          cloud_instance_type: 'H100-1x',
          interconnect: 'sxm',
          num_gpus: 1,
          spot_price_cents: 120,
          availability: [{ region: 'us-west', available: true }],
        }),
        makePricing({
          provider: 'runpod',
          gpu: 'H100',
          cloud_instance_type: 'H100-8x',
          interconnect: 'sxm',
          num_gpus: 8,
          spot_price_cents: 90,
          availability: [{ region: 'us-west', available: true }],
        }),
        makePricing({
          provider: 'runpod',
          gpu: 'H100',
          cloud_instance_type: 'H100-1x-pcie',
          interconnect: 'pcie',
          num_gpus: 1,
          spot_price_cents: 110,
          availability: [{ region: 'us-west', available: true }],
        }),
      ],
      training,
      43,
    )

    expect(comparison.entries).toHaveLength(1)
    expect(comparison.entries[0].cloud_instance_type).toBe('H100-1x')
    expect(comparison.entries[0].num_gpus).toBe(1)
    expect(comparison.entries[0].source).toBe('shadeform')
  })
})
