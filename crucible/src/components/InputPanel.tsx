import { useCallback, useEffect, useMemo, useState } from 'react'
import { resolveGPUType } from '../engine/gpu-specs'
import type {
  Architecture,
  EstimateRequest,
  FineTuneMethod,
  Framework,
  GPUType,
  LoRATargetModule,
  LRScheduler,
  Optimizer,
  Precision,
  PricingTier,
  ProviderPricing,
  QuantizationBits,
  TrainingType,
} from '../types'

interface InputPanelProps {
  value: EstimateRequest
  onChange: (patch: Partial<EstimateRequest>) => void
  pricing: ProviderPricing[]
  pricingLoading: boolean
  onResolveModel: (input: string) => Promise<void>
  modelResolveLoading: boolean
  modelResolveError: string | null
  modelResolveMessage: string | null
}

interface ModelProfile {
  id: string
  label: string
  params: number
  architecture: Architecture
  moeTotal: number
  moeActive: number
}

const MODEL_PROFILES: ModelProfile[] = [
  {
    id: 'llama-3.3-70b',
    label: 'Llama 3.3 70B',
    params: 70.6,
    architecture: 'Dense',
    moeTotal: 1,
    moeActive: 1,
  },
  {
    id: 'llama-3.1-8b',
    label: 'Llama 3.1 8B',
    params: 8,
    architecture: 'Dense',
    moeTotal: 1,
    moeActive: 1,
  },
  {
    id: 'qwen-2.5-14b',
    label: 'Qwen 2.5 14B',
    params: 14,
    architecture: 'Dense',
    moeTotal: 1,
    moeActive: 1,
  },
  {
    id: 'deepseek-v3',
    label: 'DeepSeek V3 (MoE)',
    params: 671,
    architecture: 'MoE',
    moeTotal: 256,
    moeActive: 8,
  },
]

const METHOD_OPTIONS: FineTuneMethod[] = ['Full Fine-Tune', 'LoRA', 'QLoRA']
const ARCHITECTURE_OPTIONS: Architecture[] = ['Dense', 'MoE']
const TRAINING_TYPE_OPTIONS: TrainingType[] = ['SFT', 'GRPO', 'DPO', 'PPO', 'ORPO']
const QUANTIZATION_OPTIONS: QuantizationBits[] = [4, 8, 16, 32]
const FRAMEWORK_OPTIONS: Framework[] = [
  'Unsloth',
  'HuggingFace+TRL',
  'Axolotl',
  'LLaMA-Factory',
  'torchtune',
  'Custom',
]
const OPTIMIZER_OPTIONS: Optimizer[] = [
  'adamw',
  'adamw_8bit',
  'paged_adamw_8bit',
  'sgd',
  'muon',
]
const LR_SCHEDULER_OPTIONS: LRScheduler[] = ['cosine', 'linear', 'constant']
const PRECISION_OPTIONS: Precision[] = ['fp32', 'fp16', 'bf16', 'fp8']
const PRICING_TIER_OPTIONS: PricingTier[] = ['on_demand', 'spot', 'reserved_1mo', 'reserved_3mo']
const GPU_FALLBACK_OPTIONS: GPUType[] = [
  'H100',
  'H200',
  'B200',
  'A100_80G',
  'A100',
  'L40S',
  'L40',
  'A6000',
  'RTX_5090',
  'RTX_4090',
  'RTX_3090',
]
const PROVIDER_FALLBACK_OPTIONS = [
  'runpod',
  'vast',
  'lambdalabs',
  'aws',
  'gcp',
  'azure',
  'coreweave',
  'paperspace',
  'oracle',
]
const INTERCONNECT_UNKNOWN = 'unknown'
const LORA_TARGET_MODULE_OPTIONS: LoRATargetModule[] = [
  'q',
  'k',
  'v',
  'o',
  'gate',
  'up',
  'down',
]

function parseNumber(value: string, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parsePositiveInteger(value: string, fallback: number): number {
  const parsed = Math.round(Number(value))
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return Math.max(1, parsed)
}

function normalizeLower(value: string): string {
  return value.trim().toLowerCase()
}

function toTitleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function dedupeSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right))
}

function formatPricingTierLabel(tier: PricingTier): string {
  return tier.replaceAll('_', ' ')
}

