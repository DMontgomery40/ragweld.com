export type Architecture = 'Dense' | 'MoE'
export type FineTuneMethod = 'Full Fine-Tune' | 'LoRA' | 'QLoRA'
export type QuantizationBits = 4 | 8 | 16 | 32
export type QuantizationProfile =
  | 'nf4'
  | 'fp4'
  | 'mxfp4'
  | 'dynamic_4bit'
  | 'dynamic_2_0'
  | 'int8'
  | 'int16'
  | 'int32'
export type TrainingType = 'SFT' | 'GRPO' | 'GSPO' | 'DPO' | 'PPO' | 'ORPO' | 'SimPO'
export type WorkflowMode = 'guided' | 'custom_pipeline'
export type SupportTier = 'documented' | 'inferred' | 'custom'
export type FitStatus = 'likely_fit' | 'borderline' | 'likely_oom'

export type QATScheme = 'fp8-int4' | 'fp8-fp8' | 'int8-int4' | 'int4'
export type ImportanceSamplingLevel = 'token' | 'sequence'
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
  | 'B300'

export interface ModelConfig {
  id: string
  display_name: string
  params_billions: number
  active_params_billions?: number
  hf_repo_id?: string
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
  model_hf_repo_id: string
  auto_resolve_model_metadata: boolean
  model_params_billions: number
  model_active_params_billions: number | null
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
  quantization_profile: QuantizationProfile
  use_qat: boolean
  qat_scheme: QATScheme
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
  workflow_mode: WorkflowMode
  unsloth_version: string
  use_flash_attention: boolean
  use_triton_kernels: boolean
  use_rope_kernels: boolean
  use_fused_chunked_ce_loss: boolean
  use_faster_moe_kernels: boolean
  use_packing: boolean
  custom_speed_multiplier: number

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
  importance_sampling_level: ImportanceSamplingLevel
  grpo_num_generations: number
  reward_model_size: number | null
  vllm_batch_size: number
  reference_model_pct: number
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

export interface Range3 {
  optimistic: number
  typical: number
  conservative: number
}

export interface NormalizationEvent {
  rule_id: string
  field: string
  input: unknown
  normalized_to: unknown
  reason: string
  source_ids: string[]
}

export interface SupportReason {
  rule_id: string
  tier: SupportTier
  reason: string
  source_ids: string[]
}

export interface PricingFreshness {
  source: string
  fetched_at: string
  stale_after: string | null
  is_stale: boolean
  fallback_reason: string | null
  cached: boolean
  cache_ttl_ms: number
  snapshot_updated_at: string | null
  data_age_ms: number | null
  snapshot_age_ms: number | null
}

export interface VRAMBreakdown {
  model_weights: number
  quant_metadata: number
  lora_adapters: number
  optimizer_states: number
  gradients: number
  activations: number
  rl_logits: number
  kv_cache: number
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
  total_params_billions?: number
  compute_params_billions?: number
  active_params_billions?: number | null
  moe_compute_multiplier?: number
  qat_compute_multiplier?: number
  custom_speed_multiplier?: number
  reference_model_pct?: number
  uncertainty_score?: number
  optimistic_spread?: number
  conservative_spread?: number
}

export interface TrainingEstimate {
  total_tokens: number
  effective_batch_tokens: number
  total_steps: number
  total_flops: number
  total_flops_range: Range3
  estimated_hours_by_gpu: Record<string, number>
  estimated_hours_by_gpu_range: Record<string, Range3>
  assumptions: TrainingEstimateAssumptions
  intermediates: Record<string, number>
  range_reasons: string[]
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
  estimated_hours_range: Range3
  total_cost_dollars: number
  cost_range_dollars: Range3
  spot_cost_dollars: number | null
  reserved_1mo_cost_dollars: number | null
  reserved_3mo_cost_dollars: number | null
  available: boolean
  fits_in_vram: boolean
  fit_status: FitStatus
  selected_pricing_tier: PricingTier | null
  provider_support_tier: SupportTier
  provider_support_reasons: SupportReason[]
  price_source: ProviderPricing['source']
  price_fetched_at: string
  price_stale_after: string | null
  fallback_reason: string | null
  pricing_freshness: PricingFreshness
  source: ProviderPricing['source']
}

export interface EstimateResponse {
  vram_range_gb: Range3
  hours_range: Range3
  cost_range_dollars: Range3
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
  support_tier: SupportTier
  support_reasons: SupportReason[]
  normalizations: NormalizationEvent[]
  pricing_freshness: PricingFreshness
  source_ledger_version: string
  warnings: string[]
  effective_request?: EstimateRequest
  model_resolution?: ModelResolution | null
  meta: {
    prices_fetched_at: string
    framework_used: Framework
    workflow_mode: WorkflowMode
    support_tier: SupportTier
    computation_version: string
    source_ledger_version: string
    model_name: string
    model_hf_repo_id?: string | null
    model_source?: string | null
  }
}

export interface ErrorResponse {
  error: string
  code: string
  details?: unknown
}

export type ModelResolutionSource =
  | 'request'
  | 'catalog'
  | 'hf_config'
  | 'hf_model_card'
  | 'hf_hub_api'
  | 'fallback'

export interface ModelFieldProvenance {
  field: string
  source: ModelResolutionSource
  source_ref?: string | null
  note?: string
}

export interface ResolvedModelPayload {
  id: string
  display_name: string
  hf_repo_id: string
  params_billions: number
  active_params_billions?: number
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
  config_source?: string | null
  model_card_source?: string | null
  hub_api_source?: string | null
  field_provenance?: ModelFieldProvenance[]
  warnings?: string[]
}

export interface ModelResolution {
  strategy: 'catalog' | 'huggingface' | 'fallback'
  source_input: string
  applied: boolean
  model: ResolvedModelPayload
  warnings: string[]
}
