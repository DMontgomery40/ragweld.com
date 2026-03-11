import { useMemo, useState } from 'react'
import type { EstimateRequest, EstimateResponse, ProviderPricing } from '../types'
import { resolveShareExportContext } from './shareExportContext'

interface ShareExportProps {
  request: EstimateRequest
  estimate: EstimateResponse | null
  estimateIsCurrent: boolean
  queryString: string
  pricing: ProviderPricing[]
}

const SHADEFORM_SITE_URL = 'https://www.shadeform.ai/'
const SHADEFORM_QUICKSTART_URL = 'https://docs.shadeform.ai/getting-started/quickstart'
const SHADEFORM_INSTANCE_TYPES_DOC_URL = 'https://docs.shadeform.ai/api-reference/instances/instances-types'
const SHADEFORM_INSTANCE_CREATE_DOC_URL = 'https://docs.shadeform.ai/api-reference/instances/instances-create'
const SHADEFORM_INSTANCE_TYPES_API_URL = 'https://api.shadeform.ai/v1/instances/types'
const SHADEFORM_INSTANCE_CREATE_API_URL = 'https://api.shadeform.ai/v1/instances/create'

interface ShadeformExportPlan {
  candidate: EstimateResponse['cost_comparison'][number]
  pricingRow: ProviderPricing
  region: string | null
  instanceTypesQueryUrl: string
  createPayload: {
    cloud: string
    region: string
    shade_instance_type: string
    shade_cloud: boolean
    name: string
  }
  createCurl: string
}

