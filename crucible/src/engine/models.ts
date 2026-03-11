import type {
  EstimateRequest,
  LoRATargetModule,
  ModelConfig,
  ModuleShape,
} from '../types/index'

const LORA_TARGET_MODULE_VALUES: LoRATargetModule[] = ['q', 'k', 'v', 'o', 'gate', 'up', 'down']
const LORA_TARGET_MODULE_SET = new Set<LoRATargetModule>(LORA_TARGET_MODULE_VALUES)

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

export function isValidModuleShape(value: unknown): value is ModuleShape {
  return (
    typeof value === 'object' &&
    value !== null &&
    isPositiveFiniteNumber((value as Partial<ModuleShape>).in_dim) &&
    isPositiveFiniteNumber((value as Partial<ModuleShape>).out_dim)
  )
}

export function normalizeModuleShapeOverrides(
  value: unknown,
): Partial<Record<LoRATargetModule, ModuleShape>> | null {
  if (value == null) {
    return {}
  }
  if (typeof value !== 'object') {
    return null
  }

  const normalized: Partial<Record<LoRATargetModule, ModuleShape>> = {}
  for (const [key, shape] of Object.entries(value)) {
    if (!LORA_TARGET_MODULE_SET.has(key as LoRATargetModule)) {
      return null
    }
    if (!isValidModuleShape(shape)) {
      return null
    }
    normalized[key as LoRATargetModule] = shape
  }

  return normalized
}

interface SizeBucket {
  max_params_billions: number
  hidden_size: number
  num_layers: number
  num_attention_heads: number
  num_kv_heads: number
  intermediate_size: number
}

// Used when a model id is unknown: pick a plausible transformer shape from parameter scale.
const SIZE_BUCKETS: SizeBucket[] = [
  {
    max_params_billions: 2,
    hidden_size: 2048,
    num_layers: 24,
    num_attention_heads: 16,
    num_kv_heads: 8,
    intermediate_size: 5632,
  },
  {
    max_params_billions: 4,
    hidden_size: 3072,
    num_layers: 32,
    num_attention_heads: 24,
    num_kv_heads: 8,
    intermediate_size: 8192,
  },
  {
    max_params_billions: 9,
    hidden_size: 4096,
    num_layers: 32,
    num_attention_heads: 32,
    num_kv_heads: 8,
    intermediate_size: 11008,
  },
  {
    max_params_billions: 20,
    hidden_size: 5120,
    num_layers: 40,
    num_attention_heads: 40,
    num_kv_heads: 8,
    intermediate_size: 13824,
  },
  {
    max_params_billions: 40,
    hidden_size: 6656,
    num_layers: 60,
    num_attention_heads: 52,
    num_kv_heads: 8,
    intermediate_size: 17920,
  },
  {
    max_params_billions: Number.POSITIVE_INFINITY,
    hidden_size: 8192,
    num_layers: 80,
    num_attention_heads: 64,
    num_kv_heads: 8,
    intermediate_size: 28672,
  },
]

// Curated known configs with explicit architectural dimensions.
const KNOWN_MODELS: ModelConfig[] = [
  {
    id: 'llama-3.3-70b',
    display_name: 'Llama-3.3-70B',
    params_billions: 70.6,
    hidden_size: 8192,
    num_layers: 80,
    num_attention_heads: 64,
    num_kv_heads: 8,
    intermediate_size: 28672,
    vocab_size: 128256,
    max_position_embeddings: 131072,
    architecture: 'dense',
  },
  {
    id: 'llama-3.1-8b',
    display_name: 'Llama-3.1-8B',
    params_billions: 8,
    hidden_size: 4096,
    num_layers: 32,
    num_attention_heads: 32,
    num_kv_heads: 8,
    intermediate_size: 14336,
    vocab_size: 128256,
    max_position_embeddings: 131072,
    architecture: 'dense',
  },
  {
    id: 'llama-3.2-3b',
    display_name: 'Llama-3.2-3B',
    params_billions: 3,
    hidden_size: 3072,
    num_layers: 28,
    num_attention_heads: 24,
    num_kv_heads: 8,
    intermediate_size: 8192,
    vocab_size: 128256,
    max_position_embeddings: 131072,
    architecture: 'dense',
  },
  {
    id: 'llama-3.2-1b',
    display_name: 'Llama-3.2-1B',
    params_billions: 1.2,
    hidden_size: 2048,
    num_layers: 16,
    num_attention_heads: 16,
    num_kv_heads: 8,
    intermediate_size: 5632,
    vocab_size: 128256,
    max_position_embeddings: 131072,
    architecture: 'dense',
  },
  {
    id: 'qwen2.5-7b-instruct',
    display_name: 'Qwen2.5-7B-Instruct',
    params_billions: 7.6,
    hidden_size: 3584,
    num_layers: 28,
    num_attention_heads: 28,
    num_kv_heads: 4,
    intermediate_size: 18944,
    vocab_size: 152064,
    max_position_embeddings: 32768,
    architecture: 'dense',
  },
]

function normalizeModelName(modelName: string): string {
  return modelName.trim().toLowerCase().replace(/[_\s]+/g, '-')
}

// Build lookup once so id/display-name aliases resolve in O(1).
const MODEL_LOOKUP: Record<string, ModelConfig> = (() => {
  const lookup: Record<string, ModelConfig> = {}
  for (const model of KNOWN_MODELS) {
    lookup[normalizeModelName(model.id)] = model
    lookup[normalizeModelName(model.display_name)] = model
  }
  return lookup
})()

