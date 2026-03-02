import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
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
  const chartData = [
    {
      name: 'VRAM',
      ...breakdown,
    },
  ]

  return (
    <section className="card chart-card">
      <div className="section-head">
        <h3>VRAM Breakdown</h3>
        <span className="section-meta">
          Tight {bands.tight.toFixed(1)} | Typical {bands.typical.toFixed(1)} | Conservative{' '}
          {bands.conservative.toFixed(1)} GB
        </span>
      </div>

      <div className="chart-wrap vram-chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="4 4" stroke="#202a2f" />
            <XAxis hide />
            <YAxis dataKey="name" stroke="#748089" />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0d1418',
                border: '1px solid #23313a',
                borderRadius: '6px',
                color: '#d7e0e6',
              }}
              formatter={(value, name) => {
                const numericValue =
                  typeof value === 'number' ? value : Number(value ?? 0)

                return [formatGB(numericValue), name]
              }}
            />
            {SEGMENTS.map((segment) => (
              <Bar
                key={segment.key}
                dataKey={segment.key}
                name={segment.label}
                stackId="vram"
                fill={segment.color}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="metric-grid">
        {SEGMENTS.map((segment) => (
          <div key={segment.key} className="metric-row">
            <span className="metric-label">{segment.label}</span>
            <span className="metric-value">{formatGB(breakdown[segment.key])}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
