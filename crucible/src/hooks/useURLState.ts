import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EstimateRequest } from '../types'

const NULLABLE_NUMBER_KEYS = new Set<keyof EstimateRequest>([
  'dataset_rows',
  'min_vram_gb',
  'reward_model_size',
])

function parseParamValue<K extends keyof EstimateRequest>(
  key: K,
  rawValue: string,
  defaultValue: EstimateRequest[K],
): EstimateRequest[K] {
  if (Array.isArray(defaultValue)) {
    return rawValue
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0) as EstimateRequest[K]
  }

  if (typeof defaultValue === 'number') {
    const parsed = Number(rawValue)
    return (Number.isFinite(parsed) ? parsed : defaultValue) as EstimateRequest[K]
  }

  if (typeof defaultValue === 'boolean') {
    return (rawValue === '1' || rawValue.toLowerCase() === 'true') as EstimateRequest[K]
  }

  if (defaultValue === null || NULLABLE_NUMBER_KEYS.has(key)) {
    if (rawValue === 'null' || rawValue.length === 0) {
      return null as EstimateRequest[K]
    }

    const parsed = Number(rawValue)
    return (Number.isFinite(parsed) ? parsed : null) as EstimateRequest[K]
  }

  return rawValue as EstimateRequest[K]
}

function valuesEqual(
  left: EstimateRequest[keyof EstimateRequest],
  right: EstimateRequest[keyof EstimateRequest],
): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false
    }

    return left.every((value, index) => value === right[index])
  }

  return left === right
}

export function parseEstimateRequestFromSearch(
  defaults: EstimateRequest,
  search: string,
): EstimateRequest {
  const params = new URLSearchParams(search)
  const parsed: EstimateRequest = { ...defaults }

  for (const [rawKey, rawValue] of params.entries()) {
    if (!(rawKey in defaults)) {
      continue
    }

    const key = rawKey as keyof EstimateRequest
    const defaultValue = defaults[key]
    ;(parsed as Record<keyof EstimateRequest, unknown>)[key] = parseParamValue(
      key,
      rawValue,
      defaultValue,
    )
  }

  return parsed
}

export function toQueryString(
  state: EstimateRequest,
  defaults: EstimateRequest,
): string {
  const params = new URLSearchParams()

  for (const key of Object.keys(defaults) as Array<keyof EstimateRequest>) {
    const value = state[key]
    const defaultValue = defaults[key]

    if (valuesEqual(value, defaultValue)) {
      continue
    }

    if (value === null) {
      params.set(key, 'null')
      continue
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        continue
      }

      params.set(key, value.join(','))
      continue
    }

    if (typeof value === 'boolean') {
      params.set(key, value ? '1' : '0')
      continue
    }

    params.set(key, String(value))
  }

  return params.toString()
}

export function useURLState(defaultState: EstimateRequest) {
  const [state, setStateInternal] = useState<EstimateRequest>(() => {
    return parseEstimateRequestFromSearch(defaultState, window.location.search)
  })

  useEffect(() => {
    const onPopState = () => {
      setStateInternal(parseEstimateRequestFromSearch(defaultState, window.location.search))
    }

    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
    }
  }, [defaultState])

  useEffect(() => {
    const queryString = toQueryString(state, defaultState)
    const nextUrl = `${window.location.pathname}${
      queryString.length > 0 ? `?${queryString}` : ''
    }${window.location.hash}`
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`

    if (nextUrl !== currentUrl) {
      window.history.replaceState(null, '', nextUrl)
    }
  }, [defaultState, state])

  const setState = useCallback((patch: Partial<EstimateRequest>) => {
    setStateInternal((current) => ({
      ...current,
      ...patch,
    }))
  }, [])

  const replaceState = useCallback((nextState: EstimateRequest) => {
    setStateInternal(nextState)
  }, [])

  const queryString = useMemo(() => {
    return toQueryString(state, defaultState)
  }, [defaultState, state])

  return {
    state,
    setState,
    replaceState,
    queryString,
  }
}
