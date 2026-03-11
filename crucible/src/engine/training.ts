import type {
  EstimateRequest,
  Framework,
  GPUType,
  SupportTier,
  TrainingEstimate,
  TrainingType,
} from '../types/index'
import { getGPUTFlops, resolveGPUType } from './gpu-specs'
import { buildRangeFromTypical, deriveSupportUncertaintyTier, roundRange } from './ranges'

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
const MAX_EFFECTIVE_UTILIZATION = 0.72
const SPEED_MULTIPLIER_CONFIDENCE = 0.15
const MAX_MULTI_NODE_TOPOLOGY_PENALTY = 0.3

interface TrainingUncertaintyProfile {
  score: number
  optimisticSpread: number
  conservativeSpread: number
  reasons: string[]
}

interface EstimateTrainingOptions {
  supportTier?: SupportTier
}

function asNonNegative(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) {
    return fallback
  }
  return value < 0 ? 0 : value
}

function resolveComputeParamsBillions(params: EstimateRequest, warnings: string[]): number {
  const totalParams = asNonNegative(params.model_params_billions)
  const activeParams = asNonNegative(params.model_active_params_billions ?? 0)

  if (params.architecture !== 'MoE') {
    return totalParams
  }

  if (activeParams > 0 && activeParams < totalParams) {
    warnings.push(
      `Sparse MoE compute uses ${activeParams.toFixed(2)}B activated params per token while VRAM and model capacity stay at ${totalParams.toFixed(2)}B total params.`,
    )
    return activeParams
  }

  if (
    params.moe_total_experts > 1 &&
    params.moe_active_experts > 0 &&
    params.moe_active_experts < params.moe_total_experts
  ) {
    warnings.push(
      'MoE activated params per token are unknown, so compute stays conservative on total parameters.',
    )
  }

  return totalParams
}

// Packing increases average useful tokens per sequence by reducing pad-token waste.
function tokenUtilization(params: EstimateRequest): number {
  return params.use_packing || params.packing ? 0.95 : 0.7
}

// Framework-specific speed factors represent kernel/runtime efficiencies beyond raw TFLOPS.
function advertisedSpeedMultiplier(params: EstimateRequest): number {
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
  if (params.use_fused_chunked_ce_loss && params.max_seq_length >= 32768) {
    multiplier *= 1.08
  }
  if (params.architecture === 'MoE' && params.framework === 'Unsloth' && params.use_faster_moe_kernels) {
    multiplier *= 1.1
  }
  return multiplier
}

function runtimePenaltyMultiplier(params: EstimateRequest): number {
  let multiplier = 1.0

  // Checkpointing lowers VRAM but adds recompute on the backward pass.
  if (params.use_gradient_checkpointing) {
    multiplier *= 0.85
  }

  // 4-bit adapter paths typically lag pure bf16 dense-kernel throughput.
  if (params.method === 'QLoRA') {
    multiplier *= 0.93
  }

  // MoE routing/runtime overhead is not fully captured by active-parameter FLOP math.
  if (params.architecture === 'MoE') {
    multiplier *= 0.92
  }

  return multiplier
}

function customSpeedMultiplier(params: EstimateRequest): number {
  if (params.custom_speed_multiplier && params.custom_speed_multiplier > 0) {
    return params.custom_speed_multiplier
  }
  return 1
}

function speedMultiplier(params: EstimateRequest): number {
  const rawMultiplier = advertisedSpeedMultiplier(params)
  const dampedKernelMultiplier =
    rawMultiplier <= 1 ? rawMultiplier : 1 + (rawMultiplier - 1) * SPEED_MULTIPLIER_CONFIDENCE
  return dampedKernelMultiplier * runtimePenaltyMultiplier(params) * customSpeedMultiplier(params)
}

function multiNodeTopologyMultiplier(nodeCount: number): number {
  if (nodeCount <= 1) {
    return 1
  }
  return 1 + Math.min(MAX_MULTI_NODE_TOPOLOGY_PENALTY, 0.08 * (nodeCount - 1))
}

function normalizeTargetGPU(gpu: GPUType): GPUType | string {
  return resolveGPUType(gpu) ?? gpu
}