function normalizeGpuOption(value: string): string {
  const resolved = resolveGPUType(value)
  return normalizeLower(resolved ?? value)
}

function hasTierPrice(row: ProviderPricing, tier: PricingTier): boolean {
  if (tier === 'on_demand') {
    return row.hourly_price_cents > 0
  }
  if (tier === 'spot') {
    return row.spot_price_cents !== null && row.spot_price_cents !== undefined
  }
  if (tier === 'reserved_1mo') {
    return row.reserved_1mo_price_cents !== null && row.reserved_1mo_price_cents !== undefined
  }
  return row.reserved_3mo_price_cents !== null && row.reserved_3mo_price_cents !== undefined
}

export function InputPanel({
  value,
  onChange,
  pricing,
  pricingLoading,
  onResolveModel,
  modelResolveLoading,
  modelResolveError,
  modelResolveMessage,
}: InputPanelProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [modelReference, setModelReference] = useState('')

  const patchField = useCallback(
    <K extends keyof EstimateRequest>(key: K, next: EstimateRequest[K]) => {
      onChange({ [key]: next } as Pick<EstimateRequest, K>)
    },
    [onChange],
  )

  const toggleArrayValue = useCallback(
    <
      K extends
        | 'target_gpu'
        | 'target_providers'
        | 'pricing_tier'
        | 'lora_target_modules'
        | 'target_regions'
        | 'target_interconnects'
        | 'target_instance_types',
    >(
      key: K,
      item: string,
    ) => {
      const current = value[key] as string[]
      const hasItem = current.includes(item)
      const next = hasItem ? current.filter((entry) => entry !== item) : [...current, item]

      patchField(key, next as EstimateRequest[K])
    },
    [patchField, value],
  )

  const providerRows = useMemo(() => {
    const selectedProviders = new Set(
      value.target_providers.map((provider) => normalizeLower(provider)).filter((provider) => provider.length > 0),
    )
    if (selectedProviders.size === 0) {
      return pricing
    }
    return pricing.filter((row) => selectedProviders.has(normalizeLower(row.provider)))
  }, [pricing, value.target_providers])

  const providerGpuRows = useMemo(() => {
    const selectedGpus = new Set(
      value.target_gpu.map((gpu) => normalizeGpuOption(gpu)).filter((gpu) => gpu.length > 0),
    )
    if (selectedGpus.size === 0) {
      return providerRows
    }
    return providerRows.filter((row) => selectedGpus.has(normalizeGpuOption(String(row.gpu))))
  }, [providerRows, value.target_gpu])

  const providerGpuCountRows = useMemo(() => {
    return providerGpuRows.filter((row) => row.num_gpus === value.num_gpus)
  }, [providerGpuRows, value.num_gpus])

  const availableProviders = useMemo(() => {
    if (pricing.length === 0) {
      return PROVIDER_FALLBACK_OPTIONS
    }
    return dedupeSorted(pricing.map((row) => row.provider))
  }, [pricing])

  const availableGpuFamilies = useMemo(() => {
    const sourceRows = providerRows.length > 0 ? providerRows : pricing
    if (sourceRows.length === 0) {
      return GPU_FALLBACK_OPTIONS
    }
    return dedupeSorted(
      sourceRows.map((row) => {
        const resolved = resolveGPUType(String(row.gpu))
        return resolved ?? String(row.gpu)
      }),
    )
  }, [pricing, providerRows])

  const availableGpuCounts = useMemo(() => {
    const sourceRows = providerGpuRows.length > 0 ? providerGpuRows : providerRows
    if (sourceRows.length === 0) {
      return [1, 2, 4, 8]
    }
    return Array.from(new Set(sourceRows.map((row) => row.num_gpus))).sort((left, right) => left - right)
  }, [providerGpuRows, providerRows])

  const availablePricingTiers = useMemo(() => {
    const sourceRows = providerGpuCountRows.length > 0 ? providerGpuCountRows : providerGpuRows
    if (sourceRows.length === 0) {
      return PRICING_TIER_OPTIONS
    }
    return PRICING_TIER_OPTIONS.filter((tier) => sourceRows.some((row) => hasTierPrice(row, tier)))
  }, [providerGpuCountRows, providerGpuRows])

  const availableRegions = useMemo(() => {
    const sourceRows = providerGpuCountRows.length > 0 ? providerGpuCountRows : providerGpuRows
    if (sourceRows.length === 0) {
      return []
    }
    return dedupeSorted(
      sourceRows.flatMap((row) => {
        if (row.availability.length === 0) {
          return ['any']
        }
        return row.availability.map((entry) => entry.region || 'any')
      }),
    )
  }, [providerGpuCountRows, providerGpuRows])

  const availableInterconnects = useMemo(() => {
    const sourceRows = providerGpuCountRows.length > 0 ? providerGpuCountRows : providerGpuRows
    if (sourceRows.length === 0) {
      return []
    }
    return dedupeSorted(
      sourceRows.map((row) => row.interconnect?.trim() || INTERCONNECT_UNKNOWN),
    )
  }, [providerGpuCountRows, providerGpuRows])

  const availableInstanceTypes = useMemo(() => {
    const sourceRows = providerGpuCountRows.length > 0 ? providerGpuCountRows : providerGpuRows
    if (sourceRows.length === 0) {
      return []
    }
    return dedupeSorted(
      sourceRows.map((row) => row.cloud_instance_type.trim()).filter((instanceType) => instanceType.length > 0),
    )
  }, [providerGpuCountRows, providerGpuRows])

  useEffect(() => {
    const providerSet = new Set(availableProviders.map((provider) => normalizeLower(provider)))
    const gpuSet = new Set(availableGpuFamilies.map((gpu) => normalizeGpuOption(gpu)))
    const tierSet = new Set(availablePricingTiers)
    const regionSet = new Set(availableRegions.map((region) => normalizeLower(region)))
    const interconnectSet = new Set(
      availableInterconnects.map((interconnect) => normalizeLower(interconnect)),
    )
    const instanceTypeSet = new Set(
      availableInstanceTypes.map((instanceType) => normalizeLower(instanceType)),
    )

    const nextProviders = value.target_providers.filter((provider) =>
      providerSet.has(normalizeLower(provider)),
    )
    const nextGpus = value.target_gpu.filter((gpu) => gpuSet.has(normalizeGpuOption(gpu)))
    const nextTiers = value.pricing_tier.filter((tier) => tierSet.has(tier))
    const nextRegions = value.target_regions.filter((region) => regionSet.has(normalizeLower(region)))
    const nextInterconnects = value.target_interconnects.filter((interconnect) =>
      interconnectSet.has(normalizeLower(interconnect)),
    )
    const nextInstanceTypes = value.target_instance_types.filter((instanceType) =>
      instanceTypeSet.has(normalizeLower(instanceType)),
    )

    const nextGpuCount = availableGpuCounts.includes(value.num_gpus)
      ? value.num_gpus
      : (availableGpuCounts[0] ?? value.num_gpus)

    const patch: Partial<EstimateRequest> = {}
    if (nextProviders.length !== value.target_providers.length) {
      patch.target_providers = nextProviders
    }
    if (nextGpus.length !== value.target_gpu.length) {
      patch.target_gpu = nextGpus as EstimateRequest['target_gpu']
    }
    if (nextTiers.length !== value.pricing_tier.length) {
      patch.pricing_tier = (nextTiers.length > 0
        ? nextTiers
        : [availablePricingTiers[0] ?? 'on_demand']) as EstimateRequest['pricing_tier']
    }
    if (nextRegions.length !== value.target_regions.length) {
      patch.target_regions = nextRegions
    }
    if (nextInterconnects.length !== value.target_interconnects.length) {
      patch.target_interconnects = nextInterconnects
    }
    if (nextInstanceTypes.length !== value.target_instance_types.length) {
      patch.target_instance_types = nextInstanceTypes
    }
    if (nextGpuCount !== value.num_gpus) {
      patch.num_gpus = nextGpuCount
    }

    if (Object.keys(patch).length > 0) {
      onChange(patch)
    }
  }, [
    availableGpuCounts,
    availableGpuFamilies,
    availableInstanceTypes,
    availableInterconnects,
    availablePricingTiers,
    availableProviders,
    availableRegions,
    onChange,
    value.num_gpus,
    value.pricing_tier,
    value.target_gpu,
    value.target_instance_types,
    value.target_interconnects,
    value.target_providers,
    value.target_regions,
  ])

  return (
    <section className="card input-panel">
      <div className="section-head">
        <h2>Input Matrix</h2>
        <span className="section-meta">Debounced live estimate (300ms)</span>
      </div>

      <fieldset className="panel-section">
        <legend>Model & Method</legend>
        <div className="field">
          <span>Resolve from Hugging Face URL / repo id</span>
          <div className="inline-field-row">
            <input
              type="text"
              value={modelReference}
              placeholder="https://huggingface.co/unsloth/Llama-3.1-8B or unsloth/Llama-3.1-8B"
              onChange={(event) => setModelReference(event.target.value)}
            />
            <button
              type="button"
              className="ghost-button"
              disabled={modelResolveLoading || modelReference.trim().length === 0}
              onClick={() => {
                void onResolveModel(modelReference.trim())
              }}
            >
              {modelResolveLoading ? 'Resolving...' : 'Resolve'}
            </button>
          </div>
          {modelResolveError ? (
            <span className="field-hint field-hint-error">{modelResolveError}</span>
          ) : null}
          {modelResolveMessage ? (
            <span className="field-hint field-hint-success">{modelResolveMessage}</span>
          ) : null}
        </div>
        <div className="field-grid field-grid-2">
          <label className="field">
            <span>Model preset</span>
            <select
              value={value.model_name}
              onChange={(event) => {
                const selected = MODEL_PROFILES.find((profile) => profile.id === event.target.value)
                if (!selected) {
                  patchField('model_name', event.target.value)
                  return
                }

                onChange({
                  model_name: selected.id,
                  model_params_billions: selected.params,
                  architecture: selected.architecture,
                  moe_total_experts: selected.moeTotal,
                  moe_active_experts: selected.moeActive,
                })
              }}
            >
              {MODEL_PROFILES.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Model params (B)</span>
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={value.model_params_billions}
              onChange={(event) => {
                patchField(
                  'model_params_billions',
                  Math.max(0.1, parseNumber(event.target.value, value.model_params_billions)),
                )
              }}
            />
          </label>

          <label className="field">
            <span>Architecture</span>
            <select
              value={value.architecture}
              onChange={(event) => {
                patchField('architecture', event.target.value as Architecture)
              }}
            >
              {ARCHITECTURE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Method</span>
            <select
              value={value.method}
              onChange={(event) => {
                const nextMethod = event.target.value as FineTuneMethod
                onChange({
                  method: nextMethod,
                  full_finetuning: nextMethod === 'Full Fine-Tune',
                })
              }}
            >
              {METHOD_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Quantization (bit)</span>
            <select
              value={value.quantization_bits}
              onChange={(event) => {
                patchField('quantization_bits', Number(event.target.value) as QuantizationBits)
              }}
            >
              {QUANTIZATION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}-bit
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Framework</span>
            <select
              value={value.framework}
              onChange={(event) => {
                patchField('framework', event.target.value as Framework)
              }}
            >
              {FRAMEWORK_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        {value.architecture === 'MoE' && (
          <div className="field-grid field-grid-2 conditional-grid">
            <label className="field">
              <span>Total experts</span>
              <input
                type="number"
                min={1}
                step={1}
                value={value.moe_total_experts}
                onChange={(event) => {
                  patchField(
                    'moe_total_experts',
                    parsePositiveInteger(event.target.value, value.moe_total_experts),
                  )
                }}
              />
            </label>

            <label className="field">
              <span>Active experts</span>
              <input
                type="number"
                min={1}
                step={1}
                value={value.moe_active_experts}
                onChange={(event) => {
                  patchField(
                    'moe_active_experts',
                    parsePositiveInteger(event.target.value, value.moe_active_experts),
                  )
                }}
              />
            </label>
          </div>
        )}
      </fieldset>

      <fieldset className="panel-section">
        <legend>Dataset & Training</legend>
        <div className="field-grid field-grid-2">
          <label className="field">
            <span>Dataset tokens</span>
            <input
              type="number"
              min={1}
              step={1000}
              value={value.dataset_tokens}
              onChange={(event) => {
                patchField('dataset_tokens', parsePositiveInteger(event.target.value, value.dataset_tokens))
              }}
            />
          </label>

          <label className="field">
            <span>Epochs</span>
            <input
              type="number"
              min={1}
              step={1}
              value={value.num_epochs}
              onChange={(event) => {
                patchField('num_epochs', parsePositiveInteger(event.target.value, value.num_epochs))
              }}
            />
          </label>

          <label className="field">
            <span>Batch size</span>
            <input
              type="number"
              min={1}
              step={1}
              value={value.batch_size}
              onChange={(event) => {
                patchField('batch_size', parsePositiveInteger(event.target.value, value.batch_size))
              }}
            />
          </label>

          <label className="field">
            <span>Grad accumulation</span>
            <input
              type="number"
              min={1}
              step={1}
              value={value.gradient_accumulation_steps}
              onChange={(event) => {
                patchField(
                  'gradient_accumulation_steps',
                  parsePositiveInteger(event.target.value, value.gradient_accumulation_steps),
                )
              }}
            />
          </label>

          <label className="field">
            <span>Max seq length</span>
            <input
              type="number"
              min={128}
              step={128}
              value={value.max_seq_length}
              onChange={(event) => {
                patchField(
                  'max_seq_length',
                  parsePositiveInteger(event.target.value, value.max_seq_length),
                )
              }}
            />
          </label>

          <label className="field">
            <span>Training type</span>
            <select
              value={value.training_type}
              onChange={(event) => {
                patchField('training_type', event.target.value as TrainingType)
              }}
            >
              {TRAINING_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset className="panel-section">
        <legend>Hardware & Pricing</legend>

        <div className="field-grid field-grid-2">
          <label className="field">
            <span>GPUs per run</span>
            <select
              value={value.num_gpus}
              onChange={(event) => {
                patchField('num_gpus', parsePositiveInteger(event.target.value, value.num_gpus))
              }}
            >
              {availableGpuCounts.map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Nodes</span>
            <input
              type="number"
              min={1}
              step={1}
              value={value.num_nodes}
              onChange={(event) => {
                patchField('num_nodes', parsePositiveInteger(event.target.value, value.num_nodes))
              }}
            />
          </label>
        </div>

        <div className="checkbox-matrix">
          <p className="matrix-label">Target GPU families</p>
          <div className="pill-grid">
            {availableGpuFamilies.map((gpu) => (
              <label key={gpu} className="pill-option">
                <input
                  type="checkbox"
                  checked={value.target_gpu.includes(gpu as GPUType)}
                  onChange={() => toggleArrayValue('target_gpu', gpu)}
                />
                <span>{gpu.replaceAll('_', ' ')}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="checkbox-matrix">
          <p className="matrix-label">Pricing tiers</p>
          <div className="pill-grid">
            {PRICING_TIER_OPTIONS.map((tier) => (
              <label key={tier} className="pill-option">
                <input
                  type="checkbox"
                  checked={value.pricing_tier.includes(tier)}
                  disabled={!availablePricingTiers.includes(tier)}
                  onChange={() => toggleArrayValue('pricing_tier', tier)}
                />
                <span>{formatPricingTierLabel(tier)}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="checkbox-matrix">
          <p className="matrix-label">Cloud providers (blank = all)</p>
          <div className="pill-grid">
            {availableProviders.map((provider) => (
              <label key={provider} className="pill-option">
                <input
                  type="checkbox"
                  checked={value.target_providers.includes(provider)}
                  onChange={() => toggleArrayValue('target_providers', provider)}
                />
                <span>{provider}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="checkbox-matrix">
          <p className="matrix-label">Regions (optional)</p>
          {availableRegions.length === 0 ? (
            <span className="field-hint">
              {pricingLoading
                ? 'Loading region capability map from providers...'
                : 'No region metadata available for current provider filter.'}
            </span>
          ) : (
            <div className="pill-grid">
              {availableRegions.map((region) => (
                <label key={region} className="pill-option">
                  <input
                    type="checkbox"
                    checked={value.target_regions.includes(region)}
                    onChange={() => toggleArrayValue('target_regions', region)}
                  />
                  <span>{toTitleCase(region)}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="checkbox-matrix">
          <p className="matrix-label">Interconnect (optional)</p>
          {availableInterconnects.length === 0 ? (
            <span className="field-hint">
              {pricingLoading
                ? 'Loading interconnect capability map...'
                : 'No interconnect metadata available for current filter.'}
            </span>
          ) : (
            <div className="pill-grid">
              {availableInterconnects.map((interconnect) => (
                <label key={interconnect} className="pill-option">
                  <input
                    type="checkbox"
                    checked={value.target_interconnects.includes(interconnect)}
                    onChange={() => toggleArrayValue('target_interconnects', interconnect)}
                  />
                  <span>
                    {interconnect === INTERCONNECT_UNKNOWN
                      ? 'Unknown'
                      : interconnect.toUpperCase()}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <label className="field">
          <span>Instance types (optional)</span>
          <select
            multiple
            size={Math.min(8, Math.max(3, availableInstanceTypes.length))}
            value={value.target_instance_types}
            onChange={(event) => {
              const selected = Array.from(event.target.selectedOptions).map((option) => option.value)
              patchField('target_instance_types', selected)
            }}
          >
            {availableInstanceTypes.map((instanceType) => (
              <option key={instanceType} value={instanceType}>
                {instanceType}
              </option>
            ))}
          </select>
          <span className="field-hint">
            Hold Cmd/Ctrl for multi-select. Options are constrained to selected providers/GPUs/GPU count.
          </span>
        </label>
      </fieldset>

      <button
        type="button"
        className="advanced-toggle"
        onClick={() => setAdvancedOpen((open) => !open)}
      >
        {advancedOpen ? 'Hide Advanced Parameters' : 'Show Advanced Parameters'}
      </button>

      {advancedOpen && (
        <fieldset className="panel-section advanced-section">
          <legend>Advanced</legend>

          <div className="field-grid field-grid-2">
            <label className="field">
              <span>LoRA rank</span>
              <input
                type="number"
                min={1}
                step={1}
                value={value.lora_rank}
                onChange={(event) => {
                  patchField('lora_rank', parsePositiveInteger(event.target.value, value.lora_rank))
                }}
              />
            </label>

            <label className="field">
              <span>LoRA alpha</span>
              <input
                type="number"
                min={1}
                step={1}
                value={value.lora_alpha}
                onChange={(event) => {
                  patchField('lora_alpha', parsePositiveInteger(event.target.value, value.lora_alpha))
                }}
              />
            </label>

            <label className="field">
              <span>Learning rate</span>
              <input
                type="number"
                min={0}
                step={0.00001}
                value={value.learning_rate}
                onChange={(event) => {
                  patchField('learning_rate', Math.max(0, parseNumber(event.target.value, value.learning_rate)))
                }}
              />
            </label>

            <label className="field">
              <span>Warmup ratio</span>
              <input
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={value.warmup_ratio}
                onChange={(event) => {
                  const next = Math.min(1, Math.max(0, parseNumber(event.target.value, value.warmup_ratio)))
                  patchField('warmup_ratio', next)
                }}
              />
            </label>

            <label className="field">
              <span>Optimizer</span>
              <select
                value={value.optimizer}
                onChange={(event) => {
                  patchField('optimizer', event.target.value as Optimizer)
                }}
              >
                {OPTIMIZER_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>LR scheduler</span>
              <select
                value={value.lr_scheduler}
                onChange={(event) => {
                  patchField('lr_scheduler', event.target.value as LRScheduler)
                }}
              >
                {LR_SCHEDULER_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Precision</span>
              <select
                value={value.precision}
                onChange={(event) => {
                  patchField('precision', event.target.value as Precision)
                }}
              >
                {PRECISION_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Unsloth version</span>
              <input
                type="text"
                value={value.unsloth_version}
                onChange={(event) => {
                  patchField('unsloth_version', event.target.value)
                }}
              />
            </label>

            <label className="field">
              <span>Dataset rows (optional)</span>
              <input
                type="number"
                min={1}
                step={1}
                value={value.dataset_rows ?? ''}
                onChange={(event) => {
                  const raw = event.target.value.trim()
                  if (raw.length === 0) {
                    patchField('dataset_rows', null)
                    return
                  }

                  const parsed = Number(raw)
                  patchField('dataset_rows', Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : null)
                }}
              />
            </label>

            <label className="field">
              <span>Avg tokens / row</span>
              <input
                type="number"
                min={1}
                step={1}
                value={value.avg_tokens_per_row}
                onChange={(event) => {
                  patchField(
                    'avg_tokens_per_row',
                    parsePositiveInteger(event.target.value, value.avg_tokens_per_row),
                  )
                }}
              />
            </label>

            <label className="field">
              <span>Min VRAM GB (optional)</span>
              <input
                type="number"
                min={1}
                step={1}
                value={value.min_vram_gb ?? ''}
                onChange={(event) => {
                  const raw = event.target.value.trim()
                  if (raw.length === 0) {
                    patchField('min_vram_gb', null)
                    return
                  }

                  const parsed = Number(raw)
                  patchField('min_vram_gb', Number.isFinite(parsed) ? Math.max(1, parsed) : null)
                }}
              />
            </label>

            <label className="field">
              <span>Reward model size (B)</span>
              <input
                type="number"
                min={0}
                step={0.1}
                value={value.reward_model_size ?? ''}
                onChange={(event) => {
                  const raw = event.target.value.trim()
                  if (raw.length === 0) {
                    patchField('reward_model_size', null)
                    return
                  }

                  const parsed = Number(raw)
                  patchField('reward_model_size', Number.isFinite(parsed) ? Math.max(0, parsed) : null)
                }}
              />
            </label>

            <label className="field">
              <span>GRPO generations</span>
              <input
                type="number"
                min={1}
                step={1}
                value={value.grpo_num_generations}
                onChange={(event) => {
                  patchField(
                    'grpo_num_generations',
                    parsePositiveInteger(event.target.value, value.grpo_num_generations),
                  )
                }}
              />
            </label>

            <label className="field">
              <span>vLLM batch size</span>
              <input
                type="number"
                min={1}
                step={1}
                value={value.vllm_batch_size}
                onChange={(event) => {
                  patchField(
                    'vllm_batch_size',
                    parsePositiveInteger(event.target.value, value.vllm_batch_size),
                  )
                }}
              />
            </label>

            <label className="field">
              <span>Number of runs</span>
              <input
                type="number"
                min={1}
                step={1}
                value={value.num_runs}
                onChange={(event) => {
                  patchField('num_runs', parsePositiveInteger(event.target.value, value.num_runs))
                }}
              />
            </label>
          </div>

          <div className="checkbox-matrix">
            <p className="matrix-label">LoRA target modules</p>
            <div className="pill-grid">
              {LORA_TARGET_MODULE_OPTIONS.map((module) => (
                <label key={module} className="pill-option">
                  <input
                    type="checkbox"
                    checked={value.lora_target_modules.includes(module)}
                    onChange={() => toggleArrayValue('lora_target_modules', module)}
                  />
                  <span>{module}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="toggle-grid">
            <label className="switch-field">
              <input
                type="checkbox"
                checked={value.use_gradient_checkpointing}
                onChange={(event) => {
                  patchField('use_gradient_checkpointing', event.target.checked)
                }}
              />
              <span>Gradient checkpointing</span>
            </label>

            <label className="switch-field">
              <input
                type="checkbox"
                checked={value.use_flash_attention}
                onChange={(event) => {
                  patchField('use_flash_attention', event.target.checked)
                }}
              />
              <span>Flash attention</span>
            </label>

            <label className="switch-field">
              <input
                type="checkbox"
                checked={value.use_triton_kernels}
                onChange={(event) => {
                  patchField('use_triton_kernels', event.target.checked)
                }}
              />
              <span>Triton kernels</span>
            </label>

            <label className="switch-field">
              <input
                type="checkbox"
                checked={value.use_rope_kernels}
                onChange={(event) => {
                  patchField('use_rope_kernels', event.target.checked)
                }}
              />
              <span>RoPE kernels</span>
            </label>

            <label className="switch-field">
              <input
                type="checkbox"
                checked={value.use_packing}
                onChange={(event) => {
                  patchField('use_packing', event.target.checked)
                }}
              />
              <span>Use packing</span>
            </label>

            <label className="switch-field">
              <input
                type="checkbox"
                checked={value.packing}
                onChange={(event) => {
                  patchField('packing', event.target.checked)
                }}
              />
              <span>Packing enabled</span>
            </label>

            <label className="switch-field">
              <input
                type="checkbox"
                checked={value.full_finetuning}
                onChange={(event) => {
                  patchField('full_finetuning', event.target.checked)
                }}
              />
              <span>Full finetuning mode</span>
            </label>
          </div>
        </fieldset>
      )}
    </section>
  )
}
