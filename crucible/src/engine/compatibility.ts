import type {
  EstimateRequest,
  NormalizationEvent,
  QuantizationBits,
  QuantizationProfile,
  SupportReason,
  SupportTier,
  WorkflowMode,
} from '../types/index'
import {
  isQATTargetBits,
  normalizeQATSchemeForBits,
} from './quantization'

export const SOURCE_LEDGER_VERSION = '2026-03-11'

export interface SourceLedgerEntry {
  id: string
  title: string
  url: string
  verified_on: string
}

export const ESTIMATOR_SOURCE_LEDGER: SourceLedgerEntry[] = [
  {
    id: 'unsloth-install',
    title: 'Unsloth Install',
    url: 'https://unsloth.ai/docs/get-started/install',
    verified_on: SOURCE_LEDGER_VERSION,
  },
  {
    id: 'unsloth-notebooks',
    title: 'Unsloth Notebooks',
    url: 'https://unsloth.ai/docs/get-started/unsloth-notebooks',
    verified_on: SOURCE_LEDGER_VERSION,
  },
  {
    id: 'unsloth-docker',
    title: 'Unsloth Docker',
    url: 'https://unsloth.ai/docs/get-started/install/docker',
    verified_on: SOURCE_LEDGER_VERSION,
  },
  {
    id: 'unsloth-fine-tuning-guide',
    title: 'Unsloth Fine-Tuning Guide',
    url: 'https://unsloth.ai/docs/get-started/fine-tuning-llms-guide',
    verified_on: SOURCE_LEDGER_VERSION,
  },
  {
    id: 'unsloth-multi-gpu',
    title: 'Unsloth Multi-GPU Training',
    url: 'https://unsloth.ai/docs/basics/multi-gpu-training-with-unsloth',
    verified_on: SOURCE_LEDGER_VERSION,
  },
  {
    id: 'unsloth-ddp',
    title: 'Unsloth DDP Guide',
    url: 'https://unsloth.ai/docs/basics/multi-gpu-training-with-unsloth/ddp',
    verified_on: SOURCE_LEDGER_VERSION,
  },
  {
    id: 'unsloth-qat',
    title: 'Unsloth Dynamic 2.0 / QAT',
    url: 'https://unsloth.ai/docs/get-started/fine-tuning-llms-guide/lora-hyperparameters-guide',
    verified_on: SOURCE_LEDGER_VERSION,
  },
  {
    id: 'torchao-qat-api',
    title: 'TorchAO Quantization API',
    url: 'https://docs.pytorch.org/ao/stable/api_ref_quantization.html',
    verified_on: SOURCE_LEDGER_VERSION,
  },
  {
    id: 'torchao-quantized-training',
    title: 'TorchAO Quantized Training Workflows',
    url: 'https://docs.pytorch.org/ao/stable/workflows/training.html',
    verified_on: SOURCE_LEDGER_VERSION,
  },
  {
    id: 'hf-moe-blog',
    title: 'Hugging Face Mixture-of-Experts Explainer',
    url: 'https://huggingface.co/blog/moe',
    verified_on: SOURCE_LEDGER_VERSION,
  },
  {
    id: 'qwen3-30b-a3b-card',
    title: 'Qwen3-30B-A3B Model Card',
    url: 'https://huggingface.co/Qwen/Qwen3-30B-A3B',
    verified_on: SOURCE_LEDGER_VERSION,
  },
  {
    id: 'openai-gpt-oss',
    title: 'OpenAI GPT-OSS Announcement',
    url: 'https://openai.com/index/introducing-gpt-oss/',
    verified_on: SOURCE_LEDGER_VERSION,
  },
  {
    id: 'unsloth-requirements',
    title: 'Unsloth Requirements',
    url: 'https://unsloth.ai/docs/get-started/fine-tuning-for-beginners/unsloth-requirements',
    verified_on: SOURCE_LEDGER_VERSION,
  },
  {
    id: 'unsloth-blackwell',
    title: 'Unsloth Blackwell Guide',
    url: 'https://unsloth.ai/docs/blog/fine-tuning-llms-with-blackwell-rtx-50-series-and-unsloth',
    verified_on: SOURCE_LEDGER_VERSION,
  },
]

