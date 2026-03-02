import { useMemo } from 'react'
import type { CostComparisonEntry, ProviderPricing } from '../types'

interface GPUAvailabilityProps {
  pricing: ProviderPricing[]
  comparisons: CostComparisonEntry[]
}

interface AvailabilitySummary {
  gpu: string
  totalListings: number
  availableListings: number
  fitCount: number
  comparisonCount: number
}

function percentage(numerator: number, denominator: number): number {
  if (denominator === 0) {
    return 0
  }

  return (numerator / denominator) * 100
}

export function GPUAvailability({ pricing, comparisons }: GPUAvailabilityProps) {
  const summaries = useMemo(() => {
    const byGpu = new Map<string, AvailabilitySummary>()

    for (const entry of pricing) {
      const gpu = String(entry.gpu)
      const current = byGpu.get(gpu) ?? {
        gpu,
        totalListings: 0,
        availableListings: 0,
        fitCount: 0,
        comparisonCount: 0,
      }

      current.totalListings += 1
      if (entry.available) {
        current.availableListings += 1
      }

      byGpu.set(gpu, current)
    }

    for (const comparison of comparisons) {
      const gpu = comparison.gpu
      const current = byGpu.get(gpu) ?? {
        gpu,
        totalListings: 0,
        availableListings: 0,
        fitCount: 0,
        comparisonCount: 0,
      }

      current.comparisonCount += 1
      if (comparison.fits_in_vram) {
        current.fitCount += 1
      }

      byGpu.set(gpu, current)
    }

    return [...byGpu.values()].sort((left, right) => {
      const leftAvailability = percentage(left.availableListings, left.totalListings)
      const rightAvailability = percentage(right.availableListings, right.totalListings)
      return rightAvailability - leftAvailability
    })
  }, [comparisons, pricing])

  return (
    <section className="card availability-card">
      <div className="section-head">
        <h3>GPU Availability</h3>
        <span className="section-meta">Live supply + fit telemetry</span>
      </div>

      {summaries.length === 0 ? (
        <p className="empty-copy">No pricing availability data returned yet.</p>
      ) : (
        <div className="availability-grid">
          {summaries.map((summary) => {
            const availabilityPct = percentage(summary.availableListings, summary.totalListings)
            const fitPct = percentage(summary.fitCount, summary.comparisonCount)
            const barClass =
              availabilityPct >= 60 ? 'bar-good' : availabilityPct >= 30 ? 'bar-medium' : 'bar-low'

            return (
              <article className="availability-item" key={summary.gpu}>
                <div className="availability-head">
                  <h4>{summary.gpu}</h4>
                  <span className="mono">{availabilityPct.toFixed(0)}% live</span>
                </div>
                <div className="availability-bar-outer">
                  <div className={`availability-bar-inner ${barClass}`} style={{ width: `${availabilityPct}%` }} />
                </div>
                <div className="availability-meta mono">
                  <span>
                    {summary.availableListings}/{summary.totalListings} listings
                  </span>
                  <span>{summary.comparisonCount > 0 ? `${fitPct.toFixed(0)}% fit` : 'fit n/a'}</span>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
