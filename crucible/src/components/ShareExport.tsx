import { useMemo, useState } from 'react'
import type { EstimateRequest, EstimateResponse } from '../types'

interface ShareExportProps {
  request: EstimateRequest
  estimate: EstimateResponse | null
  queryString: string
}

function normalizeBasePath(rawBasePath: string): string {
  const withLeadingSlash = rawBasePath.startsWith('/') ? rawBasePath : `/${rawBasePath}`
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`
}

function escapeCsv(value: string | number | null): string {
  if (value === null) {
    return ''
  }

  const serialized = String(value)
  if (serialized.includes(',') || serialized.includes('"') || serialized.includes('\n')) {
    return `"${serialized.replaceAll('"', '""')}"`
  }

  return serialized
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

async function copyToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

export function ShareExport({ request, estimate, queryString }: ShareExportProps) {
  const [status, setStatus] = useState<string | null>(null)

  const urls = useMemo(() => {
    const basePath = normalizeBasePath(import.meta.env.BASE_URL)
    const origin = window.location.origin

    return {
      api: `${origin}${basePath}api/v1/estimate`,
      share: `${origin}${basePath}${queryString.length > 0 ? `?${queryString}` : ''}`,
    }
  }, [queryString])

  const curlCommand = useMemo(() => {
    const payload = JSON.stringify(request)
    const escapedPayload = payload.replaceAll("'", "'\\''")

    return `curl -X POST '${urls.api}' -H 'Content-Type: application/json' -d '${escapedPayload}'`
  }, [request, urls.api])

  const handleCopyCurl = async () => {
    try {
      await copyToClipboard(curlCommand)
      setStatus('Copied curl request to clipboard.')
    } catch {
      setStatus('Unable to copy curl request.')
    }
  }

  const handleCopyShareUrl = async () => {
    try {
      await copyToClipboard(urls.share)
      setStatus('Copied shareable URL.')
    } catch {
      setStatus('Unable to copy shareable URL.')
    }
  }

  const handleExportJson = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      request,
      estimate,
    }

    downloadFile(JSON.stringify(payload, null, 2), 'crucible-estimate.json', 'application/json')
    setStatus('Exported JSON snapshot.')
  }

  const handleExportCsv = () => {
    if (!estimate || estimate.cost_comparison.length === 0) {
      const fallbackRows = [
        ['field', 'value'],
        ...Object.entries(request).map(([key, value]) => [
          key,
          Array.isArray(value) ? value.join('|') : value === null ? '' : String(value),
        ]),
      ]

      const fallbackCsv = fallbackRows
        .map((row) => row.map((cell) => escapeCsv(cell)).join(','))
        .join('\n')

      downloadFile(fallbackCsv, 'crucible-request.csv', 'text/csv;charset=utf-8')
      setStatus('Exported request CSV (no comparison rows available).')
      return
    }

    const header = [
      'provider',
      'gpu',
      'cloud_instance_type',
      'num_gpus',
      'vram_total_gb',
      'hourly_price_cents',
      'estimated_hours',
      'total_cost_dollars',
      'spot_cost_dollars',
      'reserved_1mo_cost_dollars',
      'reserved_3mo_cost_dollars',
      'available',
      'fits_in_vram',
      'source',
    ]

    const rows = estimate.cost_comparison.map((entry) => [
      entry.provider,
      entry.gpu,
      entry.cloud_instance_type,
      entry.num_gpus,
      entry.vram_total_gb,
      entry.hourly_price_cents,
      entry.estimated_hours,
      entry.total_cost_dollars,
      entry.spot_cost_dollars,
      entry.reserved_1mo_cost_dollars,
      entry.reserved_3mo_cost_dollars,
      entry.available,
      entry.fits_in_vram,
      entry.source,
    ])

    const csv = [header, ...rows]
      .map((row) => row.map((cell) => escapeCsv(cell as string | number | null)).join(','))
      .join('\n')

    downloadFile(csv, 'crucible-cost-comparison.csv', 'text/csv;charset=utf-8')
    setStatus('Exported cost comparison CSV.')
  }

  return (
    <section className="card share-card">
      <div className="section-head">
        <h3>Share & Export</h3>
        <span className="section-meta mono">{urls.api}</span>
      </div>

      <div className="share-actions">
        <button type="button" onClick={handleCopyCurl}>
          Copy as curl
        </button>
        <button type="button" onClick={handleExportJson}>
          Export JSON
        </button>
        <button type="button" onClick={handleExportCsv}>
          Export CSV
        </button>
        <button type="button" onClick={handleCopyShareUrl}>
          Share URL
        </button>
      </div>

      {status && <p className="share-status">{status}</p>}
    </section>
  )
}
