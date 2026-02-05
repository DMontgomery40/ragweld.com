import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import * as DashAPI from '@/api/dashboard';
import type { DashboardIndexStatusMetadata } from '@/types/generated';

type Series = number[];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function pushSeries(prev: Series, next: number, maxPoints: number): Series {
  const out = prev.length >= maxPoints ? prev.slice(prev.length - (maxPoints - 1)) : prev.slice();
  out.push(next);
  return out;
}

function parseDurationMs(value: string | null | undefined): number | null {
  const v = String(value || '').trim();
  if (!v) return null;
  const m = v.match(/^(\d+)\s*([smhd])$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2].toLowerCase();
  const factor =
    unit === 's' ? 1000 :
    unit === 'm' ? 60_000 :
    unit === 'h' ? 3_600_000 :
    86_400_000;
  return n * factor;
}

function rangeLabel(fromParam: string | null): string {
  const from = String(fromParam || '').trim();
  const m = from.match(/^now-(\d+)([smhd])$/i);
  if (!m) return '1h';
  return `${m[1]}${m[2].toLowerCase()}`;
}

function formatStat(value: number, unit: string) {
  if (!Number.isFinite(value)) return '—';
  if (unit === 'ms') return `${Math.round(value)} ms`;
  if (unit === 'qps') return `${value.toFixed(2)}`;
  if (unit === '%') return `${value.toFixed(2)}%`;
  return `${value}`;
}

function MiniChart({
  series,
  color,
  height = 140,
}: {
  series: Series;
  color: string;
  height?: number;
}) {
  const points = useMemo(() => {
    if (!series.length) return '';
    const max = Math.max(...series);
    const min = Math.min(...series);
    const span = max - min || 1;
    return series
      .map((v, i) => {
        const x = (i / Math.max(1, series.length - 1)) * 100;
        const y = 100 - ((v - min) / span) * 100;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }, [series]);

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: '100%', height }}>
      <defs>
        <linearGradient id="lineGlow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.45" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100" height="100" fill="transparent" />
      {/* Grid */}
      {Array.from({ length: 6 }).map((_, i) => (
        <line
          key={`h-${i}`}
          x1="0"
          y1={(i / 5) * 100}
          x2="100"
          y2={(i / 5) * 100}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth="0.6"
        />
      ))}
      {Array.from({ length: 8 }).map((_, i) => (
        <line
          key={`v-${i}`}
          x1={(i / 7) * 100}
          y1="0"
          x2={(i / 7) * 100}
          y2="100"
          stroke="rgba(255,255,255,0.035)"
          strokeWidth="0.6"
        />
      ))}
      {/* Fill */}
      <polyline
        points={`${points} 100,100 0,100`}
        fill="url(#lineGlow)"
        stroke="none"
        opacity="0.9"
      />
      {/* Line */}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.4"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Panel({
  title,
  right,
  children,
}: {
  title: string;
  right?: string;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        background: 'var(--bg-elev1)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius-md, 6px)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 12px',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          background: 'var(--panel-bg)',
        }}
      >
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.78)', fontWeight: 700 }}>
          {title}
        </div>
        {right ? (
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>{right}</div>
        ) : null}
      </div>
      <div style={{ padding: '12px' }}>{children}</div>
    </div>
  );
}

