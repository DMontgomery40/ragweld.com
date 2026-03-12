import type { EstimateRequest, EstimateResponse, ProviderPricing, Range3 } from '../types'
import { CostComparison } from './CostComparison'
import { GPUAvailability } from './GPUAvailability'
import { MathExplainer } from './MathExplainer'
import { ShareExport } from './ShareExport'
import { VRAMBreakdown } from './VRAMBreakdown'

interface ResultsPanelProps {
  request: EstimateRequest
  estimate: EstimateResponse | null
  estimateIsCurrent: boolean
  estimateLoading: boolean
  estimateError: string | null
  estimateRequestedAt: string | null
  pricing: ProviderPricing[]
  pricingLoading: boolean
  pricingError: string | null
  queryString: string
  onRetryEstimate: () => void
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return 'n/a'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString('en-US')
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(value))
}

function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) {
    return 'n/a'
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatRange(range: Range3, formatter: (value: number) => string): string {
  return `${formatter(range.optimistic)} - ${formatter(range.conservative)}`
}

function formatHoursRange(range: Range3): string {
  return formatRange(range, (value) => `${value.toFixed(2)}h`)
}

function formatGBRange(range: Range3): string {
  return formatRange(range, (value) => `${value.toFixed(2)} GB`)
}

function supportTierLabel(tier: EstimateResponse['support_tier']): string {
  switch (tier) {
    case 'documented':
      return 'Documented'
    case 'inferred':
      return 'Inferred'
    case 'custom':
    default:
      return 'Custom'
  }
}

function supportTierClass(tier: EstimateResponse['support_tier']): string {
  switch (tier) {
    case 'documented':
      return 'support-chip-documented'
    case 'inferred':
      return 'support-chip-inferred'
    case 'custom':
    default:
      return 'support-chip-custom'
  }
}

function modelSourceLabel(source: NonNullable<EstimateResponse['meta']['model_source']>): string {
  switch (source) {
    case 'catalog':
      return 'Crucible catalog'
    case 'huggingface':
      return 'Hugging Face'
    case 'fallback':
      return 'Fallback'
    default:
      return source
  }
}

const FIELD_LABELS: Record<string, string> = {
  architecture: 'Architecture',
  full_finetuning: 'Full finetuning',
  method: 'Method',
  model_hidden_size: 'hidden size',
  model_hf_repo_id: 'Repo id',
  model_intermediate_size: 'intermediate size',
  model_max_position_embeddings: 'max position',
  model_module_shapes: 'module shapes',
  model_name: 'Model identity',
  model_num_attention_heads: 'attention heads',
  model_num_kv_heads: 'KV heads',
  model_num_layers: 'layers',
  model_vocab_size: 'vocab size',
  quantization_bits: 'Quantization',
  quantization_profile: 'Quantization profile',
  qat_scheme: 'QAT scheme',
  use_qat: 'QAT',
}

const STRUCTURAL_MODEL_FIELDS = [
  'model_hidden_size',
  'model_num_layers',
  'model_num_attention_heads',
  'model_num_kv_heads',
  'model_intermediate_size',
  'model_vocab_size',
  'model_max_position_embeddings',
  'model_module_shapes',
] as const

const IMPORTANT_NORMALIZATION_FIELDS = [
  'method',
  'quantization_bits',
  'quantization_profile',
  'use_qat',
  'qat_scheme',
  'architecture',
  'full_finetuning',
] as const

function formatUnknownValue(value: unknown): string {
  if (value == null) {
    return 'none'
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (typeof value === 'string') {
    return value.length > 0 ? value : 'empty'
  }
  return '[object]'
}

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field.replaceAll('_', ' ')
}

interface NormalizationSummaryItem {
  id: string
  label: string
  body: string
}

function summarizeNormalizations(
  events: EstimateResponse['normalizations'],
): {
  summary: NormalizationSummaryItem[]
} {
  const summary: NormalizationSummaryItem[] = []
  const seen = new Set<string>()

  const identityEvents = events.filter((event) => event.field === 'model_name' || event.field === 'model_hf_repo_id')
  if (identityEvents.length > 0) {
    const target =
      identityEvents.find((event) => event.field === 'model_hf_repo_id')?.normalized_to ??
      identityEvents[0]?.normalized_to
    summary.push({
      id: 'model_identity',
      label: 'Model identity',
      body: `Resolved to ${formatUnknownValue(target)}.`,
    })
    seen.add('model_name')
    seen.add('model_hf_repo_id')
  }

  const structuralEvents = events.filter((event) =>
    STRUCTURAL_MODEL_FIELDS.includes(event.field as (typeof STRUCTURAL_MODEL_FIELDS)[number]),
  )
  if (structuralEvents.length > 0) {
    summary.push({
      id: 'model_structure',
      label: 'Structural model fields',
      body: `Auto-resolved ${structuralEvents.length} fields from the model catalog: ${structuralEvents
        .map((event) => fieldLabel(event.field))
        .join(', ')}.`,
    })
    for (const event of structuralEvents) {
      seen.add(event.field)
    }
  }

  for (const field of IMPORTANT_NORMALIZATION_FIELDS) {
    const event = events.find((candidate) => candidate.field === field)
    if (!event || seen.has(field)) {
      continue
    }
    summary.push({
      id: field,
      label: fieldLabel(field),
      body: `${formatUnknownValue(event.input)} -> ${formatUnknownValue(event.normalized_to)}. ${event.reason}`,
    })
    seen.add(field)
  }

  return {
    summary,
  }
}

export function ResultsPanel({
  request,
  estimate,
  estimateIsCurrent,
  estimateLoading,
  estimateError,
  estimateRequestedAt,
  pricing,
  pricingLoading,
  pricingError,
  queryString,
  onRetryEstimate,
}: ResultsPanelProps) {
  const recommendedOption = estimate
    ? (() => {
        const availableCandidates = estimate.cost_comparison.filter(
          (entry) => entry.available && entry.fit_status !== 'likely_oom',
        )
        const fitCandidates = estimate.cost_comparison.filter((entry) => entry.fit_status !== 'likely_oom')
        const recommendedPool =
          availableCandidates.length > 0
            ? availableCandidates
            : fitCandidates.length > 0
              ? fitCandidates
              : estimate.cost_comparison
        return recommendedPool[0] ?? null
      })()
    : null
  const plannerWarnings = estimate
    ? Array.from(new Set([...estimate.warnings, ...estimate.training_estimate.warnings]))
    : []
  const normalizationSummary = estimate ? summarizeNormalizations(estimate.normalizations) : null

  return (
    <section className="results-panel">
      <div className="card results-head">
        <div className="section-head">
          <h2>Results</h2>
          <span className="section-meta">Live from `/crucible/api/v1/estimate`</span>
        </div>

        <div className="status-row">
          <span className={`status-pill ${estimateLoading ? 'status-loading' : 'status-idle'}`}>
            {estimateLoading ? 'Recomputing' : 'Estimate ready'}
          </span>
          <span className={`status-pill ${pricingLoading ? 'status-loading' : 'status-idle'}`}>
            {pricingLoading ? 'Refreshing prices' : 'Pricing loaded'}
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
              <h3>VRAM Range</h3>
              <p className="summary-main mono">{formatGBRange(estimate.vram_range_gb)}</p>
              <p className="summary-sub mono">Typical {estimate.vram_range_gb.typical.toFixed(2)} GB</p>
            </article>

            <article className="card summary-card">
              <h3>Hours Range</h3>
              <p className="summary-main mono">{formatHoursRange(estimate.hours_range)}</p>
              <p className="summary-sub mono">{formatInteger(estimate.training_estimate.total_steps)} steps planned</p>
            </article>

            <article className="card summary-card">
              <h3>Cost Range</h3>
              <p className="summary-main mono">{formatRange(estimate.cost_range_dollars, formatCurrency)}</p>
              {recommendedOption ? (
                <p className="summary-sub">
                  Recommended row: {recommendedOption.provider} {recommendedOption.gpu} x{recommendedOption.num_gpus}
                </p>
              ) : (
                <p className="summary-sub">No provider row survived the current filters.</p>
              )}
            </article>

            <article className="card summary-card">
              <h3>Support & Freshness</h3>
              <p className="summary-sub">
                <span className={`support-chip ${supportTierClass(estimate.support_tier)}`}>
                  {supportTierLabel(estimate.support_tier)}
                </span>
              </p>
              <p className="summary-sub mono">Pricing fetched {formatDate(estimate.pricing_freshness.fetched_at)}</p>
              <p className="summary-sub mono">
                {estimate.pricing_freshness.is_stale ? 'Pricing is stale' : 'Pricing is within freshness window'}
              </p>
              {estimate.pricing_freshness.fallback_reason ? (
                <p className="summary-sub">{estimate.pricing_freshness.fallback_reason}</p>
              ) : null}
            </article>
          </div>

          <div className="card support-card">
            <div className="section-head">
              <h3>Planner Framing</h3>
              <span className="section-meta">Why this run is classified the way it is</span>
            </div>
            <p className="summary-sub">
              This is an operator planning tool with visible assumptions and ranges, not a benchmark database.
            </p>
            {estimate.support_reasons.length > 0 ? (
              <ul className="warnings-list compact-list">
                {estimate.support_reasons.map((reason) => (
                  <li key={`${reason.rule_id}:${reason.tier}`}>
                    <strong>{supportTierLabel(reason.tier)}:</strong> {reason.reason}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {estimate.model_resolution ? (
            <div className="card support-card">
              <div className="section-head">
                <h3>Model Resolution</h3>
                <span className="section-meta">Effective model structure used for this estimate</span>
              </div>
              <p className="summary-sub">
                <strong>{estimate.model_resolution.model.display_name}</strong>
                {' · '}
                {estimate.meta.model_source ? modelSourceLabel(estimate.meta.model_source) : estimate.model_resolution.strategy}
              </p>
              <p className="summary-sub mono">
                Repo {estimate.model_resolution.model.hf_repo_id} · total {estimate.model_resolution.model.params_billions}B
                {typeof estimate.model_resolution.model.active_params_billions === 'number'
                  ? ` · active ${estimate.model_resolution.model.active_params_billions}B / token`
                  : ''}
              </p>
              <p className="summary-sub mono">
                {estimate.model_resolution.model.num_layers} layers · hidden {estimate.model_resolution.model.hidden_size}
                {' · '}
                {estimate.model_resolution.model.moe_total_experts
                  ? `${estimate.model_resolution.model.moe_total_experts} experts / ${estimate.model_resolution.model.moe_active_experts ?? '?'} active`
                  : 'dense'}
              </p>
              {estimate.model_resolution.model.field_provenance && estimate.model_resolution.model.field_provenance.length > 0 ? (
                <details className="results-disclosure">
                  <summary className="results-disclosure-summary">
                    <span className="results-disclosure-title">Field provenance</span>
                    <span className="results-disclosure-copy">
                      {estimate.model_resolution.model.field_provenance.length} resolved field
                      {estimate.model_resolution.model.field_provenance.length === 1 ? '' : 's'}
                    </span>
                  </summary>
                  <ul className="warnings-list compact-list">
                    {estimate.model_resolution.model.field_provenance.map((entry) => (
                      <li key={`${entry.field}:${entry.source}`}>
                        <strong>{entry.field}</strong>: {entry.source.replaceAll('_', ' ')}
                        {entry.source_ref ? ` (${entry.source_ref})` : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ) : null}

          {estimate.normalizations.length > 0 ? (
            <div className="card warning-card">
              <div className="section-head">
                <h3>Normalized Inputs</h3>
                <span className="section-meta">
                  {estimate.normalizations.length} automatic adjustment
                  {estimate.normalizations.length === 1 ? '' : 's'}
                </span>
              </div>
              {normalizationSummary && normalizationSummary.summary.length > 0 ? (
                <ul className="warnings-list compact-list">
                  {normalizationSummary.summary.map((item) => (
                    <li key={item.id}>
                      <strong>{item.label}</strong>: {item.body}
                    </li>
                  ))}
                </ul>
              ) : null}
              <details className="results-disclosure">
                <summary className="results-disclosure-summary">
                  <span className="results-disclosure-title">Show full normalized field list</span>
                  <span className="results-disclosure-copy">Opens the original field-by-field normalization log.</span>
                </summary>
                <ul className="warnings-list compact-list">
                  {estimate.normalizations.map((event) => (
                    <li key={`${event.rule_id}:${event.field}`}>
                      <strong>{event.field}</strong>: {formatUnknownValue(event.input)} to{' '}
                      {formatUnknownValue(event.normalized_to)}. {event.reason}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ) : null}

          {plannerWarnings.length > 0 && (
            <div className="card warning-card">
              <h3>Planner Warnings</h3>
              <ul className="warnings-list">
                {plannerWarnings.map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          <VRAMBreakdown bands={estimate.vram_estimate_bands_gb} breakdown={estimate.vram_breakdown} />
          <CostComparison entries={estimate.cost_comparison} pricingTiers={request.pricing_tier} request={request} />
          <GPUAvailability pricing={pricing} comparisons={estimate.cost_comparison} />
          <MathExplainer estimate={estimate} />
          <ShareExport
            request={request}
            estimate={estimate}
            estimateIsCurrent={estimateIsCurrent}
            queryString={queryString}
            pricing={pricing}
          />
        </>
      ) : (
        <div className="card empty-state">
          <h3>No estimate yet</h3>
          <p>
            Adjust any parameter on the left panel. Crucible posts to `/crucible/api/v1/estimate` after a
            300ms debounce and streams range-planner results here.
          </p>
          <GPUAvailability pricing={pricing} comparisons={[]} />
          <ShareExport
            request={request}
            estimate={null}
            estimateIsCurrent={false}
            queryString={queryString}
            pricing={pricing}
          />
        </div>
      )}
    </section>
  )
}
