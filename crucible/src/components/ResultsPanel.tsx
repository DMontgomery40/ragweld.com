import type { EstimateRequest, EstimateResponse, ProviderPricing } from '../types'
import { CostComparison } from './CostComparison'
import { GPUAvailability } from './GPUAvailability'
import { MathExplainer } from './MathExplainer'
import { ShareExport } from './ShareExport'
import { VRAMBreakdown } from './VRAMBreakdown'

interface ResultsPanelProps {
  request: EstimateRequest
  estimate: EstimateResponse | null
  estimateLoading: boolean
  estimateError: string | null
  estimateRequestedAt: string | null
  pricing: ProviderPricing[]
  pricingLoading: boolean
  pricingError: string | null
  queryString: string
  onRetryEstimate: () => void
}

function formatDate(value: string | null): string {
  if (!value) {
    return 'n/a'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString()
}

function formatHours(value: number): string {
  return `${value.toFixed(2)}h`
}

export function ResultsPanel({
  request,
  estimate,
  estimateLoading,
  estimateError,
  estimateRequestedAt,
  pricing,
  pricingLoading,
  pricingError,
  queryString,
  onRetryEstimate,
}: ResultsPanelProps) {
  const bestOption =
    estimate?.cost_comparison
      .filter((entry) => entry.fits_in_vram)
      .sort((left, right) => left.total_cost_dollars - right.total_cost_dollars)[0] ?? null

  return (
    <section className="results-panel">
      <div className="card results-head">
        <div className="section-head">
          <h2>Results</h2>
          <span className="section-meta">Live from `/crucible/api/v1/estimate`</span>
        </div>

        <div className="status-row">
          <span className={`status-pill ${estimateLoading ? 'status-loading' : 'status-idle'}`}>
            {estimateLoading ? 'Recomputing' : 'Stable'}
          </span>
          <span className={`status-pill ${pricingLoading ? 'status-loading' : 'status-idle'}`}>
            {pricingLoading ? 'Refreshing prices' : 'Prices cached'}
          </span>
          <span className="status-pill status-neutral">Requested {formatDate(estimateRequestedAt)}</span>
          <button type="button" className="ghost-button" onClick={onRetryEstimate}>
            Force Recompute
          </button>
        </div>

        {estimateError && <p className="error-banner">Estimate error: {estimateError}</p>}
        {pricingError && <p className="error-banner">Pricing error: {pricingError}</p>}
      </div>

      {estimate ? (
        <>
          <div className="summary-grid">
            <article className="card summary-card">
              <h3>VRAM Typical</h3>
              <p className="summary-main mono">{estimate.vram_estimate_gb.toFixed(2)} GB</p>
              <p className="summary-sub mono">
                Tight {estimate.vram_estimate_bands_gb.tight.toFixed(2)} | Conservative{' '}
                {estimate.vram_estimate_bands_gb.conservative.toFixed(2)}
              </p>
            </article>

            <article className="card summary-card">
              <h3>Training Scale</h3>
              <p className="summary-main mono">{estimate.training_estimate.total_steps.toLocaleString()} steps</p>
              <p className="summary-sub mono">
                {estimate.training_estimate.total_tokens.toLocaleString()} tokens
              </p>
            </article>

            <article className="card summary-card">
              <h3>Best Fit Option</h3>
              {bestOption ? (
                <>
                  <p className="summary-main mono">${bestOption.total_cost_dollars.toFixed(2)}</p>
                  <p className="summary-sub">
                    {bestOption.provider} {bestOption.gpu} in {formatHours(bestOption.estimated_hours)}
                  </p>
                </>
              ) : (
                <p className="summary-sub">No cost entry fits requested VRAM profile.</p>
              )}
            </article>

            <article className="card summary-card">
              <h3>Meta</h3>
              <p className="summary-sub mono">Model: {estimate.meta.model_name}</p>
              <p className="summary-sub mono">Framework: {estimate.meta.framework_used}</p>
              <p className="summary-sub mono">Prices: {formatDate(estimate.meta.prices_fetched_at)}</p>
            </article>
          </div>

          {(estimate.warnings.length > 0 || estimate.training_estimate.warnings.length > 0) && (
            <div className="card warning-card">
              <h3>Warnings</h3>
              <ul className="warnings-list">
                {[...estimate.warnings, ...estimate.training_estimate.warnings].map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          <VRAMBreakdown bands={estimate.vram_estimate_bands_gb} breakdown={estimate.vram_breakdown} />
          <CostComparison entries={estimate.cost_comparison} />
          <GPUAvailability pricing={pricing} comparisons={estimate.cost_comparison} />
          <MathExplainer estimate={estimate} />
          <ShareExport request={request} estimate={estimate} queryString={queryString} />
        </>
      ) : (
        <div className="card empty-state">
          <h3>No estimate yet</h3>
          <p>
            Adjust any parameter on the left panel. Crucible posts to `/crucible/api/v1/estimate` after a
            300ms debounce and streams results here.
          </p>
          <GPUAvailability pricing={pricing} comparisons={[]} />
          <ShareExport request={request} estimate={null} queryString={queryString} />
        </div>
      )}
    </section>
  )
}
