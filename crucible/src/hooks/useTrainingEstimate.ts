import { useCallback, useEffect, useState } from 'react'
import type { ErrorResponse, EstimateRequest, EstimateResponse } from '../types'

interface UseTrainingEstimateOptions {
  debounceMs?: number
}

interface UseTrainingEstimateResult {
  data: EstimateResponse | null
  loading: boolean
  error: string | null
  requestedAt: string | null
  completedRequest: EstimateRequest | null
  refetch: () => void
}

const ESTIMATE_ENDPOINT = '/crucible/api/v1/estimate'

async function readJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type')
  if (!contentType || !contentType.toLowerCase().includes('application/json')) {
    return null
  }

  return response.json()
}

function extractErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return 'Estimate request failed'
  }

  const maybeError = payload as Partial<ErrorResponse>
  const baseMessage = maybeError.error ?? 'Estimate request failed'
  const codeSuffix = maybeError.code ? ` (${maybeError.code})` : ''

  if (maybeError.code === 'UNSUPPORTED_PRICING_TIERS' && maybeError.details && typeof maybeError.details === 'object') {
    const details = maybeError.details as { selected_pricing_tiers?: unknown }
    if (Array.isArray(details.selected_pricing_tiers) && details.selected_pricing_tiers.length > 0) {
      const tiers = details.selected_pricing_tiers
        .map((tier) => (typeof tier === 'string' ? tier.replaceAll('_', ' ') : ''))
        .filter((tier) => tier.length > 0)
      if (tiers.length > 0) {
        return `${baseMessage}${codeSuffix} Selected: ${tiers.join(', ')}.`
      }
    }
  }

  return `${baseMessage}${codeSuffix}`
}

export function useTrainingEstimate(
  request: EstimateRequest,
  options: UseTrainingEstimateOptions = {},
): UseTrainingEstimateResult {
  const debounceMs = options.debounceMs ?? 300
  const [requestRevision, setRequestRevision] = useState(0)

  const [data, setData] = useState<EstimateResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [requestedAt, setRequestedAt] = useState<string | null>(null)
  const [completedRequest, setCompletedRequest] = useState<EstimateRequest | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const requestSnapshot = request
    const timeoutId = window.setTimeout(async () => {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch(ESTIMATE_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        })

        const payload = await readJson(response)

        if (!response.ok) {
          throw new Error(extractErrorMessage(payload))
        }

        if (!payload || typeof payload !== 'object') {
          throw new Error('Estimate API returned an invalid response payload')
        }

        setData(payload as EstimateResponse)
        setRequestedAt(new Date().toISOString())
        setCompletedRequest(requestSnapshot)
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') {
          return
        }

        setData(null)
        setError(caught instanceof Error ? caught.message : 'Estimate request failed')
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }, debounceMs)

    return () => {
      controller.abort()
      window.clearTimeout(timeoutId)
    }
  }, [debounceMs, request, requestRevision])

  const refetch = useCallback(() => {
    setRequestRevision((current) => current + 1)
  }, [])

  return {
    data,
    loading,
    error,
    requestedAt,
    completedRequest,
    refetch,
  }
}
