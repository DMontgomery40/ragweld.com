import type {
  EstimateRequest,
  FineTuneMethod,
  Framework,
  Optimizer,
  QuantizationBits,
  QuantizationProfile,
  VRAMEstimateDetails,
} from '../types/index'
import { getModelConfigFromRequest, resolveModuleShape } from './models'

const BYTES_IN_GIB = 1024 ** 3
const DEFAULT_LORA_TARGETS: EstimateRequest['lora_target_modules'] = ['q', 'k', 'v', 'o']

// Storage bytes per model parameter for each quantization setting.
const WEIGHT_BYTES_PER_PARAM: Record<QuantizationBits, number> = {
  4: 0.5,
  8: 1,
  16: 2,
  32: 4,
}

// Extra memory tax for quantization metadata/scales/aux tensors.
const QUANT_METADATA_MULTIPLIER: Record<QuantizationBits, number> = {
  4: 1.1,
  8: 1.02,
  16: 1.0,
  32: 1.0,
}

const FOUR_BIT_QUANTIZATION_PROFILES: QuantizationProfile[] = [
  'nf4',
  'fp4',
  'mxfp4',
  'dynamic_4bit',
  'dynamic_2_0',
]

// These are planning multipliers, not hardware-level guarantees.
// They model metadata/scaling overhead differences between common 4-bit profiles.
const FOUR_BIT_PROFILE_METADATA_MULTIPLIER: Record<
  Extract<QuantizationProfile, 'nf4' | 'fp4' | 'mxfp4' | 'dynamic_4bit' | 'dynamic_2_0'>,
  number
> = {
  nf4: 1.1,
  fp4: 1.12,
  mxfp4: 1.08,
  dynamic_4bit: 1.16,
  dynamic_2_0: 1.15,
}

// Optimizer state memory per trainable parameter.
const OPTIMIZER_BYTES_PER_PARAM: Record<Optimizer, number> = {
  adamw: 8,
  adamw_8bit: 2,
  paged_adamw_8bit: 2,
  sgd: 4,
  muon: 4,
}

// Framework multipliers approximate runtime/allocator overhead beyond raw tensor sizes.
const FRAMEWORK_OVERHEAD_MULTIPLIER: Record<Framework, number> = {
  Unsloth: 0.35,
  'HuggingFace+TRL': 1.0,
  Axolotl: 0.85,
  'LLaMA-Factory': 0.8,
  torchtune: 0.9,
  Custom: 1.0,
}

// Small-model estimates otherwise undershoot known references without a fixed runtime tax.
const FRAMEWORK_RUNTIME_OVERHEAD_GB: Record<Framework, number> = {
  Unsloth: 0.8,
  'HuggingFace+TRL': 1.2,
  Axolotl: 1.0,
  'LLaMA-Factory': 1.0,
  torchtune: 1.0,
  Custom: 1.2,
}

interface UnslothReferencePoint {
  label: string
  method: FineTuneMethod
  quantization_bits: QuantizationBits
  min_params_billions: number
  max_params_billions: number
  vram_gb: number
}

const UNSLOTH_REFERENCE_TABLE: UnslothReferencePoint[] = [
  {
    label: '1.5B QLoRA 4-bit',
    method: 'QLoRA',
    quantization_bits: 4,
    min_params_billions: 1.2,
    max_params_billions: 1.8,
    vram_gb: 2,
  },
  {
    label: '3B QLoRA 4-bit',
    method: 'QLoRA',
    quantization_bits: 4,
    min_params_billions: 2.5,
    max_params_billions: 3.5,
    vram_gb: 4,
  },
  {
    label: '7-8B QLoRA 4-bit',
    method: 'QLoRA',
    quantization_bits: 4,
    min_params_billions: 6.5,
    max_params_billions: 8.5,
    vram_gb: 6,
  },
  {
    label: '14B QLoRA 4-bit',
    method: 'QLoRA',
    quantization_bits: 4,
    min_params_billions: 12,
    max_params_billions: 16,
    vram_gb: 10,
  },
  {
    label: '32B QLoRA 4-bit',
    method: 'QLoRA',
    quantization_bits: 4,
    min_params_billions: 28,
    max_params_billions: 36,
    vram_gb: 18,
  },
  {
    label: '70B QLoRA 4-bit',
    method: 'QLoRA',
    quantization_bits: 4,
    min_params_billions: 60,
    max_params_billions: 80,
    vram_gb: 40,
  },
  {
    label: '7-8B LoRA 16-bit',
    method: 'LoRA',
    quantization_bits: 16,
    min_params_billions: 6.5,
    max_params_billions: 8.5,
    vram_gb: 16,
  },
  {
    label: '70B LoRA 16-bit',
    method: 'LoRA',
    quantization_bits: 16,
    min_params_billions: 60,
    max_params_billions: 80,
    vram_gb: 80,
  },
]

