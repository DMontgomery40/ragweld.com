import { useMemo, useState } from 'react'
import {
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
import type { CostComparisonEntry, EstimateRequest, PricingTier } from '../types'

interface CostComparisonProps {
  entries: CostComparisonEntry[]
  pricingTiers: PricingTier[]
  request: EstimateRequest
}

const integerNumberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
})

const decimalNumberFormatter = new Intl.NumberFormat('en-US', {
  useGrouping: true,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

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
  return `${integerNumberFormatter.format(Math.round(numericValue))}h`
}

function formatHourly(cents: number): string {
  return `$${decimalNumberFormatter.format(cents / 100)}/hr`
}

type EntryStatus = 'ready' | 'reserved' | 'down' | 'oom'

function entryStatus(entry: CostComparisonEntry, hasReservedTier: boolean): EntryStatus {
  if (!entry.fits_in_vram) return 'oom'
  if (entry.available) return 'ready'
  if (hasReservedTier) return 'reserved'
  return 'down'
}

const STATUS_COLORS: Record<EntryStatus, string> = {
  ready: '#22c55e',
  reserved: '#38bdf8',
  down: '#f59e0b',
  oom: '#6b7280',
}

const STATUS_LABELS: Record<EntryStatus, string> = {
  ready: 'Ready (fits + available)',
  reserved: 'Reserved/Spot (fits)',
  down: 'Down (fits, on-demand)',
  oom: 'Does not fit',
}

const STATUS_ORDER: EntryStatus[] = ['ready', 'reserved', 'down', 'oom']

function hasNonOnDemandTier(tiers: PricingTier[]): boolean {
  return tiers.some((t) => t === 'spot' || t === 'reserved_1mo' || t === 'reserved_3mo')
}

interface ScatterTooltipPayload {
  name?: string
  hours?: number
  cost?: number
  vram?: number
  status?: EntryStatus
}

interface RechartsScatterTooltipItem {
  payload?: ScatterTooltipPayload
}

interface RechartsScatterTooltipProps {
  active?: boolean
  payload?: RechartsScatterTooltipItem[]
}

function ScatterTooltip({ active, payload }: RechartsScatterTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const first = payload[0]?.payload
  if (!first) return null

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
        <span>{integerNumberFormatter.format(toFiniteNumber(first.vram ?? 0))} GB</span>
      </div>
    </div>
  )
}

function rowClass(status: EntryStatus): string {
  if (status === 'oom') return 'row-danger'
  if (status === 'down') return 'row-warning'
  return 'row-ok'
}

