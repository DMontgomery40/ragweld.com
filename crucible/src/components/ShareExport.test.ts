import { describe, expect, it } from 'vitest'
import { makeEstimateRequest } from '../engine/__tests__/helpers'
import { resolveShareExportContext } from './shareExportContext'

describe('resolveShareExportContext', () => {
  it('falls back to the live request when the current estimate is stale', () => {
    const request = makeEstimateRequest({
      model_name: 'current-model',
      dataset_tokens: 12_000_000,
    })
    const staleEffectiveRequest = makeEstimateRequest({
      model_name: 'previous-model',
      dataset_tokens: 10_000_000,
    })

    const context = resolveShareExportContext({
      request,
      estimate: {
        effective_request: staleEffectiveRequest,
      } as never,
      estimateIsCurrent: false,
      queryString: 'model_name=current-model&dataset_tokens=12000000',
    })

    expect(context.activeEstimate).toBeNull()
    expect(context.effectiveRequest).toEqual(request)
    expect(context.shareQueryString).toContain('model_name=current-model')
  })

  it('uses the effective request only when the estimate matches the current form', () => {
    const request = makeEstimateRequest({
      model_name: 'Qwen/Qwen3-32B',
    })
    const effectiveRequest = makeEstimateRequest({
      model_name: 'Qwen/Qwen3-32B',
      model_hf_repo_id: 'Qwen/Qwen3-32B',
      auto_resolve_model_metadata: false,
    })

    const context = resolveShareExportContext({
      request,
      estimate: {
        effective_request: effectiveRequest,
      } as never,
      estimateIsCurrent: true,
      queryString: '',
    })

    expect(context.activeEstimate).not.toBeNull()
    expect(context.effectiveRequest).toEqual(effectiveRequest)
    expect(context.shareQueryString).toContain('model_hf_repo_id=Qwen%2FQwen3-32B')
  })
})
