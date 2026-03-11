import { describe, expect, it } from 'vitest'
import { estimateTraining } from '../training'
import type { TrainingType } from '../../types'
import { makeEstimateRequest } from './helpers'

describe('estimateTraining', () => {
  it('computes deterministic token, step, FLOP, and hour estimates', () => {
    const result = estimateTraining(makeEstimateRequest())

    expect(result.total_tokens).toBe(30_000_000)
    expect(result.effective_batch_tokens).toBeCloseTo(31_129.6, 2)
    expect(result.total_steps).toBe(964)
    expect(result.total_flops).toBeCloseTo(1.14372e19, -14)

    expect(result.assumptions.token_utilization).toBe(0.95)
    expect(result.assumptions.lora_compute_discount).toBe(0.9)
    expect(result.assumptions.mfu).toBe(0.45)
    expect(result.assumptions.speed_multiplier).toBeCloseTo(1.14, 2)
    expect(result.total_flops_range.conservative).toBeGreaterThan(result.total_flops)
    expect(result.estimated_hours_by_gpu_range.H100.conservative).toBeGreaterThan(
      result.estimated_hours_by_gpu.H100,
    )

    expect(result.estimated_hours_by_gpu.H100).toBeCloseTo(6.25, 2)
    expect(result.estimated_hours_by_gpu.A100_80G).toBeCloseTo(19.8, 1)
  })

  it('applies long-context attention penalty warning', () => {
    const result = estimateTraining(
      makeEstimateRequest({
        max_seq_length: 65536,
      }),
    )

    expect(result.assumptions.attention_penalty).toBe(2)
    expect(result.warnings.some((warning) => warning.includes('Long context'))).toBe(true)
  })

  it('treats num_gpus as the total cluster size while applying a multi-node topology penalty', () => {
    const singleNode = estimateTraining(
      makeEstimateRequest({
        target_gpu: ['H100'],
        num_gpus: 8,
        num_nodes: 1,
      }),
    )
    const multiNode = estimateTraining(
      makeEstimateRequest({
        target_gpu: ['H100'],
        num_gpus: 8,
        num_nodes: 2,
      }),
    )

    expect(multiNode.effective_batch_tokens).toBeCloseTo(singleNode.effective_batch_tokens, 5)
    expect(multiNode.total_steps).toBe(singleNode.total_steps)
    expect(multiNode.intermediates.multi_node_topology_multiplier).toBeGreaterThan(1)
    expect(multiNode.estimated_hours_by_gpu.H100).toBeGreaterThan(singleNode.estimated_hours_by_gpu.H100)
  })

  it('uses fused chunked CE to reduce long-context wall-clock estimates', () => {
    const withoutFusedCe = estimateTraining(
      makeEstimateRequest({
        target_gpu: ['H100'],
        max_seq_length: 32768,
        use_fused_chunked_ce_loss: false,
      }),
    )
    const withFusedCe = estimateTraining(
      makeEstimateRequest({
        target_gpu: ['H100'],
        max_seq_length: 32768,
        use_fused_chunked_ce_loss: true,
      }),
    )

    expect(withFusedCe.assumptions.speed_multiplier).toBeGreaterThan(withoutFusedCe.assumptions.speed_multiplier)
    expect(withFusedCe.estimated_hours_by_gpu.H100).toBeLessThan(withoutFusedCe.estimated_hours_by_gpu.H100)
  })

  it('falls back to dataset_rows when dataset_tokens is not provided', () => {
    const result = estimateTraining(
      makeEstimateRequest({
        dataset_tokens: 0,
        dataset_rows: 1000,
        avg_tokens_per_row: 100,
        num_epochs: 2,
      }),
    )

    expect(result.total_tokens).toBe(200_000)
    expect(result.intermediates.dataset_tokens_used).toBe(100_000)
  })

  it('keeps MoE compute conservative instead of collapsing to active-expert ratios', () => {
    const result = estimateTraining(
      makeEstimateRequest({
        model_name: 'qwen3.5-35b-a3b',
        model_params_billions: 35.95,
        architecture: 'MoE',
        moe_total_experts: 256,
        moe_active_experts: 8,
        target_gpu: ['B200'],
        num_gpus: 4,
      }),
    )

    expect(result.assumptions.moe_compute_multiplier).toBe(1)
    expect(result.assumptions.compute_params_billions).toBe(35.95)
    expect(
      result.warnings.some((warning) =>
        warning.includes('MoE compute kept conservative (no active-expert discount)'),
      ),
    ).toBe(true)
    expect(
      result.warnings.some((warning) =>
        warning.includes('Kernel/runtime speedups are damped before wall-clock math'),
      ),
    ).toBe(true)
    expect(result.estimated_hours_by_gpu.B200).toBeGreaterThan(0.3)
  })

  it('uses active parameters for MoE compute when they are explicitly known', () => {
    const conservative = estimateTraining(
      makeEstimateRequest({
        model_name: 'moonshotai/Kimi-K2-Instruct',
        model_params_billions: 1000,
        architecture: 'MoE',
        moe_total_experts: 384,
        moe_active_experts: 8,
        target_gpu: ['H100'],
        num_gpus: 8,
        num_nodes: 2,
      }),
    )

    const resolved = estimateTraining(
      makeEstimateRequest({
        model_name: 'moonshotai/Kimi-K2-Instruct',
        model_hf_repo_id: 'moonshotai/Kimi-K2-Instruct',
        model_params_billions: 1000,
        model_active_params_billions: 32,
        architecture: 'MoE',
        moe_total_experts: 384,
        moe_active_experts: 8,
        target_gpu: ['H100'],
        num_gpus: 8,
        num_nodes: 2,
      }),
    )

    expect(resolved.assumptions.compute_params_billions).toBe(32)
    expect(resolved.assumptions.total_params_billions).toBe(1000)
    expect(resolved.assumptions.moe_compute_multiplier).toBeCloseTo(0.032, 3)
    expect(resolved.total_flops).toBeLessThan(conservative.total_flops / 20)
    expect(resolved.total_flops).toBeGreaterThan(conservative.total_flops / 50)
    expect(
      resolved.warnings.some((warning) =>
        warning.includes('Sparse MoE compute uses 32.00B activated params per token'),
      ),
    ).toBe(true)
  })

  it('does not crash when legacy clients send an unknown training_type enum', () => {
    const result = estimateTraining(
      makeEstimateRequest({
        training_type: 'RL' as unknown as TrainingType,
      }),
    )

    expect(result.total_flops).toBeGreaterThan(0)
    expect(
      result.warnings.some((warning) =>
        warning.includes('Unknown training_type "RL" defaulted to a 1.00x FLOP multiplier.'),
      ),
    ).toBe(true)
    expect(
      result.warnings.some((warning) => warning.includes('RL compute is approximated with a 1.00x multiplier')),
    ).toBe(true)
  })

  it('does not collapse stacked Unsloth MoE QLoRA speedups to peak-chip throughput', () => {
    const result = estimateTraining(
      makeEstimateRequest({
        model_name: 'qwen3.5-35b-a3b',
        model_hf_repo_id: 'unsloth/Qwen3.5-35B-A3B',
        model_params_billions: 35.95,
        model_active_params_billions: 3,
        architecture: 'MoE',
        moe_total_experts: 256,
        moe_active_experts: 8,
        lora_rank: 32,
        lora_alpha: 64,
        dataset_tokens: 10_000_000,
        num_epochs: 30,
        batch_size: 2,
        gradient_accumulation_steps: 8,
        max_seq_length: 4096,
        optimizer: 'muon',
        target_gpu: ['H100'],
        num_gpus: 4,
      }),
    )

    expect(result.intermediates.raw_speed_multiplier).toBeCloseTo(4.356, 3)
    expect(result.assumptions.speed_multiplier).toBeLessThan(1.2)
    expect(result.intermediates.capped_effective_utilization).toBeLessThan(0.55)
    expect(result.estimated_hours_by_gpu.H100).toBeGreaterThan(0.68)
  })
})
