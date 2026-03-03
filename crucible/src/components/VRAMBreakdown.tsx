import type { VRAMBreakdown as VRAMBreakdownValues, VRAMEstimateBands } from '../types'

interface VRAMBreakdownProps {
  bands: VRAMEstimateBands
  breakdown: VRAMBreakdownValues
}

interface SegmentConfig {
  key: keyof VRAMBreakdownValues
  label: string
  color: string
}

const SEGMENTS: SegmentConfig[] = [
  { key: 'model_weights', label: 'Weights', color: '#f59f2a' },
  { key: 'quant_metadata', label: 'Quant metadata', color: '#f97316' },
  { key: 'lora_adapters', label: 'LoRA adapters', color: '#eab308' },
  { key: 'optimizer_states', label: 'Optimizer', color: '#22c55e' },
  { key: 'gradients', label: 'Gradients', color: '#38bdf8' },
  { key: 'activations', label: 'Activations', color: '#0891b2' },
  { key: 'rl_logits', label: 'RL logits', color: '#a855f7' },
  { key: 'kv_cache', label: 'KV cache', color: '#6366f1' },
  {
    key: 'non_weight_after_framework',
    label: 'Framework overhead',
    color: '#64748b',
  },
  { key: 'buffer', label: 'Buffer', color: '#ef4444' },
]

function formatGB(value: number): string {
  return `${value.toFixed(2)} GB`
}

export function VRAMBreakdown({ bands, breakdown }: VRAMBreakdownProps) {
  const total = SEGMENTS.reduce((sum, seg) => sum + breakdown[seg.key], 0)

  return (
    <section className="card chart-card">
      <div className="section-head">
        <h3>VRAM Breakdown</h3>
        <span className="section-meta">
          Tight {bands.tight.toFixed(1)} | Typical {bands.typical.toFixed(1)} | Conservative{' '}
          {bands.conservative.toFixed(1)} GB
        </span>
      </div>

      <div className="vram-bar-container">
        {SEGMENTS.map((segment) => {
          const value = breakdown[segment.key]
          if (value <= 0) return null
          const pct = total > 0 ? (value / total) * 100 : 0
          return (
            <div
              key={segment.key}
              className="vram-bar-segment"
              style={{ width: `${pct}%`, backgroundColor: segment.color }}
            >
              <div className="vram-bar-tooltip">
                <div className="vram-bar-tooltip-title">{segment.label}</div>
                <div>{formatGB(value)} ({pct.toFixed(1)}%)</div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="metric-grid">
        {SEGMENTS.map((segment) => (
          <div key={segment.key} className="metric-row">
            <span className="metric-label">
              <span className="metric-color-dot" style={{ backgroundColor: segment.color }} />
              {segment.label}
            </span>
            <span className="metric-value">{formatGB(breakdown[segment.key])}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