function deriveTrainingUncertainty(
  params: EstimateRequest,
  supportTier: SupportTier | undefined,
): TrainingUncertaintyProfile {
  let score = 0.06
  const reasons: string[] = []

  const supportTierScore = deriveSupportUncertaintyTier(supportTier ?? 'inferred')
  if (supportTierScore > 0) {
    score += supportTierScore
    reasons.push(`Support tier ${supportTier ?? 'inferred'} widens time/cost ranges.`)
  }

  if (params.framework !== 'Unsloth') {
    score += 0.12
    reasons.push('Non-Unsloth frameworks are modeled as provisional in this planner.')
  } else if (params.workflow_mode === 'custom_pipeline') {
    score += 0.05
    reasons.push('Custom pipeline mode widens timing estimates relative to guided paths.')
  }

  if (params.training_type !== 'SFT') {
    const increment = params.training_type === 'PPO' ? 0.14 : 0.08
    score += increment
    reasons.push(`${params.training_type} post-training is wider than pure SFT planning.`)
  }

  if (params.use_qat) {
    score += 0.04
    reasons.push('QAT is modeled with a wider range because runtime overhead varies across implementations.')
  }

  if (params.architecture === 'MoE') {
    score += 0.05
    reasons.push('MoE timing remains conservative because router/runtime behavior varies by implementation.')
  }

  if (params.max_seq_length >= 32768) {
    score += Math.min(0.12, 0.04 + (params.max_seq_length / 32768 - 1) * 0.03)
    reasons.push('Long-context runs widen the training-time range.')
  }

  if (params.num_gpus > 1) {
    score += 0.05
    reasons.push('Distributed training widens the range because host feed and communication overhead can vary.')
  }

  if (params.num_nodes > 1) {
    score += 0.12
    reasons.push('Multi-node runs widen the range materially.')
  }

  if (params.optimizer === 'muon') {
    score += 0.03
    reasons.push('Muon gains are treated as a low-confidence planner input.')
  }

  const optimisticSpread = Math.min(0.3, 0.1 + score * 0.35)
  const conservativeSpread = Math.min(0.8, 0.16 + score * 0.7)

  return {
    score,
    optimisticSpread,
    conservativeSpread,
    reasons,
  }
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
  const effectiveUtilization = Math.min(MAX_EFFECTIVE_UTILIZATION, requestedUtilization)
  const practicalFlopsPerSecPerGPU = tflops * 1e12 * effectiveUtilization
  const gpuCount = Math.max(1, asNonNegative(numGPUsOverride ?? params.num_gpus, 1))
  const topologyMultiplier = multiNodeTopologyMultiplier(Math.max(1, asNonNegative(params.num_nodes, 1)))
  const trainingSeconds = totalFLOPs / (practicalFlopsPerSecPerGPU * gpuCount)
  return (trainingSeconds / 3600) * topologyMultiplier
}

export function estimateTrainingHoursForGPU(
  params: EstimateRequest,
  totalFLOPs: number,
  gpu: GPUType | string,
  numGPUsOverride?: number,
): number | null {
  return estimateHours(params, totalFLOPs, gpu, numGPUsOverride)
}