interface RuleDefinition {
  id: string
  reason: string
  source_ids: string[]
}

const RULES = {
  fullFintuneOverride: {
    id: 'full_finetuning_override',
    reason: 'full_finetuning=true overrides method selection; using Full Fine-Tune assumptions.',
    source_ids: [],
  },
  lora4bitBecomesQlora: {
    id: 'lora_4bit_is_qlora',
    reason: '4-bit adapter training corresponds to QLoRA; switching method from LoRA to QLoRA.',
    source_ids: ['unsloth-fine-tuning-guide'],
  },
  qloraIs4bit: {
    id: 'qlora_requires_4bit',
    reason: 'QLoRA is modeled as 4-bit adapter training; forcing quantization to 4-bit NF4.',
    source_ids: ['unsloth-fine-tuning-guide'],
  },
  fullFineTunePromote8Bit: {
    id: 'full_finetune_promote_8bit',
    reason:
      '4-bit full fine-tuning is not source-backed in the current Unsloth guide; promoting to 8-bit for planning.',
    source_ids: ['unsloth-fine-tuning-guide'],
  },
  unslothGuidedEntryPath: {
    id: 'unsloth_guided_entry_path',
    reason:
      'Guided mode stays closest to the current Unsloth entry paths: notebooks, local installs, and Docker.',
    source_ids: ['unsloth-install', 'unsloth-notebooks', 'unsloth-docker'],
  },
  unslothGuidedMultiGpu: {
    id: 'unsloth_guided_multi_gpu_manual',
    reason:
      'Unsloth guided mode is source-backed for notebook/local/Docker entry paths, but multi-GPU runs move into manual Accelerate/DeepSpeed/FSDP/DDP setup.',
    source_ids: ['unsloth-multi-gpu', 'unsloth-ddp'],
  },
  providerSpecificSupportInference: {
    id: 'provider_specific_support_inferred',
    reason:
      'Provider support is inferred from environment requirements rather than a provider certification list.',
    source_ids: ['unsloth-install', 'unsloth-docker', 'unsloth-requirements'],
  },
  nonUnslothProvisional: {
    id: 'framework_outside_unsloth_catalog',
    reason:
      'Only Unsloth has a current source-backed compatibility catalog in Crucible. Other frameworks remain provisional.',
    source_ids: [],
  },
  muonCustom: {
    id: 'muon_custom_pipeline',
    reason:
      'Muon is not currently documented in the Unsloth guided setup docs; treat optimizer-specific gains as custom-pipeline tuning.',
    source_ids: ['unsloth-install', 'unsloth-notebooks'],
  },
  qatNonUnsloth: {
    id: 'qat_non_unsloth_provisional',
    reason: 'QAT planning is currently source-backed only for Unsloth docs; non-Unsloth QAT is provisional.',
    source_ids: ['unsloth-qat'],
  },
  qatFullFinetune: {
    id: 'qat_full_finetune_custom',
    reason: 'Unsloth QAT docs currently describe LoRA/QLoRA combinations, not full fine-tune QAT workflows.',
    source_ids: ['unsloth-qat'],
  },
  qatTargetBitsOnly: {
    id: 'qat_requires_4_or_8bit_target',
    reason:
      'Current source-backed QAT paths in this planner target INT4 or FP8-style exports; disabling QAT for 16/32-bit targets.',
    source_ids: ['unsloth-qat', 'torchao-qat-api', 'torchao-quantized-training'],
  },
  qatSchemeMatchesTargetBits: {
    id: 'qat_scheme_matches_target_precision',
    reason:
      'The selected QAT scheme did not match the current target precision, so it was normalized to a compatible scheme.',
    source_ids: ['unsloth-qat', 'torchao-qat-api'],
  },
  moeQloraEvolving: {
    id: 'unsloth_moe_qlora_evolving',
    reason: 'Unsloth MoE + QLoRA support is still evolving; treat these estimates as inferred rather than documented.',
    source_ids: ['unsloth-fine-tuning-guide'],
  },
  providerCustomPipeline: {
    id: 'provider_custom_pipeline_inferred',
    reason: 'Custom pipeline mode allows standard CUDA cloud environments, but provider support remains inferred.',
    source_ids: ['unsloth-install', 'unsloth-docker', 'unsloth-requirements'],
  },
} satisfies Record<string, RuleDefinition>