function asNonNegative(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) {
    return fallback
  }
  return value < 0 ? 0 : value
}

function isLoraMethod(method: FineTuneMethod): boolean {
  return method === 'LoRA' || method === 'QLoRA'
}

function isPackingEnabled(params: EstimateRequest): boolean {
  return Boolean(params.use_packing || params.packing)
}

function findUnslothReference(params: EstimateRequest): UnslothReferencePoint | undefined {
  if (params.framework !== 'Unsloth') {
    return undefined
  }
  return UNSLOTH_REFERENCE_TABLE.find(
    (row) =>
      row.method === params.method &&
      row.quantization_bits === params.quantization_bits &&
      params.model_params_billions >= row.min_params_billions &&
      params.model_params_billions <= row.max_params_billions,
  )
}

// We keep fp16/bf16/fp8 gradients at 2 bytes/param in this planner.
function gradientBytesPerParam(precision: EstimateRequest['precision']): number {
  if (precision === 'fp16' || precision === 'bf16' || precision === 'fp8') {
    return 2
  }
  return 4
}

function expectedProfileForBits(bits: QuantizationBits): QuantizationProfile {
  switch (bits) {
    case 8:
      return 'int8'
    case 16:
      return 'int16'
    case 32:
      return 'int32'
    case 4:
    default:
      return 'nf4'
  }
}

function normalizeQuantizationProfile(params: EstimateRequest, warnings: string[]): QuantizationProfile {
  const requested = params.quantization_profile
  const expected = expectedProfileForBits(params.quantization_bits)

  if (params.quantization_bits === 4) {
    if (requested && FOUR_BIT_QUANTIZATION_PROFILES.includes(requested)) {
      return requested
    }
    if (requested && requested !== expected) {
      warnings.push(
        `Quantization profile "${requested}" is not a 4-bit profile; defaulting to ${expected}.`,
      )
    }
    return expected
  }

  if (requested && requested !== expected) {
    warnings.push(
      `Quantization profile "${requested}" is incompatible with ${params.quantization_bits}-bit; using ${expected}.`,
    )
  }
  return expected
}

