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

function formatCurrency(value: number | null): string {
  if (value === null) {
    return 'n/a'
  }

  return `$${value.toFixed(2)}`
}

function formatHourly(cents: number): string {
  return `$${(cents / 100).toFixed(2)}/hr`
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
    totalCost: entry.total_cost_dollars,
    fill: entry.fits_in_vram && entry.available ? '#22c55e' : '#ef4444',
  }))

  const scatterData = sortedEntries.map((entry) => ({
    name: `${entry.provider} ${entry.gpu}`,
    hours: entry.estimated_hours,
    cost: entry.total_cost_dollars,
    vram: entry.vram_total_gb,
    fill: entry.fits_in_vram && entry.available ? '#38bdf8' : '#f97316',
  }))

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
              <XAxis type="number" stroke="#7d8993" tickFormatter={(value) => `$${value.toFixed(0)}`} />
              <YAxis dataKey="label" type="category" width={140} stroke="#7d8993" />
              <Tooltip
                formatter={(value) => {
                  const numericValue =
                    typeof value === 'number' ? value : Number(value ?? 0)

                  return [`$${numericValue.toFixed(2)}`, 'Total cost']
                }}
                contentStyle={{
                  backgroundColor: '#0d1418',
                  border: '1px solid #23313a',
                  borderRadius: '6px',
                  color: '#d7e0e6',
                }}
              />
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
            <ScatterChart margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="#202a2f" />
              <XAxis
                type="number"
                dataKey="hours"
                name="Training hours"
                stroke="#7d8993"
                tickFormatter={(value) => `${value.toFixed(1)}h`}
              />
              <YAxis
                type="number"
                dataKey="cost"
                name="Total cost"
                stroke="#7d8993"
                tickFormatter={(value) => `$${value.toFixed(0)}`}
              />
              <ZAxis type="number" dataKey="vram" range={[80, 320]} name="VRAM" />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                contentStyle={{
                  backgroundColor: '#0d1418',
                  border: '1px solid #23313a',
                  borderRadius: '6px',
                  color: '#d7e0e6',
                }}
                formatter={(value, label) => {
                  const numericValue =
                    typeof value === 'number' ? value : Number(value ?? 0)
                  if (label === 'Total cost') {
                    return [`$${numericValue.toFixed(2)}`, label]
                  }

                  if (label === 'Training hours') {
                    return [`${numericValue.toFixed(2)} h`, label]
                  }

                  return [numericValue.toFixed(0), label]
                }}
              />
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
                <td>{entry.estimated_hours.toFixed(2)}h</td>
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
