export type Architecture = 'Dense' | 'MoE'
export type FineTuneMethod = 'Full Fine-Tune' | 'LoRA' | 'QLoRA'
export type QuantizationBits = 4 | 8 | 16 | 32
export type TrainingType = 'SFT' | 'GRPO' | 'DPO' | 'PPO' | 'ORPO'
export type Optimizer = 'adamw' | 'adamw_8bit' | 'sgd' | 'paged_adamw_8bit' | 'muon'
export type LRScheduler = 'cosine' | 'linear' | 'constant'
export type Precision = 'fp32' | 'fp16' | 'bf16' | 'fp8'
export type Framework =
  | 'Unsloth'
  | 'HuggingFace+TRL'
  | 'Axolotl'
  | 'LLaMA-Factory'
  | 'torchtune'
  | 'Custom'
export type PricingTier = 'on_demand' | 'spot' | 'reserved_1mo' | 'reserved_3mo'
export type GPUType =
  | 'H100'
  | 'H200'
  | 'A100_80G'
  | 'A100'
  | 'L40S'
  | 'L40'
  | 'A6000'
  | 'RTX_4090'
  | 'RTX_3090'
  | 'RTX_5090'
  | 'B200'

export interface ModelConfig {
  id: string
  display_name: string
  params_billions: number
  hidden_size: number
  num_layers: number
  num_attention_heads: number
  num_kv_heads: number
  intermediate_size: number
  vocab_size: number
  max_position_embeddings: number
  architecture: 'dense' | 'moe'
  moe_total_experts?: number
  moe_active_experts?: number
  module_shapes?: Partial<Record<LoRATargetModule, ModuleShape>>
}

export type LoRATargetModule = 'q' | 'k' | 'v' | 'o' | 'gate' | 'up' | 'down'

export interface ModuleShape {
  in_dim: number
  out_dim: number
}

export interface EstimateRequest {
  model_name: string
  model_params_billions: number
  architecture: Architecture
  moe_total_experts: number
  moe_active_experts: number
  model_hidden_size?: number
  model_num_layers?: number
  model_num_attention_heads?: number
  model_num_kv_heads?: number
  model_intermediate_size?: number
  model_vocab_size?: number
  model_max_position_embeddings?: number
  model_module_shapes?: Partial<Record<LoRATargetModule, ModuleShape>>

  method: FineTuneMethod
  quantization_bits: QuantizationBits
  lora_rank: number
  lora_alpha: number
  lora_target_modules: LoRATargetModule[]
  use_gradient_checkpointing: boolean
  full_finetuning: boolean

  dataset_tokens: number
  dataset_rows: number | null
  avg_tokens_per_row: number
  num_epochs: number
  batch_size: number
  gradient_accumulation_steps: number
  max_seq_length: number
  learning_rate: number
  optimizer: Optimizer
  lr_scheduler: LRScheduler
  warmup_ratio: number
  precision: Precision
  packing: boolean

  framework: Framework
  unsloth_version: string
  use_flash_attention: boolean
  use_triton_kernels: boolean
  use_rope_kernels: boolean
  use_packing: boolean

  target_gpu: GPUType[]
  target_providers: string[]
  target_regions: string[]
  target_interconnects: string[]
  target_instance_types: string[]
  num_gpus: number
  num_nodes: number
  pricing_tier: PricingTier[]
  min_vram_gb: number | null

  training_type: TrainingType
  grpo_num_generations: number
  reward_model_size: number | null
  vllm_batch_size: number
  num_runs: number
}

export interface PriceAvailability {
  region: string
  available: boolean
}

export interface ProviderPricing {
  provider: string
  source: 'shadeform' | 'vastai' | 'runpod' | 'lambdalabs' | 'static'
  shade_instance_type?: string
  cloud_instance_type: string
  gpu: GPUType | string
  num_gpus: number
  vram_per_gpu_in_gb: number
  memory_in_gb?: number
  storage_in_gb?: number
  vcpus?: number
  interconnect?: string
  hourly_price_cents: number
  spot_price_cents?: number | null
  reserved_1mo_price_cents?: number | null
  reserved_3mo_price_cents?: number | null
  availability: PriceAvailability[]
  available: boolean
  fetched_at: string
}

export interface VRAMBreakdown {
  model_weights: number
  quant_metadata: number
  lora_adapters: number
  optimizer_states: number
  gradients: number
  activations: number
  non_weight_after_framework: number
  buffer: number
}

export interface VRAMEstimateBands {
  tight: number
  typical: number
  conservative: number
}

export interface VRAMEstimateDetails {
  bands_gb: VRAMEstimateBands
  breakdown_gb: VRAMBreakdown
  intermediates: Record<string, number>
  warnings: string[]
}

export interface TrainingEstimateAssumptions {
  token_utilization: number
  lora_compute_discount: number
  mfu: number
  speed_multiplier: number
  attention_penalty: number
}

export interface TrainingEstimate {
  total_tokens: number
  effective_batch_tokens: number
  total_steps: number
  total_flops: number
  estimated_hours_by_gpu: Record<string, number>
  assumptions: TrainingEstimateAssumptions
  intermediates: Record<string, number>
  warnings: string[]
}

export interface CostComparisonEntry {
  provider: string
  gpu: string
  cloud_instance_type: string
  num_gpus: number
  vram_total_gb: number
  hourly_price_cents: number
  spot_price_cents: number | null
  reserved_1mo_price_cents: number | null
  reserved_3mo_price_cents: number | null
  estimated_hours: number
  total_cost_dollars: number
  spot_cost_dollars: number | null
  reserved_1mo_cost_dollars: number | null
  reserved_3mo_cost_dollars: number | null
  available: boolean
  fits_in_vram: boolean
  source: ProviderPricing['source']
}

export interface EstimateResponse {
  vram_estimate_gb: number
  vram_estimate_bands_gb: VRAMEstimateBands
  vram_breakdown: VRAMBreakdown
  training_estimate: TrainingEstimate
  cost_comparison: CostComparisonEntry[]
  math: {
    vram: Record<string, number>
    training: Record<string, number>
    cost: Record<string, number>
  }
  warnings: string[]
  meta: {
    prices_fetched_at: string
    framework_used: Framework
    computation_version: string
    model_name: string
  }
}

export interface ErrorResponse {
  error: string
  code: string
  details?: unknown
}

export interface ResolvedModelPayload {
  id: string
  display_name: string
  hf_repo_id: string
  params_billions: number
  hidden_size: number
  num_layers: number
  num_attention_heads: number
  num_kv_heads: number
  intermediate_size: number
  vocab_size: number
  max_position_embeddings: number
  architecture: 'dense' | 'moe'
  moe_total_experts?: number
  moe_active_experts?: number
  module_shapes: Partial<Record<LoRATargetModule, ModuleShape>>
  source: string
}
