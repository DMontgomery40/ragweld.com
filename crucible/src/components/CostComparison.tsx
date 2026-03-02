import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import type { CostComparisonEntry } from '../types'

interface CostComparisonProps {
  entries: CostComparisonEntry[]
}

const integerNumberFormatter = new Intl.NumberFormat('en-US', {
  useGrouping: false,
  maximumFractionDigits: 0,
})

const decimalNumberFormatter = new Intl.NumberFormat('en-US', {
  useGrouping: false,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

interface TooltipEntryPayload {
  name?: string
  hours?: number
  cost?: number
  vram?: number
}

interface RechartsTooltipPayloadItem {
  payload?: TooltipEntryPayload
}

interface RechartsTooltipProps {
  active?: boolean
  label?: string | number
  payload?: RechartsTooltipPayloadItem[]
}

function toFiniteNumber(value: number | string): number {
  const numericValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numericValue) ? numericValue : 0
}

function formatCurrency(value: number | null): string {
  if (value === null) {
    return 'n/a'
  }

  return `$${decimalNumberFormatter.format(value)}`
}

function formatCurrencyTick(value: number | string): string {
  const numericValue = toFiniteNumber(value)
  return `$${integerNumberFormatter.format(Math.round(numericValue))}`
}

function formatHoursTick(value: number | string): string {
  const numericValue = toFiniteNumber(value)
  return `${integerNumberFormatter.format(numericValue)}h`
}

function formatHourly(cents: number): string {
  return `$${decimalNumberFormatter.format(cents / 100)}/hr`
}

function rowClass(entry: CostComparisonEntry): string {
  if (!entry.fits_in_vram) {
    return 'row-danger'
  }

  if (!entry.available) {
    return 'row-warning'
  }

  return 'row-ok'
}

function BarTooltip({ active, payload }: RechartsTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null
  }

  const first = payload[0]?.payload
  if (!first) {
    return null
  }

  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-title">{first.name}</p>
      <div className="chart-tooltip-row">
        <span className="chart-tooltip-key">Total cost</span>
        <span>{formatCurrency(toFiniteNumber(first.cost ?? 0))}</span>
      </div>
    </div>
  )
}

function ScatterTooltip({ active, payload }: RechartsTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null
  }

  const first = payload[0]?.payload
  if (!first) {
    return null
  }

  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-title">{first.name}</p>
      <div className="chart-tooltip-row">
        <span className="chart-tooltip-key">Total cost</span>
        <span>{formatCurrency(toFiniteNumber(first.cost ?? 0))}</span>
      </div>
      <div className="chart-tooltip-row">
        <span className="chart-tooltip-key">Training hours</span>
        <span>{decimalNumberFormatter.format(toFiniteNumber(first.hours ?? 0))}h</span>
      </div>
      <div className="chart-tooltip-row">
        <span className="chart-tooltip-key">VRAM</span>
        <span>{integerNumberFormatter.format(toFiniteNumber(first.vram ?? 0))}</span>
      </div>
    </div>
  )
}

export function CostComparison({ entries }: CostComparisonProps) {
  if (entries.length === 0) {
    return (
      <section className="card chart-card">
        <div className="section-head">
          <h3>Cost Comparison</h3>
          <span className="section-meta">No provider results returned.</span>
        </div>
      </section>
    )
  }

  const sortedEntries = [...entries].sort((left, right) => left.total_cost_dollars - right.total_cost_dollars)

  const barChartData = sortedEntries.map((entry) => ({
    id: `${entry.provider}:${entry.gpu}`,
    label: `${entry.provider} ${entry.gpu}`,
    name: `${entry.provider} ${entry.gpu}`,
    totalCost: entry.total_cost_dollars,
    cost: entry.total_cost_dollars,
    fill: entry.fits_in_vram && entry.available ? '#22c55e' : '#ef4444',
  }))

  const scatterData = sortedEntries.map((entry) => ({
    name: `${entry.provider} ${entry.gpu}`,
    hours: entry.estimated_hours,
    cost: entry.total_cost_dollars,
    vram: entry.vram_total_gb,
    fill: entry.fits_in_vram && entry.available ? '#38bdf8' : '#f97316',
    }))

  const maxHours = scatterData.reduce((max, entry) => Math.max(max, entry.hours), 0)
  const maxCost = scatterData.reduce((max, entry) => Math.max(max, entry.cost), 0)

  return (
    <section className="card chart-card">
      <div className="section-head">
        <h3>Cost Comparison</h3>
        <span className="section-meta">Provider and GPU matrix</span>
      </div>

      <div className="chart-grid">
        <div className="chart-wrap cost-chart">
          <h4>Total Cost by Option</h4>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barChartData} layout="vertical" margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="#202a2f" />
              <XAxis type="number" stroke="#7d8993" tickFormatter={formatCurrencyTick} />
              <YAxis dataKey="label" type="category" width={140} stroke="#7d8993" />
              <Tooltip content={<BarTooltip />} />
              <Bar dataKey="totalCost" radius={[2, 2, 2, 2]}>
                {barChartData.map((entry) => (
                  <Cell key={entry.id} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-wrap scatter-chart">
          <h4>Time vs Cost</h4>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 28, left: 50, bottom: 18 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="#202a2f" />
              <XAxis
                type="number"
                dataKey="hours"
                name="Training hours"
                stroke="#7d8993"
                tickFormatter={formatHoursTick}
                domain={[0, Math.max(1, maxHours * 1.05)]}
              />
              <YAxis
                type="number"
                dataKey="cost"
                name="Total cost"
                stroke="#7d8993"
                width={102}
                tickFormatter={formatCurrencyTick}
                domain={[0, Math.max(1, maxCost * 1.05)]}
              />
              <ZAxis type="number" dataKey="vram" range={[80, 320]} name="VRAM" />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<ScatterTooltip />} />
              <Scatter data={scatterData} name="Options">
                {scatterData.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>GPU</th>
              <th>Instance</th>
              <th>Hourly</th>
              <th>Hours</th>
              <th>Total</th>
              <th>Spot</th>
              <th>Res 1mo</th>
              <th>Res 3mo</th>
              <th>Fit</th>
              <th>Avail</th>
            </tr>
          </thead>
          <tbody>
            {sortedEntries.map((entry) => (
              <tr key={`${entry.provider}-${entry.gpu}-${entry.cloud_instance_type}`} className={rowClass(entry)}>
                <td>{entry.provider}</td>
                <td>{`${entry.gpu} x${entry.num_gpus}`}</td>
                <td>{entry.cloud_instance_type}</td>
                <td>{formatHourly(entry.hourly_price_cents)}</td>
                <td>{decimalNumberFormatter.format(entry.estimated_hours)}h</td>
                <td>{formatCurrency(entry.total_cost_dollars)}</td>
                <td>{formatCurrency(entry.spot_cost_dollars)}</td>
                <td>{formatCurrency(entry.reserved_1mo_cost_dollars)}</td>
                <td>{formatCurrency(entry.reserved_3mo_cost_dollars)}</td>
                <td>{entry.fits_in_vram ? 'fit' : 'oom'}</td>
                <td>{entry.available ? 'up' : 'down'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