function pickSizeBucket(paramsBillions: number): SizeBucket {
  for (const bucket of SIZE_BUCKETS) {
    if (paramsBillions <= bucket.max_params_billions) {
      return bucket
    }
  }
  return SIZE_BUCKETS[SIZE_BUCKETS.length - 1]
}

function buildFallbackModelConfig(modelName: string, paramsBillions: number): ModelConfig {
  const safeParams = Number.isFinite(paramsBillions) && paramsBillions > 0 ? paramsBillions : 7
  const bucket = pickSizeBucket(safeParams)
  return {
    id: normalizeModelName(modelName || `custom-${safeParams}b`),
    display_name: modelName || `Custom-${safeParams}B`,
    params_billions: safeParams,
    hidden_size: bucket.hidden_size,
    num_layers: bucket.num_layers,
    num_attention_heads: bucket.num_attention_heads,
    num_kv_heads: bucket.num_kv_heads,
    intermediate_size: bucket.intermediate_size,
    vocab_size: 128000,
    max_position_embeddings: 32768,
    architecture: 'dense',
  }
}

// GQA/MQA models use fewer KV heads than attention heads, so K/V projection width is smaller.
function kvProjectionOutDim(model: ModelConfig): number {
  const hidden = model.hidden_size
  const totalHeads = model.num_attention_heads
  const kvHeads = model.num_kv_heads

  if (hidden <= 0 || totalHeads <= 0 || kvHeads <= 0) {
    return hidden
  }

  const headDim = hidden / totalHeads
  if (!Number.isFinite(headDim) || headDim <= 0) {
    return hidden
  }

  return Math.max(1, Math.round(headDim * kvHeads))
}

function defaultModuleShape(module: LoRATargetModule, model: ModelConfig): ModuleShape {
  const kvOutDim = kvProjectionOutDim(model)

  switch (module) {
    case 'q':
    case 'o':
      return { in_dim: model.hidden_size, out_dim: model.hidden_size }
    case 'k':
    case 'v':
      return { in_dim: model.hidden_size, out_dim: kvOutDim }
    case 'gate':
    case 'up':
      return { in_dim: model.hidden_size, out_dim: model.intermediate_size }
    case 'down':
      return { in_dim: model.intermediate_size, out_dim: model.hidden_size }
    default:
      return { in_dim: model.hidden_size, out_dim: model.hidden_size }
  }
}

export function getModelConfig(modelName: string, paramsBillions: number): ModelConfig {
  const normalizedName = normalizeModelName(modelName)
  const knownModel = MODEL_LOOKUP[normalizedName]
  if (knownModel) {
    return knownModel
  }
  return buildFallbackModelConfig(modelName, paramsBillions)
}

export function getModelConfigFromRequest(
  params: Pick<
    EstimateRequest,
    | 'model_name'
    | 'model_params_billions'
    | 'architecture'
    | 'moe_total_experts'
    | 'moe_active_experts'
    | 'model_hidden_size'
    | 'model_num_layers'
    | 'model_num_attention_heads'
    | 'model_num_kv_heads'
    | 'model_intermediate_size'
    | 'model_vocab_size'
    | 'model_max_position_embeddings'
    | 'model_module_shapes'
  >,
): ModelConfig {
  // Start from known/fallback defaults, then allow API/UI-provided structural overrides.
  const baseModel = getModelConfig(params.model_name, params.model_params_billions)

  const hiddenSize = params.model_hidden_size ?? baseModel.hidden_size
  const numLayers = params.model_num_layers ?? baseModel.num_layers
  const numAttentionHeads = params.model_num_attention_heads ?? baseModel.num_attention_heads
  const numKVHeads = params.model_num_kv_heads ?? baseModel.num_kv_heads
  const intermediateSize = params.model_intermediate_size ?? baseModel.intermediate_size
  const vocabSize = params.model_vocab_size ?? baseModel.vocab_size
  const maxPositionEmbeddings =
    params.model_max_position_embeddings ?? baseModel.max_position_embeddings

  return {
    ...baseModel,
    architecture: params.architecture === 'MoE' ? 'moe' : 'dense',
    moe_total_experts:
      params.architecture === 'MoE'
        ? (params.moe_total_experts ?? baseModel.moe_total_experts)
        : undefined,
    moe_active_experts:
      params.architecture === 'MoE'
        ? (params.moe_active_experts ?? baseModel.moe_active_experts)
        : undefined,
    hidden_size: hiddenSize,
    num_layers: numLayers,
    num_attention_heads: numAttentionHeads,
    num_kv_heads: numKVHeads,
    intermediate_size: intermediateSize,
    vocab_size: vocabSize,
    max_position_embeddings: maxPositionEmbeddings,
    module_shapes: params.model_module_shapes ?? baseModel.module_shapes,
  }
}

export function resolveModuleShape(model: ModelConfig, module: LoRATargetModule): ModuleShape {
  // Request-level module shape overrides take precedence; otherwise use architecture defaults.
  const override = model.module_shapes?.[module]
  if (isValidModuleShape(override)) {
    return override
  }
  return defaultModuleShape(module, model)
}

export { KNOWN_MODELS as MODEL_CONFIGS }