export function estimateVRAM(params: EstimateRequest): VRAMEstimateDetails {
  const warnings: string[] = []
  const intermediates: Record<string, number> = {}

  // Resolve full structural config (known model defaults + any request overrides).
  const model = getModelConfigFromRequest(params)
  const totalParams = asNonNegative(params.model_params_billions) * 1e9
  const weightBytesPerParam = WEIGHT_BYTES_PER_PARAM[params.quantization_bits]
  const modelWeightVRAMGB = (totalParams * weightBytesPerParam) / BYTES_IN_GIB
  const normalizedQuantizationProfile = normalizeQuantizationProfile(params, warnings)
  const quantMetadataMultiplier =
    params.quantization_bits === 4
      ? FOUR_BIT_PROFILE_METADATA_MULTIPLIER[
          normalizedQuantizationProfile as keyof typeof FOUR_BIT_PROFILE_METADATA_MULTIPLIER
        ]
      : QUANT_METADATA_MULTIPLIER[params.quantization_bits]
  const modelVRAMGB = modelWeightVRAMGB * quantMetadataMultiplier
  const quantMetadataGB = Math.max(0, modelVRAMGB - modelWeightVRAMGB)

  const trainWithLora = isLoraMethod(params.method)
  const loraRank = asNonNegative(params.lora_rank)
  let loraTargets = params.lora_target_modules
  if (trainWithLora && loraTargets.length === 0) {
    warnings.push('LoRA method selected without target modules; defaulting to q/k/v/o.')
    loraTargets = DEFAULT_LORA_TARGETS
  }

  let loraParams = 0
  if (trainWithLora && loraRank > 0) {
    // LoRA adapter parameter count depends on per-module matrix shapes and layer count.
    for (const moduleName of loraTargets) {
      const shape = resolveModuleShape(model, moduleName)
      const moduleParamsPerLayer = shape.in_dim * loraRank + loraRank * shape.out_dim
      loraParams += moduleParamsPerLayer * model.num_layers
    }
  }

  const loraVRAMGB = (loraParams * 2) / BYTES_IN_GIB
  const trainableParams = trainWithLora ? loraParams : totalParams
  const optimizerBytesPerParam = OPTIMIZER_BYTES_PER_PARAM[params.optimizer]
  const optimizerVRAMGB = (trainableParams * optimizerBytesPerParam) / BYTES_IN_GIB
  const gradBytesPerParam = gradientBytesPerParam(params.precision)
  const gradientVRAMGB = (trainableParams * gradBytesPerParam) / BYTES_IN_GIB

  if (params.precision === 'fp8') {
    warnings.push('FP8 gradients are approximated at 2 bytes/param for stability.')
  }

  const tokenUtilization = isPackingEnabled(params) ? 0.95 : 0.7
  if (isPackingEnabled(params) && params.avg_tokens_per_row > 0 && params.max_seq_length > 0) {
    const averageFillRatio = Math.min(1, params.avg_tokens_per_row / params.max_seq_length)
    if (averageFillRatio > 0.85) {
      warnings.push(
        'Packing is enabled, but average sequence length is already near max sequence; VRAM savings from packing may be limited.',
      )
    }
  }
  const effectiveSeq = asNonNegative(params.max_seq_length) * tokenUtilization
  // Activation size tracks batch * sequence * hidden dimension (2 bytes activation dtype assumption).
  const activationBytesPerLayer =
    asNonNegative(params.batch_size, 1) * effectiveSeq * model.hidden_size * 2

  let activationVRAMGB =
    params.use_gradient_checkpointing
      ? (activationBytesPerLayer * Math.sqrt(model.num_layers)) / BYTES_IN_GIB
      : (activationBytesPerLayer * model.num_layers) / BYTES_IN_GIB

  // Framework toggles model practical runtime savings from kernel/checkpoint features.
  // These multipliers are calibration heuristics, not guarantees for every model/sequence mix.
  if (params.framework === 'Unsloth') {
    if (params.use_gradient_checkpointing) {
      activationVRAMGB *= 0.7
    }
    if (params.use_rope_kernels) {
      activationVRAMGB *= 0.7
    }
    if (params.use_triton_kernels) {
      activationVRAMGB *= 0.95
    }
    if (params.use_fused_chunked_ce_loss && params.max_seq_length >= 32768) {
      activationVRAMGB *= 0.4
    }
    if (params.architecture === 'MoE' && params.use_faster_moe_kernels) {
      activationVRAMGB *= 0.65
    }
  }

  const isGrpo = params.training_type === 'GRPO' || params.training_type === 'GSPO'
  const generations = isGrpo ? Math.max(1, Math.round(asNonNegative(params.grpo_num_generations, 1))) : 0
  const vocabSize = model.vocab_size
  const contextLength = Math.max(1, Math.round(asNonNegative(params.max_seq_length, 1)))

  // Unsloth GRPO kernels avoid materializing full logits tensors; model this as an 8x reduction.
  const rlLogitsReduction = params.framework === 'Unsloth' ? 8 : 1
  const rlLogitsBytes = isGrpo ? 2 * 2 * generations * contextLength * vocabSize : 0
  const rlLogitsVRAMGB = rlLogitsBytes / rlLogitsReduction / BYTES_IN_GIB

  // vLLM KV cache (approx): 2 * 2 bytes * layers * seq_len * kv_dim * batch.
  const headDim = model.num_attention_heads > 0 ? model.hidden_size / model.num_attention_heads : 0
  const kvDim = model.num_kv_heads * headDim
  const kvCacheBytes =
    isGrpo ? 2 * 2 * model.num_layers * contextLength * kvDim * Math.max(1, params.vllm_batch_size) : 0
  const kvCacheVRAMGB = kvCacheBytes / BYTES_IN_GIB

  if (isGrpo) {
    if (rlLogitsVRAMGB > 8) {
      warnings.push(
        `GRPO/GSPO logits memory estimate is large (${rlLogitsVRAMGB.toFixed(1)} GB). Logits scale with vocab_size * seq_len * generations; consider reducing generations or sequence length.`,
      )
    }
    if (kvCacheVRAMGB > 8) {
      warnings.push(
        `vLLM KV cache estimate is large (${kvCacheVRAMGB.toFixed(1)} GB). KV cache scales with layers * kv_dim * seq_len * vLLM batch size.`,
      )
    }
  }

  const frameworkOverheadMultiplier = FRAMEWORK_OVERHEAD_MULTIPLIER[params.framework]
  const frameworkRuntimeOverheadGB = FRAMEWORK_RUNTIME_OVERHEAD_GB[params.framework]
  const nonWeightBeforeFrameworkGB =
    loraVRAMGB + optimizerVRAMGB + gradientVRAMGB + activationVRAMGB + rlLogitsVRAMGB + kvCacheVRAMGB
  const frameworkOverheadGB = nonWeightBeforeFrameworkGB * frameworkOverheadMultiplier + frameworkRuntimeOverheadGB
  const nonWeightAfterFrameworkGB = nonWeightBeforeFrameworkGB + frameworkOverheadGB

  const baseVRAMGB = modelVRAMGB + nonWeightAfterFrameworkGB
  const tightVRAMGB = baseVRAMGB * 1.05
  const typicalVRAMGB = baseVRAMGB * 1.15
  const conservativeVRAMGB = baseVRAMGB * 1.25
  const bufferGB = typicalVRAMGB - baseVRAMGB

  // MoE compute can route fewer experts, but resident VRAM still pays for full expert weights.
  if (params.architecture === 'MoE' && params.moe_active_experts < params.moe_total_experts) {
    warnings.push(
      'MoE active experts affect compute estimates, but VRAM assumes full expert weights are resident.',
    )
  }

  if (params.framework === 'Unsloth' && params.method === 'QLoRA' && params.architecture === 'MoE') {
    warnings.push(
      'Unsloth MoE + QLoRA support is evolving; 4-bit bitsandbytes paths can be unstable on some MoE setups. Treat this VRAM estimate as low-confidence.',
    )
  }

  const unslothReference = findUnslothReference(params)
  if (unslothReference) {
    // Calibration warning: highlight when modeled output diverges from known point estimates.
    const diffRatio = Math.abs(typicalVRAMGB - unslothReference.vram_gb) / unslothReference.vram_gb
    intermediates.unsloth_reference_vram_gb = unslothReference.vram_gb
    intermediates.unsloth_reference_diff_ratio = diffRatio
    if (diffRatio > 0.25) {
      warnings.push(
        `Typical VRAM (${typicalVRAMGB.toFixed(2)} GB) differs >25% from Unsloth reference (${unslothReference.vram_gb.toFixed(2)} GB) for ${unslothReference.label}.`,
      )
    }
  }

  intermediates.model_total_params = totalParams
  intermediates.model_hidden_size = model.hidden_size
  intermediates.model_num_layers = model.num_layers
  intermediates.weight_bytes_per_param = weightBytesPerParam
  intermediates.quant_metadata_multiplier = quantMetadataMultiplier
  intermediates.quantization_profile =
    normalizedQuantizationProfile === 'nf4'
      ? 1
      : normalizedQuantizationProfile === 'fp4'
        ? 2
        : normalizedQuantizationProfile === 'mxfp4'
          ? 3
          : normalizedQuantizationProfile === 'dynamic_4bit'
            ? 4
            : normalizedQuantizationProfile === 'dynamic_2_0'
              ? 5
            : normalizedQuantizationProfile === 'int8'
              ? 8
              : normalizedQuantizationProfile === 'int16'
                ? 16
                : 32
  intermediates.model_weight_vram_gb = modelWeightVRAMGB
  intermediates.model_vram_gb = modelVRAMGB
  intermediates.lora_rank = loraRank
  intermediates.lora_target_count = loraTargets.length
  intermediates.lora_params = loraParams
  intermediates.trainable_params = trainableParams
  intermediates.optimizer_bytes_per_param = optimizerBytesPerParam
  intermediates.gradient_bytes_per_param = gradBytesPerParam
  intermediates.token_utilization = tokenUtilization
  intermediates.effective_seq = effectiveSeq
  intermediates.activation_bytes_per_layer = activationBytesPerLayer
  intermediates.rl_logits_reduction = rlLogitsReduction
  intermediates.rl_logits_bytes = rlLogitsBytes
  intermediates.rl_logits_vram_gb = rlLogitsVRAMGB
  intermediates.kv_cache_bytes = kvCacheBytes
  intermediates.kv_cache_vram_gb = kvCacheVRAMGB
  intermediates.framework_overhead_multiplier = frameworkOverheadMultiplier
  intermediates.framework_runtime_overhead_gb = frameworkRuntimeOverheadGB
  intermediates.non_weight_vram_before_framework_gb = nonWeightBeforeFrameworkGB
  intermediates.framework_overhead_gb = frameworkOverheadGB
  intermediates.non_weight_vram_after_framework_gb = nonWeightAfterFrameworkGB
  intermediates.base_vram_gb = baseVRAMGB
  intermediates.tight_multiplier = 1.05
  intermediates.typical_multiplier = 1.15
  intermediates.conservative_multiplier = 1.25

  return {
    bands_gb: {
      tight: tightVRAMGB,
      typical: typicalVRAMGB,
      conservative: conservativeVRAMGB,
    },
    breakdown_gb: {
      model_weights: modelWeightVRAMGB,
      quant_metadata: quantMetadataGB,
      lora_adapters: loraVRAMGB,
      optimizer_states: optimizerVRAMGB,
      gradients: gradientVRAMGB,
      activations: activationVRAMGB,
      rl_logits: rlLogitsVRAMGB,
      kv_cache: kvCacheVRAMGB,
      non_weight_after_framework: frameworkOverheadGB,
      buffer: bufferGB,
    },
    intermediates,
    warnings,
  }
}
