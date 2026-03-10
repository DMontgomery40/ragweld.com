import { describe, expect, it } from 'vitest'
import {
  estimateParamsBillions,
  hydrateEstimateRequestModel,
} from '../../../../netlify/functions/crucible-model-resolution'
import {
  normalizeEstimateRequest,
  rowMatchesRequestFilters,
} from '../../../../netlify/functions/estimate'
import { makeEstimateRequest } from './helpers'

describe('rowMatchesRequestFilters', () => {
  it('matches pricing rows by GPUs per node for multi-node requests', () => {
    const request = makeEstimateRequest({
      target_gpu: ['H100'],
      num_gpus: 8,
      num_nodes: 2,
    })

    expect(
      rowMatchesRequestFilters(request, {
        provider: 'horizon',
        gpu: 'H100',
        num_gpus: 4,
        cloud_instance_type: 'H100-4x',
        availability: [{ region: 'any', available: true }],
      }),
    ).toBe(true)

    expect(
      rowMatchesRequestFilters(request, {
        provider: 'horizon',
        gpu: 'H100',
        num_gpus: 8,
        cloud_instance_type: 'H100-8x',
        availability: [{ region: 'any', available: true }],
      }),
    ).toBe(false)
  })

  it('skips model hydration when manual overrides disable auto resolution', async () => {
    const request = makeEstimateRequest({
      model_name: 'qwen3-32b',
      model_hf_repo_id: 'unsloth/Qwen3-32B',
      auto_resolve_model_metadata: false,
      model_params_billions: 999,
    })

    const hydrated = await hydrateEstimateRequestModel(request)

    expect(hydrated.request).toEqual(request)
    expect(hydrated.model_resolution).toBeNull()
    expect(hydrated.normalizations).toEqual([])
  })

  it('keeps model auto-resolution opt-in for API callers that omit the new flag', () => {
    const {
      auto_resolve_model_metadata: _autoResolveModelMetadata,
      ...request
    } = makeEstimateRequest({
        model_name: 'Qwen/Qwen3-32B',
        model_hf_repo_id: 'Qwen/Qwen3-32B',
      })
    void _autoResolveModelMetadata

    const normalized = normalizeEstimateRequest(request as ReturnType<typeof makeEstimateRequest> & Record<string, unknown>)

    expect(normalized.request.auto_resolve_model_metadata).toBe(false)
  })

  it('expands MoE expert blocks when estimating total params from config-only metadata', () => {
    const denseEstimate = estimateParamsBillions({
      hiddenSize: 4096,
      layers: 32,
      numAttentionHeads: 32,
      numKVHeads: 8,
      intermediateSize: 14336,
      vocabSize: 128000,
      architecture: 'dense',
    })
    const moeEstimate = estimateParamsBillions({
      hiddenSize: 4096,
      layers: 32,
      numAttentionHeads: 32,
      numKVHeads: 8,
      intermediateSize: 14336,
      vocabSize: 128000,
      architecture: 'moe',
      moeTotalExperts: 16,
    })

    expect(moeEstimate).toBeGreaterThan(denseEstimate * 5)
  })
})
