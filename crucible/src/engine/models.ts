import type {
  EstimateRequest,
  LoRATargetModule,
  ModelConfig,
  ModuleShape,
} from '../types/index'

interface SizeBucket {
  max_params_billions: number
  hidden_size: number
  num_layers: number
  num_attention_heads: number
  num_kv_heads: number
  intermediate_size: number
}

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

function defaultModuleShape(module: LoRATargetModule, model: ModelConfig): ModuleShape {
  switch (module) {
    case 'q':
    case 'k':
    case 'v':
    case 'o':
      return { in_dim: model.hidden_size, out_dim: model.hidden_size }
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
  params: Pick<EstimateRequest, 'model_name' | 'model_params_billions'>,
): ModelConfig {
  return getModelConfig(params.model_name, params.model_params_billions)
}

export function resolveModuleShape(model: ModelConfig, module: LoRATargetModule): ModuleShape {
  const override = model.module_shapes?.[module]
  if (override) {
    return override
  }
  return defaultModuleShape(module, model)
}

export { KNOWN_MODELS as MODEL_CONFIGS }
