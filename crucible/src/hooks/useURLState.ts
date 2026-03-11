import { useCallback, useEffect, useMemo, useState } from 'react'
import { normalizeModuleShapeOverrides } from '../engine/models'
import { normalizeLegacyEstimateRequest } from '../request-normalization'
import type { EstimateRequest } from '../types'

const NULLABLE_NUMBER_KEYS = new Set<keyof EstimateRequest>([
  'model_active_params_billions',
  'dataset_rows',
  'min_vram_gb',
  'reward_model_size',
])
const EXTRA_QUERY_KEYS = [
  'model_hidden_size',
  'model_num_layers',
  'model_num_attention_heads',
  'model_num_kv_heads',
  'model_intermediate_size',
  'model_vocab_size',
  'model_max_position_embeddings',
  'model_module_shapes',
] as const
const EXTRA_QUERY_KEY_SET = new Set<string>(EXTRA_QUERY_KEYS)

type ExtraQueryKey = (typeof EXTRA_QUERY_KEYS)[number]

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

function parseExtraParamValue<K extends ExtraQueryKey>(
  key: K,
  rawValue: string,
): EstimateRequest[K] {
  if (key === 'model_module_shapes') {
    if (rawValue === 'null' || rawValue.length === 0) {
      return undefined as EstimateRequest[K]
    }
    try {
      const parsed = JSON.parse(rawValue)
      const normalized = normalizeModuleShapeOverrides(parsed)
      return (normalized && Object.keys(normalized).length > 0 ? normalized : undefined) as EstimateRequest[K]
    } catch {
      return undefined as EstimateRequest[K]
    }
  }

  if (rawValue === 'null' || rawValue.length === 0) {
    return undefined as EstimateRequest[K]
  }

  const parsed = Number(rawValue)
  return (Number.isFinite(parsed) ? parsed : undefined) as EstimateRequest[K]
}

function appendSerializedParam(
  params: URLSearchParams,
  key: string,
  value: unknown,
): void {
  if (value === undefined) {
    return
  }

  if (value === null) {
    params.set(key, 'null')
    return
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return
    }
    params.set(key, value.join(','))
    return
  }

  if (typeof value === 'boolean') {
    params.set(key, value ? '1' : '0')
    return
  }

  if (typeof value === 'object') {
    params.set(key, JSON.stringify(value))
    return
  }

  if (typeof value === 'string' && value.length === 0) {
    return
  }

  params.set(key, String(value))
}

export function serializeEstimateRequestQuery(request: EstimateRequest): string {
  const params = new URLSearchParams()

  for (const [key, value] of Object.entries(request) as Array<
    [keyof EstimateRequest, EstimateRequest[keyof EstimateRequest]]
  >) {
    appendSerializedParam(params, key, value)
  }

  return params.toString()
}

export function parseEstimateRequestFromSearch(
  defaults: EstimateRequest,
  search: string,
): EstimateRequest {
  const params = new URLSearchParams(search)
  const parsed: EstimateRequest = { ...defaults }

  for (const [rawKey, rawValue] of params.entries()) {
    if (!(rawKey in defaults) && !EXTRA_QUERY_KEY_SET.has(rawKey)) {
      continue
    }

    if (rawKey in defaults) {
      const key = rawKey as keyof EstimateRequest
      const defaultValue = defaults[key]
      ;(parsed as Record<keyof EstimateRequest, unknown>)[key] = parseParamValue(
        key,
        rawValue,
        defaultValue,
      )
      continue
    }

    const key = rawKey as ExtraQueryKey
    ;(parsed as unknown as Record<string, unknown>)[key] = parseExtraParamValue(
      key,
      rawValue,
    )
  }

  return normalizeLegacyEstimateRequest({
    ...parsed,
    rl: params.get('rl'),
    rl_algorithm: params.get('rl_algorithm'),
    rl_generations_per_prompt:
      params.get('rl_generations_per_prompt') === null
        ? null
        : Number(params.get('rl_generations_per_prompt')),
    context_length:
      params.get('context_length') === null ? null : Number(params.get('context_length')),
    epochs: params.get('epochs') === null ? null : Number(params.get('epochs')),
  }).request
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

    appendSerializedParam(params, key, value)
  }

  for (const key of EXTRA_QUERY_KEYS) {
    appendSerializedParam(params, key, state[key] as EstimateRequest[keyof EstimateRequest] | undefined)
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