export function CostComparison({ entries, pricingTiers, request }: CostComparisonProps) {
  const [showAll, setShowAll] = useState(false)
  const [showTable, setShowTable] = useState(false)
  const [hoveredEntry, setHoveredEntry] = useState<string | null>(null)

  const nodeCount = Math.max(1, request.num_nodes)
  const gpusPerNode = Math.max(1, request.num_gpus)
  const totalGpus = nodeCount * gpusPerNode
  const runs = Math.max(1, request.num_runs)

  const reservedTier = useMemo(() => hasNonOnDemandTier(pricingTiers), [pricingTiers])

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => a.total_cost_dollars - b.total_cost_dollars)
  }, [entries])

  const entriesWithStatus = useMemo(() => {
    return sortedEntries.map((entry) => ({
      entry,
      id: `${entry.provider}:${entry.gpu}:${entry.cloud_instance_type}`,
      status: entryStatus(entry, reservedTier),
    }))
  }, [sortedEntries, reservedTier])

  const filteredEntries = useMemo(() => {
    if (showAll) return entriesWithStatus
    return entriesWithStatus.filter((e) => {
      if (e.status === 'ready') return true
      if (e.status === 'reserved') return true
      if (e.status === 'down' && reservedTier) return true
      return false
    })
  }, [entriesWithStatus, showAll, reservedTier])

  const hiddenCount = entriesWithStatus.length - filteredEntries.length

  const maxCost = useMemo(() => {
    return filteredEntries.reduce((max, e) => Math.max(max, e.entry.total_cost_dollars), 0)
  }, [filteredEntries])

  const scatterData = useMemo(() => {
    return filteredEntries.map((e) => ({
      id: e.id,
      name: `${e.entry.provider} ${e.entry.gpu}`,
      hours: e.entry.estimated_hours,
      cost: e.entry.total_cost_dollars,
      vram: e.entry.vram_total_gb,
      status: e.status,
      fill: STATUS_COLORS[e.status],
    }))
  }, [filteredEntries])

  const maxHours = scatterData.reduce((max, e) => Math.max(max, e.hours), 0)
  const maxScatterCost = scatterData.reduce((max, e) => Math.max(max, e.cost), 0)

  // Group entries by status for table view
  const groupedEntries = useMemo(() => {
    const groups: Record<EntryStatus, typeof filteredEntries> = {
      ready: [],
      reserved: [],
      down: [],
      oom: [],
    }
    for (const e of filteredEntries) {
      groups[e.status].push(e)
    }
    return STATUS_ORDER.filter((s) => groups[s].length > 0).map((s) => ({
      status: s,
      entries: groups[s],
    }))
  }, [filteredEntries])

  // Active color legend entries
  const activeStatuses = useMemo(() => {
    const set = new Set(filteredEntries.map((e) => e.status))
    return STATUS_ORDER.filter((s) => set.has(s))
  }, [filteredEntries])

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

  return (
    <section className="card chart-card">
      <div className="section-head">
        <h3>Cost Comparison</h3>
        <span className="section-meta">
          {filteredEntries.length} option{filteredEntries.length !== 1 ? 's' : ''}
          {hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ''}
        </span>
      </div>

      <p className="mono" style={{ marginTop: 0 }}>
        Assumes {nodeCount} node(s) × {gpusPerNode} GPU/node ({totalGpus} GPUs total); costs include all nodes and {runs} run(s).
        Hourly rates shown are per node.
      </p>

      <div className="cost-filter-bar">
        <div className="cost-color-legend">
          {activeStatuses.map((status) => (
            <span key={status} className="cost-color-legend-item">
              <span className="cost-color-swatch" style={{ backgroundColor: STATUS_COLORS[status] }} />
              {STATUS_LABELS[status]}
            </span>
          ))}
        </div>
        {hiddenCount > 0 && (
          <button
            type="button"
            className="cost-filter-toggle"
            onClick={() => setShowAll((prev) => !prev)}
          >
            {showAll ? `Showing all ${entriesWithStatus.length}` : `Show all ${entriesWithStatus.length} providers`}
          </button>
        )}
      </div>

      {/* Hero bar chart */}
      <div className="cost-hero-bar-chart">
        {filteredEntries.map((e) => {
          const pct = maxCost > 0 ? (e.entry.total_cost_dollars / maxCost) * 100 : 0
          const isDimmed = hoveredEntry !== null && hoveredEntry !== e.id
          return (
            <div
              key={e.id}
              className="cost-bar-entry"
              data-dimmed={String(isDimmed)}
              onMouseEnter={() => setHoveredEntry(e.id)}
              onMouseLeave={() => setHoveredEntry(null)}
            >
              <span className="cost-bar-label" title={`${e.entry.provider} ${e.entry.gpu}`}>
                {e.entry.provider} {e.entry.gpu}
              </span>
              <div className="cost-bar-tooltip-wrap">
                <div className="cost-bar-track">
                  <div
                    className="cost-bar-fill"
                    style={{
                      width: `${Math.max(1, pct)}%`,
                      backgroundColor: STATUS_COLORS[e.status],
                    }}
                  />
                </div>
                <div className="cost-bar-rich-tooltip">
                  <p className="chart-tooltip-title">
                    {e.entry.provider} {e.entry.gpu} x{e.entry.num_gpus}
                  </p>
                  <div className="chart-tooltip-row">
                    <span className="chart-tooltip-key">Instance</span>
                    <span>{e.entry.cloud_instance_type}</span>
                  </div>
                  <div className="chart-tooltip-row">
                    <span className="chart-tooltip-key">Hourly</span>
                    <span>{formatHourly(e.entry.hourly_price_cents)}</span>
                  </div>
                  <div className="chart-tooltip-row">
                    <span className="chart-tooltip-key">Hours</span>
                    <span>{decimalNumberFormatter.format(e.entry.estimated_hours)}h</span>
                  </div>
                  <div className="chart-tooltip-row">
                    <span className="chart-tooltip-key">Total</span>
                    <span>{formatCurrency(e.entry.total_cost_dollars)}</span>
                  </div>
                  {e.entry.spot_cost_dollars !== null && (
                    <div className="chart-tooltip-row">
                      <span className="chart-tooltip-key">Spot</span>
                      <span>{formatCurrency(e.entry.spot_cost_dollars)}</span>
                    </div>
                  )}
                  {e.entry.reserved_1mo_cost_dollars !== null && (
                    <div className="chart-tooltip-row">
                      <span className="chart-tooltip-key">Res 1mo</span>
                      <span>{formatCurrency(e.entry.reserved_1mo_cost_dollars)}</span>
                    </div>
                  )}
                  {e.entry.reserved_3mo_cost_dollars !== null && (
                    <div className="chart-tooltip-row">
                      <span className="chart-tooltip-key">Res 3mo</span>
                      <span>{formatCurrency(e.entry.reserved_3mo_cost_dollars)}</span>
                    </div>
                  )}
                  <div className="chart-tooltip-row">
                    <span className="chart-tooltip-key">Fit</span>
                    <span>{e.entry.fits_in_vram ? 'yes' : 'oom'}</span>
                  </div>
                  <div className="chart-tooltip-row">
                    <span className="chart-tooltip-key">Avail</span>
                    <span>{e.entry.available ? 'up' : 'down'}</span>
                  </div>
                </div>
              </div>
              <span className="cost-bar-value">{formatCurrency(e.entry.total_cost_dollars)}</span>
            </div>
          )
        })}
      </div>

      {/* Scatter plot */}
      {scatterData.length > 0 && (
        <div className="chart-wrap scatter-chart">
          <h4>Time vs Cost</h4>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 32, left: 62, bottom: 18 }}>
              <CartesianGrid strokeDasharray="4 4" stroke="#202a2f" />
              <XAxis
                type="number"
                dataKey="hours"
                name="Training hours"
                stroke="#7d8993"
                tickFormatter={formatHoursTick}
                tickMargin={6}
                domain={[0, Math.max(1, maxHours * 1.05)]}
              />
              <YAxis
                type="number"
                dataKey="cost"
                name="Total cost"
                stroke="#7d8993"
                width={118}
                tickFormatter={formatCurrencyTick}
                tickMargin={8}
                domain={[0, Math.max(1, maxScatterCost * 1.05)]}
              />
              <ZAxis type="number" dataKey="vram" range={[80, 320]} name="VRAM" />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<ScatterTooltip />} />
              <Scatter data={scatterData} name="Options">
                {scatterData.map((entry) => {
                  const isDimmed = hoveredEntry !== null && hoveredEntry !== entry.id
                  return (
                    <Cell
                      key={entry.id}
                      fill={entry.fill}
                      opacity={isDimmed ? 0.25 : 1}
                      onMouseEnter={() => setHoveredEntry(entry.id)}
                      onMouseLeave={() => setHoveredEntry(null)}
                    />
                  )
                })}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table toggle */}
      <button
        type="button"
        className="cost-table-toggle"
        onClick={() => setShowTable((prev) => !prev)}
      >
        {showTable ? 'Hide full table' : 'Expand full table'}
      </button>

      {showTable && (
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
              {groupedEntries.map((group, gi) => (
                <>{group.entries.map((e, ei) => (
                  <tr
                    key={e.id}
                    className={rowClass(e.status)}
                    data-dimmed={hoveredEntry !== null && hoveredEntry !== e.id ? 'true' : undefined}
                    onMouseEnter={() => setHoveredEntry(e.id)}
                    onMouseLeave={() => setHoveredEntry(null)}
                  >
                    {ei === 0 && gi > 0 ? null : null}
                    <td>{e.entry.provider}</td>
                    <td>{`${e.entry.gpu} x${e.entry.num_gpus}`}</td>
                    <td>{e.entry.cloud_instance_type}</td>
                    <td>{formatHourly(e.entry.hourly_price_cents)}</td>
                    <td>{decimalNumberFormatter.format(e.entry.estimated_hours)}h</td>
                    <td>{formatCurrency(e.entry.total_cost_dollars)}</td>
                    <td>{formatCurrency(e.entry.spot_cost_dollars)}</td>
                    <td>{formatCurrency(e.entry.reserved_1mo_cost_dollars)}</td>
                    <td>{formatCurrency(e.entry.reserved_3mo_cost_dollars)}</td>
                    <td>{e.entry.fits_in_vram ? 'fit' : 'oom'}</td>
                    <td>{e.entry.available ? 'up' : 'down'}</td>
                  </tr>
                ))}</>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
