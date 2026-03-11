import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  appendNonDuplicatePricingRows,
  enrichShadeformPricingWithStatic,
  normalizeStaticPricing,
} from '../../../../netlify/functions/crucible-shared'
import type { ProviderPricing } from '../../types'

function loadStaticPricingFixture(): unknown {
  const fixturePath = path.resolve(process.cwd(), 'data/static-pricing.json')
  return JSON.parse(readFileSync(fixturePath, 'utf8'))
}

describe('pricing catalog composition', () => {
  it('normalizes direct-cloud snapshot rows with region metadata and coreweave tiers', () => {
    const rows = normalizeStaticPricing(loadStaticPricingFixture())

    const providers = new Set(rows.map((row) => row.provider))
    expect(providers.has('aws')).toBe(true)
    expect(providers.has('azure')).toBe(true)
    expect(providers.has('gcp')).toBe(true)
    expect(providers.has('coreweave')).toBe(true)

    const awsH100 = rows.find((row) => row.provider === 'aws' && row.cloud_instance_type === 'p5.48xlarge')
    expect(awsH100?.availability).toEqual([{ region: 'us-east-1', available: true }])

    const gcpA100 = rows.find((row) => row.provider === 'gcp' && row.cloud_instance_type === 'a2-ultragpu-4g')
    expect(gcpA100?.hourly_price_cents).toBe(440)

    const gcpH100 = rows.find((row) => row.provider === 'gcp' && row.cloud_instance_type === 'a3-highgpu-4g')
    expect(gcpH100?.hourly_price_cents).toBe(500)

    const coreweaveH100 = rows.find(
      (row) => row.provider === 'coreweave' && row.cloud_instance_type === 'gd-8xh100ib-i128',
    )
    expect(coreweaveH100).toBeDefined()
    expect(coreweaveH100?.spot_price_cents).toBeGreaterThan(0)
    expect(coreweaveH100?.reserved_1mo_price_cents).toBeGreaterThan(0)
    expect(coreweaveH100?.reserved_3mo_price_cents).toBeGreaterThan(0)
    expect(coreweaveH100?.availability).toEqual([{ region: 'any', available: true }])
  })

  it('appends non-duplicate static rows while keeping the live row for duplicates', () => {
    const shadeformRows: ProviderPricing[] = [
      {
        provider: 'aws',
        source: 'shadeform',
        cloud_instance_type: 'p5.48xlarge',
        gpu: 'H100',
        num_gpus: 8,
        vram_per_gpu_in_gb: 80,
        hourly_price_cents: 5504,
        spot_price_cents: null,
        reserved_1mo_price_cents: null,
        reserved_3mo_price_cents: null,
        availability: [{ region: 'us-east-1', available: true }],
        available: true,
        fetched_at: '2026-03-06T00:00:00.000Z',
      },
    ]

    const staticRows: ProviderPricing[] = [
      {
        provider: 'aws',
        source: 'static',
        cloud_instance_type: 'p5.48xlarge',
        gpu: 'H100',
        num_gpus: 8,
        vram_per_gpu_in_gb: 80,
        hourly_price_cents: 5504,
        spot_price_cents: 3041,
        reserved_1mo_price_cents: 4954,
        reserved_3mo_price_cents: 2378,
        availability: [{ region: 'us-east-1', available: true }],
        available: true,
        fetched_at: '2026-03-06T00:00:00.000Z',
      },
      {
        provider: 'coreweave',
        source: 'static',
        cloud_instance_type: 'gd-8xh100ib-i128',
        gpu: 'H100',
        num_gpus: 8,
        vram_per_gpu_in_gb: 80,
        hourly_price_cents: 4924,
        spot_price_cents: 1970,
        reserved_1mo_price_cents: 4432,
        reserved_3mo_price_cents: 3841,
        availability: [{ region: 'any', available: true }],
        available: true,
        fetched_at: '2026-03-06T00:00:00.000Z',
      },
    ]

    const merged = appendNonDuplicatePricingRows(shadeformRows, staticRows)

    expect(merged.pricing).toHaveLength(2)
    expect(merged.rowsAdded).toBe(1)
    expect(merged.providersAdded).toEqual(['coreweave'])
    expect(merged.pricing[0].source).toBe('shadeform')
    expect(merged.pricing[1].provider).toBe('coreweave')
  })

  it('marks static-enriched tier prices with static provenance', () => {
    const enriched = enrichShadeformPricingWithStatic(
      [
        {
          provider: 'aws',
          source: 'shadeform',
          cloud_instance_type: 'p5.48xlarge',
          gpu: 'H100',
          num_gpus: 8,
          vram_per_gpu_in_gb: 80,
          hourly_price_cents: 5504,
          hourly_price_source: 'shadeform',
          hourly_price_fetched_at: '2026-03-06T12:00:00.000Z',
          spot_price_cents: null,
          reserved_1mo_price_cents: null,
          reserved_3mo_price_cents: null,
          availability: [{ region: 'us-east-1', available: true }],
          available: true,
          fetched_at: '2026-03-06T12:00:00.000Z',
        },
      ],
      [
        {
          provider: 'aws',
          source: 'static',
          cloud_instance_type: 'p5.48xlarge',
          gpu: 'H100',
          num_gpus: 8,
          vram_per_gpu_in_gb: 80,
          hourly_price_cents: 5504,
          hourly_price_source: 'static',
          hourly_price_fetched_at: '2026-03-01T00:00:00.000Z',
          spot_price_cents: 3041,
          spot_price_source: 'static',
          spot_price_fetched_at: '2026-03-01T00:00:00.000Z',
          reserved_1mo_price_cents: 4954,
          reserved_1mo_price_source: 'static',
          reserved_1mo_price_fetched_at: '2026-03-01T00:00:00.000Z',
          reserved_3mo_price_cents: 2378,
          reserved_3mo_price_source: 'static',
          reserved_3mo_price_fetched_at: '2026-03-01T00:00:00.000Z',
          availability: [{ region: 'us-east-1', available: true }],
          available: true,
          fetched_at: '2026-03-01T00:00:00.000Z',
        },
      ],
    )

    expect(enriched.pricing[0].source).toBe('shadeform')
    expect(enriched.pricing[0].spot_price_source).toBe('static')
    expect(enriched.pricing[0].spot_price_fetched_at).toBe('2026-03-01T00:00:00.000Z')
  })
})