function defaultQuantizationProfile(bits: QuantizationBits): QuantizationProfile {
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

const TIER_RANK: Record<SupportTier, number> = {
  documented: 0,
  inferred: 1,
  custom: 2,
}

function worsenSupportTier(current: SupportTier, next: SupportTier): SupportTier {
  return TIER_RANK[next] > TIER_RANK[current] ? next : current
}

function normalizeWorkflowMode(value: EstimateRequest['workflow_mode'] | undefined): WorkflowMode {
  return value === 'guided' ? 'guided' : 'custom_pipeline'
}

function addSupportReason(
  collection: SupportReason[],
  tier: SupportTier,
  rule: RuleDefinition,
): void {
  collection.push({
    rule_id: rule.id,
    tier,
    reason: rule.reason,
    source_ids: rule.source_ids,
  })
}

function addNormalization(
  collection: NormalizationEvent[],
  rule: RuleDefinition,
  field: string,
  input: unknown,
  normalizedTo: unknown,
): void {
  collection.push({
    rule_id: rule.id,
    field,
    input,
    normalized_to: normalizedTo,
    reason: rule.reason,
    source_ids: rule.source_ids,
  })
}

export interface CompatibilityGuardResult {
  normalized: EstimateRequest
  warnings: string[]
  normalizations: NormalizationEvent[]
  support_tier: SupportTier
  support_reasons: SupportReason[]
}

export function applyCompatibilityGuards(request: EstimateRequest): CompatibilityGuardResult {
  const warnings: string[] = []
  const normalizations: NormalizationEvent[] = []
  const supportReasons: SupportReason[] = []
  const normalized: EstimateRequest = {
    ...request,
    workflow_mode: normalizeWorkflowMode(request.workflow_mode),
  }

  let supportTier: SupportTier = 'documented'

  if (normalized.framework !== 'Unsloth') {
    supportTier = 'custom'
    addSupportReason(supportReasons, 'custom', RULES.nonUnslothProvisional)
    warnings.push(RULES.nonUnslothProvisional.reason)
  } else if (normalized.workflow_mode === 'guided') {
    addSupportReason(supportReasons, 'documented', RULES.unslothGuidedEntryPath)
  } else {
    supportTier = worsenSupportTier(supportTier, 'inferred')
    addSupportReason(supportReasons, 'inferred', RULES.providerCustomPipeline)
  }

  if (normalized.full_finetuning && normalized.method !== 'Full Fine-Tune') {
    const inputMethod = normalized.method
    normalized.method = 'Full Fine-Tune'
    addNormalization(normalizations, RULES.fullFintuneOverride, 'method', inputMethod, normalized.method)
    warnings.push(RULES.fullFintuneOverride.reason)
  }

  if (normalized.method === 'Full Fine-Tune' && !normalized.full_finetuning) {
    const inputValue = normalized.full_finetuning
    normalized.full_finetuning = true
    addNormalization(
      normalizations,
      RULES.fullFintuneOverride,
      'full_finetuning',
      inputValue,
      normalized.full_finetuning,
    )
    warnings.push(RULES.fullFintuneOverride.reason)
  }

  if (normalized.method === 'LoRA' && normalized.quantization_bits === 4) {
    const inputMethod = normalized.method
    normalized.method = 'QLoRA'
    addNormalization(normalizations, RULES.lora4bitBecomesQlora, 'method', inputMethod, normalized.method)
    warnings.push(RULES.lora4bitBecomesQlora.reason)
  }

  if (normalized.method === 'QLoRA' && normalized.quantization_bits !== 4) {
    const inputBits = normalized.quantization_bits
    const inputProfile = normalized.quantization_profile
    normalized.quantization_bits = 4
    normalized.quantization_profile = defaultQuantizationProfile(4)
    addNormalization(
      normalizations,
      RULES.qloraIs4bit,
      'quantization_bits',
      inputBits,
      normalized.quantization_bits,
    )
    addNormalization(
      normalizations,
      RULES.qloraIs4bit,
      'quantization_profile',
      inputProfile,
      normalized.quantization_profile,
    )
    warnings.push(RULES.qloraIs4bit.reason)
  }

  if (normalized.method === 'Full Fine-Tune' && normalized.quantization_bits === 4) {
    const inputBits = normalized.quantization_bits
    const inputProfile = normalized.quantization_profile
    normalized.quantization_bits = 8
    normalized.quantization_profile = defaultQuantizationProfile(8)
    addNormalization(
      normalizations,
      RULES.fullFineTunePromote8Bit,
      'quantization_bits',
      inputBits,
      normalized.quantization_bits,
    )
    addNormalization(
      normalizations,
      RULES.fullFineTunePromote8Bit,
      'quantization_profile',
      inputProfile,
      normalized.quantization_profile,
    )
    warnings.push(RULES.fullFineTunePromote8Bit.reason)
  }

  if (normalized.framework === 'Unsloth' && normalized.workflow_mode === 'guided') {
    if (normalized.num_nodes > 1 || normalized.num_gpus > 1) {
      supportTier = worsenSupportTier(supportTier, 'custom')
      addSupportReason(supportReasons, 'custom', RULES.unslothGuidedMultiGpu)
      warnings.push(RULES.unslothGuidedMultiGpu.reason)
    }

    if (normalized.target_providers.length > 0) {
      supportTier = worsenSupportTier(supportTier, 'inferred')
      addSupportReason(supportReasons, 'inferred', RULES.providerSpecificSupportInference)
      warnings.push(RULES.providerSpecificSupportInference.reason)
    }

    if (normalized.optimizer === 'muon') {
      supportTier = worsenSupportTier(supportTier, 'custom')
      addSupportReason(supportReasons, 'custom', RULES.muonCustom)
      warnings.push(RULES.muonCustom.reason)
    }
  }

  if (normalized.use_qat) {
    if (!isQATTargetBits(normalized.quantization_bits)) {
      const inputUseQat = normalized.use_qat
      normalized.use_qat = false
      addNormalization(
        normalizations,
        RULES.qatTargetBitsOnly,
        'use_qat',
        inputUseQat,
        normalized.use_qat,
      )
      warnings.push(RULES.qatTargetBitsOnly.reason)
    } else {
      const normalizedScheme = normalizeQATSchemeForBits(
        normalized.quantization_bits,
        normalized.qat_scheme,
      )
      if (normalizedScheme && normalizedScheme !== normalized.qat_scheme) {
        const inputScheme = normalized.qat_scheme
        normalized.qat_scheme = normalizedScheme
        addNormalization(
          normalizations,
          RULES.qatSchemeMatchesTargetBits,
          'qat_scheme',
          inputScheme,
          normalized.qat_scheme,
        )
        warnings.push(RULES.qatSchemeMatchesTargetBits.reason)
      }
    }

    if (normalized.framework !== 'Unsloth') {
      supportTier = worsenSupportTier(supportTier, 'custom')
      addSupportReason(supportReasons, 'custom', RULES.qatNonUnsloth)
      warnings.push(RULES.qatNonUnsloth.reason)
    } else if (normalized.method === 'Full Fine-Tune') {
      supportTier = worsenSupportTier(supportTier, 'custom')
      addSupportReason(supportReasons, 'custom', RULES.qatFullFinetune)
      warnings.push(RULES.qatFullFinetune.reason)
    }
  }

  if (normalized.framework === 'Unsloth' && normalized.method === 'QLoRA' && normalized.architecture === 'MoE') {
    supportTier = worsenSupportTier(supportTier, 'inferred')
    addSupportReason(supportReasons, 'inferred', RULES.moeQloraEvolving)
    warnings.push(RULES.moeQloraEvolving.reason)
  }

  return {
    normalized,
    warnings,
    normalizations,
    support_tier: supportTier,
    support_reasons: dedupeSupportReasons(supportReasons),
  }
}

function dedupeSupportReasons(reasons: SupportReason[]): SupportReason[] {
  const seen = new Set<string>()
  return reasons.filter((reason) => {
    const key = `${reason.rule_id}:${reason.tier}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}