export default function GrafanaEmbed(): ReactElement {
  const { uid, slug } = useParams<{ uid: string; slug: string }>();
  const location = useLocation();
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const refreshMs = useMemo(() => parseDurationMs(query.get('refresh')) ?? 10_000, [query]);
  const timeRange = useMemo(() => rangeLabel(query.get('from')), [query]);
  const dashboardTitle = useMemo(() => {
    const s = String(slug || uid || 'tribrid-metrics').replace(/[-_]/g, ' ').trim();
    if (!s) return 'TriBridRAG Metrics';
    return s
      .split(' ')
      .filter(Boolean)
      .map((w) => w.slice(0, 1).toUpperCase() + w.slice(1))
      .join(' ');
  }, [slug, uid]);

  const [metadata, setMetadata] = useState<DashboardIndexStatusMetadata | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const status = await DashAPI.getIndexStatus();
        if (cancelled) return;
        setMetadata((status.metadata || null) as DashboardIndexStatusMetadata | null);
      } catch {
        if (cancelled) return;
        setMetadata(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const baseLatencyMs = useMemo(() => {
    const tokens = Number(metadata?.costs?.total_tokens || 0);
    // Keep it believable: larger indexes cost a bit more, but cap the demo.
    return clamp(140 + Math.log10(Math.max(10_000, tokens)) * 40, 120, 320);
  }, [metadata]);

  const points = 80;
  const [vectorP50, setVectorP50] = useState<Series>(() => Array.from({ length: points }, () => baseLatencyMs * 0.85));
  const [sparseP50, setSparseP50] = useState<Series>(() => Array.from({ length: points }, () => baseLatencyMs * 0.6));
  const [graphP50, setGraphP50] = useState<Series>(() => Array.from({ length: points }, () => baseLatencyMs * 1.25));
  const [rateQps, setRateQps] = useState<Series>(() => Array.from({ length: points }, () => 0.22));
  const [errPct, setErrPct] = useState<Series>(() => Array.from({ length: points }, () => 0.12));

  // Re-seed baseline when metadata loads (once).
  useEffect(() => {
    setVectorP50(Array.from({ length: points }, (_, i) => baseLatencyMs * 0.82 + Math.sin(i / 7) * 4));
    setSparseP50(Array.from({ length: points }, (_, i) => baseLatencyMs * 0.58 + Math.cos(i / 6) * 3));
    setGraphP50(Array.from({ length: points }, (_, i) => baseLatencyMs * 1.18 + Math.sin(i / 5) * 6));
    setRateQps(Array.from({ length: points }, (_, i) => 0.18 + Math.abs(Math.sin(i / 11)) * 0.22));
    setErrPct(Array.from({ length: points }, (_, i) => 0.08 + Math.abs(Math.cos(i / 13)) * 0.16));
  }, [baseLatencyMs]);

  // Tick the series to look "live" in the hosted demo.
  useEffect(() => {
    const interval = setInterval(() => {
      setVectorP50((prev) => {
        const last = prev[prev.length - 1] ?? baseLatencyMs * 0.82;
        const next = clamp(last + (Math.random() - 0.5) * 10, baseLatencyMs * 0.65, baseLatencyMs * 1.1);
        return pushSeries(prev, next, points);
      });
      setSparseP50((prev) => {
        const last = prev[prev.length - 1] ?? baseLatencyMs * 0.58;
        const next = clamp(last + (Math.random() - 0.5) * 8, baseLatencyMs * 0.45, baseLatencyMs * 0.9);
        return pushSeries(prev, next, points);
      });
      setGraphP50((prev) => {
        const last = prev[prev.length - 1] ?? baseLatencyMs * 1.18;
        const next = clamp(last + (Math.random() - 0.5) * 14, baseLatencyMs * 0.95, baseLatencyMs * 1.55);
        return pushSeries(prev, next, points);
      });
      setRateQps((prev) => {
        const last = prev[prev.length - 1] ?? 0.2;
        const next = clamp(last + (Math.random() - 0.5) * 0.08, 0.05, 0.9);
        return pushSeries(prev, next, points);
      });
      setErrPct((prev) => {
        const last = prev[prev.length - 1] ?? 0.12;
        const next = clamp(last + (Math.random() - 0.5) * 0.05, 0.0, 1.2);
        return pushSeries(prev, next, points);
      });
    }, refreshMs);
    return () => clearInterval(interval);
  }, [baseLatencyMs, refreshMs]);

  const p95 = useMemo(() => {
    const v = vectorP50[vectorP50.length - 1] ?? baseLatencyMs * 0.85;
    const s = sparseP50[sparseP50.length - 1] ?? baseLatencyMs * 0.6;
    const g = graphP50[graphP50.length - 1] ?? baseLatencyMs * 1.25;
    return Math.max(v, s, g) * 1.35;
  }, [baseLatencyMs, graphP50, sparseP50, vectorP50]);

  const qps = rateQps[rateQps.length - 1] ?? 0;
  const err = errPct[errPct.length - 1] ?? 0;

  const timestamp = useMemo(() => {
    try {
      return new Date().toLocaleString();
    } catch {
      return '';
    }
  }, [vectorP50, sparseP50, graphP50, rateQps, errPct]);

  return (
    <div
      style={{
        height: '100vh',
        background: 'var(--bg)',
        color: 'var(--fg)',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Minimal Grafana-like chrome */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          background: 'rgba(255,255,255,0.02)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <div
            aria-hidden="true"
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '7px',
              background: 'radial-gradient(circle at 30% 30%, #ffd166 0%, #f8961e 30%, #ef476f 100%)',
              boxShadow: '0 0 20px rgba(248, 150, 30, 0.25)',
              flexShrink: 0,
            }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Home &nbsp;›&nbsp; Dashboards &nbsp;›&nbsp; {dashboardTitle}
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>
              Range: {timeRange} · Refresh: {query.get('refresh') || '10s'} · {timestamp}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>
            {loading ? 'Loading…' : (metadata?.current_repo ? `Corpus: ${metadata.current_repo}` : 'Corpus: —')}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '12px' }}>
          <div style={{ gridColumn: 'span 6' }}>
            <Panel title="Search Latency (p95)" right="ms">
              <div style={{ fontSize: '64px', fontWeight: 800, color: 'var(--ok)', letterSpacing: '-2px', lineHeight: 1 }}>
                {Number.isFinite(p95) ? Math.round(p95) : '—'}
              </div>
            </Panel>
          </div>

          <div style={{ gridColumn: 'span 6' }}>
            <Panel title="Search Rate" right="qps">
              <div style={{ fontSize: '64px', fontWeight: 800, color: 'var(--ok)', letterSpacing: '-2px', lineHeight: 1 }}>
                {Number.isFinite(qps) ? qps.toFixed(2) : '—'}
              </div>
            </Panel>
          </div>

          <div style={{ gridColumn: 'span 12', display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '12px' }}>
            <div style={{ gridColumn: 'span 6' }}>
              <Panel title="Search Latency by Leg (p50)" right="ms">
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '8px', fontSize: '11px', color: 'rgba(255,255,255,0.55)' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '10px', height: '2px', background: 'var(--link)' }} /> Vector
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '10px', height: '2px', background: 'var(--warn)' }} /> Sparse
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '10px', height: '2px', background: 'var(--ok)' }} /> Graph
                  </span>
                </div>
                <div style={{ display: 'grid', gap: '8px' }}>
                  <MiniChart series={vectorP50} color="var(--link)" />
                  <MiniChart series={sparseP50} color="var(--warn)" />
                  <MiniChart series={graphP50} color="var(--ok)" />
                </div>
              </Panel>
            </div>

            <div style={{ gridColumn: 'span 6' }}>
              <Panel title="Search Stage Error Rate" right="%">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.55)' }}>Total</div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--warn)' }}>{formatStat(err, '%')}</div>
                </div>
                <MiniChart series={errPct} color="var(--err)" height={168} />
              </Panel>
            </div>
          </div>

          <div style={{ gridColumn: 'span 12', display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '12px' }}>
            <div style={{ gridColumn: 'span 12' }}>
              <Panel title="Search Stage Latency (p50)" right="ms">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px' }}>embed_query</div>
                    <MiniChart series={vectorP50.map((v) => v * 0.55)} color="var(--link)" height={120} />
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px' }}>postgres_vector_search</div>
                    <MiniChart series={vectorP50.map((v) => v * 0.75)} color="var(--ok)" height={120} />
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px' }}>fusion_rrf</div>
                    <MiniChart series={graphP50.map((v) => v * 0.62)} color="var(--warn)" height={120} />
                  </div>
                </div>
              </Panel>
            </div>
          </div>

          <div style={{ gridColumn: 'span 12' }}>
            <Panel title="Index Snapshot" right={loading ? 'loading' : 'live'}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>Total Tokens</div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ok)' }}>
                    {metadata?.costs?.total_tokens ? metadata.costs.total_tokens.toLocaleString() : '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>Embedding Cost</div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ok)' }}>
                    {metadata?.costs?.embedding_cost == null ? '—' : `$${Number(metadata.costs.embedding_cost || 0).toFixed(4)}`}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>Postgres Total</div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ok)' }}>
                    {metadata?.storage_breakdown?.postgres_total_bytes
                      ? `${(metadata.storage_breakdown.postgres_total_bytes / 1024 / 1024).toFixed(1)} MB`
                      : '—'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>Neo4j Store</div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--ok)' }}>
                    {metadata?.storage_breakdown?.neo4j_store_bytes
                      ? `${(metadata.storage_breakdown.neo4j_store_bytes / 1024 / 1024).toFixed(1)} MB`
                      : '—'}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: '10px', fontSize: '11px', color: 'rgba(255,255,255,0.38)' }}>
                Demo dashboard: panels are simulated, but index snapshot values are read from the live demo database.
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
