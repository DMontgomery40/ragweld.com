import { useCallback, useEffect, useRef, useState } from 'react'
import type { ProviderPricing } from '../types'

interface UseGPUPricingOptions {
  refreshMs?: number
}

interface UseGPUPricingResult {
  data: ProviderPricing[]
  loading: boolean
  error: string | null
  fetchedAt: string | null
  pricingMeta: PricingMeta | null
  refetch: (options?: { forceRefresh?: boolean }) => void
}

export interface PricingMeta {
  count?: number
  source?: string
  fetched_at?: string
  cached?: boolean
  fallback_reason?: string | null
  filters?: Record<string, unknown>
}

const PRICES_ENDPOINT = '/crucible/api/v1/prices'

function extractPricing(payload: unknown): ProviderPricing[] {
  if (Array.isArray(payload)) {
    return payload as ProviderPricing[]
  }

  if (!payload || typeof payload !== 'object') {
    return []
  }

  const record = payload as Record<string, unknown>

  if (Array.isArray(record.prices)) {
    return record.prices as ProviderPricing[]
  }

  if (Array.isArray(record.data)) {
    return record.data as ProviderPricing[]
  }

  if (Array.isArray(record.items)) {
    return record.items as ProviderPricing[]
  }

  return []
}

function extractMeta(payload: unknown): PricingMeta | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const record = payload as Record<string, unknown>
  if (!record.meta || typeof record.meta !== 'object') {
    return null
  }

  return record.meta as PricingMeta
}

function extractErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return 'Unable to load pricing'
  }

  const maybeError = payload as Record<string, unknown>
  if (typeof maybeError.error === 'string') {
    return maybeError.error
  }

  return 'Unable to load pricing'
}

export function useGPUPricing(options: UseGPUPricingOptions = {}): UseGPUPricingResult {
  const refreshMs = options.refreshMs ?? 180_000
  const [revision, setRevision] = useState(0)
  const forceRefreshNextRef = useRef(false)

  const [data, setData] = useState<ProviderPricing[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [pricingMeta, setPricingMeta] = useState<PricingMeta | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    const fetchPrices = async () => {
      setLoading(true)
      setError(null)

      try {
        const shouldForceRefresh = forceRefreshNextRef.current
        forceRefreshNextRef.current = false

        const endpoint = shouldForceRefresh
          ? `${PRICES_ENDPOINT}?force_refresh=true`
          : PRICES_ENDPOINT

        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
          signal: controller.signal,
        })

        const payload = await response.json().catch(() => null)

        if (!response.ok) {
          throw new Error(extractErrorMessage(payload))
        }

        const prices = extractPricing(payload)
        const meta = extractMeta(payload)
        setData(prices)
        setPricingMeta(meta)
        setFetchedAt(meta?.fetched_at ?? new Date().toISOString())
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === 'AbortError') {
          return
        }

        setError(caught instanceof Error ? caught.message : 'Unable to load pricing')
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void fetchPrices()
    const intervalId = window.setInterval(fetchPrices, refreshMs)

    return () => {
      controller.abort()
      window.clearInterval(intervalId)
    }
  }, [refreshMs, revision])

  const refetch = useCallback((options?: { forceRefresh?: boolean }) => {
    if (options?.forceRefresh) {
      forceRefreshNextRef.current = true
    }
    setRevision((current) => current + 1)
  }, [])

  return {
    data,
    loading,
    error,
    fetchedAt,
    pricingMeta,
    refetch,
  }
}
