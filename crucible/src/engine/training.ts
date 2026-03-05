import type {
  EstimateRequest,
  Framework,
  GPUType,
  TrainingEstimate,
  TrainingType,
} from '../types/index'
import { getGPUTFlops, resolveGPUType } from './gpu-specs'

// MFU (model flops utilization) defaults are coarse planning values, not hard guarantees.
const MFU_BY_FRAMEWORK: Record<Framework, number> = {
  Unsloth: 0.45,
  'HuggingFace+TRL': 0.25,
  Axolotl: 0.35,
  'LLaMA-Factory': 0.35,
  torchtune: 0.3,
  Custom: 0.3,
}

// RL-style post-training often requires more compute per token than pure SFT.
const TRAINING_TYPE_FLOP_MULTIPLIER: Record<TrainingType, number> = {
  SFT: 1.0,
  DPO: 1.15,
  ORPO: 1.2,
  GRPO: 1.0,
  GSPO: 1.0,
  PPO: 2.0,
  SimPO: 1.1,
}
const MAX_MOE_EFFECTIVE_UTILIZATION = 1.0

function asNonNegative(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) {
    return fallback
  }
  return value < 0 ? 0 : value
}

// Packing increases average useful tokens per sequence by reducing pad-token waste.
function tokenUtilization(params: EstimateRequest): number {
  return params.use_packing || params.packing ? 0.95 : 0.7
}

// Framework-specific speed factors represent kernel/runtime efficiencies beyond raw TFLOPS.
function speedMultiplier(params: EstimateRequest): number {
  let multiplier = 1.0
  if (params.framework === 'Unsloth') {
    multiplier *= 2.0
  }
  if (params.use_flash_attention) {
    multiplier *= 1.2
  }
  if (params.use_triton_kernels) {
    multiplier *= 1.1
  }
  if (params.use_rope_kernels) {
    multiplier *= 1.5
  }
  if (params.architecture === 'MoE' && params.framework === 'Unsloth' && params.use_faster_moe_kernels) {
    multiplier *= 1.1
  }
  if (params.custom_speed_multiplier && params.custom_speed_multiplier > 0) {
    multiplier *= params.custom_speed_multiplier
  }
  return multiplier
}

function normalizeTargetGPU(gpu: GPUType): GPUType | string {
  return resolveGPUType(gpu) ?? gpu
}

// Convert total workload FLOPs into wall-clock time from per-GPU throughput and parallelism.
function estimateHours(
  params: EstimateRequest,
  totalFLOPs: number,
  gpu: GPUType | string,
  numGPUsOverride?: number,
): number | null {
  const tflops = getGPUTFlops(gpu, params.precision)
  if (!tflops || tflops <= 0) {
    return null
  }
  const mfu = MFU_BY_FRAMEWORK[params.framework]
  const speed = speedMultiplier(params)
  const requestedUtilization = mfu * speed
  const effectiveUtilization =
    params.architecture === 'MoE'
      ? Math.min(MAX_MOE_EFFECTIVE_UTILIZATION, requestedUtilization)
      : requestedUtilization
  const practicalFlopsPerSecPerGPU = tflops * 1e12 * effectiveUtilization
  const gpuCount = Math.max(1, asNonNegative(numGPUsOverride ?? params.num_gpus, 1))
  const nodeCount = Math.max(1, asNonNegative(params.num_nodes, 1))
  const trainingSeconds = totalFLOPs / (practicalFlopsPerSecPerGPU * gpuCount * nodeCount)
  return trainingSeconds / 3600
}

export function estimateTrainingHoursForGPU(
  params: EstimateRequest,
  totalFLOPs: number,
  gpu: GPUType | string,
  numGPUsOverride?: number,
): number | null {
  return estimateHours(params, totalFLOPs, gpu, numGPUsOverride)
}

