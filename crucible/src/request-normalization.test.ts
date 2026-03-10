import { describe, expect, it } from 'vitest'
import { makeEstimateRequest } from './engine/__tests__/helpers'
import { normalizeLegacyEstimateRequest } from './request-normalization'
import type { TrainingType } from './types'

describe('normalizeLegacyEstimateRequest', () => {
  it('maps legacy RL fields onto the current training request shape', () => {
    const result = normalizeLegacyEstimateRequest({
      ...makeEstimateRequest({
        training_type: 'SFT',
        grpo_num_generations: 0,
        max_seq_length: 0,
        num_epochs: 0,
      }),
      training_type: 'RL' as unknown as TrainingType,
      rl: true,
      rl_algorithm: 'GSPO',
      rl_generations_per_prompt: 6,
      context_length: 32768,
      epochs: 12,
    })

    expect(result.request.training_type).toBe('GSPO')
    expect(result.request.grpo_num_generations).toBe(6)
    expect(result.request.max_seq_length).toBe(32768)
    expect(result.request.num_epochs).toBe(12)
    expect(result.normalizations.map((entry) => entry.field)).toEqual([
      'training_type',
      'num_epochs',
      'max_seq_length',
      'grpo_num_generations',
    ])
    expect(result.warnings).toEqual([])
  })

  it('treats SimPO case-insensitively in legacy aliases', () => {
    const result = normalizeLegacyEstimateRequest({
      ...makeEstimateRequest({
        training_type: 'SFT',
      }),
      training_type: 'RL' as unknown as TrainingType,
      rl: true,
      rl_algorithm: 'simpo',
    })

    expect(result.request.training_type).toBe('SimPO')
    expect(result.warnings).toEqual([])
  })
})
