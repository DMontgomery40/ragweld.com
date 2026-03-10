import { useMemo, useState } from 'react'
import type { EstimateResponse } from '../types'

interface MathExplainerProps {
  estimate: EstimateResponse
}

interface SectionProps {
  title: string
  values: Record<string, number>
}

function formatNumber(value: number): string {
  const absolute = Math.abs(value)

  if (absolute >= 1_000_000_000) {
    return value.toExponential(3)
  }

  if (absolute >= 1000) {
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  return value.toFixed(4)
}

function MathSection({ title, values }: SectionProps) {
  const entries = Object.entries(values).sort(([left], [right]) => left.localeCompare(right))

  if (entries.length === 0) {
    return null
  }

  return (
    <section className="math-block">
      <h4>{title}</h4>
      <div className="table-scroll">
        <table className="data-table math-table">
          <thead>
            <tr>
              <th>Term</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([key, value]) => (
              <tr key={key}>
                <td>{key}</td>
                <td className="mono">{formatNumber(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function MathExplainer({ estimate }: MathExplainerProps) {
  const [open, setOpen] = useState(false)

  const combinedWarnings = useMemo(() => {
    const warnings = [...estimate.warnings, ...estimate.training_estimate.warnings]

    if (estimate.training_estimate.assumptions.mfu < 0.3) {
      warnings.push('Low MFU assumption may inflate time estimates.')
    }

    warnings.push(...estimate.training_estimate.range_reasons)

    return warnings
  }, [estimate])

  return (
    <section className="card math-card">
      <button
        type="button"
        className="math-toggle"
        onClick={() => {
          setOpen((current) => !current)
        }}
      >
        {open ? 'Hide Math' : 'Show Math'}
      </button>

      {open && (
        <div className="math-content">
          <div className="metric-grid assumptions-grid">
            <div className="metric-row">
              <span className="metric-label">Range posture</span>
              <span className="metric-value mono">heuristic planner</span>
            </div>
            <div className="metric-row">
              <span className="metric-label">Token utilization</span>
              <span className="metric-value mono">
                {estimate.training_estimate.assumptions.token_utilization.toFixed(3)}
              </span>
            </div>
            <div className="metric-row">
              <span className="metric-label">LoRA compute discount</span>
              <span className="metric-value mono">
                {estimate.training_estimate.assumptions.lora_compute_discount.toFixed(3)}
              </span>
            </div>
            <div className="metric-row">
              <span className="metric-label">MFU</span>
              <span className="metric-value mono">
                {estimate.training_estimate.assumptions.mfu.toFixed(3)}
              </span>
            </div>
            <div className="metric-row">
              <span className="metric-label">Speed multiplier</span>
              <span className="metric-value mono">
                {estimate.training_estimate.assumptions.speed_multiplier.toFixed(3)}
              </span>
            </div>
            <div className="metric-row">
              <span className="metric-label">Attention penalty</span>
              <span className="metric-value mono">
                {estimate.training_estimate.assumptions.attention_penalty.toFixed(3)}
              </span>
            </div>
            <div className="metric-row">
              <span className="metric-label">Uncertainty score</span>
              <span className="metric-value mono">
                {(estimate.training_estimate.assumptions.uncertainty_score ?? 0).toFixed(3)}
              </span>
            </div>
          </div>

          {combinedWarnings.length > 0 && (
            <ul className="warnings-list">
              {combinedWarnings.map((warning, index) => (
                <li key={`${warning}-${index}`}>{warning}</li>
              ))}
            </ul>
          )}

          <div className="math-grid">
            <MathSection title="VRAM Intermediates" values={estimate.math.vram} />
            <MathSection title="Training Intermediates" values={estimate.math.training} />
            <MathSection title="Cost Intermediates" values={estimate.math.cost} />
            <MathSection
              title="Training Engine Intermediates"
              values={estimate.training_estimate.intermediates}
            />
          </div>
        </div>
      )}
    </section>
  )
}
