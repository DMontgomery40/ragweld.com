import { describe, expect, it } from 'vitest'
import { getModelConfig, getModelConfigFromRequest, resolveModuleShape } from '../models'
import { makeEstimateRequest } from './helpers'

describe('model config resolution', () => {
  it('applies resolved-model structural overrides from request', () => {
    const request = makeEstimateRequest({
      model_name: 'custom/repo-model',
      model_params_billions: 9.8,
      architecture: 'Dense',
      model_hidden_size: 5120,
      model_num_layers: 48,
      model_num_attention_heads: 40,
      model_num_kv_heads: 8,
      model_intermediate_size: 13824,
      model_vocab_size: 200000,
      model_max_position_embeddings: 131072,
      model_module_shapes: {
        q: { in_dim: 5120, out_dim: 5120 },
      },
    })

    const model = getModelConfigFromRequest(request)

    expect(model.hidden_size).toBe(5120)
    expect(model.num_layers).toBe(48)
    expect(model.num_attention_heads).toBe(40)
    expect(model.num_kv_heads).toBe(8)
    expect(model.intermediate_size).toBe(13824)
    expect(model.vocab_size).toBe(200000)
    expect(model.max_position_embeddings).toBe(131072)
    expect(model.module_shapes?.q?.out_dim).toBe(5120)
  })

  it('uses KV-head width for default k/v LoRA shapes on GQA models', () => {
    const model = getModelConfig('qwen2.5-7b-instruct', 7.6)
    const q = resolveModuleShape(model, 'q')
    const k = resolveModuleShape(model, 'k')
    const v = resolveModuleShape(model, 'v')

    expect(q.out_dim).toBe(3584)
    expect(k.out_dim).toBe(512)
    expect(v.out_dim).toBe(512)
  })

  it('falls back to default module shapes when an override is malformed at runtime', () => {
    const request = {
      ...makeEstimateRequest({
        model_name: 'qwen2.5-7b-instruct',
        model_params_billions: 7.6,
      }),
      model_module_shapes: {
        q: {
          in_dim: 'oops',
          out_dim: 4096,
        },
      },
    } as unknown as ReturnType<typeof makeEstimateRequest>

    const model = getModelConfigFromRequest(request)
    const q = resolveModuleShape(model, 'q')

    expect(q.out_dim).toBe(3584)
  })
})
