export type CrucibleHelpTone =
  | 'info'
  | 'warn'
  | 'warning'
  | 'err'
  | 'reindex'
  | 'ok'
  | 'success'
  | 'security'

export type CrucibleHelpImpact =
  | 'vram'
  | 'cost'
  | 'throughput'
  | 'quality'
  | 'stability'
  | 'compatibility'

export interface CrucibleHelpBadge {
  text: string
  tone?: CrucibleHelpTone
}

export interface CrucibleHelpSource {
  title: string
  href: string
  type: 'paper' | 'docs' | 'vendor' | 'reference'
}

export interface CrucibleHelpSection {
  id: 'what' | 'how_to_read' | 'tradeoffs' | 'practical_rule'
  title: string
  bullets: string[]
}

export interface CrucibleHelpCard {
  id: string
  title: string
  short: string
  impacts?: CrucibleHelpImpact[]
  badges?: CrucibleHelpBadge[]
  sections?: CrucibleHelpSection[]
  sources?: CrucibleHelpSource[]
}

function card(
  id: string,
  title: string,
  short: string,
  extra: Omit<CrucibleHelpCard, 'id' | 'title' | 'short'> = {},
): CrucibleHelpCard {
  return {
    id,
    title,
    short,
    ...extra,
  }
}

export const INPUT_PANEL_HELP = {
  model: {
    resolveReference: card(
      'model.resolve_reference',
      'Resolve from Hugging Face URL / repo id',
      'Paste a Hugging Face URL or repo id to auto-fill model parameters.',
    ),
    modelPreset: card(
      'model.preset',
      'Model preset',
      'Loads curated defaults for known models. Use Custom to keep manual values.',
    ),
    modelId: card(
      'model.id',
      'Model id',
      'Model identifier used in requests and exports.',
    ),
    modelParams: card(
      'model.params_billions',
      'Model params (B)',
      'Total parameters in billions. This directly drives VRAM and compute estimates.',
      { impacts: ['vram', 'cost', 'throughput'] },
    ),
    activeParams: card(
      'model.active_params_billions',
      'Active params (B)',
      'Optional activated-parameter count for MoE compute. Total params still drive weight memory.',
      { impacts: ['cost', 'throughput'] },
    ),
    architecture: card(
      'model.architecture',
      'Architecture',
      'Dense uses all parameters each step. MoE activates only a subset of experts.',
      { impacts: ['vram', 'cost', 'throughput', 'compatibility'] },
    ),
    method: card(
      'model.method',
      'Method',
      'Training strategy: full fine-tune updates base weights, LoRA and QLoRA update adapters.',
      { impacts: ['vram', 'cost', 'quality', 'compatibility'] },
    ),
    quantizationBits: card(
      'model.quantization_bits',
      'Quantization (bit)',
      'Weight precision assumption used in memory and throughput calculations.',
      { impacts: ['vram', 'throughput', 'compatibility'] },
    ),
    quantizationProfile: card(
      'model.quantization_profile',
      'Quantization profile',
      'Selects profile-specific overhead assumptions for the chosen bit width.',
      { impacts: ['vram', 'throughput', 'compatibility'] },
    ),
    useQat: card(
      'model.use_qat',
      'Use QAT',
      'Quantization-aware training trains through the quantization path. In practice this changes training behavior more than deployment behavior.',
      { impacts: ['cost', 'quality', 'compatibility'] },
    ),
    qatScheme: card(
      'model.qat_scheme',
      'QAT scheme',
      'Scheme selection for Unsloth QAT (for example FP8 to INT4).',
      { impacts: ['quality', 'compatibility'] },
    ),
    framework: card(
      'model.framework',
      'Framework',
      'Applies framework-specific throughput and runtime overhead assumptions.',
      { impacts: ['cost', 'throughput', 'compatibility', 'stability'] },
    ),
    workflowMode: card(
      'model.workflow_mode',
      'Workflow mode',
      'Guided mode stays closer to explicitly documented setup paths. Custom pipeline keeps broader flexibility for self-managed enterprise stacks.',
      { impacts: ['compatibility', 'stability'] },
    ),
    totalExperts: card(
      'model.moe_total_experts',
      'Total experts',
      'Total number of experts in the MoE model.',
      { impacts: ['vram', 'compatibility'] },
    ),
    activeExperts: card(
      'model.moe_active_experts',
      'Active experts',
      'Experts used per token during routing. Must be less than or equal to total experts.',
      { impacts: ['cost', 'throughput', 'compatibility'] },
    ),
  },
  dataset: {
    datasetTokens: card(
      'dataset.dataset_tokens',
      'Dataset tokens',
      'Total training tokens processed per epoch.',
      { impacts: ['cost', 'quality'] },
    ),
    epochs: card(
      'dataset.epochs',
      'Epochs',
      'How many full passes over the dataset to run.',
      { impacts: ['cost', 'quality'] },
    ),
    batchSize: card(
      'dataset.batch_size',
      'Batch size',
      'Micro-batch size per step before gradient accumulation. This is one of the main shape controls in the training loop.',
      {
        impacts: ['vram', 'throughput', 'stability'],
        badges: [
          { text: 'Memory-sensitive', tone: 'warn' },
          { text: 'Coupled to grad accumulation', tone: 'info' },
        ],
        sections: [
          {
            id: 'what',
            title: 'What this changes',
            bullets: [
              'Batch size controls how many examples are processed in each micro-step before gradients are accumulated or applied.',
              'In Crucible, this is one of the strongest drivers of activation memory and throughput assumptions.',
            ],
          },
          {
            id: 'tradeoffs',
            title: 'Tradeoffs',
            bullets: [
              'Larger batch sizes can improve throughput and stabilize updates, but they increase memory pressure quickly.',
              'Smaller batch sizes are safer on constrained hardware, but they can reduce utilization and make very small runs noisier.',
            ],
          },
          {
            id: 'practical_rule',
            title: 'Practical rule',
            bullets: [
              'Do not read batch size alone. Effective batch depends on batch size, gradient accumulation, number of GPUs, and number of nodes together.',
              'When a configuration nearly fits, batch size is often the first safe place to reduce pressure.',
            ],
          },
        ],
        sources: [
          {
            title: 'QLoRA: Efficient Finetuning of Quantized LLMs (arXiv)',
            href: 'https://arxiv.org/abs/2305.14314',
            type: 'paper',
          },
          {
            title: 'Transformers TrainingArguments',
            href: 'https://huggingface.co/docs/transformers/main_classes/trainer',
            type: 'docs',
          },
          {
            title: 'DeepSpeed Batch Size Related Parameters',
            href: 'https://www.deepspeed.ai/docs/config-json/#batch-size-related-parameters',
            type: 'docs',
          },
        ],
      },
    ),
    gradAccumulation: card(
      'dataset.gradient_accumulation_steps',
      'Grad accumulation',
      'Number of micro-steps to accumulate before one optimizer update. This is how you trade more wall-clock time for less immediate memory pressure.',
      {
        impacts: ['vram', 'throughput', 'stability'],
        badges: [{ text: 'Effective batch control', tone: 'info' }],
        sections: [
          {
            id: 'what',
            title: 'What this changes',
            bullets: [
              'Gradient accumulation lets you emulate a larger effective batch without holding that full batch in memory at once.',
              'In Crucible, it is one of the main levers for fitting a run onto smaller hardware while keeping the optimizer update shape roughly similar.',
            ],
          },
          {
            id: 'tradeoffs',
            title: 'Tradeoffs',
            bullets: [
              'Higher accumulation lowers immediate memory pressure, but it reduces update frequency and can slow wall-clock progress.',
              'Very high accumulation can make runs look cheap to fit while still being operationally slow.',
            ],
          },
          {
            id: 'practical_rule',
            title: 'Practical rule',
            bullets: [
              'Read it together with batch size, number of GPUs, and learning rate.',
              'If you increase accumulation to make a run fit, revisit throughput and learning-rate assumptions before treating the configuration as equivalent.',
            ],
          },
        ],
        sources: [
          {
            title: 'Transformers TrainingArguments: gradient_accumulation_steps',
            href: 'https://huggingface.co/docs/transformers/main_classes/trainer#transformers.TrainingArguments.gradient_accumulation_steps',
            type: 'docs',
          },
          {
            title: 'DeepSpeed Batch Size Related Parameters',
            href: 'https://www.deepspeed.ai/docs/config-json/#batch-size-related-parameters',
            type: 'docs',
          },
          {
            title: 'PyTorch Automatic Mixed Precision',
            href: 'https://docs.pytorch.org/docs/stable/amp.html',
            type: 'docs',
          },
        ],
      },
    ),
    maxSeqLength: card(
      'dataset.max_seq_length',
      'Max seq length',
      'Maximum sequence length used during training. This is one of the strongest cost and memory multipliers in the estimator.',
      {
        impacts: ['vram', 'cost', 'quality'],
        badges: [{ text: 'High leverage', tone: 'warn' }],
        sections: [
          {
            id: 'what',
            title: 'What this changes',
            bullets: [
              'Sequence length controls how much token context each training example can carry.',
              'In Crucible, it strongly affects activation memory, attention cost, and total training throughput assumptions.',
            ],
          },
          {
            id: 'tradeoffs',
            title: 'Tradeoffs',
            bullets: [
              'Longer sequences preserve more context and can matter for long-document or long-conversation behavior, but they increase cost and memory quickly.',
              'Shorter sequences are cheaper and easier to fit, but they may hide long-context bottlenecks or truncate useful supervision.',
            ],
          },
          {
            id: 'practical_rule',
            title: 'Practical rule',
            bullets: [
              'Treat max sequence length as a budget decision, not a cosmetic setting.',
              'If you raise it, reevaluate memory fit, throughput, and whether the dataset actually contains useful long-context examples.',
            ],
          },
        ],
        sources: [
          {
            title: 'Transformers Tokenizer API',
            href: 'https://huggingface.co/docs/transformers/main_classes/tokenizer',
            type: 'docs',
          },
          {
            title: 'Transformers Padding and Truncation',
            href: 'https://huggingface.co/docs/transformers/main/pad_truncation',
            type: 'docs',
          },
          {
            title: 'QLoRA: Efficient Finetuning of Quantized LLMs (arXiv)',
            href: 'https://arxiv.org/abs/2305.14314',
            type: 'paper',
          },
        ],
      },
    ),
    trainingType: card(
      'dataset.training_type',
      'Training type',
      'Objective class that changes compute and memory assumptions.',
      { impacts: ['vram', 'cost', 'quality', 'compatibility'] },
    ),
  },
  hardware: {
    gpusPerRun: card(
      'hardware.num_gpus',
      'GPUs per run',
      'Total number of GPUs used in each training run across all nodes.',
      { impacts: ['cost', 'throughput', 'compatibility'] },
    ),
    nodes: card(
      'hardware.num_nodes',
      'Nodes',
      'Number of machines used for distributed training.',
      { impacts: ['cost', 'throughput', 'stability'] },
    ),
    targetGpuFamilies: card(
      'hardware.target_gpu',
      'Target GPU families',
      'Filter estimates to specific GPU families. Leave empty to include all.',
      { impacts: ['cost', 'compatibility'] },
    ),
    pricingTiers: card(
      'hardware.pricing_tier',
      'Pricing tiers',
      'Billing tiers to include in cost comparisons.',
      { impacts: ['cost'] },
    ),
    cloudProviders: card(
      'hardware.target_providers',
      'Cloud providers (blank = all)',
      'Restrict calculations to selected providers. Leave empty to include all.',
      { impacts: ['cost', 'compatibility'] },
    ),
    regions: card(
      'hardware.target_regions',
      'Regions (optional)',
      'Limit to selected cloud regions. Leave empty to allow any region.',
      { impacts: ['cost', 'compatibility'] },
    ),
    interconnect: card(
      'hardware.target_interconnects',
      'Interconnect (optional)',
      'Restrict to specific interconnect types such as NVLink or PCIe.',
      { impacts: ['throughput', 'compatibility'] },
    ),
    instanceTypes: card(
      'hardware.target_instance_types',
      'Instance types (optional)',
      'Filter to specific cloud instance SKUs.',
      { impacts: ['cost', 'compatibility'] },
    ),
  },
  advanced: {
    toggle: card(
      'advanced.toggle',
      'Advanced parameters',
      'Open expert-level knobs that change training math assumptions.',
    ),
    loraRank: card(
      'advanced.lora_rank',
      'LoRA rank',
      'Adapter width for LoRA. Higher values increase adapter capacity and memory cost.',
      {
        impacts: ['vram', 'cost', 'quality'],
        badges: [
          { text: 'High impact', tone: 'warn' },
          { text: 'Adapter capacity', tone: 'info' },
        ],
        sections: [
          {
            id: 'what',
            title: 'What this changes',
            bullets: [
              'LoRA rank is the adapter width r.',
              'In Crucible, it changes adapter memory, trainable parameter count, and part of the expected training cost curve.',
            ],
          },
          {
            id: 'how_to_read',
            title: 'How to read it',
            bullets: [
              'Lower ranks keep runs cheaper and are often enough for narrow instruction tuning, formatting changes, or style adaptation.',
              'Higher ranks give the adapter more capacity, which can help on broader domain shifts or harder behaviors, but they also increase VRAM pressure and make under-regularized runs easier to overfit.',
            ],
          },
          {
            id: 'practical_rule',
            title: 'Practical rule',
            bullets: [
              'Treat rank as coupled with LoRA alpha and target modules.',
              'If you change rank without revisiting those, cost and quality comparisons get noisy fast.',
            ],
          },
        ],
        sources: [
          {
            title: 'LoRA: Low-Rank Adaptation of Large Language Models (arXiv)',
            href: 'https://arxiv.org/abs/2106.09685',
            type: 'paper',
          },
          {
            title: 'QLoRA: Efficient Finetuning of Quantized LLMs (arXiv)',
            href: 'https://arxiv.org/abs/2305.14314',
            type: 'paper',
          },
          {
            title: 'PEFT LoRA Configuration Reference',
            href: 'https://huggingface.co/docs/peft/main/package_reference/lora',
            type: 'docs',
          },
          {
            title: 'PEFT LoRA Developer Guide',
            href: 'https://huggingface.co/docs/peft/main/developer_guides/lora',
            type: 'docs',
          },
        ],
      },
    ),
    loraAlpha: card(
      'advanced.lora_alpha',
      'LoRA alpha',
      'LoRA scaling factor for adapter updates. In practice this controls how hard a chosen rank pushes on the base model.',
      {
        impacts: ['quality', 'stability'],
        badges: [
          { text: 'Coupled to rank', tone: 'info' },
          { text: 'Can destabilize', tone: 'warn' },
        ],
        sections: [
          {
            id: 'what',
            title: 'What this changes',
            bullets: [
              'LoRA alpha scales adapter updates, commonly as alpha divided by rank.',
              'In Crucible, it is best read as an intensity knob layered on top of LoRA rank and target-module choice.',
            ],
          },
          {
            id: 'tradeoffs',
            title: 'Tradeoffs',
            bullets: [
              'Higher alpha can help adapters move faster, but it also makes overshoot, instability, and overfitting easier.',
              'Lower alpha is more conservative and usually safer when the run is already capacity-limited or noisy.',
            ],
          },
          {
            id: 'practical_rule',
            title: 'Practical rule',
            bullets: [
              'Do not tune alpha in isolation. If rank changes, revisit alpha too.',
              'When comparisons look noisy, check alpha, learning rate, and target modules together before trusting the result.',
            ],
          },
        ],
        sources: [
          {
            title: 'LoRA: Low-Rank Adaptation of Large Language Models (arXiv)',
            href: 'https://arxiv.org/abs/2106.09685',
            type: 'paper',
          },
          {
            title: 'QLoRA: Efficient Finetuning of Quantized LLMs (arXiv)',
            href: 'https://arxiv.org/abs/2305.14314',
            type: 'paper',
          },
          {
            title: 'PEFT LoRA Configuration Reference',
            href: 'https://huggingface.co/docs/peft/main/package_reference/lora',
            type: 'docs',
          },
          {
            title: 'PEFT LoRA Developer Guide',
            href: 'https://huggingface.co/docs/peft/main/developer_guides/lora',
            type: 'docs',
          },
        ],
      },
    ),
    learningRate: card(
      'advanced.learning_rate',
      'Learning rate',
      'Base optimizer step size. This is one of the highest-leverage knobs in the whole training loop.',
      {
        impacts: ['quality', 'stability'],
        badges: [
          { text: 'High leverage', tone: 'warn' },
          { text: 'Tune with warmup', tone: 'info' },
        ],
        sections: [
          {
            id: 'what',
            title: 'What this changes',
            bullets: [
              'Learning rate controls how far each optimizer step can move the model.',
              'In Crucible, it is one of the main controls that determines whether a run looks underpowered, stable, or unstable.',
            ],
          },
          {
            id: 'tradeoffs',
            title: 'Tradeoffs',
            bullets: [
              'Too high usually shows up as unstable loss, noisy metrics, or brittle comparisons between runs.',
              'Too low can make long runs look safe while still undertraining and wasting budget.',
            ],
          },
          {
            id: 'practical_rule',
            title: 'Practical rule',
            bullets: [
              'Treat learning rate as coupled to batch size, gradient accumulation, warmup, and method.',
              'If a run feels unstable, do not just lower LR blindly. Check whether batch shape or warmup is the actual problem.',
            ],
          },
        ],
        sources: [
          {
            title: 'QLoRA: Efficient Finetuning of Quantized LLMs (arXiv)',
            href: 'https://arxiv.org/abs/2305.14314',
            type: 'paper',
          },
          {
            title: 'Transformers Optimizer Schedules',
            href: 'https://huggingface.co/docs/transformers/main_classes/optimizer_schedules',
            type: 'docs',
          },
          {
            title: 'PyTorch Optimizer Documentation',
            href: 'https://docs.pytorch.org/docs/stable/optim.html',
            type: 'docs',
          },
        ],
      },
    ),
    warmupRatio: card(
      'advanced.warmup_ratio',
      'Warmup ratio',
      'Fraction of total steps spent ramping the learning rate up instead of starting at full strength.',
      {
        impacts: ['stability'],
        badges: [{ text: 'Stability control', tone: 'info' }],
        sections: [
          {
            id: 'what',
            title: 'What this changes',
            bullets: [
              'Warmup protects the earliest training steps when the optimizer and adapter updates are least settled.',
              'In Crucible, it is mainly a stability control rather than a quality knob by itself.',
            ],
          },
          {
            id: 'tradeoffs',
            title: 'Tradeoffs',
            bullets: [
              'Too little warmup can make early steps spike or diverge, especially with aggressive learning rates.',
              'Too much warmup can waste a meaningful fraction of a short run on underpowered updates.',
            ],
          },
          {
            id: 'practical_rule',
            title: 'Practical rule',
            bullets: [
              'Tune warmup together with learning rate and total run length.',
              'Short experiments usually need less warmup than long production-style runs.',
            ],
          },
        ],
        sources: [
          {
            title: 'Transformers Optimizer Schedules',
            href: 'https://huggingface.co/docs/transformers/main_classes/optimizer_schedules',
            type: 'docs',
          },
          {
            title: 'TrainingArguments.warmup_ratio',
            href: 'https://huggingface.co/docs/transformers/main_classes/trainer#transformers.TrainingArguments.warmup_ratio',
            type: 'docs',
          },
          {
            title: 'PyTorch LinearLR Scheduler',
            href: 'https://pytorch.org/docs/stable/generated/torch.optim.lr_scheduler.LinearLR.html',
            type: 'docs',
          },
        ],
      },
    ),
    optimizer: card(
      'advanced.optimizer',
      'Optimizer',
      'Optimizer implementation assumption for compute and memory overhead.',
      { impacts: ['vram', 'throughput', 'stability'] },
    ),
    lrScheduler: card(
      'advanced.lr_scheduler',
      'LR scheduler',
      'Learning-rate schedule family applied over training steps.',
      { impacts: ['quality', 'stability'] },
    ),
    precision: card(
      'advanced.precision',
      'Precision',
      'Compute precision for training kernels and optimizer state assumptions.',
      { impacts: ['vram', 'throughput', 'compatibility'] },
    ),
    unslothVersion: card(
      'advanced.unsloth_version',
      'Unsloth version',
      'Version hint for framework-specific overhead modeling.',
      { impacts: ['compatibility'] },
    ),
    customSpeedMultiplier: card(
      'advanced.custom_speed_multiplier',
      'Custom speed multiplier',
      'Extra multiplier applied on top of framework and kernel assumptions.',
      { impacts: ['cost', 'throughput'] },
    ),
    datasetRows: card(
      'advanced.dataset_rows',
      'Dataset rows (optional)',
      'Optional row count used for consistency checks against token totals.',
    ),
    avgTokensPerRow: card(
      'advanced.avg_tokens_per_row',
      'Avg tokens / row',
      'Average tokens per sample, used with row count for token sanity checks.',
    ),
    minVramGb: card(
      'advanced.min_vram_gb',
      'Min VRAM GB (optional)',
      'Hard minimum GPU memory required for candidate filtering.',
      { impacts: ['compatibility'] },
    ),
    rewardModelSize: card(
      'advanced.reward_model_size',
      'Reward model size (B)',
      'Reward model parameter count in billions for RL-style training modes.',
      { impacts: ['vram', 'cost', 'quality'] },
    ),
    importanceSampling: card(
      'advanced.importance_sampling_level',
      'Importance sampling',
      'GRPO defaults to token-level importance sampling. GSPO uses sequence-level importance sampling.',
      { impacts: ['cost', 'quality'] },
    ),
    referenceModelPct: card(
      'advanced.reference_model_pct',
      'Reference model (%)',
      'Approximate fraction of reference-model forward passes used for KL regularization (0-100).',
      { impacts: ['cost', 'quality'] },
    ),
    grpoGenerations: card(
      'advanced.grpo_num_generations',
      'GRPO generations',
      'Number of sampled generations per prompt for GRPO.',
      { impacts: ['cost', 'quality'] },
    ),
    vllmBatchSize: card(
      'advanced.vllm_batch_size',
      'vLLM batch size',
      'Batch size assumption used for vLLM-assisted generation workloads.',
      { impacts: ['throughput', 'compatibility'] },
    ),
    numRuns: card(
      'advanced.num_runs',
      'Number of runs',
      'Parallel or repeated training runs included in total cost output.',
      { impacts: ['cost'] },
    ),
    loraTargetModules: card(
      'advanced.lora_target_modules',
      'LoRA target modules',
      'Model submodules where LoRA adapters are attached. This decides where adaptation capacity is actually spent.',
      {
        impacts: ['quality', 'compatibility'],
        badges: [{ text: 'Architecture-sensitive', tone: 'warn' }],
        sections: [
          {
            id: 'what',
            title: 'What this changes',
            bullets: [
              'Target modules decide which attention or MLP projections receive LoRA adapters.',
              'In Crucible, this affects how much of the model can adapt, not just how much memory the adapter consumes.',
            ],
          },
          {
            id: 'tradeoffs',
            title: 'Tradeoffs',
            bullets: [
              'Narrow targeting is cheaper and simpler, but can underfit harder behavior changes.',
              'Broad targeting increases adaptation capacity, but also raises memory use, training cost, and architecture-specific failure risk.',
            ],
          },
          {
            id: 'practical_rule',
            title: 'Practical rule',
            bullets: [
              'Match module names to the real model architecture. Wrong names silently break experiments or create misleading comparisons.',
              'When rank or alpha changes, revisit target modules too before drawing conclusions from cost or quality changes.',
            ],
          },
        ],
        sources: [
          {
            title: 'LoRA: Low-Rank Adaptation of Large Language Models (arXiv)',
            href: 'https://arxiv.org/abs/2106.09685',
            type: 'paper',
          },
          {
            title: 'PEFT LoRA Configuration Reference',
            href: 'https://huggingface.co/docs/peft/main/package_reference/lora',
            type: 'docs',
          },
          {
            title: 'PEFT LoRA Developer Guide',
            href: 'https://huggingface.co/docs/peft/main/developer_guides/lora',
            type: 'docs',
          },
          {
            title: 'Transformers AutoModel Classes',
            href: 'https://huggingface.co/docs/transformers/main/model_doc/auto',
            type: 'docs',
          },
        ],
      },
    ),
    gradientCheckpointing: card(
      'advanced.use_gradient_checkpointing',
      'Gradient checkpointing',
      'Trades compute for memory by recomputing activations during backpropagation.',
      { impacts: ['vram', 'throughput'] },
    ),
    flashAttention: card(
      'advanced.use_flash_attention',
      'Flash attention',
      'Enables FlashAttention-style kernels when available.',
      { impacts: ['throughput', 'compatibility'] },
    ),
    tritonKernels: card(
      'advanced.use_triton_kernels',
      'Triton kernels',
      'Assumes Triton kernel implementations are used where available.',
      { impacts: ['throughput', 'compatibility'] },
    ),
    ropeKernels: card(
      'advanced.use_rope_kernels',
      'RoPE kernels',
      'Enables rotary-position-embedding optimized kernels.',
      { impacts: ['throughput', 'compatibility'] },
    ),
    fusedChunkedCe: card(
      'advanced.use_fused_chunked_ce_loss',
      'Fused chunked CE',
      'Assumes fused plus chunked cross-entropy loss kernels are available for long-context training.',
      { impacts: ['throughput', 'compatibility'] },
    ),
    fasterMoeKernels: card(
      'advanced.use_faster_moe_kernels',
      'Faster MoE kernels',
      'Assumes Unsloth Split-LoRA or faster MoE kernels are used when training MoE models.',
      { impacts: ['throughput', 'compatibility'] },
    ),
    sequencePacking: card(
      'advanced.sequence_packing',
      'Sequence packing',
      'Packs multiple short samples into longer sequences for higher utilization.',
      { impacts: ['throughput', 'cost'] },
    ),
    fullFinetuningMode: card(
      'advanced.full_finetuning',
      'Full finetuning mode',
      'Forces full-weight finetuning assumptions regardless of method selection.',
      { impacts: ['vram', 'cost', 'compatibility'] },
    ),
  },
} as const