export function estimateTraining(
  params: EstimateRequest,
  options: EstimateTrainingOptions = {},
): TrainingEstimate {
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
    effectiveSeq

  let totalSteps = 0
  if (effectiveBatchTokens > 0) {
    totalSteps = Math.ceil(totalTokens / effectiveBatchTokens)
  } else {
    warnings.push('Effective batch tokens evaluated to 0; training steps set to 0.')
  }

  // Dense-transformer planning rule of thumb: ~6 * params * tokens for training FLOPs.
  const totalModelParams = asNonNegative(params.model_params_billions) * 1e9
  const computeModelParams = resolveComputeParamsBillions(params, warnings) * 1e9
  const trainingFLOPs = 6 * computeModelParams * totalTokens
  const forwardOnlyFLOPs = 2 * computeModelParams * forwardOnlyTokens
  const baseTotalFLOPs = trainingFLOPs + forwardOnlyFLOPs
  const loraComputeDiscount = params.method === 'LoRA' || params.method === 'QLoRA' ? 0.9 : 1.0

  const moeComputeMultiplier =
    totalModelParams > 0 ? Math.min(1, computeModelParams / totalModelParams) : 1.0
  if (
    params.architecture === 'MoE' &&
    params.moe_total_experts > 0 &&
    params.moe_active_experts > 0 &&
    params.moe_active_experts < params.moe_total_experts &&
    computeModelParams === totalModelParams
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

  const trainingTypeKey = params.training_type as keyof typeof TRAINING_TYPE_FLOP_MULTIPLIER
  const rlMultiplier = TRAINING_TYPE_FLOP_MULTIPLIER[trainingTypeKey] ?? 1.0
  if (!(trainingTypeKey in TRAINING_TYPE_FLOP_MULTIPLIER)) {
    warnings.push(`Unknown training_type "${params.training_type}" defaulted to a 1.00x FLOP multiplier.`)
  }
  if (params.training_type !== 'SFT') {
    warnings.push(
      `${params.training_type} compute is approximated with a ${rlMultiplier.toFixed(2)}x multiplier over SFT FLOPs.`,
    )
  }

  const totalFLOPs =
    baseTotalFLOPs * loraComputeDiscount * attentionPenalty * rlMultiplier * qatComputeMultiplier
  const uncertaintyProfile = deriveTrainingUncertainty(params, options.supportTier)
  const totalFlopsRange = roundRange(
    buildRangeFromTypical(totalFLOPs, {
      optimisticSpread: uncertaintyProfile.optimisticSpread,
      conservativeSpread: uncertaintyProfile.conservativeSpread,
    }),
  )
  const frameworkMFU = MFU_BY_FRAMEWORK[params.framework]
  const baseAdvertisedSpeedMultiplier = advertisedSpeedMultiplier(params)
  const userSpeedMultiplier = customSpeedMultiplier(params)
  const rawSpeedMultiplier = baseAdvertisedSpeedMultiplier * userSpeedMultiplier
  const dampedKernelSpeedMultiplier =
    baseAdvertisedSpeedMultiplier <= 1
      ? baseAdvertisedSpeedMultiplier
      : 1 + (baseAdvertisedSpeedMultiplier - 1) * SPEED_MULTIPLIER_CONFIDENCE
  const runtimePenalty = runtimePenaltyMultiplier(params)
  const frameworkSpeedMultiplier = dampedKernelSpeedMultiplier * runtimePenalty * userSpeedMultiplier
  const rawRequestedEffectiveUtilization = frameworkMFU * rawSpeedMultiplier
  const requestedEffectiveUtilization = frameworkMFU * frameworkSpeedMultiplier
  const cappedEffectiveUtilization = Math.min(MAX_EFFECTIVE_UTILIZATION, requestedEffectiveUtilization)
  const topologyMultiplier = multiNodeTopologyMultiplier(Math.max(1, asNonNegative(params.num_nodes, 1)))

  if (rawSpeedMultiplier > frameworkSpeedMultiplier * 1.2) {
    warnings.push(
      'Kernel/runtime speedups are damped before wall-clock math so benchmark deltas do not multiply directly into peak TFLOPs.',
    )
  }

  if (requestedEffectiveUtilization > MAX_EFFECTIVE_UTILIZATION) {
    warnings.push(
      `Throughput capped at ${MAX_EFFECTIVE_UTILIZATION.toFixed(2)}x practical utilization (requested ${requestedEffectiveUtilization.toFixed(2)}x).`,
    )
  }

  const estimatedHoursByGPU: Record<string, number> = {}
  const estimatedHoursByGPURange: Record<string, TrainingEstimate['estimated_hours_by_gpu_range'][string]> = {}
  const dedupedGPUs = new Set(params.target_gpu.map(normalizeTargetGPU))
  for (const gpu of dedupedGPUs) {
    const hours = estimateHours(params, totalFLOPs, gpu)
    if (hours === null) {
      warnings.push(`No GPU throughput spec for ${gpu}; training hours unavailable for that target.`)
      continue
    }
    estimatedHoursByGPU[gpu] = hours
    estimatedHoursByGPURange[gpu] = roundRange(
      buildRangeFromTypical(hours, {
        optimisticSpread: uncertaintyProfile.optimisticSpread,
        conservativeSpread: uncertaintyProfile.conservativeSpread,
      }),
    )
    intermediates[`estimated_hours_${gpu}`] = hours
  }

  if (dedupedGPUs.size === 0) {
    warnings.push('No target GPUs were provided; estimated_hours_by_gpu is empty.')
  }

  intermediates.model_total_params = totalModelParams
  intermediates.model_compute_params = computeModelParams
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
  intermediates.raw_speed_multiplier = rawSpeedMultiplier
  intermediates.damped_kernel_speed_multiplier = dampedKernelSpeedMultiplier
  intermediates.runtime_penalty_multiplier = runtimePenalty
  intermediates.speed_multiplier_confidence = SPEED_MULTIPLIER_CONFIDENCE
  intermediates.framework_speed_multiplier = frameworkSpeedMultiplier
  intermediates.raw_requested_effective_utilization = rawRequestedEffectiveUtilization
  intermediates.requested_effective_utilization = requestedEffectiveUtilization
  intermediates.capped_effective_utilization = cappedEffectiveUtilization
  intermediates.multi_node_topology_multiplier = topologyMultiplier
  intermediates.total_flops = totalFLOPs
  intermediates.training_uncertainty_score = uncertaintyProfile.score
  intermediates.training_optimistic_spread = uncertaintyProfile.optimisticSpread
  intermediates.training_conservative_spread = uncertaintyProfile.conservativeSpread

  return {
    total_tokens: totalTokens,
    effective_batch_tokens: effectiveBatchTokens,
    total_steps: totalSteps,
    total_flops: totalFLOPs,
    total_flops_range: totalFlopsRange,
    estimated_hours_by_gpu: estimatedHoursByGPU,
    estimated_hours_by_gpu_range: estimatedHoursByGPURange,
    assumptions: {
      token_utilization: utilization,
      lora_compute_discount: loraComputeDiscount,
      mfu: frameworkMFU,
      speed_multiplier: frameworkSpeedMultiplier,
      attention_penalty: attentionPenalty,
      total_params_billions: Number((totalModelParams / 1e9).toFixed(2)),
      compute_params_billions: Number((computeModelParams / 1e9).toFixed(2)),
      active_params_billions: params.model_active_params_billions,
      moe_compute_multiplier: moeComputeMultiplier,
      qat_compute_multiplier: qatComputeMultiplier,
      custom_speed_multiplier: params.custom_speed_multiplier,
      reference_model_pct: referencePct,
      uncertainty_score: uncertaintyProfile.score,
      optimistic_spread: uncertaintyProfile.optimisticSpread,
      conservative_spread: uncertaintyProfile.conservativeSpread,
    },
    intermediates,
    range_reasons: uncertaintyProfile.reasons,
    warnings,
  }
}
