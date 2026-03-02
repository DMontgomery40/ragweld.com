import type {
  EstimateRequest,
  Framework,
  GPUType,
  TrainingEstimate,
  TrainingType,
} from '../types/index'
import { getGPUTFlops, resolveGPUType } from './gpu-specs'

const MFU_BY_FRAMEWORK: Record<Framework, number> = {
  Unsloth: 0.45,
  'HuggingFace+TRL': 0.25,
  Axolotl: 0.35,
  'LLaMA-Factory': 0.35,
  torchtune: 0.3,
  Custom: 0.3,
}

const TRAINING_TYPE_FLOP_MULTIPLIER: Record<TrainingType, number> = {
  SFT: 1.0,
  DPO: 1.15,
  ORPO: 1.2,
  GRPO: 1.8,
  PPO: 2.0,
}

function asNonNegative(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) {
    return fallback
  }
  return value < 0 ? 0 : value
}

function tokenUtilization(params: EstimateRequest): number {
  return params.use_packing || params.packing ? 0.95 : 0.7
}

function speedMultiplier(params: EstimateRequest): number {
  let multiplier = 1.0
  if (params.framework === 'Unsloth') {
    multiplier *= 2.0
    if (params.use_rope_kernels) {
      multiplier *= 1.5
    }
  }
  return multiplier
}

function normalizeTargetGPU(gpu: GPUType): GPUType | string {
  return resolveGPUType(gpu) ?? gpu
}

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
  const practicalFlopsPerSecPerGPU = tflops * 1e12 * mfu * speed
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

  const inferredDatasetTokens =
    asNonNegative(params.dataset_rows ?? 0) * asNonNegative(params.avg_tokens_per_row)
  const datasetTokens = params.dataset_tokens > 0 ? params.dataset_tokens : inferredDatasetTokens
  const epochs = asNonNegative(params.num_epochs, 1)
  const totalTokens = asNonNegative(datasetTokens) * epochs

  const utilization = tokenUtilization(params)
  const effectiveSeq = asNonNegative(params.max_seq_length) * utilization
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

  const modelParams = asNonNegative(params.model_params_billions) * 1e9
  const baseTotalFLOPs = 6 * modelParams * totalTokens
  const loraComputeDiscount = params.method === 'LoRA' || params.method === 'QLoRA' ? 0.9 : 1.0

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

  const totalFLOPs = baseTotalFLOPs * loraComputeDiscount * attentionPenalty * rlMultiplier
  const frameworkMFU = MFU_BY_FRAMEWORK[params.framework]
  const frameworkSpeedMultiplier = speedMultiplier(params)

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
  intermediates.lora_compute_discount = loraComputeDiscount
  intermediates.attention_penalty = attentionPenalty
  intermediates.training_type_multiplier = rlMultiplier
  intermediates.framework_mfu = frameworkMFU
  intermediates.framework_speed_multiplier = frameworkSpeedMultiplier
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
    },
    intermediates,
    warnings,
  }
}
