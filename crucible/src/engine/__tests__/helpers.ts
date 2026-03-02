import type { EstimateRequest, ProviderPricing } from '../../types/index'

export function makeEstimateRequest(overrides: Partial<EstimateRequest> = {}): EstimateRequest {
  return {
    model_name: 'Llama-3.3-70B',
    model_params_billions: 70.6,
    architecture: 'Dense',
    moe_total_experts: 8,
    moe_active_experts: 2,

    method: 'QLoRA',
    quantization_bits: 4,
    lora_rank: 16,
    lora_alpha: 16,
    lora_target_modules: ['q', 'k', 'v', 'o', 'gate', 'up', 'down'],
    use_gradient_checkpointing: true,
    full_finetuning: false,

    dataset_tokens: 10_000_000,
    dataset_rows: null,
    avg_tokens_per_row: 512,
    num_epochs: 3,
    batch_size: 2,
    gradient_accumulation_steps: 4,
    max_seq_length: 4096,
    learning_rate: 2e-4,
    optimizer: 'adamw_8bit',
    lr_scheduler: 'cosine',
    warmup_ratio: 0.03,
    precision: 'bf16',
    packing: true,

    framework: 'Unsloth',
    unsloth_version: 'latest',
    use_flash_attention: true,
    use_triton_kernels: true,
    use_rope_kernels: true,
    use_packing: true,

    target_gpu: ['H100', 'A100_80G'],
    target_providers: [],
    target_regions: [],
    target_interconnects: [],
    target_instance_types: [],
    num_gpus: 1,
    num_nodes: 1,
    pricing_tier: ['on_demand', 'spot'],
    min_vram_gb: null,

    training_type: 'SFT',
    grpo_num_generations: 8,
    reward_model_size: null,
    vllm_batch_size: 8,
    num_runs: 1,
    ...overrides,
  }
}

export function makePricing(overrides: Partial<ProviderPricing> = {}): ProviderPricing {
  return {
    provider: 'runpod',
    source: 'shadeform',
    shade_instance_type: 'H100',
    cloud_instance_type: 'NVIDIA H100 SXM',
    gpu: 'H100',
    num_gpus: 1,
    vram_per_gpu_in_gb: 80,
    memory_in_gb: 120,
    storage_in_gb: 200,
    vcpus: 16,
    interconnect: 'sxm',
    hourly_price_cents: 300,
    spot_price_cents: 120,
    reserved_1mo_price_cents: 250,
    reserved_3mo_price_cents: 220,
    availability: [{ region: 'us-west', available: true }],
    available: true,
    fetched_at: '2026-03-01T00:00:00Z',
    ...overrides,
  }
}
