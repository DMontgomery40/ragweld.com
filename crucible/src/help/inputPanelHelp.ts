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

type HelpCardEnrichment = Omit<CrucibleHelpCard, 'id' | 'title' | 'short'>

function dedupeSources(sources: CrucibleHelpSource[] | undefined): CrucibleHelpSource[] | undefined {
  if (!sources || sources.length === 0) {
    return sources
  }

  const seen = new Set<string>()
  return sources.filter((entry) => {
    const key = `${entry.href}::${entry.title}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function source(title: string, href: string, type: CrucibleHelpSource['type']): CrucibleHelpSource {
  return { title, href, type }
}

function buildSections(input: {
  what?: string[]
  howToRead?: string[]
  tradeoffs?: string[]
  practicalRule?: string[]
}): CrucibleHelpSection[] {
  const sections: CrucibleHelpSection[] = []

  if (input.what && input.what.length > 0) {
    sections.push({
      id: 'what',
      title: 'What this changes',
      bullets: input.what,
    })
  }

  if (input.howToRead && input.howToRead.length > 0) {
    sections.push({
      id: 'how_to_read',
      title: 'How to read it',
      bullets: input.howToRead,
    })
  }

  if (input.tradeoffs && input.tradeoffs.length > 0) {
    sections.push({
      id: 'tradeoffs',
      title: 'Tradeoffs',
      bullets: input.tradeoffs,
    })
  }

  if (input.practicalRule && input.practicalRule.length > 0) {
    sections.push({
      id: 'practical_rule',
      title: 'Practical rule',
      bullets: input.practicalRule,
    })
  }

  return sections
}

const HELP_SOURCES = {
  hfHubModels: source('Hugging Face Hub Models', 'https://huggingface.co/docs/hub/models', 'docs'),
  hfAutoClasses: source(
    'Transformers Auto Classes',
    'https://huggingface.co/docs/transformers/main/model_doc/auto',
    'docs',
  ),
  hfTrainer: source(
    'Transformers Trainer / TrainingArguments',
    'https://huggingface.co/docs/transformers/main_classes/trainer',
    'docs',
  ),
  hfTokenizer: source(
    'Transformers Tokenizer API',
    'https://huggingface.co/docs/transformers/main_classes/tokenizer',
    'docs',
  ),
  hfPaddingTruncation: source(
    'Transformers Padding and Truncation',
    'https://huggingface.co/docs/transformers/main/pad_truncation',
    'docs',
  ),
  hfOptimizerSchedules: source(
    'Transformers Optimizer Schedules',
    'https://huggingface.co/docs/transformers/main_classes/optimizer_schedules',
    'docs',
  ),
  hfPerfGpu: source(
    'Transformers GPU Training Performance Guide',
    'https://huggingface.co/docs/transformers/main/perf_train_gpu_one',
    'docs',
  ),
  hfBitsandbytes: source(
    'Transformers BitsAndBytes Quantization',
    'https://huggingface.co/docs/transformers/quantization/bitsandbytes',
    'docs',
  ),
  bitsandbytesLinear4bit: source(
    'BitsAndBytes Linear4bit Reference',
    'https://huggingface.co/docs/bitsandbytes/main/en/reference/nn/linear4bit',
    'docs',
  ),
  hfMoE: source('Hugging Face Mixture-of-Experts Explainer', 'https://huggingface.co/blog/moe', 'reference'),
  peftLoraRef: source(
    'PEFT LoRA Configuration Reference',
    'https://huggingface.co/docs/peft/main/package_reference/lora',
    'docs',
  ),
  peftLoraGuide: source(
    'PEFT LoRA Developer Guide',
    'https://huggingface.co/docs/peft/main/developer_guides/lora',
    'docs',
  ),
  qloraPaper: source(
    'QLoRA: Efficient Finetuning of Quantized LLMs',
    'https://arxiv.org/abs/2305.14314',
    'paper',
  ),
  loraPaper: source(
    'LoRA: Low-Rank Adaptation of Large Language Models',
    'https://arxiv.org/abs/2106.09685',
    'paper',
  ),
  roformerPaper: source(
    'RoFormer: Rotary Position Embedding',
    'https://arxiv.org/abs/2104.09864',
    'paper',
  ),
  flashAttentionPaper: source('FlashAttention', 'https://arxiv.org/abs/2205.14135', 'paper'),
  deepseekDistill32b: source(
    'DeepSeek-R1-Distill-Qwen-32B Model Card',
    'https://huggingface.co/deepseek-ai/DeepSeek-R1-Distill-Qwen-32B',
    'vendor',
  ),
  qwen30bA3b: source('Qwen3-30B-A3B Model Card', 'https://huggingface.co/Qwen/Qwen3-30B-A3B', 'vendor'),
  unslothInstall: source('Unsloth Install', 'https://unsloth.ai/docs/get-started/install', 'vendor'),
  unslothNotebooks: source(
    'Unsloth Notebooks',
    'https://unsloth.ai/docs/get-started/unsloth-notebooks',
    'vendor',
  ),
  unslothFineTuning: source(
    'Unsloth Fine-Tuning Guide',
    'https://unsloth.ai/docs/get-started/fine-tuning-llms-guide',
    'vendor',
  ),
  unslothMultiGpu: source(
    'Unsloth Multi-GPU Training',
    'https://unsloth.ai/docs/basics/multi-gpu-training-with-unsloth',
    'vendor',
  ),
  unslothUpdating: source(
    'Updating Unsloth',
    'https://unsloth.ai/docs/get-started/install-and-update/updating',
    'vendor',
  ),
  unslothPacking: source(
    'Unsloth Kernels + Packing',
    'https://unsloth.ai/docs/new/3x-faster-training-packing',
    'vendor',
  ),
  unslothQat: source(
    'Unsloth Quantization-Aware Training',
    'https://unsloth.ai/docs/get-started/fine-tuning-llms-guide/lora-hyperparameters-guide',
    'vendor',
  ),
  unslothDynamic20: source(
    'Unsloth Dynamic 2.0 GGUFs',
    'https://unsloth.ai/docs/basics/unsloth-dynamic-2.0-ggufs',
    'vendor',
  ),
  unslothGrpoLongContext: source(
    'Unsloth GRPO Long Context',
    'https://unsloth.ai/docs/new/grpo-long-context',
    'vendor',
  ),
  torchaoQatApi: source(
    'TorchAO Quantization API',
    'https://docs.pytorch.org/ao/stable/pt2e_quantization/index.html',
    'docs',
  ),
  torchaoTraining: source(
    'TorchAO Quantized Training Workflows',
    'https://docs.pytorch.org/ao/stable/workflows/training.html',
    'docs',
  ),
  pytorchAmp: source(
    'PyTorch Automatic Mixed Precision',
    'https://docs.pytorch.org/docs/stable/amp.html',
    'docs',
  ),
  pytorchCheckpoint: source(
    'PyTorch Activation Checkpointing',
    'https://docs.pytorch.org/docs/stable/checkpoint.html',
    'docs',
  ),
  pytorchSdpa: source(
    'PyTorch Scaled Dot Product Attention',
    'https://docs.pytorch.org/docs/stable/generated/torch.nn.functional.scaled_dot_product_attention',
    'docs',
  ),
  pytorchOptim: source('PyTorch Optimizers', 'https://docs.pytorch.org/docs/stable/optim.html', 'docs'),
  pytorchDistributed: source(
    'PyTorch Distributed Overview',
    'https://docs.pytorch.org/docs/stable/distributed',
    'docs',
  ),
  torchrun: source(
    'torchrun Elastic Launch',
    'https://docs.pytorch.org/docs/stable/elastic/run.html',
    'docs',
  ),
  deepspeedTraining: source('DeepSpeed Training', 'https://www.deepspeed.ai/training/', 'docs'),
  tritonDocs: source('Triton Language Documentation', 'https://triton-lang.org/main/index.html', 'docs'),
  trlSft: source('TRL SFT Trainer', 'https://huggingface.co/docs/trl/main/en/sft_trainer', 'docs'),
  trlDpo: source('TRL DPO Trainer', 'https://huggingface.co/docs/trl/en/dpo_trainer', 'docs'),
  trlGrpo: source('TRL GRPO Trainer', 'https://huggingface.co/docs/trl/main/en/grpo_trainer', 'docs'),
  trlOrpo: source('TRL ORPO Trainer', 'https://huggingface.co/docs/trl/orpo_trainer', 'docs'),
  trlPpo: source('TRL PPO Trainer', 'https://huggingface.co/docs/trl/ppo_trainer', 'docs'),
  trlReward: source(
    'TRL Reward Modeling',
    'https://huggingface.co/docs/trl/main/reward_trainer',
    'docs',
  ),
  transformersHpo: source(
    'Transformers Hyperparameter Search',
    'https://huggingface.co/docs/transformers/hpo_train',
    'docs',
  ),
  vllmEngineArgs: source(
    'vLLM Engine Arguments',
    'https://docs.vllm.ai/configuration/engine_args.html',
    'docs',
  ),
  vllmScheduler: source(
    'vLLM Scheduler Config',
    'https://docs.vllm.ai/en/latest/api/vllm/config/scheduler/',
    'docs',
  ),
  vllmOpenAiServer: source(
    'vLLM OpenAI-Compatible Server',
    'https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html',
    'docs',
  ),
  shadeformQuickstart: source(
    'Shadeform Quickstart',
    'https://docs.shadeform.ai/getting-started/quickstart',
    'docs',
  ),
  shadeformTypes: source(
    'Shadeform Instance Types',
    'https://docs.shadeform.ai/api-reference/instances/instances-types',
    'docs',
  ),
  shadeformCreate: source(
    'Shadeform Create Instance',
    'https://docs.shadeform.ai/api-reference/instances/instances-create',
    'docs',
  ),
  nvidiaNvlink: source(
    'NVIDIA NVLink Network Overview',
    'https://docs.nvidia.com/multi-node-nvlink-systems/imex-guide/overview.html',
    'vendor',
  ),
} as const

const MODEL_RESOLUTION_SOURCES = [
  HELP_SOURCES.hfHubModels,
  HELP_SOURCES.hfAutoClasses,
  HELP_SOURCES.deepseekDistill32b,
]

const MOE_SOURCES = [HELP_SOURCES.hfMoE, HELP_SOURCES.qwen30bA3b, HELP_SOURCES.deepseekDistill32b]
const METHOD_SOURCES = [HELP_SOURCES.peftLoraRef, HELP_SOURCES.peftLoraGuide, HELP_SOURCES.qloraPaper]
const QUANTIZATION_SOURCES = [HELP_SOURCES.hfBitsandbytes, HELP_SOURCES.unslothQat, HELP_SOURCES.torchaoTraining]
const QAT_SOURCES = [HELP_SOURCES.unslothQat, HELP_SOURCES.torchaoQatApi, HELP_SOURCES.torchaoTraining]
const FRAMEWORK_SOURCES = [HELP_SOURCES.unslothFineTuning, HELP_SOURCES.hfTrainer, HELP_SOURCES.unslothInstall]
const TRAINING_SHAPE_SOURCES = [HELP_SOURCES.hfTrainer, HELP_SOURCES.hfTokenizer, HELP_SOURCES.hfPaddingTruncation]
const RL_SOURCES = [HELP_SOURCES.trlSft, HELP_SOURCES.trlDpo, HELP_SOURCES.trlGrpo, HELP_SOURCES.trlPpo]
const DISTRIBUTED_SOURCES = [HELP_SOURCES.torchrun, HELP_SOURCES.pytorchDistributed, HELP_SOURCES.unslothMultiGpu]
const HARDWARE_FILTER_SOURCES = [
  HELP_SOURCES.shadeformQuickstart,
  HELP_SOURCES.shadeformTypes,
  HELP_SOURCES.shadeformCreate,
]
const INTERCONNECT_SOURCES = [HELP_SOURCES.nvidiaNvlink, HELP_SOURCES.pytorchDistributed, HELP_SOURCES.shadeformTypes]
const OPTIMIZER_SOURCES = [HELP_SOURCES.pytorchOptim, HELP_SOURCES.hfOptimizerSchedules, HELP_SOURCES.hfTrainer]
const PRECISION_SOURCES = [HELP_SOURCES.pytorchAmp, HELP_SOURCES.hfBitsandbytes, HELP_SOURCES.torchaoTraining]
const VERSION_SOURCES = [HELP_SOURCES.unslothInstall, HELP_SOURCES.unslothUpdating, HELP_SOURCES.unslothNotebooks]
const CHECKPOINT_SOURCES = [HELP_SOURCES.pytorchCheckpoint, HELP_SOURCES.hfPerfGpu, HELP_SOURCES.hfTrainer]
const KERNEL_SOURCES = [HELP_SOURCES.pytorchSdpa, HELP_SOURCES.tritonDocs, HELP_SOURCES.unslothFineTuning]
const PACKING_SOURCES = [HELP_SOURCES.unslothPacking, HELP_SOURCES.trlSft, HELP_SOURCES.hfPaddingTruncation]
const VLLM_SOURCES = [HELP_SOURCES.vllmEngineArgs, HELP_SOURCES.vllmScheduler, HELP_SOURCES.trlGrpo]
const CAMPAIGN_SOURCES = [HELP_SOURCES.hfTrainer, HELP_SOURCES.transformersHpo, HELP_SOURCES.torchrun]

const HELP_ENRICHMENTS: Record<string, HelpCardEnrichment> = {
  'model.resolve_reference': {
    badges: [{ text: 'Metadata autofill', tone: 'info' }],
    sections: buildSections({
      what: [
        'This looks up a Hugging Face repo or URL and pulls the model metadata that Crucible can use immediately.',
        'It is the fastest path to align parameter count, architecture, layer shape, and repo identity with the published source of truth.',
      ],
      tradeoffs: [
        'Auto-filled metadata is only as good as the model card and config the repo actually publishes.',
        'Forks, repacks, and distills can look similar by name while still having materially different architecture details.',
      ],
      practicalRule: [
        'Use resolve when you know the exact repo. Switch to manual overrides only after you have a concrete reason to disagree with the published config.',
        'If the resolved model is dense, do not carry over MoE assumptions from an upstream family name.',
      ],
    }),
    sources: MODEL_RESOLUTION_SOURCES,
  },
  'model.preset': {
    badges: [{ text: 'Curated default', tone: 'info' }],
    sections: buildSections({
      what: [
        'A preset is a convenience template for known models, not a live promise that every value exactly matches the newest upstream revision.',
        'It gives you a fast starting point for math, filters, and cost estimates before you resolve a specific repo.',
      ],
      tradeoffs: [
        'Presets are great for exploration, but they can lag new checkpoints, forks, or rapidly changing training workflows.',
        'Using a preset without checking the actual repo can accidentally preserve stale architecture or quantization assumptions.',
      ],
      practicalRule: [
        'Use a preset to get moving, then resolve the exact repo or compare against the model card before trusting the final estimate.',
        'If you are working with a fork, distill, or vendor-tuned release, treat Custom or direct resolve as the safer path.',
      ],
    }),
    sources: MODEL_RESOLUTION_SOURCES,
  },
  'model.id': {
    badges: [{ text: 'Identity field', tone: 'info' }],
    sections: buildSections({
      what: [
        'This is the identifier Crucible carries through requests, sharing, and model resolution.',
        'Exact repo ids usually carry more useful information than human-readable labels because they bind you to a specific namespace and artifact.',
      ],
      howToRead: [
        'A short label can be enough for local exploration, but a full Hugging Face repo id is the strongest signal when you want reliable auto-resolution.',
        'Distills and vendor repacks often differ from their upstream family even when the marketing name sounds similar.',
      ],
      practicalRule: [
        'Prefer the exact repo id when you have it. It reduces ambiguity and makes later exports easier to audit.',
        'If a model name is generic, confirm the repo rather than assuming the planner will infer the intended checkpoint.',
      ],
    }),
    sources: MODEL_RESOLUTION_SOURCES,
  },
  'model.params_billions': {
    badges: [{ text: 'Capacity + residency', tone: 'warn' }],
    sections: buildSections({
      what: [
        'Total parameters are the full weight count the model carries, which is why this field drives resident VRAM and overall model capacity.',
        'For sparse MoE models, this stays large even when only a subset of experts are active per token.',
      ],
      tradeoffs: [
        'Higher total params can improve capacity, but they raise memory pressure even if per-token compute is sparse.',
        'Confusing total params with active params is one of the fastest ways to understate VRAM requirements.',
      ],
      practicalRule: [
        'Use the published total parameter count here, not the activated-per-token number and not the LoRA adapter size.',
        'If the model is MoE, keep total params here and use the active-params field separately when the model card explicitly publishes it.',
      ],
    }),
    sources: MOE_SOURCES,
  },
  'model.active_params_billions': {
    badges: [{ text: 'Compute-side only', tone: 'warn' }],
    sections: buildSections({
      what: [
        'This is the activated parameter count per token for sparse MoE compute, not the full model size.',
        'Crucible uses it to reduce compute and time assumptions while still keeping VRAM and capacity anchored to total params.',
      ],
      tradeoffs: [
        'If you know the real activated-per-token count, estimates get much more honest for sparse MoE throughput.',
        'If you guess here or copy an expert-count ratio blindly, you can make the compute math look unrealistically cheap.',
      ],
      practicalRule: [
        'Leave this blank unless the model card, paper, or official repo actually publishes activated params per token.',
        'Do not substitute active experts, expert ratios, or a dense submodel size unless the source explicitly equates those values.',
      ],
    }),
    sources: MOE_SOURCES,
  },
  'model.architecture': {
    badges: [{ text: 'Dense vs sparse', tone: 'warn' }],
    sections: buildSections({
      what: [
        'Architecture tells Crucible whether the model behaves like a dense transformer or a sparse MoE system.',
        'That choice changes how the planner interprets total params, active params, expert fields, and some runtime warnings.',
      ],
      tradeoffs: [
        'MoE can reduce per-token compute, but it does not magically turn total weight residency into the active count.',
        'Marking a dense distill as MoE will distort throughput assumptions and confuse the help around active parameters.',
      ],
      practicalRule: [
        'Use the architecture published by the actual checkpoint you are training, not the family it was derived from.',
        'Distills like DeepSeek-R1-Distill-Qwen-32B are dense even though some upstream DeepSeek families are MoE.',
      ],
    }),
    sources: MOE_SOURCES,
  },
  'model.method': {
    badges: [{ text: 'Coupled to quantization', tone: 'warn' }],
    sections: buildSections({
      what: [
        'Method decides whether you are updating full base weights or adapter weights, which changes memory, throughput, and support assumptions.',
        'In this planner, LoRA and QLoRA are not just branding choices. They imply different trainable state and quantization behavior.',
      ],
      tradeoffs: [
        'Full fine-tuning gives the broadest adaptation but is the most memory-intensive path.',
        'LoRA and QLoRA are cheaper and faster to fit, but they are narrower interventions and more sensitive to rank, target modules, and quantization setup.',
      ],
      practicalRule: [
        'Read method together with quantization, rank, alpha, and target modules before trusting any comparison.',
        'If you select QLoRA, expect the planner to normalize you back to a 4-bit adapter path.',
      ],
    }),
    sources: METHOD_SOURCES,
  },
  'model.quantization_bits': {
    badges: [{ text: 'Weight precision bucket', tone: 'info' }],
    sections: buildSections({
      what: [
        'This is the target weight precision bucket the planner uses for memory and throughput assumptions.',
        'Under QAT, this is the export target precision rather than a second independent training scheme selector.',
      ],
      tradeoffs: [
        'Lower bit-widths reduce weight footprint, but they introduce stronger quantization assumptions and compatibility constraints.',
        '8-bit QAT targets and 4-bit QLoRA paths are not interchangeable even if both sound like “quantized training.”',
      ],
      practicalRule: [
        'Read this field together with method and Use QAT. Those controls are intentionally coupled.',
        'If you are on 4-bit non-QAT, the profile selector matters. If you are on 8-bit QAT, the scheme field is the more relevant companion.',
      ],
    }),
    sources: QUANTIZATION_SOURCES,
  },
  'model.quantization_profile': {
    badges: [{ text: '4-bit only in practice', tone: 'info' }],
    sections: buildSections({
      what: [
        'Quantization profile distinguishes different 4-bit implementation families such as NF4, FP4, and dynamic paths.',
        'It exists because not all 4-bit routes behave the same for memory overhead and planner assumptions.',
      ],
      tradeoffs: [
        'Profile choice matters most when you are comparing 4-bit adapter paths or inference-style quantization families.',
        'Once you move to 8/16/32-bit or a QAT-specific export path, a separate profile selector becomes less meaningful.',
      ],
      practicalRule: [
        'Use this to compare 4-bit families, not to express a second copy of target precision.',
        'If QAT is on, expect the scheme selector to supersede this field rather than stacking with it.',
      ],
    }),
    sources: [HELP_SOURCES.hfBitsandbytes, HELP_SOURCES.bitsandbytesLinear4bit, HELP_SOURCES.unslothDynamic20],
  },
  'model.use_qat': {
    badges: [{ text: 'Training-path choice', tone: 'warn' }],
    sections: buildSections({
      what: [
        'QAT means the training loop is modeling the target quantized deployment path rather than only quantizing after training.',
        'In Crucible right now, the source-backed paths are 4-bit INT4-style exports and 8-bit FP8-style exports.',
      ],
      tradeoffs: [
        'QAT can make deployment behavior closer to the trained path, but it adds workflow complexity and some compute overhead.',
        'It is not the same thing as loading a quantized base model for ordinary LoRA or QLoRA training.',
      ],
      practicalRule: [
        'Turn this on when deploy fidelity to a known target precision is part of the job, not just because lower-bit inference exists.',
        'If the target precision changes, revisit the QAT scheme instead of assuming the old setting still makes sense.',
      ],
    }),
    sources: QAT_SOURCES,
  },
  'model.qat_scheme': {
    badges: [{ text: 'Target-specific', tone: 'warn' }],
    sections: buildSections({
      what: [
        'QAT scheme selects the specific quantized-training path Crucible is modeling for the chosen target precision.',
        'The available options are intentionally filtered because 4-bit-target QAT and 8-bit-target QAT are different workflows.',
      ],
      tradeoffs: [
        'A scheme that makes sense for INT4 export does not automatically make sense for FP8-style export.',
        'Carrying a stale scheme forward after changing target precision creates nonsense pairings, so the planner normalizes mismatches.',
      ],
      practicalRule: [
        'Read the scheme only after you know the target precision you actually want to ship.',
        'If you are not explicitly planning a QAT workflow, leave Use QAT off instead of trying to encode inference quantization here.',
      ],
    }),
    sources: QAT_SOURCES,
  },
  'model.framework': {
    badges: [{ text: 'Planner posture', tone: 'info' }],
    sections: buildSections({
      what: [
        'Framework tells Crucible which runtime, kernel, and documentation posture to assume for the run.',
        'It affects modeled throughput, compatibility confidence, and how strict the planner is about documented versus inferred paths.',
      ],
      tradeoffs: [
        'A framework with stronger source coverage can make the planner more opinionated and easier to trust.',
        'A framework outside the current source-backed catalog may still work, but the estimate becomes more provisional.',
      ],
      practicalRule: [
        'Treat framework as a concrete implementation choice, not just a brand preference.',
        'If you are hand-rolling the stack or deviating from documented guides, expect the support posture to widen.',
      ],
    }),
    sources: FRAMEWORK_SOURCES,
  },
  'model.workflow_mode': {
    badges: [{ text: 'Documentation confidence', tone: 'info' }],
    sections: buildSections({
      what: [
        'Workflow mode tells Crucible whether to frame the estimate around a documented setup path or a more open-ended custom pipeline.',
        'It mainly changes support posture and how conservative the planner is about runtime assumptions.',
      ],
      tradeoffs: [
        'Guided mode stays closer to public setup docs and is easier to compare against vendor examples.',
        'Custom pipeline gives you room to model bespoke infra, but it weakens the guarantee that a doc-backed path exists end-to-end.',
      ],
      practicalRule: [
        'Use Guided when you are intentionally following a documented notebook, local, or Docker path.',
        'Use Custom pipeline when you are stitching together your own infra, distributed setup, or provider integration.',
      ],
    }),
    sources: [HELP_SOURCES.unslothInstall, HELP_SOURCES.unslothNotebooks, HELP_SOURCES.unslothMultiGpu],
  },
  'model.moe_total_experts': {
    badges: [{ text: 'Structural MoE field', tone: 'info' }],
    sections: buildSections({
      what: [
        'Total experts is the full number of experts present in the sparse model architecture.',
        'It matters for weight residency and for understanding how sparse routing sits inside the full parameter count.',
      ],
      tradeoffs: [
        'More experts can increase model capacity and sparsity options, but they also push total weight residency upward.',
        'This field alone does not tell you how many parameters are actually active for any given token.',
      ],
      practicalRule: [
        'Use the published expert count from the model card or config.',
        'Do not replace this with the number of active experts or with an activated-parameter estimate.',
      ],
    }),
    sources: MOE_SOURCES,
  },
  'model.moe_active_experts': {
    badges: [{ text: 'Routing metadata', tone: 'warn' }],
    sections: buildSections({
      what: [
        'Active experts is the number of experts the router selects per token.',
        'It helps describe sparse routing structure, but it is not automatically the same thing as active parameter count per token.',
      ],
      tradeoffs: [
        'Lower routing fanout can reduce per-token compute, but runtime behavior still depends on kernels, batching, and dispatch overhead.',
        'Using active experts as a shortcut for activated params can badly understate or overstate compute.',
      ],
      practicalRule: [
        'Use this as structural MoE metadata and keep active params in the dedicated field when the model publishes it.',
        'If activated params are unknown, the planner should stay conservative rather than pretending the expert ratio is exact.',
      ],
    }),
    sources: MOE_SOURCES,
  },
  'dataset.dataset_tokens': {
    badges: [{ text: 'Linear cost driver', tone: 'warn' }],
    sections: buildSections({
      what: [
        'Dataset tokens are the total tokenized workload per epoch, so this field is one of the most direct cost multipliers in the estimator.',
        'Crucible uses it to turn your model and batch assumptions into steps, FLOPs, hours, and cost.',
      ],
      tradeoffs: [
        'More tokens usually improve coverage and robustness, but the cost scales almost linearly with them.',
        'A row count without good token estimates can make the workload look much smaller or larger than it really is.',
      ],
      practicalRule: [
        'Use real tokenized totals when possible. If you only have rows, treat the estimate as a sanity check rather than ground truth.',
        'Revisit this number after changing templates, truncation, or packing assumptions.',
      ],
    }),
    sources: TRAINING_SHAPE_SOURCES,
  },
  'dataset.epochs': {
    badges: [{ text: 'Repeat factor', tone: 'info' }],
    sections: buildSections({
      what: [
        'Epochs set how many full passes over the dataset the run will make.',
        'Because cost scales with tokens seen, epochs directly multiply the training workload.',
      ],
      tradeoffs: [
        'More epochs can help if the dataset is small or the target behavior is hard, but they can also waste budget or overfit narrow data.',
        'A fixed epoch count is not equally meaningful across tiny and huge datasets.',
      ],
      practicalRule: [
        'Read epochs together with dataset size. Three epochs on a tiny corpus is not the same planning decision as three epochs on a giant one.',
        'If quality stalls early, more epochs are not automatically the right answer.',
      ],
    }),
    sources: [HELP_SOURCES.hfTrainer, HELP_SOURCES.trlSft, HELP_SOURCES.hfTokenizer],
  },
  'dataset.training_type': {
    badges: [{ text: 'Objective class', tone: 'warn' }],
    sections: buildSections({
      what: [
        'Training type decides whether Crucible is modeling SFT-style supervised updates or more complex post-training loops such as DPO, GRPO, ORPO, or PPO.',
        'That changes how much extra forward work, sampling, or reference-model traffic the planner expects.',
      ],
      tradeoffs: [
        'SFT is usually the cleanest baseline for cost planning.',
        'Preference optimization and RL-style methods can be much more operationally expensive even when the base model is unchanged.',
      ],
      practicalRule: [
        'Compare costs inside the same objective family before drawing conclusions about hardware efficiency.',
        'If a run involves generation, rewards, or KL regularization, do not expect SFT-shaped math to stay accurate.',
      ],
    }),
    sources: RL_SOURCES,
  },
  'hardware.num_gpus': {
    badges: [{ text: 'Cluster total', tone: 'warn' }],
    sections: buildSections({
      what: [
        'This is the total number of GPUs used by the run across all nodes, not the per-node count.',
        'Crucible uses it to scale effective throughput and candidate matching across provider rows.',
      ],
      tradeoffs: [
        'More GPUs can cut wall-clock time and raise feasible batch size, but they also add orchestration, communication, and availability constraints.',
        'A higher GPU count is not free speed if interconnect and host feed become the bottleneck.',
      ],
      practicalRule: [
        'Read GPUs per run together with Nodes and Interconnect.',
        'If you mean “4 GPUs across 2 nodes,” enter 4 here and 2 in Nodes rather than multiplying twice in your head.',
      ],
    }),
    sources: DISTRIBUTED_SOURCES,
  },
  'hardware.num_nodes': {
    badges: [{ text: 'Topology-sensitive', tone: 'warn' }],
    sections: buildSections({
      what: [
        'Nodes are the number of machines participating in the run.',
        'They matter because crossing machine boundaries changes communication and host-feed behavior even when the total GPU count is unchanged.',
      ],
      tradeoffs: [
        'More nodes can make bigger clusters possible, but they usually widen the runtime envelope and operational complexity.',
        'A two-node job with the same total GPUs is not equivalent to a one-node job with fast local fabric.',
      ],
      practicalRule: [
        'Treat nodes as a topology decision, not just a bookkeeping field.',
        'If you increase node count, revisit throughput and support assumptions before treating the result as a simple linear scale-out.',
      ],
    }),
    sources: DISTRIBUTED_SOURCES,
  },
  'hardware.target_gpu': {
    badges: [{ text: 'Result filter', tone: 'info' }],
    sections: buildSections({
      what: [
        'Target GPU families filter the candidate rows shown in the cost table.',
        'They do not change the model math itself. They only change which hardware comparisons survive to the results pane.',
      ],
      tradeoffs: [
        'A narrow GPU filter makes the table easier to read, but it can hide cheaper or safer fits elsewhere.',
        'An overly broad filter can create noise if you already know the procurement class you care about.',
      ],
      practicalRule: [
        'Start broad while you are learning the run envelope, then narrow once you know the VRAM and throughput neighborhood you actually need.',
        'If the table looks empty or weirdly expensive, clear the filter before assuming the model is impossible.',
      ],
    }),
    sources: HARDWARE_FILTER_SOURCES,
  },
  'hardware.pricing_tier': {
    badges: [{ text: 'Budget framing', tone: 'info' }],
    sections: buildSections({
      what: [
        'Pricing tiers decide which billing modes are allowed into cost comparison, such as on-demand, spot, or reserved pricing.',
        'The same hardware can look radically different depending on which tiers are actually available.',
      ],
      tradeoffs: [
        'Cheaper tiers can materially reduce estimated spend, but they may be sparse, stale, or operationally less reliable.',
        'Using only a discounted tier can make the budget look better than what you can actually procure on schedule.',
      ],
      practicalRule: [
        'Keep at least one realistic procurement tier in the comparison while you are sanity-checking budgets.',
        'If a tier has no published prices for the current filter set, treat the empty result as a data constraint, not as proof the run is impossible.',
      ],
    }),
    sources: HARDWARE_FILTER_SOURCES,
  },
  'hardware.target_providers': {
    badges: [{ text: 'Operational filter', tone: 'info' }],
    sections: buildSections({
      what: [
        'Provider filters restrict the result table to clouds or marketplaces you are actually willing to use.',
        'They are operational constraints layered on top of the estimator, not direct training-math controls.',
      ],
      tradeoffs: [
        'Provider filtering improves realism for procurement, compliance, or region constraints.',
        'It also removes discovery value and can hide the actual cheapest or fastest fit if your shortlist is too aggressive.',
      ],
      practicalRule: [
        'Leave this blank until you have a real provider constraint.',
        'If you do filter providers, be ready for pricing tiers, regions, and instance availability to shrink sharply with them.',
      ],
    }),
    sources: HARDWARE_FILTER_SOURCES,
  },
  'hardware.target_regions': {
    badges: [{ text: 'Availability filter', tone: 'info' }],
    sections: buildSections({
      what: [
        'Region filters constrain the comparison to locations where you can or want to run the job.',
        'They interact with provider, tier, and GPU availability rather than changing the training math itself.',
      ],
      tradeoffs: [
        'Region constraints make the results more operationally honest, but they can wipe out spot or niche SKUs quickly.',
        'A good global price can disappear once you force the table into a single region.',
      ],
      practicalRule: [
        'Apply region filters after you know the hardware class, not before.',
        'If the table empties out, relax region or provider constraints before assuming the model no longer fits economically.',
      ],
    }),
    sources: HARDWARE_FILTER_SOURCES,
  },
  'hardware.target_interconnects': {
    badges: [{ text: 'Scale-out filter', tone: 'warn' }],
    sections: buildSections({
      what: [
        'Interconnect filters narrow the table to specific hardware fabrics such as PCIe or higher-bandwidth SXM/NVLink-style setups.',
        'This matters most when you care about multi-GPU or multi-node efficiency rather than single-GPU fit.',
      ],
      tradeoffs: [
        'Faster interconnect can improve collective performance and reduce scale-out pain, but it usually narrows supply and can raise price.',
        'Constraining interconnect too early can hide acceptable single-node options that would otherwise be fine.',
      ],
      practicalRule: [
        'Use this when your run is genuinely communication-sensitive, not just because the faster fabric sounds better.',
        'If you are comparing small runs, leave it open unless topology is a real procurement requirement.',
      ],
    }),
    sources: INTERCONNECT_SOURCES,
  },
  'hardware.target_instance_types': {
    badges: [{ text: 'Late-stage filter', tone: 'info' }],
    sections: buildSections({
      what: [
        'Instance-type filtering pins the comparison to exact provider SKUs.',
        'It is the most operationally specific hardware filter in the panel.',
      ],
      tradeoffs: [
        'This is useful when you already know the exact procurement target.',
        'It is also the easiest way to accidentally hide better alternatives or create empty results with no explanatory value.',
      ],
      practicalRule: [
        'Use instance filters late in the search process, after GPU family and region filters have already narrowed the field.',
        'When you are exploring, leave this blank and let the table teach you what instance types are even relevant.',
      ],
    }),
    sources: HARDWARE_FILTER_SOURCES,
  },
  'advanced.toggle': {
    badges: [{ text: 'Expert controls', tone: 'warn' }],
    sections: buildSections({
      what: [
        'Advanced parameters expose the lower-level knobs that shape Crucible’s training math, support posture, and runtime assumptions.',
        'They are meant for situations where the default planner surface is too coarse for the real run you are trying to model.',
      ],
      tradeoffs: [
        'More control means you can model more realistic setups.',
        'It also means it becomes easier to create internally inconsistent configurations that look precise but are not comparable.',
      ],
      practicalRule: [
        'Change advanced knobs in coherent groups rather than flipping many at once.',
        'If an estimate suddenly looks dramatically better, check whether you improved the real plan or just made the assumptions looser.',
      ],
    }),
    sources: [HELP_SOURCES.hfTrainer, HELP_SOURCES.unslothFineTuning, HELP_SOURCES.hfPerfGpu],
  },
  'advanced.optimizer': {
    badges: [{ text: 'State-memory driver', tone: 'info' }],
    sections: buildSections({
      what: [
        'Optimizer selection changes how much optimizer state the run carries and how aggressive the update dynamics look.',
        'It also affects whether memory-saving paths like 8-bit optimizer state are part of the estimate.',
      ],
      tradeoffs: [
        'Memory-saving optimizers can help a run fit, but they are not interchangeable with full-state optimizers in every regime.',
        'A different optimizer can change stability enough that apparent cost wins are not apples-to-apples.',
      ],
      practicalRule: [
        'Compare runs with the same optimizer before attributing changes to batch size, quantization, or hardware.',
        'If you change optimizer, revisit learning rate and warmup rather than assuming the old recipe still transfers cleanly.',
      ],
    }),
    sources: OPTIMIZER_SOURCES,
  },
  'advanced.lr_scheduler': {
    badges: [{ text: 'Curve-shape control', tone: 'info' }],
    sections: buildSections({
      what: [
        'The scheduler controls how learning rate evolves across steps after warmup.',
        'It changes the training curve even when the peak LR number stays the same.',
      ],
      tradeoffs: [
        'Different schedules can stabilize or destabilize the same run depending on length and objective.',
        'A good schedule for a long run may be wasteful or misleading on a very short run.',
      ],
      practicalRule: [
        'Read scheduler together with warmup and total steps, not as an isolated drop-down.',
        'If a run looks unstable, check whether the schedule and warmup are mismatched before assuming the base LR is wrong.',
      ],
    }),
    sources: [HELP_SOURCES.hfOptimizerSchedules, HELP_SOURCES.pytorchOptim, HELP_SOURCES.hfTrainer],
  },
  'advanced.precision': {
    badges: [{ text: 'Compute dtype', tone: 'warn' }],
    sections: buildSections({
      what: [
        'Precision here means the compute dtype the kernels are using during training, not the target weight quantization bucket.',
        'This is why fp16, bf16, and fp8 belong in this field while INT4/INT8 export targets live elsewhere.',
      ],
      tradeoffs: [
        'Lower-precision compute can improve speed and memory efficiency, but the real benefit depends heavily on hardware support and kernel maturity.',
        'Mixing up compute precision with weight quantization is a fast way to misunderstand what the estimate is actually modeling.',
      ],
      practicalRule: [
        'Keep compute precision and weight precision mentally separate when reading the form.',
        'If hardware support is unclear, prefer the documented precision path for the chosen framework before assuming peak throughput behavior.',
      ],
    }),
    sources: PRECISION_SOURCES,
  },
  'advanced.unsloth_version': {
    badges: [{ text: 'Version hint', tone: 'info' }],
    sections: buildSections({
      what: [
        'This field is a version hint for framework-specific assumptions, especially when Unsloth support and kernels have changed over time.',
        'It helps anchor the planner to the rough generation of docs and runtime behavior you expect.',
      ],
      tradeoffs: [
        'Newer versions can unlock better kernels or workflow support.',
        'Older versions can still be the reality in a production environment, which is why version drift matters for honest planning.',
      ],
      practicalRule: [
        'If your local stack is pinned, do not assume “latest” behavior automatically applies.',
        'When an estimate looks off, one of the first checks is whether the docs you are reading match the version you are actually running.',
      ],
    }),
    sources: VERSION_SOURCES,
  },
  'advanced.custom_speed_multiplier': {
    badges: [{ text: 'Manual override', tone: 'warn' }],
    sections: buildSections({
      what: [
        'Custom speed multiplier is a manual adjustment layered on top of the planner’s framework and kernel assumptions.',
        'It exists for cases where you know something concrete about your environment that the generic planner cannot infer.',
      ],
      tradeoffs: [
        'This can make the estimate more realistic for a known stack.',
        'It can also quietly turn the planner into fiction if you use it to force the output toward a desired number.',
      ],
      practicalRule: [
        'Only use this when you can explain the reason in plain language, such as a measured throughput delta or a known infra bottleneck.',
        'If you change it, document why, because otherwise later comparisons become hard to trust.',
      ],
    }),
    sources: [HELP_SOURCES.unslothFineTuning, HELP_SOURCES.pytorchDistributed, HELP_SOURCES.tritonDocs],
  },
  'advanced.dataset_rows': {
    badges: [{ text: 'Fallback estimator', tone: 'info' }],
    sections: buildSections({
      what: [
        'Dataset rows are a fallback way to estimate workload when exact tokenized totals are not available.',
        'Crucible can combine this with average tokens per row to produce a rough token count.',
      ],
      tradeoffs: [
        'Rows are easy to count, but they are a weak proxy when sample lengths vary widely.',
        'Prompt templates, truncation, and packing can make “one row” represent very different token loads.',
      ],
      practicalRule: [
        'Use rows for sanity checks, not as a substitute for real tokenized counts when you can compute them.',
        'If the dataset format changes, revisit avg tokens per row before reusing the old estimate.',
      ],
    }),
    sources: TRAINING_SHAPE_SOURCES,
  },
  'advanced.avg_tokens_per_row': {
    badges: [{ text: 'Proxy input', tone: 'info' }],
    sections: buildSections({
      what: [
        'Average tokens per row converts a row count into a rough token workload when exact tokenized totals are unavailable.',
        'It is an estimator input, not a guaranteed measurement of what the trainer will actually process.',
      ],
      tradeoffs: [
        'Averages are convenient, but they hide long tails in example length and can understate padded or truncated workloads.',
        'Packing, prompt formatting, and chat templates can all shift this number materially.',
      ],
      practicalRule: [
        'Recompute or resample this average when you change dataset formatting or tokenizer behavior.',
        'If the estimate will drive a real budget decision, prefer actual token counts over row-based approximations.',
      ],
    }),
    sources: TRAINING_SHAPE_SOURCES,
  },
  'advanced.min_vram_gb': {
    badges: [{ text: 'Hard result cutoff', tone: 'info' }],
    sections: buildSections({
      what: [
        'Minimum VRAM is a result filter that removes candidates below a required memory floor.',
        'It does not change the model math. It only changes which provider rows are considered viable.',
      ],
      tradeoffs: [
        'This is useful when your operational policy already rules out smaller cards.',
        'It can also hide near-fit options that might still be valid with a small batch or sequence adjustment.',
      ],
      practicalRule: [
        'Use it when you have a real procurement floor, not just a vague preference for bigger GPUs.',
        'If the table looks oddly narrow, clear the VRAM floor before concluding the run is impossible.',
      ],
    }),
    sources: [HELP_SOURCES.shadeformTypes, HELP_SOURCES.hfPerfGpu, HELP_SOURCES.shadeformQuickstart],
  },
  'advanced.reward_model_size': {
    badges: [{ text: 'RL-side footprint', tone: 'warn' }],
    sections: buildSections({
      what: [
        'Reward model size tells Crucible how large the auxiliary reward model is for RL-style or reward-modeling workflows.',
        'That extra model can materially change memory and total runtime, especially when generation and scoring are in the loop.',
      ],
      tradeoffs: [
        'A stronger reward model can improve training signal, but it raises auxiliary cost and operational complexity.',
        'Leaving this understated can make RL-style plans look deceptively cheap.',
      ],
      practicalRule: [
        'If the workflow really uses a separate reward model, put a realistic size here instead of leaving it implicit.',
        'Distinguish reward-model cost from reference-model cost. They are not always the same thing.',
      ],
    }),
    sources: [HELP_SOURCES.trlReward, HELP_SOURCES.trlPpo, HELP_SOURCES.trlGrpo],
  },
  'advanced.importance_sampling_level': {
    badges: [{ text: 'RL variance control', tone: 'info' }],
    sections: buildSections({
      what: [
        'Importance sampling level describes whether the algorithm is weighting at the token level or sequence level for the relevant RL-style update.',
        'It affects the shape of the estimator’s RL assumptions rather than the base model architecture.',
      ],
      tradeoffs: [
        'Different sampling granularities change variance and can shift how much work is done per batch.',
        'Treating this as a cosmetic switch can make RL estimates look more interchangeable than they really are.',
      ],
      practicalRule: [
        'Keep this aligned with the actual algorithm you are running, not the one you wish it resembled.',
        'If you are comparing GRPO and GSPO-style setups, do not assume the same sampling semantics carry over cleanly.',
      ],
    }),
    sources: [HELP_SOURCES.trlGrpo, HELP_SOURCES.unslothGrpoLongContext, HELP_SOURCES.trlPpo],
  },
  'advanced.reference_model_pct': {
    badges: [{ text: 'KL-cost lever', tone: 'warn' }],
    sections: buildSections({
      what: [
        'Reference model percent is a planner-side approximation of how much reference-model forward work remains in the loop for KL-style regularization.',
        'It matters because reference traffic can add a real compute tax to preference optimization or RL workflows.',
      ],
      tradeoffs: [
        'More reference-model work can stabilize policy drift, but it also raises the cost of every step.',
        'If you push this down unrealistically, the estimate may look better than the real training loop.',
      ],
      practicalRule: [
        'Use this to express a real algorithmic simplification, not to paper over budget pressure.',
        'When comparing runs, keep reference-model assumptions aligned before attributing wins to hardware or optimizer changes.',
      ],
    }),
    sources: [HELP_SOURCES.trlPpo, HELP_SOURCES.trlDpo, HELP_SOURCES.trlOrpo],
  },
  'advanced.grpo_num_generations': {
    badges: [{ text: 'Generation-cost multiplier', tone: 'warn' }],
    sections: buildSections({
      what: [
        'GRPO generations is the number of sampled completions per prompt used to construct the policy update.',
        'This is one of the cleanest cost multipliers in GRPO-style planning because it increases generation-side work directly.',
      ],
      tradeoffs: [
        'More generations can improve search and signal quality, but they also increase sampling time, vLLM pressure, and overall spend.',
        'Very high values can make the policy side look much slower than the base SFT intuition would suggest.',
      ],
      practicalRule: [
        'If GRPO costs look unexpectedly high, this is one of the first fields to inspect.',
        'Keep it consistent across comparisons unless you are explicitly trading more exploration for more budget.',
      ],
    }),
    sources: [HELP_SOURCES.trlGrpo, HELP_SOURCES.unslothGrpoLongContext, HELP_SOURCES.vllmEngineArgs],
  },
  'advanced.vllm_batch_size': {
    badges: [{ text: 'Generation-side throughput', tone: 'info' }],
    sections: buildSections({
      what: [
        'vLLM batch size is the planner assumption for how much generation-side concurrency you are attempting to drive through vLLM-assisted sampling workloads.',
        'It mainly matters for objectives that spend real time on generation rather than pure teacher-forced training.',
      ],
      tradeoffs: [
        'Higher batch values can improve sampling throughput, but only until KV cache, max-num-seqs, or token budget limits become the true bottleneck.',
        'Treating this as infinite concurrency can make RL-style workloads look cleaner than they are in production.',
      ],
      practicalRule: [
        'Read this together with prompt length, generation count, and the serving model shape.',
        'If your generation stack is already strained, lowering this may produce a more honest estimate than pretending the sampler scales perfectly.',
      ],
    }),
    sources: VLLM_SOURCES,
  },
  'advanced.num_runs': {
    badges: [{ text: 'Campaign budget', tone: 'info' }],
    sections: buildSections({
      what: [
        'Number of runs multiplies the per-run estimate into a campaign or sweep budget.',
        'It is a budgeting control, not a training-quality knob by itself.',
      ],
      tradeoffs: [
        'More runs buy exploration and robustness, but total spend rises fast even when each individual run looks affordable.',
        'A run that looks cheap in isolation can still be expensive once you account for repeats, ablations, or sweeps.',
      ],
      practicalRule: [
        'Separate per-run economics from total-program budget in your head.',
        'If you are planning ablations or hyperparameter search, model them here instead of mentally hand-waving the multiplier later.',
      ],
    }),
    sources: CAMPAIGN_SOURCES,
  },
  'advanced.use_gradient_checkpointing': {
    badges: [{ text: 'Compute for memory', tone: 'warn' }],
    sections: buildSections({
      what: [
        'Gradient checkpointing saves memory by discarding selected activations and recomputing them during the backward pass.',
        'It is one of the most common ways to make an otherwise-too-large run fit.',
      ],
      tradeoffs: [
        'Checkpointing can materially reduce memory pressure, but it also slows the run because extra forward work is being redone.',
        'A fit win from checkpointing is real, but it is not free.',
      ],
      practicalRule: [
        'Use it when memory is the blocker, not because it sounds like a universal best practice.',
        'If you enable it to make a run fit, revisit wall-clock expectations before declaring the plan cheap.',
      ],
    }),
    sources: CHECKPOINT_SOURCES,
  },
  'advanced.use_flash_attention': {
    badges: [{ text: 'Kernel assumption', tone: 'info' }],
    sections: buildSections({
      what: [
        'This tells the planner to assume FlashAttention-style attention kernels are available.',
        'It mainly affects throughput posture rather than changing model capacity or training objective.',
      ],
      tradeoffs: [
        'Faster attention kernels can help, especially at longer sequence lengths.',
        'They are still hardware- and stack-dependent, so the advertised speedup should not be treated as guaranteed wall-clock truth.',
      ],
      practicalRule: [
        'Turn this on when the real stack actually supports it, not just because the GPU is modern.',
        'If the run is short-context and lightly loaded, do not expect magical gains from this flag alone.',
      ],
    }),
    sources: KERNEL_SOURCES,
  },
  'advanced.use_triton_kernels': {
    badges: [{ text: 'Compiler/runtime dependent', tone: 'info' }],
    sections: buildSections({
      what: [
        'This assumes Triton-authored kernels are part of the runtime path for the relevant operations.',
        'It is a throughput-tilting planner knob rather than a direct model-quality control.',
      ],
      tradeoffs: [
        'Good Triton kernels can help a lot, but their effect depends on the exact stack, shapes, and hardware path.',
        'Assuming Triton everywhere can overstate gains if your environment falls back to less optimized implementations.',
      ],
      practicalRule: [
        'Use it when you have a real reason to believe the stack is taking those kernel paths.',
        'If you cannot explain where the Triton kernels are coming from, leave the planner more conservative.',
      ],
    }),
    sources: [HELP_SOURCES.tritonDocs, HELP_SOURCES.unslothFineTuning, HELP_SOURCES.hfPerfGpu],
  },
  'advanced.use_rope_kernels': {
    badges: [{ text: 'Long-context helper', tone: 'info' }],
    sections: buildSections({
      what: [
        'RoPE kernels here means optimized runtime handling for rotary position embeddings.',
        'It is most relevant when the model uses RoPE and long-context behavior makes those operations a meaningful part of the runtime path.',
      ],
      tradeoffs: [
        'Kernel improvements can help long-context efficiency, but they do not change the underlying quadratic pressure of attention by themselves.',
        'Treating this as a substitute for sequence-length budgeting would be a mistake.',
      ],
      practicalRule: [
        'Use it when the real model architecture and runtime actually expose those optimized paths.',
        'If long-context cost is the real problem, check sequence length first and kernel flags second.',
      ],
    }),
    sources: [HELP_SOURCES.roformerPaper, HELP_SOURCES.unslothFineTuning, HELP_SOURCES.pytorchSdpa],
  },
  'advanced.use_fused_chunked_ce_loss': {
    badges: [{ text: 'Long-context optimization', tone: 'info' }],
    sections: buildSections({
      what: [
        'This assumes fused and chunked cross-entropy loss kernels are available for the run.',
        'It matters most when long sequences make the loss path itself a real throughput bottleneck.',
      ],
      tradeoffs: [
        'A fused loss path can improve long-context wall-clock behavior.',
        'It still does not erase the rest of the activation and attention cost, so the improvement should be read as incremental rather than absolute.',
      ],
      practicalRule: [
        'Turn this on when the stack actually exposes the fused path, especially for long-context training.',
        'If sequence length is modest, do not expect this flag to move the estimate dramatically.',
      ],
    }),
    sources: [HELP_SOURCES.unslothFineTuning, HELP_SOURCES.tritonDocs, HELP_SOURCES.hfPerfGpu],
  },
  'advanced.use_faster_moe_kernels': {
    badges: [{ text: 'Sparse-runtime assumption', tone: 'warn' }],
    sections: buildSections({
      what: [
        'This tells Crucible to assume faster MoE-specific kernels or sparse-runtime improvements are available.',
        'It only matters on MoE models. Dense models will not benefit from it directly.',
      ],
      tradeoffs: [
        'Better MoE kernels can reduce dispatch overhead, but they do not turn sparse routing into free compute.',
        'Runtime behavior still varies a lot across stacks, which is why the planner keeps MoE timing conservative.',
      ],
      practicalRule: [
        'Use this when the actual training stack really ships the sparse-kernel path you expect.',
        'If the estimate still looks optimistic, trust the conservative MoE warnings over the marketing headline.',
      ],
    }),
    sources: [HELP_SOURCES.unslothFineTuning, HELP_SOURCES.unslothMultiGpu, HELP_SOURCES.hfMoE],
  },
  'advanced.sequence_packing': {
    badges: [{ text: 'Utilization knob', tone: 'info' }],
    sections: buildSections({
      what: [
        'Sequence packing combines multiple short examples into a longer packed sequence to reduce pad-token waste.',
        'In the planner, it mainly changes token utilization and therefore practical throughput.',
      ],
      tradeoffs: [
        'Packing can improve efficiency when samples are short and heterogeneous.',
        'It can also complicate data handling and make simplistic tokens-per-row assumptions less trustworthy.',
      ],
      practicalRule: [
        'Use packing when short examples are leaving a lot of slack in each sequence window.',
        'If you switch packing on or off, revisit dataset token assumptions before trusting a before-and-after comparison.',
      ],
    }),
    sources: PACKING_SOURCES,
  },
  'advanced.full_finetuning': {
    badges: [{ text: 'Force override', tone: 'warn' }],
    sections: buildSections({
      what: [
        'This flag forces full-weight fine-tuning assumptions even if the high-level method selector says otherwise.',
        'It exists to keep the planner honest when the actual workflow is updating base weights rather than only adapters.',
      ],
      tradeoffs: [
        'Full finetuning is the broadest intervention, but it is also the most expensive memory path in the planner.',
        'Forcing it on while reading the run as “LoRA-like” will make quality and cost comparisons misleading.',
      ],
      practicalRule: [
        'Only enable this when the real run is truly updating full model weights.',
        'If it is on, read the rest of the estimate as a full fine-tune plan, not as a lightly modified adapter run.',
      ],
    }),
    sources: [HELP_SOURCES.unslothFineTuning, HELP_SOURCES.peftLoraGuide, HELP_SOURCES.hfTrainer],
  },
}

function card(
  id: string,
  title: string,
  short: string,
  extra: Omit<CrucibleHelpCard, 'id' | 'title' | 'short'> = {},
): CrucibleHelpCard {
  const enrichment = HELP_ENRICHMENTS[id] ?? {}
  return {
    id,
    title,
    short,
    impacts: extra.impacts ?? enrichment.impacts,
    badges: extra.badges ?? enrichment.badges,
    sections: extra.sections ?? enrichment.sections,
    sources: dedupeSources(extra.sources ?? enrichment.sources),
  }
}

function richCard(
  id: string,
  title: string,
  short: string,
  extra: Omit<CrucibleHelpCard, 'id' | 'title' | 'short' | 'sections'> & {
    what: string[]
    howToRead?: string[]
    tradeoffs?: string[]
    practicalRule?: string[]
  },
): CrucibleHelpCard {
  const { what, howToRead, tradeoffs, practicalRule, ...rest } = extra
  return card(id, title, short, {
    ...rest,
    sections: buildSections({
      what,
      howToRead,
      tradeoffs,
      practicalRule,
    }),
  })
}

export const INPUT_PANEL_HELP = {
  model: {
    resolveReference: richCard(
      'model.resolve_reference',
      'Resolve from Hugging Face URL / repo id',
      'Paste a Hugging Face URL or repo id to auto-fill model parameters.',
      {
        impacts: ['compatibility'],
        badges: [{ text: 'Metadata autofill', tone: 'info' }],
        what: [
          'This reads published metadata from Hugging Face so Crucible can fill structure fields like parameter count, layers, heads, and architecture.',
          'It reduces the odds of estimating from a vague model name when a real repo already publishes usable config data.',
        ],
        practicalRule: [
          'Use this when you want the estimate tied to a specific public repo instead of a hand-entered approximation.',
          'After autofill, still sanity-check MoE-specific fields against the model card before trusting sparse-model math.',
        ],
        sources: MODEL_RESOLUTION_SOURCES,
      },
    ),
    modelPreset: richCard(
      'model.preset',
      'Model preset',
      'Loads curated defaults for known models. Use Custom to keep manual values.',
      {
        impacts: ['compatibility'],
        badges: [{ text: 'Curated defaults', tone: 'info' }],
        what: [
          'A preset drops in a maintained starting point for a known model family so you can get to a plausible estimate quickly.',
          'It is a convenience layer, not a replacement for a repo-specific resolve step when exact release metadata matters.',
        ],
        practicalRule: [
          'Use a preset to start fast, then switch to Resolve or Custom if you need the estimate grounded in a specific upstream repo.',
          'If you manually change architecture or MoE fields after selecting a preset, treat the run as a custom configuration.',
        ],
        sources: MODEL_RESOLUTION_SOURCES,
      },
    ),
    modelId: richCard(
      'model.id',
      'Model id',
      'Model identifier used in requests and exports.',
      {
        impacts: ['compatibility'],
        what: [
          'This is the string Crucible carries through requests, share URLs, exports, and model-resolution lookups.',
          'It is best read as identity metadata, not a training hyperparameter by itself.',
        ],
        practicalRule: [
          'Use a repo-style id when you want resolution, provenance, and exports to point at a real upstream model.',
          'If the id is custom or shorthand, make sure the structural fields below are still correct.',
        ],
        sources: MODEL_RESOLUTION_SOURCES,
      },
    ),
    modelParams: richCard(
      'model.params_billions',
      'Model params (B)',
      'Total parameters in billions. This drives resident weight memory and overall model capacity; sparse MoE compute can separately use activated parameters per token.',
      {
        impacts: ['vram', 'cost', 'throughput'],
        badges: [{ text: 'Capacity baseline', tone: 'info' }],
        what: [
          'Total parameters are the estimator’s main proxy for resident weight memory and the overall size class of the model.',
          'For sparse MoE models, this stays the memory-side number even when only a subset of experts activates on each token.',
        ],
        practicalRule: [
          'Treat this as the total model size, not the routed-per-token size.',
          'If a model card publishes both total and active parameters, total params stay here and active params belong in the MoE active-per-token field.',
        ],
        sources: [...MODEL_RESOLUTION_SOURCES, HELP_SOURCES.hfMoE],
      },
    ),
    activeParams: richCard(
      'model.active_params_billions',
      'Active params / token (B)',
      'Optional activated-parameter count per token for sparse MoE compute. This affects throughput and cost planning, but total params still drive VRAM and overall model capacity.',
      {
        impacts: ['cost', 'throughput'],
        badges: [{ text: 'MoE-only concept', tone: 'warn' }],
        what: [
          'This is the routed parameter count used on each token for sparse-MoE compute math when the model card actually publishes it.',
          'It does not replace total parameters for VRAM fit, checkpoint size, or the model’s overall size class.',
        ],
        practicalRule: [
          'Leave it blank unless you have a published active-parameter number from the model card or technical report.',
          'Do not back-solve it from expert ratios unless the model authors publish that mapping explicitly.',
        ],
        sources: MOE_SOURCES,
      },
    ),
    architecture: richCard(
      'model.architecture',
      'Architecture',
      'Dense uses all parameters each step. MoE activates only a subset of experts.',
      {
        impacts: ['vram', 'cost', 'throughput', 'compatibility'],
        badges: [{ text: 'Changes estimator math', tone: 'warn' }],
        what: [
          'Architecture tells Crucible whether to model the run as dense or sparse-MoE, which changes how it interprets parameter counts and routing metadata.',
          'Dense models use all parameters every step; MoE models keep total weights resident while activating only a subset of experts per token.',
        ],
        practicalRule: [
          'Do not mark a dense distill model as MoE just because the broader family has MoE variants.',
          'If the model card says dense, leave this as dense and ignore MoE-only fields.',
        ],
        sources: [HELP_SOURCES.hfMoE, HELP_SOURCES.qwen30bA3b, HELP_SOURCES.deepseekDistill32b],
      },
    ),
    method: richCard(
      'model.method',
      'Method',
      'Training strategy: full fine-tune updates base weights, LoRA and QLoRA update adapters.',
      {
        impacts: ['vram', 'cost', 'quality', 'compatibility'],
        badges: [{ text: 'Planner normalization', tone: 'info' }],
        what: [
          'Method decides whether Crucible models the run as full-weight finetuning, adapter tuning, or 4-bit QLoRA-style adapter tuning.',
          'That choice changes memory shape, optimizer assumptions, and some compatibility guardrails.',
        ],
        tradeoffs: [
          'Full fine-tune gives the broadest update path, but it is the most expensive in memory and optimizer state.',
          'LoRA and QLoRA are cheaper to fit, but they only train adapters and come with method-specific constraints.',
        ],
        practicalRule: [
          'Read method together with quantization and QAT because some combinations are intentionally normalized by the planner.',
          'If you want an 8-bit target path, do not leave the method on QLoRA, because QLoRA is still treated as 4-bit adapter training.',
        ],
        sources: [...METHOD_SOURCES, HELP_SOURCES.qloraPaper, HELP_SOURCES.unslothFineTuning],
      },
    ),
    quantizationBits: richCard(
      'model.quantization_bits',
      'Quantization (bit)',
      'Target weight precision bucket used in memory and throughput calculations. Under QAT this is the export target, not a second scheme selector.',
      {
        impacts: ['vram', 'throughput', 'compatibility'],
        badges: [{ text: 'Target precision', tone: 'info' }],
        what: [
          'This is the weight-precision bucket the estimator uses for memory and throughput assumptions.',
          'When QAT is enabled, this field becomes the deployment target precision rather than a second scheme selector.',
        ],
        practicalRule: [
          'Read this first as the coarse precision bucket: 4-bit, 8-bit, 16-bit, or 32-bit.',
          'If QAT is on, expect the scheme selector to be filtered so only schemes compatible with this target remain visible.',
        ],
        sources: [...QUANTIZATION_SOURCES, ...QAT_SOURCES],
      },
    ),
    quantizationProfile: richCard(
      'model.quantization_profile',
      'Quantization profile',
      'Selects profile-specific overhead assumptions for non-QAT 4-bit runs. 8/16/32-bit modes use fixed profiles, and QAT schemes supersede this selector.',
      {
        impacts: ['vram', 'throughput', 'compatibility'],
        badges: [{ text: '4-bit only', tone: 'info' }],
        what: [
          'Profiles let Crucible distinguish between materially different 4-bit paths like NF4, FP4, MXFP4, or dynamic variants.',
          'Higher-precision modes do not need a separate profile selector in this planner because their assumptions are fixed by the bit bucket.',
        ],
        practicalRule: [
          'If you are not in a non-QAT 4-bit path, this field should disappear instead of asking the same question twice.',
          'Use the profile field only when you are intentionally comparing different 4-bit runtime assumptions.',
        ],
        sources: QUANTIZATION_SOURCES,
      },
    ),
    useQat: richCard(
      'model.use_qat',
      'Use QAT',
      'Quantization-aware training trains through a target quantization path. In the current planner this is modeled for 4-bit INT4 and 8-bit FP8-style export paths.',
      {
        impacts: ['cost', 'quality', 'compatibility'],
        badges: [{ text: 'Source-backed subset', tone: 'warn' }],
        what: [
          'QAT means the training path is aware of the target quantized representation instead of only quantizing after training.',
          'In Crucible, the documented planner paths currently focus on 4-bit INT4-style exports and 8-bit FP8-style exports.',
        ],
        tradeoffs: [
          'QAT can preserve more deployment-faithful behavior than pure post-training quantization, but it adds extra complexity and some compute overhead.',
          'Not every method and target precision combination has equally mature tooling, so the planner intentionally narrows this space.',
        ],
        practicalRule: [
          'Turn this on only when your actual workflow intends to train toward a quantized export target.',
          'If you just want ordinary LoRA or QLoRA planning, leave QAT off and use the normal quantization controls.',
        ],
        sources: QAT_SOURCES,
      },
    ),
    qatScheme: richCard(
      'model.qat_scheme',
      'QAT scheme',
      'Scheme selection for source-backed Unsloth/TorchAO QAT paths. Options are filtered to match the selected target precision.',
      {
        impacts: ['quality', 'compatibility'],
        badges: [{ text: 'Precision-coupled', tone: 'info' }],
        what: [
          'The scheme captures the specific quantized-training path, such as FP8-to-INT4 or FP8-to-FP8, rather than the broad target precision alone.',
          'Crucible filters schemes so they stay compatible with the selected target precision and do not expose impossible combinations.',
        ],
        practicalRule: [
          'If you pick 8-bit QAT, INT4-target schemes should disappear instead of lingering in the menu.',
          'Treat scheme as the detailed path and the target-precision field as the coarse deployment bucket.',
        ],
        sources: QAT_SOURCES,
      },
    ),
    framework: richCard(
      'model.framework',
      'Framework',
      'Applies framework-specific throughput and runtime overhead assumptions.',
      {
        impacts: ['cost', 'throughput', 'compatibility', 'stability'],
        badges: [{ text: 'Planner-specific assumptions', tone: 'info' }],
        what: [
          'Framework tells Crucible which runtime and kernel assumptions to use when translating training FLOPs into wall-clock estimates.',
          'Different frameworks expose different levels of documented support for kernels, QAT, distributed setup, and long-context tricks.',
        ],
        practicalRule: [
          'Treat framework as both a speed assumption and a compatibility assumption.',
          'If you move outside the documented Unsloth paths, expect the estimate to widen and the support tier to degrade.',
        ],
        sources: FRAMEWORK_SOURCES,
      },
    ),
    workflowMode: richCard(
      'model.workflow_mode',
      'Workflow mode',
      'Guided mode stays closer to explicitly documented setup paths. Custom pipeline keeps broader flexibility for self-managed enterprise stacks.',
      {
        impacts: ['compatibility', 'stability'],
        badges: [{ text: 'Support framing', tone: 'info' }],
        what: [
          'Workflow mode tells Crucible whether to stay near currently documented entry paths or to assume a broader self-managed stack.',
          'This mainly affects confidence and support framing rather than changing the core training math by itself.',
        ],
        practicalRule: [
          'Use Guided when you want the estimator anchored to documented notebook, local, or Docker-style flows.',
          'Use Custom pipeline when you are hand-rolling distributed setup, enterprise infra, or provider-specific plumbing.',
        ],
        sources: FRAMEWORK_SOURCES,
      },
    ),
    totalExperts: richCard(
      'model.moe_total_experts',
      'Total experts',
      'Total number of experts in the MoE model.',
      {
        impacts: ['vram', 'compatibility'],
        badges: [{ text: 'Structure field', tone: 'info' }],
        what: [
          'Total experts is the structural size of the expert pool in a sparse MoE layer.',
          'It helps describe architecture and routing shape, but it is not itself the compute-side active-parameter number.',
        ],
        practicalRule: [
          'Use the published total-expert count from the model card or technical report.',
          'Do not expect this field alone to tell Crucible how many parameters fire on each token.',
        ],
        sources: MOE_SOURCES,
      },
    ),
    activeExperts: richCard(
      'model.moe_active_experts',
      'Active experts',
      'Experts used per token during routing. This is structural routing metadata, not a substitute for published activated-parameter counts.',
      {
        impacts: ['cost', 'throughput', 'compatibility'],
        badges: [{ text: 'Routing metadata', tone: 'info' }],
        what: [
          'Active experts tells Crucible how many experts are routed for each token in the sparse architecture.',
          'It is useful routing context, but it is still not the same thing as a published active-parameter count.',
        ],
        practicalRule: [
          'Use this to describe routing structure, not to claim the model has “become” that smaller size.',
          'If the model card publishes both active experts and active parameters, keep those two fields distinct.',
        ],
        sources: MOE_SOURCES,
      },
    ),
  },
  dataset: {
    datasetTokens: richCard(
      'dataset.dataset_tokens',
      'Dataset tokens',
      'Total training tokens processed per epoch.',
      {
        impacts: ['cost', 'quality'],
        badges: [{ text: 'Workload size', tone: 'info' }],
        what: [
          'Dataset tokens are the core workload size input for the planner: more tokens means more optimizer steps, FLOPs, time, and spend.',
          'This is usually more informative than raw row count because training cost follows token volume more directly than file counts.',
        ],
        practicalRule: [
          'Use token counts when you have them. They make comparisons cleaner than row counts alone.',
          'If you only know rows, pair rows with average tokens per row instead of guessing a token total blindly.',
        ],
        sources: [HELP_SOURCES.hfTrainer, HELP_SOURCES.hfTokenizer, HELP_SOURCES.hfPaddingTruncation],
      },
    ),
    epochs: richCard(
      'dataset.epochs',
      'Epochs',
      'How many full passes over the dataset to run.',
      {
        impacts: ['cost', 'quality'],
        badges: [{ text: 'Run length', tone: 'info' }],
        what: [
          'Epochs decide how many times the optimizer sees the same training corpus.',
          'In Crucible, this is a direct multiplier on total tokens processed and therefore on total training cost.',
        ],
        tradeoffs: [
          'More epochs can help smaller or cleaner datasets train further, but they also increase overfitting risk and spend.',
          'Too few epochs can make a run look cheap while still undertraining the target behavior.',
        ],
        practicalRule: [
          'Read epochs together with dataset size, not in isolation.',
          'A tiny dataset at many epochs and a huge dataset at one epoch can imply very different generalization risks even when token totals match.',
        ],
        sources: [HELP_SOURCES.hfTrainer, HELP_SOURCES.trlSft, HELP_SOURCES.qloraPaper],
      },
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
    trainingType: richCard(
      'dataset.training_type',
      'Training type',
      'Objective class that changes compute and memory assumptions.',
      {
        impacts: ['vram', 'cost', 'quality', 'compatibility'],
        badges: [{ text: 'Objective family', tone: 'warn' }],
        what: [
          'Training type tells Crucible whether to model the run as plain supervised finetuning or a post-training objective like DPO or GRPO.',
          'Different objective families change how much extra sampling, reference-model work, or reward-model work the planner should expect.',
        ],
        practicalRule: [
          'Choose the training type that matches the real optimization loop, not the dataset format alone.',
          'If you are doing RL-style sampling or preference optimization, do not leave this on SFT just because the inputs still look like text examples.',
        ],
        sources: RL_SOURCES,
      },
    ),
  },
  hardware: {
    gpusPerRun: richCard(
      'hardware.num_gpus',
      'GPUs per run',
      'Total number of GPUs used in each training run across all nodes.',
      {
        impacts: ['cost', 'throughput', 'compatibility'],
        badges: [{ text: 'Cluster size', tone: 'info' }],
        what: [
          'This is the total cluster GPU count the planner uses for parallel throughput and cost scaling.',
          'It is not a per-node count unless you are running on exactly one node.',
        ],
        practicalRule: [
          'Read GPU count together with node count and interconnect quality.',
          'More GPUs do not automatically mean linear speedup when host feed or cross-node communication becomes the bottleneck.',
        ],
        sources: DISTRIBUTED_SOURCES,
      },
    ),
    nodes: richCard(
      'hardware.num_nodes',
      'Nodes',
      'Number of machines used for distributed training.',
      {
        impacts: ['cost', 'throughput', 'stability'],
        badges: [{ text: 'Topology matters', tone: 'warn' }],
        what: [
          'Nodes count the number of separate machines in the distributed job, which changes communication topology and host-feed assumptions.',
          'The same total GPU count can behave very differently on one node versus many nodes.',
        ],
        tradeoffs: [
          'More nodes can unlock larger jobs, but they increase coordination overhead and make throughput more sensitive to networking quality.',
          'Cross-node runs often cost more operationally even when the raw GPU count is unchanged.',
        ],
        practicalRule: [
          'Treat nodes as a topology input, not just a billing detail.',
          'When you split a fixed GPU count across more machines, re-evaluate throughput instead of assuming the same wall-clock time.',
        ],
        sources: DISTRIBUTED_SOURCES,
      },
    ),
    targetGpuFamilies: richCard(
      'hardware.target_gpu',
      'Target GPU families',
      'Filter estimates to specific GPU families. Leave empty to include all.',
      {
        impacts: ['cost', 'compatibility'],
        what: [
          'This filter narrows the cost table to specific GPU families without changing the underlying training math.',
          'It is mainly for comparison scope: which hardware families you are willing to consider.',
        ],
        practicalRule: [
          'Keep this broad when you are still exploring fit and cost envelopes.',
          'Narrow it only after you already understand the model’s approximate VRAM and throughput requirements.',
        ],
        sources: HARDWARE_FILTER_SOURCES,
      },
    ),
    pricingTiers: richCard(
      'hardware.pricing_tier',
      'Pricing tiers',
      'Billing tiers to include in cost comparisons.',
      {
        impacts: ['cost'],
        what: [
          'Pricing tiers control which billing modes the estimator is allowed to compare, such as on-demand, spot, or reserved-style prices.',
          'They do not change training math; they change which price rows are eligible for cost output.',
        ],
        practicalRule: [
          'Use multiple tiers when you want to see the realistic cost spread across procurement options.',
          'If a tier has no published rows in the live feed, expect the estimator to surface that instead of silently inventing a price.',
        ],
        sources: HARDWARE_FILTER_SOURCES,
      },
    ),
    cloudProviders: richCard(
      'hardware.target_providers',
      'Cloud providers (blank = all)',
      'Restrict calculations to selected providers. Leave empty to include all.',
      {
        impacts: ['cost', 'compatibility'],
        what: [
          'This narrows the comparison table to specific infrastructure vendors without changing the core estimator math.',
          'It is useful when procurement, data locality, or compliance already limits where the run can land.',
        ],
        practicalRule: [
          'Leave providers blank while scouting the market, then narrow once you know your real procurement constraints.',
          'Do not treat provider filters as performance guarantees; they only scope the rows being compared.',
        ],
        sources: HARDWARE_FILTER_SOURCES,
      },
    ),
    regions: richCard(
      'hardware.target_regions',
      'Regions (optional)',
      'Limit to selected cloud regions. Leave empty to allow any region.',
      {
        impacts: ['cost', 'compatibility'],
        what: [
          'Regions limit the hardware search to specific geography or availability zones represented in the pricing feed.',
          'This is a scope filter for operational constraints like compliance, latency, or data-residency rules.',
        ],
        practicalRule: [
          'Keep regions open while exploring unless geography is already fixed by policy or data gravity.',
          'A narrow region filter can remove otherwise good hardware options and make the table look artificially expensive.',
        ],
        sources: HARDWARE_FILTER_SOURCES,
      },
    ),
    interconnect: richCard(
      'hardware.target_interconnects',
      'Interconnect (optional)',
      'Restrict to specific interconnect types such as NVLink or PCIe.',
      {
        impacts: ['throughput', 'compatibility'],
        badges: [{ text: 'Distributed throughput', tone: 'info' }],
        what: [
          'Interconnect filters the table by how GPUs are wired, which matters most for multi-GPU and multi-node communication-heavy runs.',
          'It does not change the model math directly, but it changes which hardware rows are plausible for a given distributed workload.',
        ],
        practicalRule: [
          'Care about this most when scaling beyond a single GPU or when synchronization cost is already material.',
          'If you do not know the topology requirement yet, leave it open and let the estimator compare more rows.',
        ],
        sources: [HELP_SOURCES.shadeformTypes, ...DISTRIBUTED_SOURCES],
      },
    ),
    instanceTypes: richCard(
      'hardware.target_instance_types',
      'Instance types (optional)',
      'Filter to specific cloud instance SKUs.',
      {
        impacts: ['cost', 'compatibility'],
        what: [
          'Instance types are concrete provider SKUs, which lets you pin the estimate to exact hardware offerings instead of broad GPU families.',
          'This is the narrowest hardware filter in the planner.',
        ],
        practicalRule: [
          'Use instance filters when procurement or an existing cluster already constrains you to exact SKUs.',
          'Leave it blank when you still want the estimator to show cheaper or better-fitting alternatives.',
        ],
        sources: HARDWARE_FILTER_SOURCES,
      },
    ),
  },
  advanced: {
    toggle: richCard(
      'advanced.toggle',
      'Advanced parameters',
      'Open expert-level knobs that change training math assumptions.',
      {
        impacts: ['vram', 'cost', 'throughput', 'quality', 'compatibility'],
        badges: [{ text: 'Expert surface', tone: 'warn' }],
        what: [
          'This reveals the second layer of knobs that affect how Crucible turns a run description into memory, time, and cost assumptions.',
          'Most of these settings matter only after the core model, dataset, and hardware shape are already sane.',
        ],
        practicalRule: [
          'Open this section when you are tuning fit, optimizer behavior, distributed assumptions, or kernel-specific planner inputs.',
          'Do not reach for advanced knobs first if the model, method, batch shape, or hardware scope are still wrong.',
        ],
        sources: [HELP_SOURCES.hfTrainer, HELP_SOURCES.unslothFineTuning, HELP_SOURCES.pytorchOptim],
      },
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
    optimizer: richCard(
      'advanced.optimizer',
      'Optimizer',
      'Optimizer implementation assumption for compute and memory overhead.',
      {
        impacts: ['vram', 'throughput', 'stability'],
        badges: [{ text: 'State overhead', tone: 'info' }],
        what: [
          'Optimizer choice changes how much optimizer state the planner assumes and how aggressive the update path can be.',
          'Some optimizers mainly change memory footprint, while others also change stability expectations and throughput tradeoffs.',
        ],
        practicalRule: [
          'Read optimizer together with precision and method because optimizer-state cost is not independent of the rest of the run shape.',
          'If you switch optimizers, revisit stability expectations instead of assuming the same learning rate and warmup still make sense.',
        ],
        sources: OPTIMIZER_SOURCES,
      },
    ),
    lrScheduler: richCard(
      'advanced.lr_scheduler',
      'LR scheduler',
      'Learning-rate schedule family applied over training steps.',
      {
        impacts: ['quality', 'stability'],
        what: [
          'The scheduler controls how learning rate changes over the course of the run after warmup.',
          'It mainly affects stability and how the optimizer spends the fixed training budget, not raw memory fit.',
        ],
        practicalRule: [
          'Treat scheduler choice as part of the optimization recipe, not a cosmetic detail.',
          'If you change scheduler family, revisit warmup and learning rate together before comparing runs.',
        ],
        sources: OPTIMIZER_SOURCES,
      },
    ),
    precision: richCard(
      'advanced.precision',
      'Precision',
      'Compute precision for training kernels and optimizer state assumptions.',
      {
        impacts: ['vram', 'throughput', 'compatibility'],
        badges: [{ text: 'Kernel path', tone: 'info' }],
        what: [
          'Precision controls the arithmetic mode used by training kernels, which changes throughput, stability envelope, and some memory assumptions.',
          'This is separate from the weight-quantization bucket: compute precision tells the planner what math kernels are doing during training.',
        ],
        practicalRule: [
          'Read precision together with framework and hardware support because not every GPU/kernel stack treats FP8, BF16, and FP16 equally.',
          'Do not confuse compute precision with the quantized deployment target.',
        ],
        sources: [HELP_SOURCES.pytorchAmp, HELP_SOURCES.hfPerfGpu, HELP_SOURCES.unslothFineTuning],
      },
    ),
    unslothVersion: richCard(
      'advanced.unsloth_version',
      'Unsloth version',
      'Version hint for framework-specific overhead modeling.',
      {
        impacts: ['compatibility'],
        what: [
          'This is a planner hint about which Unsloth feature set and performance envelope you expect the run to resemble.',
          'It matters because framework capabilities evolve faster than static model metadata.',
        ],
        practicalRule: [
          'Use the version that best matches the actual environment you plan to run, especially when you care about newer kernels or QAT paths.',
          'If you are unsure, treat the estimate as version-sensitive and verify the workflow in the relevant Unsloth docs.',
        ],
        sources: FRAMEWORK_SOURCES,
      },
    ),
    customSpeedMultiplier: richCard(
      'advanced.custom_speed_multiplier',
      'Custom speed multiplier',
      'Extra multiplier applied on top of framework and kernel assumptions.',
      {
        impacts: ['cost', 'throughput'],
        badges: [{ text: 'Manual override', tone: 'warn' }],
        what: [
          'This is an operator override that scales the planner’s runtime assumptions after the built-in framework and kernel logic has already run.',
          'It exists for teams that have measured their stack and want the estimate to reflect a known deviation from the default planner posture.',
        ],
        practicalRule: [
          'Use this only when you have a concrete reason from your own benchmarks or production telemetry.',
          'Do not use it to “make the number look right” without evidence, because it can hide an actual modeling problem.',
        ],
        sources: [HELP_SOURCES.unslothFineTuning, HELP_SOURCES.hfPerfGpu, HELP_SOURCES.deepspeedTraining],
      },
    ),
    datasetRows: richCard(
      'advanced.dataset_rows',
      'Dataset rows (optional)',
      'Optional row count used for consistency checks against token totals.',
      {
        impacts: ['cost', 'quality'],
        what: [
          'Row count is a secondary sanity-check input that helps Crucible reason about whether the token total looks plausible for the dataset shape.',
          'It matters most when the exact token count is unknown or when exported estimates need a second workload anchor.',
        ],
        practicalRule: [
          'Prefer real token counts when you have them, and use row count as a cross-check rather than the primary training-workload metric.',
          'If row count and token count imply very different average sample sizes, revisit the underlying data assumptions.',
        ],
        sources: [HELP_SOURCES.hfTrainer, HELP_SOURCES.hfTokenizer, HELP_SOURCES.hfPaddingTruncation],
      },
    ),
    avgTokensPerRow: richCard(
      'advanced.avg_tokens_per_row',
      'Avg tokens / row',
      'Average tokens per sample, used with row count for token sanity checks.',
      {
        impacts: ['cost', 'quality'],
        what: [
          'Average tokens per row lets Crucible translate row count into a rough token workload when a true token total is unavailable.',
          'It is an approximation input, not a replacement for measured tokenization.',
        ],
        practicalRule: [
          'Use a realistic post-tokenization average, not a visual guess from raw text length.',
          'If this number is uncertain, treat downstream time and cost as less trustworthy than a measured token total.',
        ],
        sources: [HELP_SOURCES.hfTokenizer, HELP_SOURCES.hfPaddingTruncation, HELP_SOURCES.hfTrainer],
      },
    ),
    minVramGb: richCard(
      'advanced.min_vram_gb',
      'Min VRAM GB (optional)',
      'Hard minimum GPU memory required for candidate filtering.',
      {
        impacts: ['compatibility'],
        what: [
          'This is a hard filter that removes hardware rows below a VRAM floor you already know you need.',
          'It affects which candidates survive the comparison table, not the underlying training math.',
        ],
        practicalRule: [
          'Use it when procurement or prior experiments have already established a non-negotiable memory floor.',
          'Leave it unset while exploring so you can still see why smaller cards do or do not fit.',
        ],
        sources: [HELP_SOURCES.shadeformTypes, HELP_SOURCES.hfPerfGpu, HELP_SOURCES.deepspeedTraining],
      },
    ),
    rewardModelSize: richCard(
      'advanced.reward_model_size',
      'Reward model size (B)',
      'Reward model parameter count in billions for RL-style training modes.',
      {
        impacts: ['vram', 'cost', 'quality'],
        badges: [{ text: 'RL-specific', tone: 'warn' }],
        what: [
          'Reward-model size matters when the training loop actually evaluates candidate outputs with a separate reward model.',
          'It adds extra compute and memory pressure beyond a plain supervised finetuning run.',
        ],
        practicalRule: [
          'Only fill this when your RL-style workflow truly includes a reward model in the loop.',
          'If the method is preference optimization without a separate learned reward model, leave this blank and let the training type carry the signal.',
        ],
        sources: RL_SOURCES,
      },
    ),
    importanceSampling: richCard(
      'advanced.importance_sampling_level',
      'Importance sampling',
      'GRPO defaults to token-level importance sampling. GSPO uses sequence-level importance sampling.',
      {
        impacts: ['cost', 'quality'],
        badges: [{ text: 'RL-specific', tone: 'warn' }],
        what: [
          'Importance-sampling level changes how RL-style objectives weight sequence-level versus token-level corrections during policy optimization.',
          'It mainly matters for how expensive and how noisy the post-training loop becomes.',
        ],
        practicalRule: [
          'Use the setting that matches the actual trainer and objective, not a hand-wavy intuition about “importance.”',
          'If you are not in an RL-style workflow, this field should not drive your estimate at all.',
        ],
        sources: RL_SOURCES,
      },
    ),
    referenceModelPct: richCard(
      'advanced.reference_model_pct',
      'Reference model (%)',
      'Approximate fraction of reference-model forward passes used for KL regularization (0-100).',
      {
        impacts: ['cost', 'quality'],
        badges: [{ text: 'KL overhead', tone: 'info' }],
        what: [
          'This estimates how much reference-model work the loop still performs for KL-style regularization or policy anchoring.',
          'Higher reference-model use means more forward-pass overhead and potentially more stable policy behavior.',
        ],
        practicalRule: [
          'Use zero only when the workflow genuinely drops reference-model work.',
          'If you are unsure, prefer a conservative number rather than pretending the KL/reference path is free.',
        ],
        sources: RL_SOURCES,
      },
    ),
    grpoGenerations: richCard(
      'advanced.grpo_num_generations',
      'GRPO generations',
      'Number of sampled generations per prompt for GRPO.',
      {
        impacts: ['cost', 'quality'],
        badges: [{ text: 'Sampling multiplier', tone: 'warn' }],
        what: [
          'This is the number of sampled completions generated per prompt in GRPO-style training.',
          'It is a direct multiplier on generation-side work, which can dominate post-training cost if set high.',
        ],
        practicalRule: [
          'Treat this as one of the biggest cost levers in GRPO-style runs.',
          'If you increase sampled generations, revisit vLLM serving assumptions and total run budget at the same time.',
        ],
        sources: [HELP_SOURCES.trlGrpo, HELP_SOURCES.vllmEngineArgs, HELP_SOURCES.vllmOpenAiServer],
      },
    ),
    vllmBatchSize: richCard(
      'advanced.vllm_batch_size',
      'vLLM batch size',
      'Batch size assumption used for vLLM-assisted generation workloads.',
      {
        impacts: ['throughput', 'compatibility'],
        badges: [{ text: 'Serving-side assumption', tone: 'info' }],
        what: [
          'This is the serving batch-size assumption Crucible uses when RL-style or sampling-heavy workflows rely on vLLM-assisted generation.',
          'It affects throughput modeling on the generation side rather than the core training-step memory footprint.',
        ],
        practicalRule: [
          'Tune this only when your workflow genuinely depends on vLLM for generation throughput.',
          'If you raise it aggressively, make sure the serving stack can actually sustain that concurrency on the chosen hardware.',
        ],
        sources: VLLM_SOURCES,
      },
    ),
    numRuns: richCard(
      'advanced.num_runs',
      'Number of runs',
      'Parallel or repeated training runs included in total cost output.',
      {
        impacts: ['cost'],
        what: [
          'This multiplies total spend by the number of planned repetitions or parallel runs you want the estimator to include.',
          'It is an accounting knob for experiment volume, not a per-run training-shape change.',
        ],
        practicalRule: [
          'Use one run for per-experiment math and increase this only when you intentionally want total campaign cost.',
          'Do not use number of runs to fake uncertainty; Crucible already handles uncertainty separately.',
        ],
        sources: [HELP_SOURCES.hfTrainer, HELP_SOURCES.trlSft, HELP_SOURCES.shadeformQuickstart],
      },
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
    gradientCheckpointing: richCard(
      'advanced.use_gradient_checkpointing',
      'Gradient checkpointing',
      'Trades compute for memory by recomputing activations during backpropagation.',
      {
        impacts: ['vram', 'throughput'],
        badges: [{ text: 'Compute for memory', tone: 'info' }],
        what: [
          'Checkpointing lowers activation-memory pressure by recomputing parts of the forward pass during backpropagation.',
          'It is one of the most common ways to make a too-large run fit without changing the model itself.',
        ],
        tradeoffs: [
          'The memory savings come at the cost of extra compute and longer wall-clock time.',
          'It can make a run fit while still making the run slower than the raw GPU count suggests.',
        ],
        practicalRule: [
          'Use it when memory is the hard blocker, not as a default speed optimization.',
          'If a run only fits with checkpointing, treat the throughput hit as part of the real operating cost.',
        ],
        sources: [HELP_SOURCES.pytorchCheckpoint, HELP_SOURCES.hfPerfGpu, HELP_SOURCES.unslothFineTuning],
      },
    ),
    flashAttention: richCard(
      'advanced.use_flash_attention',
      'Flash attention',
      'Enables FlashAttention-style kernels when available.',
      {
        impacts: ['throughput', 'compatibility'],
        badges: [{ text: 'Kernel path', tone: 'info' }],
        what: [
          'This assumes the runtime can use FlashAttention-style attention kernels where supported.',
          'The gain is primarily a throughput and memory-efficiency effect in the attention path.',
        ],
        practicalRule: [
          'Treat this as a hardware-plus-software compatibility assumption, not a guaranteed speedup.',
          'If your actual stack does not support the kernel path, turn it off instead of trusting the optimistic estimate.',
        ],
        sources: [HELP_SOURCES.flashAttentionPaper, HELP_SOURCES.pytorchSdpa, HELP_SOURCES.unslothFineTuning],
      },
    ),
    tritonKernels: richCard(
      'advanced.use_triton_kernels',
      'Triton kernels',
      'Assumes Triton kernel implementations are used where available.',
      {
        impacts: ['throughput', 'compatibility'],
        what: [
          'This tells Crucible to assume Triton-based custom kernels are available for parts of the stack that benefit from them.',
          'It mainly changes runtime expectations rather than model structure.',
        ],
        practicalRule: [
          'Only leave this on if your actual framework/runtime path is set up to use Triton kernels on the target hardware.',
          'Treat it as an implementation detail with real compatibility risk, not as a free speed bonus.',
        ],
        sources: [HELP_SOURCES.tritonDocs, HELP_SOURCES.unslothFineTuning, HELP_SOURCES.hfPerfGpu],
      },
    ),
    ropeKernels: richCard(
      'advanced.use_rope_kernels',
      'RoPE kernels',
      'Enables rotary-position-embedding optimized kernels.',
      {
        impacts: ['throughput', 'compatibility'],
        what: [
          'This assumes the runtime can use optimized rotary-position-embedding kernel paths instead of a slower generic implementation.',
          'The effect is most noticeable when long-context runs make positional work more material.',
        ],
        practicalRule: [
          'Treat this as a runtime-capability flag, not a model-quality change.',
          'If the stack does not actually expose optimized RoPE kernels, leave it off and accept the more conservative timing.',
        ],
        sources: [HELP_SOURCES.roformerPaper, HELP_SOURCES.unslothFineTuning, HELP_SOURCES.tritonDocs],
      },
    ),
    fusedChunkedCe: richCard(
      'advanced.use_fused_chunked_ce_loss',
      'Fused chunked CE',
      'Assumes fused plus chunked cross-entropy loss kernels are available for long-context training.',
      {
        impacts: ['throughput', 'compatibility'],
        what: [
          'This assumes the training stack can use fused and chunked cross-entropy loss paths that are especially helpful in long-context runs.',
          'It affects runtime expectations for the loss path rather than changing model capacity or memory shape directly.',
        ],
        practicalRule: [
          'It matters most when max sequence length is already large enough for loss computation to be a visible bottleneck.',
          'If you are not using a stack that exposes these kernels, turn it off instead of taking the planner’s optimistic path.',
        ],
        sources: [HELP_SOURCES.unslothFineTuning, HELP_SOURCES.tritonDocs, HELP_SOURCES.hfPerfGpu],
      },
    ),
    fasterMoeKernels: richCard(
      'advanced.use_faster_moe_kernels',
      'Faster MoE kernels',
      'Assumes Unsloth Split-LoRA or faster MoE kernels are used when training MoE models.',
      {
        impacts: ['throughput', 'compatibility'],
        badges: [{ text: 'MoE-specific', tone: 'warn' }],
        what: [
          'This assumes the MoE runtime path has faster expert-routing or expert-kernel implementations available instead of a plain baseline path.',
          'It only matters for MoE runs; dense models should ignore it.',
        ],
        practicalRule: [
          'Leave it off unless your actual MoE training stack documents the faster kernel path you expect to use.',
          'Even when enabled, treat the speedup conservatively because router and runtime overhead still vary a lot in practice.',
        ],
        sources: [HELP_SOURCES.unslothFineTuning, HELP_SOURCES.unslothMultiGpu, HELP_SOURCES.hfMoE],
      },
    ),
    sequencePacking: richCard(
      'advanced.sequence_packing',
      'Sequence packing',
      'Packs multiple short samples into longer sequences for higher utilization.',
      {
        impacts: ['throughput', 'cost'],
        badges: [{ text: 'Utilization lever', tone: 'info' }],
        what: [
          'Packing combines multiple shorter examples into fuller training sequences so fewer tokens are wasted on padding.',
          'It is mainly a throughput and token-utilization assumption, not a change to model size.',
        ],
        practicalRule: [
          'Packing matters most when the dataset contains many short samples relative to the max sequence length.',
          'If the corpus is already close to full-context examples, packing will do much less than the toggle suggests.',
        ],
        sources: PACKING_SOURCES,
      },
    ),
    fullFinetuningMode: richCard(
      'advanced.full_finetuning',
      'Full finetuning mode',
      'Forces full-weight finetuning assumptions regardless of method selection.',
      {
        impacts: ['vram', 'cost', 'compatibility'],
        badges: [{ text: 'Overrides method', tone: 'warn' }],
        what: [
          'This override tells Crucible to use full-weight finetuning assumptions even if another method selector still says LoRA or QLoRA.',
          'It exists as a guardrail for inputs that conceptually mean “treat this as full finetune.”',
        ],
        practicalRule: [
          'Do not leave this on accidentally; it can move the estimate into a much more expensive memory regime.',
          'If this is enabled, trust the effective behavior panel more than the raw method dropdown label.',
        ],
        sources: [...METHOD_SOURCES, HELP_SOURCES.unslothFineTuning, HELP_SOURCES.hfTrainer],
      },
    ),
  },
} as const
