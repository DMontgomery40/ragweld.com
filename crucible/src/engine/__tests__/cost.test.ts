import { describe, expect, it } from 'vitest'
import { estimateCostComparison } from '../cost'
import { estimateTraining } from '../training'
import { makeEstimateRequest, makePricing, makePricingFreshness } from './helpers'

const REQUIRED_VRAM_RANGE = {
  optimistic: 38,
  typical: 43,
  conservative: 48,
} as const

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
      REQUIRED_VRAM_RANGE,
      makePricingFreshness(),
    )

    const h100 = comparison.entries.find((entry) => entry.gpu === 'H100')
    const rtx4090 = comparison.entries.find((entry) => entry.gpu === 'RTX_4090')

    expect(h100).toBeDefined()
    expect(rtx4090).toBeDefined()
    expect(h100?.fit_status).toBe('likely_fit')
    expect(rtx4090?.fit_status).toBe('likely_oom')
    expect(h100?.total_cost_dollars).toBeCloseTo(18.76, 2)
    expect(h100?.provider_support_tier).toBe('inferred')
    expect(h100?.estimated_hours_range.conservative).toBeGreaterThan(h100?.estimated_hours ?? 0)
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
      REQUIRED_VRAM_RANGE,
      makePricingFreshness(),
    )

    expect(comparison.entries[0].total_cost_dollars).toBeCloseTo(7.5, 2)
  })

  it('uses the cheapest available price across selected tiers', () => {
    const params = makeEstimateRequest({
      pricing_tier: ['on_demand', 'spot'],
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
      REQUIRED_VRAM_RANGE,
      makePricingFreshness(),
    )

    expect(comparison.entries[0].total_cost_dollars).toBeCloseTo(7.5, 2)
  })

  it('keeps rows when any selected tier is available', () => {
    const params = makeEstimateRequest({
      pricing_tier: ['spot', 'reserved_1mo'],
    })
    const training = estimateTraining(params)
    const comparison = estimateCostComparison(
      params,
      [
        makePricing({
          provider: 'runpod',
          gpu: 'H100',
          cloud_instance_type: 'H100-1x',
          spot_price_cents: null,
          reserved_1mo_price_cents: 250,
        }),
      ],
      training,
      REQUIRED_VRAM_RANGE,
      makePricingFreshness(),
    )

    expect(comparison.entries).toHaveLength(1)
    expect(comparison.entries[0].total_cost_dollars).toBeGreaterThan(0)
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
      REQUIRED_VRAM_RANGE,
      makePricingFreshness(),
    )

    expect(comparison.entries).toHaveLength(1)
    expect(comparison.entries[0].cloud_instance_type).toBe('H100-1x')
    expect(comparison.entries[0].num_gpus).toBe(1)
    expect(comparison.entries[0].source).toBe('shadeform')
  })

  it('matches provider rows by GPUs per node for multi-node runs', () => {
    const params = makeEstimateRequest({
      target_gpu: ['H100'],
      pricing_tier: ['on_demand'],
      num_gpus: 8,
      num_nodes: 2,
    })
    const comparison = estimateCostComparison(
      params,
      [
        makePricing({
          provider: 'runpod',
          gpu: 'H100',
          cloud_instance_type: 'H100-4x',
          num_gpus: 4,
          vram_per_gpu_in_gb: 80,
          hourly_price_cents: 780,
        }),
        makePricing({
          provider: 'runpod',
          gpu: 'H100',
          cloud_instance_type: 'H100-8x',
          num_gpus: 8,
          vram_per_gpu_in_gb: 80,
          hourly_price_cents: 1500,
        }),
      ],
      estimateTraining(params),
      REQUIRED_VRAM_RANGE,
      makePricingFreshness(),
    )

    expect(comparison.entries).toHaveLength(1)
    expect(comparison.entries[0].cloud_instance_type).toBe('H100-4x')
    expect(comparison.entries[0].num_gpus).toBe(8)
    expect(comparison.entries[0].vram_total_gb).toBe(640)
    expect(comparison.entries[0].total_cost_dollars).toBeGreaterThan(0)
  })

  it('carries selected tier provenance when static pricing fills a live row tier', () => {
    const params = makeEstimateRequest({
      pricing_tier: ['spot'],
      target_gpu: ['H100'],
    })

    const comparison = estimateCostComparison(
      params,
      [
        makePricing({
          provider: 'aws',
          source: 'shadeform',
          gpu: 'H100',
          cloud_instance_type: 'p5.48xlarge',
          hourly_price_cents: 500,
          spot_price_cents: 250,
          spot_price_source: 'static',
          spot_price_fetched_at: '2026-02-20T00:00:00Z',
        }),
      ],
      estimateTraining(params),
      REQUIRED_VRAM_RANGE,
      makePricingFreshness({
        source: 'shadeform+static',
        fallback_reason: 'Static spot fallback',
        snapshot_updated_at: '2026-02-20T00:00:00Z',
      }),
    )

    expect(comparison.entries[0].price_source).toBe('static')
    expect(comparison.entries[0].price_fetched_at).toBe('2026-02-20T00:00:00Z')
    expect(comparison.entries[0].fallback_reason).toBe('Static spot fallback')
  })

  it('filters out selected regions that are present but unavailable', () => {
    const params = makeEstimateRequest({
      target_regions: ['us-west'],
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
          num_gpus: 1,
          availability: [{ region: 'us-west', available: false }],
          spot_price_cents: 120,
        }),
      ],
      training,
      REQUIRED_VRAM_RANGE,
      makePricingFreshness(),
    )

    expect(comparison.entries).toHaveLength(0)
  })

  it('keeps non-finite training-hour rows from appearing as zero-cost options', () => {
    const params = makeEstimateRequest({
      target_gpu: [],
      pricing_tier: ['on_demand'],
    })
    const training = estimateTraining(params)
    const comparison = estimateCostComparison(
      params,
      [
        makePricing({
          provider: 'runpod',
          gpu: 'UNKNOWN_GPU',
          cloud_instance_type: 'unknown-1x',
          hourly_price_cents: 300,
        }),
      ],
      training,
      REQUIRED_VRAM_RANGE,
      makePricingFreshness(),
    )

    expect(comparison.entries).toHaveLength(1)
    expect(comparison.entries[0].total_cost_dollars).toBe(Number.POSITIVE_INFINITY)
    expect(comparison.entries[0].cost_range_dollars.typical).toBe(Number.POSITIVE_INFINITY)
  })

  it('changes provider support posture when workflow mode changes', () => {
    const guidedParams = makeEstimateRequest({
      workflow_mode: 'guided',
      num_gpus: 4,
      target_gpu: ['H100'],
    })
    const customParams = makeEstimateRequest({
      workflow_mode: 'custom_pipeline',
      num_gpus: 4,
      target_gpu: ['H100'],
    })

    const guided = estimateCostComparison(
      guidedParams,
      [
        makePricing({
          provider: 'runpod',
          gpu: 'H100',
          num_gpus: 4,
          cloud_instance_type: 'H100-4x',
          vram_per_gpu_in_gb: 80,
        }),
      ],
      estimateTraining(guidedParams),
      REQUIRED_VRAM_RANGE,
      makePricingFreshness(),
    )

    const custom = estimateCostComparison(
      customParams,
      [
        makePricing({
          provider: 'runpod',
          gpu: 'H100',
          num_gpus: 4,
          cloud_instance_type: 'H100-4x',
          vram_per_gpu_in_gb: 80,
        }),
      ],
      estimateTraining(customParams),
      REQUIRED_VRAM_RANGE,
      makePricingFreshness(),
    )

    expect(guided.entries[0].provider_support_tier).toBe('custom')
    expect(custom.entries[0].provider_support_tier).toBe('inferred')
  })

  it('widens price ranges when pricing is stale static fallback data', () => {
    const params = makeEstimateRequest({
      pricing_tier: ['on_demand'],
      target_gpu: ['H100'],
    })
    const comparison = estimateCostComparison(
      params,
      [
        makePricing({
          provider: 'aws',
          source: 'static',
          gpu: 'H100',
          cloud_instance_type: 'p5.48xlarge',
          vram_per_gpu_in_gb: 80,
          hourly_price_cents: 5504,
        }),
      ],
      estimateTraining(params),
      REQUIRED_VRAM_RANGE,
      makePricingFreshness({
        source: 'static',
        is_stale: true,
        snapshot_updated_at: '2026-02-20T00:00:00Z',
        fallback_reason: 'Shadeform unavailable; static snapshot used.',
      }),
    )

    expect(comparison.entries[0].cost_range_dollars.conservative).toBeGreaterThan(
      comparison.entries[0].total_cost_dollars,
    )
    expect(comparison.entries[0].price_source).toBe('static')
    expect(comparison.entries[0].fallback_reason).toContain('static snapshot used')
  })

  it('ranks live pricing rows ahead of supplemental static rows when support and fit are equal', () => {
    const params = makeEstimateRequest({
      pricing_tier: ['on_demand'],
      target_gpu: ['H100'],
      num_gpus: 4,
    })
    const comparison = estimateCostComparison(
      params,
      [
        makePricing({
          provider: 'horizon',
          source: 'shadeform',
          gpu: 'H100',
          cloud_instance_type: 'H100-4x',
          num_gpus: 4,
          vram_per_gpu_in_gb: 80,
          hourly_price_cents: 780,
        }),
        makePricing({
          provider: 'gcp',
          source: 'static',
          gpu: 'H100',
          cloud_instance_type: 'a3-highgpu-4g',
          num_gpus: 4,
          vram_per_gpu_in_gb: 80,
          hourly_price_cents: 454,
        }),
      ],
      estimateTraining(params),
      REQUIRED_VRAM_RANGE,
      makePricingFreshness({
        source: 'shadeform+static',
        snapshot_updated_at: '2026-03-06T00:00:00Z',
        fallback_reason: 'Supplemental direct-cloud snapshot rows are available.',
      }),
    )

    expect(comparison.entries[0].source).toBe('shadeform')
    expect(comparison.entries[1].source).toBe('static')
  })
})