function normalizeBasePath(rawBasePath: string): string {
  const withLeadingSlash = rawBasePath.startsWith('/') ? rawBasePath : `/${rawBasePath}`
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`
}

function normalizeLower(value: string): string {
  return value.trim().toLowerCase()
}

function normalizeRegion(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  if (trimmed.length === 0 || normalizeLower(trimmed) === 'any') {
    return null
  }

  return trimmed
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')

  return slug.length > 0 ? slug.slice(0, 36) : 'training-run'
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

function resolveMatchingPricingRow(
  candidate: EstimateResponse['cost_comparison'][number],
  pricing: ProviderPricing[],
  request: EstimateRequest,
): ProviderPricing | null {
  return (
    pricing.find((row) => {
      if (row.source !== 'shadeform') {
        return false
      }

      const hasShadeType = typeof row.shade_instance_type === 'string' && row.shade_instance_type.trim().length > 0
      if (!hasShadeType) {
        return false
      }

      return (
        normalizeLower(row.provider) === normalizeLower(candidate.provider) &&
        normalizeLower(String(row.gpu)) === normalizeLower(candidate.gpu) &&
        normalizeLower(row.cloud_instance_type) === normalizeLower(candidate.cloud_instance_type) &&
        row.num_gpus * Math.max(1, request.num_nodes) === candidate.num_gpus
      )
    }) ?? null
  )
}

function resolvePreferredRegion(row: ProviderPricing, request: EstimateRequest): string | null {
  const availableRegion = row.availability.find((item) => item.available)?.region
  const fallbackRegion = row.availability.find((item) => item.region.trim().length > 0)?.region
  const preferredRequestRegion = request.target_regions[0]

  return (
    normalizeRegion(availableRegion) ??
    normalizeRegion(preferredRequestRegion) ??
    normalizeRegion(fallbackRegion) ??
    null
  )
}

function toShadeformExportPlan(
  estimate: EstimateResponse | null,
  pricing: ProviderPricing[],
  request: EstimateRequest,
): ShadeformExportPlan | null {
  if (!estimate || estimate.cost_comparison.length === 0) {
    return null
  }

  const prioritizedCandidates = [...estimate.cost_comparison]
    .filter((entry) => entry.source === 'shadeform' && entry.fits_in_vram)
    .sort((left, right) => {
      if (left.total_cost_dollars !== right.total_cost_dollars) {
        return left.total_cost_dollars - right.total_cost_dollars
      }
      return left.estimated_hours - right.estimated_hours
    })

  for (const candidate of prioritizedCandidates) {
    const pricingRow = resolveMatchingPricingRow(candidate, pricing, request)
    if (!pricingRow || !pricingRow.shade_instance_type) {
      continue
    }

    const region = resolvePreferredRegion(pricingRow, request)
    const queryParams = new URLSearchParams({
      cloud: pricingRow.provider,
      shade_instance_type: pricingRow.shade_instance_type,
      num_gpus: String(pricingRow.num_gpus),
      available: 'true',
      sort: 'price',
    })

    const createPayload = {
      cloud: pricingRow.provider,
      region: region ?? '<set-region-from-instances-types>',
      shade_instance_type: pricingRow.shade_instance_type,
      shade_cloud: true,
      name: `crucible-${slugify(request.model_name)}`,
    }

    const escapedCreatePayload = JSON.stringify(createPayload).replaceAll("'", "'\\''")
    const createCurl = `curl --request POST '${SHADEFORM_INSTANCE_CREATE_API_URL}' -H 'X-API-KEY: <your-shadeform-api-key>' -H 'Content-Type: application/json' -d '${escapedCreatePayload}'`

    return {
      candidate,
      pricingRow,
      region,
      instanceTypesQueryUrl: `${SHADEFORM_INSTANCE_TYPES_API_URL}?${queryParams.toString()}`,
      createPayload,
      createCurl,
    }
  }

  return null
}

export function ShareExport({ request, estimate, estimateIsCurrent, queryString, pricing }: ShareExportProps) {
  const [status, setStatus] = useState<string | null>(null)
  const exportContext = useMemo(
    () => resolveShareExportContext({ request, estimate, estimateIsCurrent, queryString }),
    [estimate, estimateIsCurrent, queryString, request],
  )
  const { activeEstimate, effectiveRequest, shareQueryString } = exportContext

  const urls = useMemo(() => {
    const basePath = normalizeBasePath(import.meta.env.BASE_URL)
    const origin = window.location.origin

    return {
      api: `${origin}${basePath}api/v1/estimate`,
      share: `${origin}${basePath}${shareQueryString.length > 0 ? `?${shareQueryString}` : ''}`,
    }
  }, [shareQueryString])

  const curlCommand = useMemo(() => {
    const payload = JSON.stringify(effectiveRequest)
    const escapedPayload = payload.replaceAll("'", "'\\''")

    return `curl -X POST '${urls.api}' -H 'Content-Type: application/json' -d '${escapedPayload}'`
  }, [effectiveRequest, urls.api])

  const shadeformPlan = useMemo(() => {
    return toShadeformExportPlan(activeEstimate, pricing, effectiveRequest)
  }, [activeEstimate, effectiveRequest, pricing])

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

  const handleCopyShadeformCurl = async () => {
    if (!shadeformPlan) {
      setStatus('No fit-ready Shadeform option is available yet for launch export.')
      return
    }

    try {
      await copyToClipboard(shadeformPlan.createCurl)
      setStatus('Copied Shadeform launch curl. Set your API key before running.')
    } catch {
      setStatus('Unable to copy Shadeform launch curl.')
    }
  }

  const handleExportJson = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      request,
      effective_request: effectiveRequest,
      estimate: activeEstimate,
    }

    downloadFile(JSON.stringify(payload, null, 2), 'crucible-estimate.json', 'application/json')
    setStatus('Exported JSON snapshot.')
  }

  const handleExportShadeformBundle = () => {
    if (!shadeformPlan) {
      setStatus('No fit-ready Shadeform option is available yet for launch export.')
      return
    }

    const payload = {
      exported_at: new Date().toISOString(),
      request,
      effective_request: effectiveRequest,
      estimate_meta: activeEstimate?.meta ?? null,
      model_resolution: activeEstimate?.model_resolution ?? null,
      shadeform: {
        docs: {
          site: SHADEFORM_SITE_URL,
          quickstart: SHADEFORM_QUICKSTART_URL,
          instance_types: SHADEFORM_INSTANCE_TYPES_DOC_URL,
          instance_create: SHADEFORM_INSTANCE_CREATE_DOC_URL,
        },
        recommendation: {
          provider: shadeformPlan.candidate.provider,
          gpu: shadeformPlan.candidate.gpu,
          cloud_instance_type: shadeformPlan.candidate.cloud_instance_type,
          shade_instance_type: shadeformPlan.pricingRow.shade_instance_type,
          num_gpus: shadeformPlan.candidate.num_gpus,
          estimated_hours: shadeformPlan.candidate.estimated_hours,
          total_cost_dollars: shadeformPlan.candidate.total_cost_dollars,
          region: shadeformPlan.region,
        },
        instance_types_query_url: shadeformPlan.instanceTypesQueryUrl,
        create_payload: shadeformPlan.createPayload,
        create_curl: shadeformPlan.createCurl,
        notes: [
          'Instance availability changes quickly. Refresh /instances/types before launching.',
          'If /instances/create returns capacity errors, retry with a different available region or instance type.',
        ],
      },
    }

    downloadFile(JSON.stringify(payload, null, 2), 'crucible-shadeform-launch.json', 'application/json')
    setStatus('Exported Shadeform launch bundle.')
  }

  const handleExportCsv = () => {
    if (!activeEstimate || activeEstimate.cost_comparison.length === 0) {
      const fallbackRows = [
        ['field', 'value'],
        ...Object.entries(effectiveRequest).map(([key, value]) => [
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

    const rows = activeEstimate.cost_comparison.map((entry) => [
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
        <button type="button" onClick={handleCopyShadeformCurl} disabled={!shadeformPlan}>
          Copy Shadeform curl
        </button>
        <button type="button" onClick={handleExportShadeformBundle} disabled={!shadeformPlan}>
          Export Shadeform JSON
        </button>
        <a
          className="share-action-link"
          href={SHADEFORM_SITE_URL}
          target="_blank"
          rel="noopener noreferrer"
          title="Open Shadeform"
        >
          Open Shadeform
        </a>
      </div>

      <p className="share-hint">
        Shadeform export uses the cheapest fit-ready Shadeform result in this table and includes an API-ready
        launch payload.
      </p>

      <p className="share-links">
        <a href={SHADEFORM_QUICKSTART_URL} target="_blank" rel="noopener noreferrer">
          Shadeform quickstart
        </a>
        <span aria-hidden="true">|</span>
        <a href={SHADEFORM_INSTANCE_TYPES_DOC_URL} target="_blank" rel="noopener noreferrer">
          /instances/types docs
        </a>
        <span aria-hidden="true">|</span>
        <a href={SHADEFORM_INSTANCE_CREATE_DOC_URL} target="_blank" rel="noopener noreferrer">
          /instances/create docs
        </a>
      </p>

      {status && <p className="share-status">{status}</p>}
    </section>
  )
}
