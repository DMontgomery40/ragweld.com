import { describe, expect, it } from 'vitest'
import { makeEstimateRequest } from '../engine/__tests__/helpers'
import {
  parseEstimateRequestFromSearch,
  serializeEstimateRequestQuery,
  toQueryString,
} from './useURLState'

describe('estimate request query helpers', () => {
  it('round-trips resolved model structure fields through share URLs', () => {
    const defaults = makeEstimateRequest()
    const state = {
      ...defaults,
      auto_resolve_model_metadata: false,
      model_hf_repo_id: 'Qwen/Qwen3-32B',
      model_hidden_size: 8192,
      model_num_layers: 64,
      model_num_attention_heads: 64,
      model_num_kv_heads: 8,
      model_intermediate_size: 29568,
      model_vocab_size: 151936,
      model_max_position_embeddings: 131072,
      model_module_shapes: {
        q: { in_dim: 8192, out_dim: 8192 },
        o: { in_dim: 8192, out_dim: 8192 },
      },
    }

    const fullQuery = serializeEstimateRequestQuery(state)
    const parsedFromShare = parseEstimateRequestFromSearch(defaults, `?${fullQuery}`)
    const compactQuery = toQueryString(state, defaults)
    const parsedFromCompact = parseEstimateRequestFromSearch(defaults, `?${compactQuery}`)

    expect(parsedFromShare.model_hidden_size).toBe(8192)
    expect(parsedFromShare.model_num_layers).toBe(64)
    expect(parsedFromShare.model_module_shapes).toEqual(state.model_module_shapes)
    expect(compactQuery).toContain('model_hidden_size=8192')
    expect(compactQuery).toContain('model_module_shapes=')
    expect(parsedFromCompact.model_max_position_embeddings).toBe(131072)
    expect(parsedFromCompact.model_module_shapes).toEqual(state.model_module_shapes)
  })

  it('drops malformed module shape overrides from share URLs', () => {
    const defaults = makeEstimateRequest()
    const parsed = parseEstimateRequestFromSearch(
      defaults,
      '?model_module_shapes=%7B%22q%22%3A%7B%22in_dim%22%3A%22oops%22%2C%22out_dim%22%3A4096%7D%7D',
    )

    expect(parsed.model_module_shapes).toBeUndefined()
  })
})