export function estimateTraining(params: EstimateRequest): TrainingEstimate {
  const warnings: string[] = []
  const intermediates: Record<string, number> = {}

  // If dataset_tokens is missing/0, infer it from row count and average row length.
  const inferredDatasetTokens =
    asNonNegative(params.dataset_rows ?? 0) * asNonNegative(params.avg_tokens_per_row)
  const datasetTokens = params.dataset_tokens > 0 ? params.dataset_tokens : inferredDatasetTokens
  const epochs = asNonNegative(params.num_epochs, 1)
  const baseTokens = asNonNegative(datasetTokens) * epochs

  const isGrpo = params.training_type === 'GRPO' || params.training_type === 'GSPO'
  const generations = isGrpo ? Math.max(1, Math.round(asNonNegative(params.grpo_num_generations, 1))) : 0
  const referencePct = Math.min(100, Math.max(0, asNonNegative(params.reference_model_pct, 100)))

  let totalTokens = baseTokens
  let forwardOnlyTokens = 0

  if (isGrpo) {
    const inferredRows =
      params.dataset_rows ??
      (params.avg_tokens_per_row > 0 ? Math.round(datasetTokens / params.avg_tokens_per_row) : 0)
    if (!inferredRows || inferredRows <= 0) {
      warnings.push(
        'GRPO/GSPO assumes dataset_rows (or avg_tokens_per_row) is set so we can model prompt count. Falling back to dataset_tokens for token math.',
      )
    } else {
      const prompts = Math.max(1, inferredRows)
      const seqLen = Math.max(1, Math.round(asNonNegative(params.max_seq_length, 1)))
      totalTokens = prompts * generations * seqLen * epochs
      // Forward-only passes: generation + (optional) reference model KL.
      forwardOnlyTokens = totalTokens * (1 + referencePct / 100)
      warnings.push(
        `GRPO/GSPO tokens estimated as prompts (${prompts}) * generations (${generations}) * seq_len (${seqLen}) * epochs (${epochs}).`,
      )
    }
  }

  const utilization = tokenUtilization(params)
  const effectiveSeq = asNonNegative(params.max_seq_length) * utilization
  // Global token throughput per optimizer step.
  const effectiveBatchTokens =
    asNonNegative(params.batch_size, 1) *
    asNonNegative(params.gradient_accumulation_steps, 1) *
    Math.max(1, asNonNegative(params.num_gpus, 1)) *
    Math.max(1, asNonNegative(params.num_nodes, 1)) *
    effectiveSeq

  let totalSteps = 0
  if (effectiveBatchTokens > 0) {
    totalSteps = Math.ceil(totalTokens / effectiveBatchTokens)
  } else {
    warnings.push('Effective batch tokens evaluated to 0; training steps set to 0.')
  }

  // Dense-transformer planning rule of thumb: ~6 * params * tokens for training FLOPs.
  const modelParams = asNonNegative(params.model_params_billions) * 1e9
  const trainingFLOPs = 6 * modelParams * totalTokens
  const forwardOnlyFLOPs = 2 * modelParams * forwardOnlyTokens
  const baseTotalFLOPs = trainingFLOPs + forwardOnlyFLOPs
  const loraComputeDiscount = params.method === 'LoRA' || params.method === 'QLoRA' ? 0.9 : 1.0

  // Routing-only MoE discounts can produce severe underestimates in real deployments.
  // Keep MoE compute conservative until we have architecture-aware calibration data.
  const moeComputeMultiplier = 1.0
  if (
    params.architecture === 'MoE' &&
    params.moe_total_experts > 0 &&
    params.moe_active_experts > 0 &&
    params.moe_active_experts < params.moe_total_experts
  ) {
    warnings.push(
      `MoE compute kept conservative (no active-expert discount) despite routing ${params.moe_active_experts}/${params.moe_total_experts}.`,
    )
  }

  const qatComputeMultiplier = params.use_qat ? 1.05 : 1.0
  if (params.use_qat) {
    warnings.push('QAT compute overhead modeled as +5% (heuristic).')
  }

  let attentionPenalty = 1.0
  if (params.max_seq_length >= 32768) {
    attentionPenalty = params.max_seq_length / 32768
    warnings.push(
      `Long context (${params.max_seq_length}) can increase attention compute; applying ${attentionPenalty.toFixed(2)}x penalty.`,
    )
  }

  const rlMultiplier = TRAINING_TYPE_FLOP_MULTIPLIER[params.training_type]
  if (params.training_type !== 'SFT') {
    warnings.push(
      `${params.training_type} compute is approximated with a ${rlMultiplier.toFixed(2)}x multiplier over SFT FLOPs.`,
    )
  }

  const totalFLOPs =
    baseTotalFLOPs * loraComputeDiscount * attentionPenalty * rlMultiplier * moeComputeMultiplier * qatComputeMultiplier
  const frameworkMFU = MFU_BY_FRAMEWORK[params.framework]
  const frameworkSpeedMultiplier = speedMultiplier(params)
  const requestedEffectiveUtilization = frameworkMFU * frameworkSpeedMultiplier
  const cappedEffectiveUtilization =
    params.architecture === 'MoE'
      ? Math.min(MAX_MOE_EFFECTIVE_UTILIZATION, requestedEffectiveUtilization)
      : requestedEffectiveUtilization

  if (params.architecture === 'MoE' && requestedEffectiveUtilization > MAX_MOE_EFFECTIVE_UTILIZATION) {
    warnings.push(
      `MoE throughput capped at ${MAX_MOE_EFFECTIVE_UTILIZATION.toFixed(2)}x peak utilization (requested ${requestedEffectiveUtilization.toFixed(2)}x).`,
    )
  }

  const estimatedHoursByGPU: Record<string, number> = {}
  const dedupedGPUs = new Set(params.target_gpu.map(normalizeTargetGPU))
  for (const gpu of dedupedGPUs) {
    const hours = estimateHours(params, totalFLOPs, gpu)
    if (hours === null) {
      warnings.push(`No GPU throughput spec for ${gpu}; training hours unavailable for that target.`)
      continue
    }
    estimatedHoursByGPU[gpu] = hours
    intermediates[`estimated_hours_${gpu}`] = hours
  }

  if (dedupedGPUs.size === 0) {
    warnings.push('No target GPUs were provided; estimated_hours_by_gpu is empty.')
  }

  intermediates.dataset_tokens_used = datasetTokens
  intermediates.total_tokens = totalTokens
  intermediates.token_utilization = utilization
  intermediates.effective_seq = effectiveSeq
  intermediates.effective_batch_tokens = effectiveBatchTokens
  intermediates.base_total_flops = baseTotalFLOPs
  intermediates.training_flops = trainingFLOPs
  intermediates.forward_only_tokens = forwardOnlyTokens
  intermediates.forward_only_flops = forwardOnlyFLOPs
  intermediates.lora_compute_discount = loraComputeDiscount
  intermediates.attention_penalty = attentionPenalty
  intermediates.training_type_multiplier = rlMultiplier
  intermediates.moe_compute_multiplier = moeComputeMultiplier
  intermediates.qat_compute_multiplier = qatComputeMultiplier
  intermediates.framework_mfu = frameworkMFU
  intermediates.framework_speed_multiplier = frameworkSpeedMultiplier
  intermediates.requested_effective_utilization = requestedEffectiveUtilization
  intermediates.capped_effective_utilization = cappedEffectiveUtilization
  intermediates.total_flops = totalFLOPs

  return {
    total_tokens: totalTokens,
    effective_batch_tokens: effectiveBatchTokens,
    total_steps: totalSteps,
    total_flops: totalFLOPs,
    estimated_hours_by_gpu: estimatedHoursByGPU,
    assumptions: {
      token_utilization: utilization,
      lora_compute_discount: loraComputeDiscount,
      mfu: frameworkMFU,
      speed_multiplier: frameworkSpeedMultiplier,
      attention_penalty: attentionPenalty,
      moe_compute_multiplier: moeComputeMultiplier,
      qat_compute_multiplier: qatComputeMultiplier,
      custom_speed_multiplier: params.custom_speed_multiplier,
      reference_model_pct: referencePct,
    },
    intermediates,
    warnings,
  }
}
