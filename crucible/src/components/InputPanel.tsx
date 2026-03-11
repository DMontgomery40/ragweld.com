import { useCallback, useEffect, useMemo, useRef, useState, type FocusEvent, type ReactNode } from 'react'
import { INPUT_PANEL_HELP, type CrucibleHelpCard } from '../help/inputPanelHelp'
import { resolveGPUType } from '../engine/gpu-specs'
import {
  defaultQATSchemeForBits,
  isQATTargetBits,
  normalizeQATSchemeForBits,
  qatSchemesForBits,
} from '../engine/quantization'
import type {
  Architecture,
  EstimateRequest,
  EstimateResponse,
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
  QuantizationProfile,
  TrainingType,
  WorkflowMode,
} from '../types'

interface InputPanelProps {
  value: EstimateRequest
  onChange: (patch: Partial<EstimateRequest>) => void
  estimate: EstimateResponse | null
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

interface MultiSelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface MultiSelectMatrixProps {
  label: ReactNode
  options: MultiSelectOption[]
  selectedValues: string[]
  onChange: (nextValues: string[]) => void
  emptyHint?: string
  helperText?: string
  noneLabel?: string
  allowEmpty?: boolean
  searchPlaceholder?: string
  dropdownThreshold?: number
}

const METHOD_OPTIONS: FineTuneMethod[] = ['Full Fine-Tune', 'LoRA', 'QLoRA']
const ARCHITECTURE_OPTIONS: Architecture[] = ['Dense', 'MoE']
const TRAINING_TYPE_OPTIONS: TrainingType[] = ['SFT', 'GRPO', 'GSPO', 'DPO', 'PPO', 'ORPO', 'SimPO']
const QUANTIZATION_OPTIONS: QuantizationBits[] = [4, 8, 16, 32]
const FOUR_BIT_QUANTIZATION_PROFILES: QuantizationProfile[] = [
  'nf4',
  'fp4',
  'mxfp4',
  'dynamic_4bit',
  'dynamic_2_0',
]
const NON_FOUR_BIT_PROFILE_BY_BITS: Record<Exclude<QuantizationBits, 4>, QuantizationProfile> = {
  8: 'int8',
  16: 'int16',
  32: 'int32',
}
const FRAMEWORK_OPTIONS: Framework[] = [
  'Unsloth',
  'HuggingFace+TRL',
  'Axolotl',
  'LLaMA-Factory',
  'torchtune',
  'Custom',
]
const WORKFLOW_MODE_OPTIONS: WorkflowMode[] = ['guided', 'custom_pipeline']
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
const DROPDOWN_THRESHOLD = 5
const MODEL_PROFILES: ModelProfile[] = [
  {
    id: 'qwen3-32b',
    label: 'Qwen3 32B',
    params: 29.72,
    architecture: 'Dense',
    moeTotal: 1,
    moeActive: 1,
  },
  {
    id: 'deepseek-r1-distill-qwen-32b',
    label: 'DeepSeek R1 Distill Qwen 32B',
    params: 32.76,
    architecture: 'Dense',
    moeTotal: 1,
    moeActive: 1,
  },
  {
    id: 'qwen3.5-35b-a3b',
    label: 'Qwen3.5 35B A3B',
    params: 35.95,
    architecture: 'MoE',
    moeTotal: 256,
    moeActive: 8,
  },
  {
    id: 'deepseek-v3-0324',
    label: 'DeepSeek V3 0324',
    params: 37.64,
    architecture: 'MoE',
    moeTotal: 256,
    moeActive: 8,
  },
  {
    id: 'llama-4-scout-17b-16e-instruct',
    label: 'Llama 4 Scout 17B 16E',
    params: 108.64,
    architecture: 'MoE',
    moeTotal: 16,
    moeActive: 1,
  },
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

function hasTierPrice(row: ProviderPricing, tier: PricingTier): boolean {
  if (tier === 'on_demand') {
    return row.hourly_price_cents > 0
  }

  if (tier === 'spot') {
    return typeof row.spot_price_cents === 'number' && Number.isFinite(row.spot_price_cents) && row.spot_price_cents > 0
  }

  if (tier === 'reserved_1mo') {
    return (
      typeof row.reserved_1mo_price_cents === 'number' &&
      Number.isFinite(row.reserved_1mo_price_cents) &&
      row.reserved_1mo_price_cents > 0
    )
  }

  return (
    typeof row.reserved_3mo_price_cents === 'number' &&
    Number.isFinite(row.reserved_3mo_price_cents) &&
    row.reserved_3mo_price_cents > 0
  )
}

function normalizeGpuOption(value: string): string {
  const resolved = resolveGPUType(value)
  return normalizeLower(resolved ?? value)
}

function defaultQuantizationProfile(bits: QuantizationBits): QuantizationProfile {
  if (bits === 4) {
    return 'nf4'
  }
  return NON_FOUR_BIT_PROFILE_BY_BITS[bits]
}

function quantizationProfilesForBits(bits: QuantizationBits): QuantizationProfile[] {
  if (bits === 4) {
    return FOUR_BIT_QUANTIZATION_PROFILES
  }
  return [defaultQuantizationProfile(bits)]
}

function formatQuantizationProfileLabel(profile: QuantizationProfile): string {
  switch (profile) {
    case 'nf4':
      return 'NF4 (QLoRA default)'
    case 'fp4':
      return 'FP4'
    case 'mxfp4':
      return 'MXFP4 (Blackwell-class)'
    case 'dynamic_4bit':
      return 'Dynamic 4-bit'
    case 'dynamic_2_0':
      return 'Dynamic 2.0 (GGUF)'
    case 'int8':
      return 'INT8'
    case 'int16':
      return 'INT16'
    case 'int32':
      return 'INT32'
    default:
      return profile
  }
}

function formatSupportTierLabel(tier: EstimateResponse['support_tier'] | undefined): string {
  switch (tier) {
    case 'documented':
      return 'Documented'
    case 'inferred':
      return 'Inferred'
    case 'custom':
      return 'Custom'
    default:
      return 'Unknown'
  }
}

function formatUnknownValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(', ')
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  if (value === null || value === undefined || value === '') {
    return 'none'
  }
  return String(value)
}

function formatQATSchemeLabel(scheme: EstimateRequest['qat_scheme']): string {
  switch (scheme) {
    case 'fp8-int4':
      return 'FP8 -> INT4'
    case 'fp8-fp8':
      return 'FP8 -> FP8'
    case 'int8-int4':
      return 'INT8 -> INT4'
    case 'int4':
      return 'INT4'
    default:
      return scheme
  }
}

function formatWorkflowModeLabel(mode: WorkflowMode): string {
  return mode === 'guided' ? 'Guided / documented path' : 'Custom pipeline'
}

interface HelpLabelProps {
  text: string
  tooltip: CrucibleHelpCard | TooltipSpec | string
}

interface TooltipBadge {
  text: string
  className?: 'info' | 'warn' | 'warning' | 'err' | 'reindex' | 'ok' | 'success' | 'security'
}

interface TooltipLink {
  href: string
  text: string
}

interface TooltipSection {
  title: string
  bullets: string[]
}

interface TooltipSpec {
  title?: string
  body?: string
  bodyHtml?: string
  badges?: TooltipBadge[]
  links?: TooltipLink[]
  sections?: TooltipSection[]
}

function isCrucibleHelpCard(value: TooltipSpec | CrucibleHelpCard | string): value is CrucibleHelpCard {
  return typeof value === 'object' && value !== null && 'id' in value && 'short' in value
}

function cardToTooltipSpec(card: CrucibleHelpCard): TooltipSpec {
  return {
    title: card.title,
    body: card.short,
    badges: card.badges?.map((badge) => ({
      text: badge.text,
      className: badge.tone,
    })),
    sections: card.sections?.map((section) => ({
      title: section.title,
      bullets: section.bullets,
    })),
    links: card.sources?.map((source) => ({
      text: source.title,
      href: source.href,
    })),
  }
}

function normalizeTooltip(text: string, tooltip: CrucibleHelpCard | TooltipSpec | string): TooltipSpec {
  if (typeof tooltip === 'string') {
    return {
      title: text,
      body: tooltip,
    }
  }

  if (isCrucibleHelpCard(tooltip)) {
    return cardToTooltipSpec(tooltip)
  }

  return {
    title: tooltip.title ?? text,
    body: tooltip.body,
    bodyHtml: tooltip.bodyHtml,
    badges: tooltip.badges,
    sections: tooltip.sections,
    links: tooltip.links,
  }
}

function TooltipMark({ label, tooltip }: { label: string; tooltip: CrucibleHelpCard | TooltipSpec | string }) {
  const spec = normalizeTooltip(label, tooltip)
  const [pinnedOpen, setPinnedOpen] = useState(false)
  const wrapperRef = useRef<HTMLSpanElement | null>(null)

  const handleBlur = useCallback((event: FocusEvent<HTMLSpanElement>) => {
    if (event.relatedTarget instanceof Node && wrapperRef.current?.contains(event.relatedTarget)) {
      return
    }
    setPinnedOpen(false)
  }, [])

  return (
    <span
      ref={wrapperRef}
      className="inline-tooltip"
      data-open={pinnedOpen ? 'true' : 'false'}
      onBlur={handleBlur}
    >
      <button
        type="button"
        className="inline-tooltip-button"
        aria-label={`${label} help`}
        aria-expanded={pinnedOpen}
        onMouseDown={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setPinnedOpen((current) => !current)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setPinnedOpen(false)
            event.currentTarget.blur()
          }
        }}
      >
        <span className="inline-tooltip-mark">?</span>
      </button>
      <span className="inline-tooltip-content tooltip-content" role="tooltip">
        <span className="tt-title">{spec.title}</span>
        {spec.badges && spec.badges.length > 0 ? (
          <span className="tt-badges">
            {spec.badges.map((badge) => (
              <span key={`${badge.className ?? 'default'}-${badge.text}`} className={`tt-badge ${badge.className ?? ''}`}>
                {badge.text}
              </span>
            ))}
          </span>
        ) : null}
        {spec.bodyHtml ? (
          <span className="tt-body" dangerouslySetInnerHTML={{ __html: spec.bodyHtml }} />
        ) : (
          <span className="tt-body">{spec.body}</span>
        )}
        {spec.sections && spec.sections.length > 0 ? (
          <span className="tt-sections">
            {spec.sections.map((section) => (
              <span key={section.title} className="tt-section">
                <span className="tt-section-title">{section.title}</span>
                <ul className="tt-list">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </span>
            ))}
          </span>
        ) : null}
        {spec.links && spec.links.length > 0 ? (
          <span className="tt-links-block">
            <span className="tt-links-title">Sources</span>
            <span className="tt-links">
            {spec.links.map((link) => (
              <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">
                {link.text}
              </a>
            ))}
            </span>
          </span>
        ) : null}
      </span>
    </span>
  )
}

function HelpLabel({ text, tooltip }: HelpLabelProps) {
  return (
    <span className="field-label">
      <span>{text}</span>
      <TooltipMark label={text} tooltip={tooltip} />
    </span>
  )
}

function MultiSelectMatrix({
  label,
  options,
  selectedValues,
  onChange,
  emptyHint,
  helperText,
  noneLabel = 'None selected',
  allowEmpty = true,
  searchPlaceholder = 'Filter options',
  dropdownThreshold = DROPDOWN_THRESHOLD,
}: MultiSelectMatrixProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues])
  const selectedLabels = useMemo(
    () => options.filter((option) => selectedSet.has(option.value)).map((option) => option.label),
    [options, selectedSet],
  )

  const normalizedSearch = search.trim().toLowerCase()
  const filteredOptions = useMemo(() => {
    const visibleOptions = normalizedSearch
      ? options.filter((option) => {
          return (
            option.label.toLowerCase().includes(normalizedSearch) ||
            option.value.toLowerCase().includes(normalizedSearch)
          )
        })
      : options

    return [...visibleOptions].sort((left, right) => {
      const leftSelected = selectedSet.has(left.value) ? 1 : 0
      const rightSelected = selectedSet.has(right.value) ? 1 : 0
      if (leftSelected !== rightSelected) {
        return rightSelected - leftSelected
      }
      return left.label.localeCompare(right.label)
    })
  }, [normalizedSearch, options, selectedSet])

  const selectedCount = selectedLabels.length
  const useDropdown = options.length > dropdownThreshold
  const canClear = allowEmpty ? selectedCount > 0 : selectedCount > 1
  const canSelectVisible = filteredOptions.some((option) => {
    return !option.disabled && !selectedSet.has(option.value)
  })

  const applyToggle = useCallback(
    (optionValue: string) => {
      const isSelected = selectedSet.has(optionValue)
      if (isSelected && !allowEmpty && selectedValues.length <= 1) {
        return
      }

      if (isSelected) {
        onChange(selectedValues.filter((value) => value !== optionValue))
        return
      }

      onChange([...selectedValues, optionValue])
    },
    [allowEmpty, onChange, selectedSet, selectedValues],
  )

  const clearSelection = useCallback(() => {
    if (!canClear) {
      return
    }
    if (!allowEmpty && selectedValues.length > 0) {
      onChange([selectedValues[0]])
      return
    }
    onChange([])
  }, [allowEmpty, canClear, onChange, selectedValues])

  const selectVisible = useCallback(() => {
    if (!canSelectVisible) {
      return
    }

    const nextSet = new Set(selectedValues)
    for (const option of filteredOptions) {
      if (!option.disabled) {
        nextSet.add(option.value)
      }
    }
    onChange(options.filter((option) => nextSet.has(option.value)).map((option) => option.value))
  }, [canSelectVisible, filteredOptions, onChange, options, selectedValues])

  const summaryText =
    selectedCount === 0
      ? noneLabel
      : selectedCount <= 2
        ? selectedLabels.join(' / ')
        : `${selectedLabels.slice(0, 2).join(' / ')} +${selectedCount - 2} more`

  return (
    <div className="checkbox-matrix">
      <div className="matrix-label">{label}</div>
      {options.length === 0 ? (
        <span className="field-hint">{emptyHint ?? 'No options available for the current filter.'}</span>
      ) : useDropdown ? (
        <div className="multi-select-dropdown">
          <button
            type="button"
            className="multi-select-trigger"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            <span className="multi-select-trigger-main">{summaryText}</span>
            <span className="multi-select-trigger-meta">{`${selectedCount}/${options.length}`}</span>
          </button>

          {open ? (
            <div className="multi-select-panel">
              <div className="multi-select-toolbar">
                <input
                  type="text"
                  value={search}
                  placeholder={searchPlaceholder}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <div className="multi-select-actions">
                  <button
                    type="button"
                    className="multi-select-action"
                    disabled={!canSelectVisible}
                    onClick={selectVisible}
                  >
                    All visible
                  </button>
                  <button
                    type="button"
                    className="multi-select-action"
                    disabled={!canClear}
                    onClick={clearSelection}
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="multi-select-list">
                {filteredOptions.length === 0 ? (
                  <p className="multi-select-empty">No matches for the current filter.</p>
                ) : (
                  filteredOptions.map((option) => (
                    <label
                      key={option.value}
                      className={`multi-select-option-row ${selectedSet.has(option.value) ? 'selected' : ''} ${
                        option.disabled ? 'disabled' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedSet.has(option.value)}
                        disabled={option.disabled}
                        onChange={() => applyToggle(option.value)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="pill-grid">
          {options.map((option) => (
            <label key={option.value} className="pill-option">
              <input
                type="checkbox"
                checked={selectedSet.has(option.value)}
                disabled={option.disabled}
                onChange={() => applyToggle(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      )}
      {helperText ? <span className="field-hint">{helperText}</span> : null}
    </div>
  )
}

export function InputPanel({
  value,
  onChange,
  estimate,
  pricing,
  pricingLoading,
  onResolveModel,
  modelResolveLoading,
  modelResolveError,
  modelResolveMessage,
}: InputPanelProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [modelReference, setModelReference] = useState('')
  const [sectionOpen, setSectionOpen] = useState({ model: true, dataset: true, hardware: true })

  const toggleSection = useCallback((key: 'model' | 'dataset' | 'hardware') => {
    setSectionOpen((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const patchField = useCallback(
    <K extends keyof EstimateRequest>(key: K, next: EstimateRequest[K]) => {
      onChange({ [key]: next } as Pick<EstimateRequest, K>)
    },
    [onChange],
  )

  const patchArrayField = useCallback(
    <
      K extends
        | 'target_gpu'
        | 'target_providers'
        | 'pricing_tier'
        | 'lora_target_modules'
        | 'target_regions'
        | 'target_interconnects'
        | 'target_instance_types',
    >(key: K, nextValues: string[]) => {
      patchField(key, nextValues as EstimateRequest[K])
    },
    [patchField],
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
    return providerGpuRows.filter((row) => row.num_gpus * value.num_nodes === value.num_gpus)
  }, [providerGpuRows, value.num_gpus, value.num_nodes])

  const tierScopeRows = useMemo(() => {
    if (providerGpuCountRows.length > 0) {
      return providerGpuCountRows
    }
    if (providerGpuRows.length > 0) {
      return providerGpuRows
    }
    if (providerRows.length > 0) {
      return providerRows
    }
    return pricing
  }, [pricing, providerGpuCountRows, providerGpuRows, providerRows])

  const pricingTierCoverage = useMemo(() => {
    return PRICING_TIER_OPTIONS.reduce<Record<PricingTier, number>>(
      (acc, tier) => {
        acc[tier] = tierScopeRows.filter((row) => hasTierPrice(row, tier)).length
        return acc
      },
      {
        on_demand: 0,
        spot: 0,
        reserved_1mo: 0,
        reserved_3mo: 0,
      },
    )
  }, [tierScopeRows])

  const unsupportedSelectedPricingTiers = useMemo(() => {
    return value.pricing_tier.filter((tier) => pricingTierCoverage[tier] === 0)
  }, [pricingTierCoverage, value.pricing_tier])

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
      return [1, 2, 4, 8].map((count) => count * value.num_nodes)
    }
    return Array.from(new Set(sourceRows.map((row) => row.num_gpus * value.num_nodes))).sort(
      (left, right) => left - right,
    )
  }, [providerGpuRows, providerRows, value.num_nodes])

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

  const gpuFamilyOptions = useMemo<MultiSelectOption[]>(() => {
    return availableGpuFamilies.map((gpu) => ({
      value: gpu,
      label: gpu.replaceAll('_', ' '),
    }))
  }, [availableGpuFamilies])

  const pricingTierOptions = useMemo<MultiSelectOption[]>(() => {
    return PRICING_TIER_OPTIONS.map((tier) => ({
      value: tier,
      label: `${formatPricingTierLabel(tier)} (${pricingTierCoverage[tier]})`,
    }))
  }, [pricingTierCoverage])

  const providerOptions = useMemo<MultiSelectOption[]>(() => {
    return availableProviders.map((provider) => ({
      value: provider,
      label: provider,
    }))
  }, [availableProviders])

  const regionOptions = useMemo<MultiSelectOption[]>(() => {
    return availableRegions.map((region) => ({
      value: region,
      label: toTitleCase(region),
    }))
  }, [availableRegions])

  const interconnectOptions = useMemo<MultiSelectOption[]>(() => {
    return availableInterconnects.map((interconnect) => ({
      value: interconnect,
      label: interconnect === INTERCONNECT_UNKNOWN ? 'Unknown' : interconnect.toUpperCase(),
    }))
  }, [availableInterconnects])

  const instanceTypeOptions = useMemo<MultiSelectOption[]>(() => {
    return availableInstanceTypes.map((instanceType) => ({
      value: instanceType,
      label: instanceType,
    }))
  }, [availableInstanceTypes])

  const loraTargetOptions = useMemo<MultiSelectOption[]>(() => {
    return LORA_TARGET_MODULE_OPTIONS.map((module) => ({
      value: module,
      label: module,
    }))
  }, [])

  const quantizationProfileOptions = useMemo<MultiSelectOption[]>(() => {
    return quantizationProfilesForBits(value.quantization_bits).map((profile) => ({
      value: profile,
      label: formatQuantizationProfileLabel(profile),
    }))
  }, [value.quantization_bits])

  const qatSchemeOptions = useMemo<MultiSelectOption[]>(() => {
    return qatSchemesForBits(value.quantization_bits).map((scheme) => ({
      value: scheme,
      label: formatQATSchemeLabel(scheme),
    }))
  }, [value.quantization_bits])

  const isQATTargetPrecision = useMemo(() => {
    return isQATTargetBits(value.quantization_bits)
  }, [value.quantization_bits])

  const showQuantizationProfile = value.quantization_bits === 4 && !value.use_qat

  const selectedModelPreset = useMemo(() => {
    const selected = MODEL_PROFILES.find((profile) => profile.id === value.model_name)
    return selected?.id ?? 'custom'
  }, [value.model_name])

  const normalizationsByField = useMemo(() => {
    const next = new Map<string, EstimateResponse['normalizations']>()
    for (const event of estimate?.normalizations ?? []) {
      const existing = next.get(event.field) ?? []
      existing.push(event)
      next.set(event.field, existing)
    }
    return next
  }, [estimate?.normalizations])

  const workflowSupportSummary = useMemo(() => {
    return estimate?.support_reasons[0]?.reason ?? null
  }, [estimate?.support_reasons])

  const selectionAdjustmentMessages = useMemo(() => {
    if (pricingLoading || pricing.length === 0) {
      return []
    }

    const messages: string[] = []

    const providerSet = new Set(availableProviders.map((provider) => normalizeLower(provider)))
    const gpuSet = new Set(availableGpuFamilies.map((gpu) => normalizeGpuOption(gpu)))
    const regionSet = new Set(availableRegions.map((region) => normalizeLower(region)))
    const interconnectSet = new Set(availableInterconnects.map((interconnect) => normalizeLower(interconnect)))
    const instanceTypeSet = new Set(availableInstanceTypes.map((instanceType) => normalizeLower(instanceType)))

    if (value.target_providers.some((provider) => !providerSet.has(normalizeLower(provider)))) {
      messages.push('Provider filters will be pruned because some selected providers are no longer present in the current pricing feed.')
    }
    if (value.target_gpu.some((gpu) => !gpuSet.has(normalizeGpuOption(gpu)))) {
      messages.push('GPU filters will be pruned because some selected GPU families are no longer present in the current pricing feed.')
    }
    if (value.target_regions.some((region) => !regionSet.has(normalizeLower(region)))) {
      messages.push('Region filters will be pruned because some selected regions are no longer available for the current provider/GPU scope.')
    }
    if (value.target_interconnects.some((interconnect) => !interconnectSet.has(normalizeLower(interconnect)))) {
      messages.push('Interconnect filters will be pruned because some selected modes are no longer available for the current provider/GPU scope.')
    }
    if (value.target_instance_types.some((instanceType) => !instanceTypeSet.has(normalizeLower(instanceType)))) {
      messages.push('Instance filters will be pruned because some selected instances are no longer available for the current provider/GPU scope.')
    }
    if (!availableGpuCounts.includes(value.num_gpus)) {
      messages.push(
        `Total GPU count will be normalized to ${availableGpuCounts[0] ?? value.num_gpus} to match the currently visible provider rows.`,
      )
    }

    return messages
  }, [
    availableGpuCounts,
    availableGpuFamilies,
    availableInstanceTypes,
    availableInterconnects,
    availableProviders,
    availableRegions,
    pricing.length,
    pricingLoading,
    value.num_gpus,
    value.target_gpu,
    value.target_instance_types,
    value.target_interconnects,
    value.target_providers,
    value.target_regions,
  ])

  useEffect(() => {
    if (pricingLoading || pricing.length === 0) {
      return
    }

    const providerSet = new Set(availableProviders.map((provider) => normalizeLower(provider)))
    const gpuSet = new Set(availableGpuFamilies.map((gpu) => normalizeGpuOption(gpu)))
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
    availableProviders,
    availableRegions,
    onChange,
    pricing.length,
    pricingLoading,
    value.num_gpus,
    value.target_gpu,
    value.target_instance_types,
    value.target_interconnects,
    value.target_providers,
    value.target_regions,
  ])

  useEffect(() => {
    if (!value.use_qat) {
      return
    }

    if (!isQATTargetPrecision) {
      onChange({ use_qat: false })
      return
    }

    const normalizedScheme = normalizeQATSchemeForBits(value.quantization_bits, value.qat_scheme)
    if (normalizedScheme && normalizedScheme !== value.qat_scheme) {
      onChange({ qat_scheme: normalizedScheme })
    }
  }, [
    isQATTargetPrecision,
    onChange,
    value.qat_scheme,
    value.quantization_bits,
    value.use_qat,
  ])

  return (
    <section className="card input-panel">
      <div className="section-head">
        <h2>Input Matrix</h2>
        <span className="section-meta">Debounced live estimate (300ms)</span>
      </div>

      {(estimate?.normalizations.length ?? 0) > 0 || selectionAdjustmentMessages.length > 0 ? (
        <div className="input-note-card">
          <h3>Effective Behavior</h3>
          {(estimate?.normalizations.length ?? 0) > 0 ? (
            <ul className="warnings-list compact-list">
              {estimate?.normalizations.map((event) => (
                <li key={`${event.rule_id}:${event.field}`}>
                  <strong>{event.field}</strong>: {formatUnknownValue(event.input)} to{' '}
                  {formatUnknownValue(event.normalized_to)}. {event.reason}
                </li>
              ))}
            </ul>
          ) : null}
          {selectionAdjustmentMessages.length > 0 ? (
            <ul className="warnings-list compact-list">
              {selectionAdjustmentMessages.map((message, index) => (
                <li key={`${message}-${index}`}>{message}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <fieldset className="panel-section">
        <legend
          className="section-toggle-legend"
          data-open={String(sectionOpen.model)}
          onClick={() => toggleSection('model')}
        >
          Model & Method
        </legend>
        <div className="section-body" data-open={String(sectionOpen.model)}>
        <div className="field">
          <HelpLabel text="Resolve from Hugging Face URL / repo id" tooltip={INPUT_PANEL_HELP.model.resolveReference} />
          <div className="inline-field-row">
            <input
              type="text"
              value={modelReference}
              placeholder="https://huggingface.co/Qwen/qwen3-32b or Qwen/qwen3-32b"
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
            <HelpLabel text="Model preset" tooltip={INPUT_PANEL_HELP.model.modelPreset} />
            <select
              value={selectedModelPreset}
              onChange={(event) => {
                const next = event.target.value
                if (next === 'custom') {
                  return
                }

                const selected = MODEL_PROFILES.find((profile) => profile.id === next)
                if (!selected) {
                  return
                }

                onChange({
                  model_name: selected.id,
                  model_hf_repo_id: '',
                  auto_resolve_model_metadata: true,
                  model_params_billions: selected.params,
                  model_active_params_billions: null,
                  architecture: selected.architecture,
                  moe_total_experts: selected.moeTotal,
                  moe_active_experts: selected.moeActive,
                  model_hidden_size: undefined,
                  model_num_layers: undefined,
                  model_num_attention_heads: undefined,
                  model_num_kv_heads: undefined,
                  model_intermediate_size: undefined,
                  model_vocab_size: undefined,
                  model_max_position_embeddings: undefined,
                  model_module_shapes: undefined,
                })
              }}
            >
              {MODEL_PROFILES.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.label}
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>
          </label>

          <label className="field">
            <HelpLabel text="Model id" tooltip={INPUT_PANEL_HELP.model.modelId} />
            <input
              type="text"
              value={value.model_name}
              onChange={(event) => {
                onChange({
                  model_name: event.target.value,
                  model_hf_repo_id: '',
                  auto_resolve_model_metadata: true,
                })
              }}
              placeholder="qwen3-32b or custom"
            />
            <span className="field-hint">
              Direct Hugging Face repo ids are auto-resolved during estimate. Resolve above is optional if you
              want the form fields filled immediately.
            </span>
          </label>

          <label className="field">
            <HelpLabel text="Model params (B)" tooltip={INPUT_PANEL_HELP.model.modelParams} />
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={value.model_params_billions}
              onChange={(event) => {
                onChange({
                  model_params_billions: Math.max(0.1, parseNumber(event.target.value, value.model_params_billions)),
                  auto_resolve_model_metadata: false,
                })
              }}
            />
          </label>

          <label className="field">
            <HelpLabel text="Active params / token (B)" tooltip={INPUT_PANEL_HELP.model.activeParams} />
            <input
              type="number"
              min={0}
              step={0.1}
              value={value.model_active_params_billions ?? ''}
              onChange={(event) => {
                const rawValue = event.target.value.trim()
                onChange({
                  model_active_params_billions:
                    rawValue.length === 0 ? null : Math.max(0, parseNumber(rawValue, value.model_params_billions)),
                  auto_resolve_model_metadata: false,
                })
              }}
              placeholder={value.architecture === 'MoE' ? 'e.g. 32' : 'optional'}
            />
            <span className="field-hint">
              Leave blank unless the model card publishes activated params per token. This changes
              compute/time only; total params still drive VRAM and model capacity.
            </span>
          </label>

          <label className="field">
            <HelpLabel text="Architecture" tooltip={INPUT_PANEL_HELP.model.architecture} />
            <select
              value={value.architecture}
              onChange={(event) => {
                onChange({
                  architecture: event.target.value as Architecture,
                  auto_resolve_model_metadata: false,
                })
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
            <HelpLabel text="Method" tooltip={INPUT_PANEL_HELP.model.method} />
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
            {normalizationsByField.get('method')?.map((event) => (
              <span key={`${event.rule_id}:${event.field}`} className="field-hint field-hint-warn">
                Effective method: {formatUnknownValue(event.normalized_to)}. {event.reason}
              </span>
            ))}
          </label>

          <label className="field">
            <HelpLabel
              text={value.use_qat ? 'Target weight precision' : 'Quantization (bit)'}
              tooltip={INPUT_PANEL_HELP.model.quantizationBits}
            />
            <select
              value={value.quantization_bits}
              onChange={(event) => {
                const nextBits = Number(event.target.value) as QuantizationBits
                const validProfiles = quantizationProfilesForBits(nextBits)
                const nextProfile = validProfiles.includes(value.quantization_profile)
                  ? value.quantization_profile
                  : defaultQuantizationProfile(nextBits)
                const patch: Partial<EstimateRequest> = {
                  quantization_bits: nextBits,
                  quantization_profile: nextProfile,
                }
                if (value.use_qat) {
                  if (!isQATTargetBits(nextBits)) {
                    patch.use_qat = false
                  } else {
                    patch.qat_scheme =
                      normalizeQATSchemeForBits(nextBits, value.qat_scheme) ??
                      defaultQATSchemeForBits(nextBits) ??
                      value.qat_scheme
                  }
                }
                onChange(patch)
              }}
            >
              {QUANTIZATION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}-bit
                </option>
              ))}
            </select>
            <span className="field-hint">
              {value.use_qat
                ? 'QAT uses this as the export target precision. The scheme selector below is filtered to match it.'
                : value.quantization_bits === 4
                  ? '4-bit keeps a separate profile selector because NF4/FP4-style paths differ materially.'
                  : '8/16/32-bit modes use a fixed planner profile, so there is no separate profile selector.'}
            </span>
            {normalizationsByField.get('quantization_bits')?.map((event) => (
              <span key={`${event.rule_id}:${event.field}`} className="field-hint field-hint-warn">
                Effective quantization: {formatUnknownValue(event.normalized_to)}. {event.reason}
              </span>
            ))}
          </label>

          {showQuantizationProfile ? (
            <label className="field">
              <HelpLabel text="Quantization profile" tooltip={INPUT_PANEL_HELP.model.quantizationProfile} />
              <select
                value={value.quantization_profile}
                onChange={(event) => {
                  patchField('quantization_profile', event.target.value as QuantizationProfile)
                }}
              >
                {quantizationProfileOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="field-hint">
                4-bit profiles model NF4/FP4-era differences. QAT schemes and higher precisions do
                not use a separate profile selector here.
              </span>
              {normalizationsByField.get('quantization_profile')?.map((event) => (
                <span key={`${event.rule_id}:${event.field}`} className="field-hint field-hint-warn">
                  Effective profile: {formatUnknownValue(event.normalized_to)}. {event.reason}
                </span>
              ))}
            </label>
          ) : null}

          <label className="field">
            <HelpLabel text="Use QAT" tooltip={INPUT_PANEL_HELP.model.useQat} />
            <input
              type="checkbox"
              checked={value.use_qat}
              disabled={!isQATTargetPrecision}
              onChange={(event) => {
                const nextUseQat = event.target.checked
                const patch: Partial<EstimateRequest> = {
                  use_qat: nextUseQat,
                }
                if (nextUseQat) {
                  patch.qat_scheme =
                    normalizeQATSchemeForBits(value.quantization_bits, value.qat_scheme) ??
                    defaultQATSchemeForBits(value.quantization_bits) ??
                    value.qat_scheme
                }
                onChange(patch)
              }}
            />
            <span className="field-hint">
              {isQATTargetPrecision
                ? 'Optional. Current source-backed planner paths cover 4-bit INT4 and 8-bit FP8-style export targets.'
                : 'QAT is disabled here for 16/32-bit targets because the current modeled workflows are 4-bit or 8-bit export paths.'}
            </span>
          </label>

          {value.use_qat ? (
            <label className="field">
              <HelpLabel text="QAT scheme" tooltip={INPUT_PANEL_HELP.model.qatScheme} />
              <select
                value={value.qat_scheme}
                disabled={!value.use_qat}
                onChange={(event) => {
                  patchField('qat_scheme', event.target.value as EstimateRequest['qat_scheme'])
                }}
              >
                {qatSchemeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="field-hint">
                {value.quantization_bits === 8
                  ? '8-bit QAT is modeled here as an FP8-style export path, so INT4-target schemes are hidden.'
                  : 'INT4-target QAT schemes stay available for 4-bit exports only.'}
              </span>
            </label>
          ) : null}

          <label className="field">
            <HelpLabel text="Framework" tooltip={INPUT_PANEL_HELP.model.framework} />
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

          <label className="field">
            <HelpLabel text="Workflow mode" tooltip={INPUT_PANEL_HELP.model.workflowMode} />
            <select
              value={value.workflow_mode}
              onChange={(event) => {
                patchField('workflow_mode', event.target.value as WorkflowMode)
              }}
            >
              {WORKFLOW_MODE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {formatWorkflowModeLabel(option)}
                </option>
              ))}
            </select>
            <span className="field-hint">
              Use Guided for notebook/local/Docker-style paths. Use Custom pipeline when you are hand-rolling infra, distributed setup, or provider integration.
            </span>
            {estimate ? (
              <span className="field-hint field-hint-warn">
                Current support: {formatSupportTierLabel(estimate.support_tier)}.{' '}
                {workflowSupportSummary ?? 'Workflow affects provider ranking and support confidence, not raw provider membership.'}
              </span>
            ) : null}
          </label>
        </div>

        {value.architecture === 'MoE' && (
          <div className="field-grid field-grid-2 conditional-grid">
            <label className="field">
              <HelpLabel text="Total experts" tooltip={INPUT_PANEL_HELP.model.totalExperts} />
              <input
                type="number"
                min={1}
                step={1}
                value={value.moe_total_experts}
                onChange={(event) => {
                  onChange({
                    moe_total_experts: parsePositiveInteger(event.target.value, value.moe_total_experts),
                    auto_resolve_model_metadata: false,
                  })
                }}
              />
            </label>

            <label className="field">
              <HelpLabel text="Active experts" tooltip={INPUT_PANEL_HELP.model.activeExperts} />
              <input
                type="number"
                min={1}
                step={1}
                value={value.moe_active_experts}
                onChange={(event) => {
                  onChange({
                    moe_active_experts: parsePositiveInteger(event.target.value, value.moe_active_experts),
                    auto_resolve_model_metadata: false,
                  })
                }}
              />
            </label>
          </div>
        )}
        </div>
      </fieldset>

      <fieldset className="panel-section">
        <legend
          className="section-toggle-legend"
          data-open={String(sectionOpen.dataset)}
          onClick={() => toggleSection('dataset')}
        >
          Dataset & Training
        </legend>
        <div className="section-body" data-open={String(sectionOpen.dataset)}>
        <div className="field-grid field-grid-2">
          <label className="field">
            <HelpLabel text="Dataset tokens" tooltip={INPUT_PANEL_HELP.dataset.datasetTokens} />
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
            <HelpLabel text="Epochs" tooltip={INPUT_PANEL_HELP.dataset.epochs} />
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
            <HelpLabel text="Batch size" tooltip={INPUT_PANEL_HELP.dataset.batchSize} />
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
            <HelpLabel text="Grad accumulation" tooltip={INPUT_PANEL_HELP.dataset.gradAccumulation} />
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
            <HelpLabel text="Max seq length" tooltip={INPUT_PANEL_HELP.dataset.maxSeqLength} />
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
            <HelpLabel text="Training type" tooltip={INPUT_PANEL_HELP.dataset.trainingType} />
            <select
              value={value.training_type}
              onChange={(event) => {
                const nextType = event.target.value as TrainingType
                const nextImportance =
                  nextType === 'GSPO' ? 'sequence' : nextType === 'GRPO' ? 'token' : value.importance_sampling_level
                onChange({ training_type: nextType, importance_sampling_level: nextImportance })
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
        </div>
      </fieldset>

      <fieldset className="panel-section">
        <legend
          className="section-toggle-legend"
          data-open={String(sectionOpen.hardware)}
          onClick={() => toggleSection('hardware')}
        >
          Hardware & Pricing
        </legend>
        <div className="section-body" data-open={String(sectionOpen.hardware)}>
        <div className="field-grid field-grid-2">
          <label className="field">
            <HelpLabel text="GPUs per run" tooltip={INPUT_PANEL_HELP.hardware.gpusPerRun} />
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
            <HelpLabel text="Nodes" tooltip={INPUT_PANEL_HELP.hardware.nodes} />
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

        <MultiSelectMatrix
          label={
            <HelpLabel text="Target GPU families" tooltip={INPUT_PANEL_HELP.hardware.targetGpuFamilies} />
          }
          options={gpuFamilyOptions}
          selectedValues={value.target_gpu}
          onChange={(nextValues) => {
            patchArrayField('target_gpu', nextValues)
          }}
          helperText="Leave blank to include all GPU families."
          searchPlaceholder="Filter GPU families"
        />

        <MultiSelectMatrix
          label={
            <HelpLabel text="Pricing tiers" tooltip={INPUT_PANEL_HELP.hardware.pricingTiers} />
          }
          options={pricingTierOptions}
          selectedValues={value.pricing_tier}
          onChange={(nextValues) => {
            patchArrayField('pricing_tier', nextValues)
          }}
          allowEmpty={false}
          helperText={
            unsupportedSelectedPricingTiers.length > 0
              ? `Selected tier(s) currently have no published prices: ${unsupportedSelectedPricingTiers
                  .map((tier) => formatPricingTierLabel(tier))
                  .join(', ')}. Estimates will return an explicit API error until filters or pricing source change.`
              : 'At least one tier must stay selected.'
          }
          searchPlaceholder="Filter pricing tiers"
        />

        <MultiSelectMatrix
          label={
            <HelpLabel text="Cloud providers (blank = all)" tooltip={INPUT_PANEL_HELP.hardware.cloudProviders} />
          }
          options={providerOptions}
          selectedValues={value.target_providers}
          onChange={(nextValues) => {
            patchArrayField('target_providers', nextValues)
          }}
          helperText="Leave blank to compare all providers in the current price feed."
          searchPlaceholder="Filter providers"
        />

        <MultiSelectMatrix
          label={
            <HelpLabel text="Regions (optional)" tooltip={INPUT_PANEL_HELP.hardware.regions} />
          }
          options={regionOptions}
          selectedValues={value.target_regions}
          onChange={(nextValues) => {
            patchArrayField('target_regions', nextValues)
          }}
          emptyHint={
            pricingLoading
              ? 'Loading region capability map from providers...'
              : 'No region metadata available for current provider filter.'
          }
          helperText="Leave blank to allow all regions."
          searchPlaceholder="Filter regions"
        />

        <MultiSelectMatrix
          label={
            <HelpLabel text="Interconnect (optional)" tooltip={INPUT_PANEL_HELP.hardware.interconnect} />
          }
          options={interconnectOptions}
          selectedValues={value.target_interconnects}
          onChange={(nextValues) => {
            patchArrayField('target_interconnects', nextValues)
          }}
          emptyHint={
            pricingLoading
              ? 'Loading interconnect capability map...'
              : 'No interconnect metadata available for current filter.'
          }
          helperText="Leave blank to include any interconnect."
          searchPlaceholder="Filter interconnect"
        />

        <MultiSelectMatrix
          label={
            <HelpLabel text="Instance types (optional)" tooltip={INPUT_PANEL_HELP.hardware.instanceTypes} />
          }
          options={instanceTypeOptions}
          selectedValues={value.target_instance_types}
          onChange={(nextValues) => {
            patchArrayField('target_instance_types', nextValues)
          }}
          emptyHint="No instance types found for current provider and GPU filters."
          helperText="Leave blank to include all instance types."
          searchPlaceholder="Filter instance types"
        />
        </div>
      </fieldset>

      <div className="advanced-toggle-row">
        <button
          type="button"
          className="advanced-toggle"
          onClick={() => setAdvancedOpen((open) => !open)}
        >
          {advancedOpen ? 'Hide Advanced Parameters' : 'Show Advanced Parameters'}
        </button>
        <TooltipMark
          label="Advanced parameters"
          tooltip={INPUT_PANEL_HELP.advanced.toggle}
        />
      </div>

      {advancedOpen && (
        <fieldset className="panel-section advanced-section">
          <legend>Advanced</legend>

          <div className="field-grid field-grid-2">
            <label className="field">
              <HelpLabel text="LoRA rank" tooltip={INPUT_PANEL_HELP.advanced.loraRank} />
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
              <HelpLabel text="LoRA alpha" tooltip={INPUT_PANEL_HELP.advanced.loraAlpha} />
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
              <HelpLabel text="Learning rate" tooltip={INPUT_PANEL_HELP.advanced.learningRate} />
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
              <HelpLabel text="Warmup ratio" tooltip={INPUT_PANEL_HELP.advanced.warmupRatio} />
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
              <HelpLabel text="Optimizer" tooltip={INPUT_PANEL_HELP.advanced.optimizer} />
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
              <HelpLabel text="LR scheduler" tooltip={INPUT_PANEL_HELP.advanced.lrScheduler} />
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
              <HelpLabel text="Precision" tooltip={INPUT_PANEL_HELP.advanced.precision} />
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
              <HelpLabel text="Unsloth version" tooltip={INPUT_PANEL_HELP.advanced.unslothVersion} />
              <input
                type="text"
                value={value.unsloth_version}
                onChange={(event) => {
                  patchField('unsloth_version', event.target.value)
                }}
              />
            </label>

            <label className="field">
              <HelpLabel text="Custom speed multiplier" tooltip={INPUT_PANEL_HELP.advanced.customSpeedMultiplier} />
              <input
                type="number"
                min={0.1}
                step={0.05}
                value={value.custom_speed_multiplier}
                onChange={(event) => {
                  const parsed = Number(event.target.value)
                  patchField(
                    'custom_speed_multiplier',
                    Number.isFinite(parsed) ? Math.max(0.1, parsed) : value.custom_speed_multiplier,
                  )
                }}
              />
            </label>

            <label className="field">
              <HelpLabel text="Dataset rows (optional)" tooltip={INPUT_PANEL_HELP.advanced.datasetRows} />
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
              <HelpLabel text="Avg tokens / row" tooltip={INPUT_PANEL_HELP.advanced.avgTokensPerRow} />
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
              <HelpLabel text="Min VRAM GB (optional)" tooltip={INPUT_PANEL_HELP.advanced.minVramGb} />
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
              <HelpLabel text="Reward model size (B)" tooltip={INPUT_PANEL_HELP.advanced.rewardModelSize} />
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
              <HelpLabel text="Importance sampling" tooltip={INPUT_PANEL_HELP.advanced.importanceSampling} />
              <select
                value={value.importance_sampling_level}
                disabled={value.training_type === 'GSPO'}
                onChange={(event) => {
                  patchField(
                    'importance_sampling_level',
                    event.target.value as EstimateRequest['importance_sampling_level'],
                  )
                }}
              >
                <option value="token">Token</option>
                <option value="sequence">Sequence</option>
              </select>
            </label>

            <label className="field">
              <HelpLabel text="Reference model (%)" tooltip={INPUT_PANEL_HELP.advanced.referenceModelPct} />
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={value.reference_model_pct}
                onChange={(event) => {
                  const parsed = Number(event.target.value)
                  patchField(
                    'reference_model_pct',
                    Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : value.reference_model_pct,
                  )
                }}
              />
            </label>

            <label className="field">
              <HelpLabel text="GRPO generations" tooltip={INPUT_PANEL_HELP.advanced.grpoGenerations} />
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
              <HelpLabel text="vLLM batch size" tooltip={INPUT_PANEL_HELP.advanced.vllmBatchSize} />
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
              <HelpLabel text="Number of runs" tooltip={INPUT_PANEL_HELP.advanced.numRuns} />
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

          <MultiSelectMatrix
            label={
              <HelpLabel text="LoRA target modules" tooltip={INPUT_PANEL_HELP.advanced.loraTargetModules} />
            }
            options={loraTargetOptions}
            selectedValues={value.lora_target_modules}
            onChange={(nextValues) => {
              patchArrayField('lora_target_modules', nextValues)
            }}
            allowEmpty={false}
            helperText="Select the modules to adapt."
            searchPlaceholder="Filter modules"
          />

          <div className="toggle-grid">
            <label className="switch-field">
              <input
                type="checkbox"
                checked={value.use_gradient_checkpointing}
                onChange={(event) => {
                  patchField('use_gradient_checkpointing', event.target.checked)
                }}
              />
              <span className="switch-field-copy">
                <span>Gradient checkpointing</span>
                <TooltipMark
                  label="Gradient checkpointing"
                  tooltip={INPUT_PANEL_HELP.advanced.gradientCheckpointing}
                />
              </span>
            </label>

            <label className="switch-field">
              <input
                type="checkbox"
                checked={value.use_flash_attention}
                onChange={(event) => {
                  patchField('use_flash_attention', event.target.checked)
                }}
              />
              <span className="switch-field-copy">
                <span>Flash attention</span>
                <TooltipMark
                  label="Flash attention"
                  tooltip={INPUT_PANEL_HELP.advanced.flashAttention}
                />
              </span>
            </label>

            <label className="switch-field">
              <input
                type="checkbox"
                checked={value.use_triton_kernels}
                onChange={(event) => {
                  patchField('use_triton_kernels', event.target.checked)
                }}
              />
              <span className="switch-field-copy">
                <span>Triton kernels</span>
                <TooltipMark
                  label="Triton kernels"
                  tooltip={INPUT_PANEL_HELP.advanced.tritonKernels}
                />
              </span>
            </label>

            <label className="switch-field">
              <input
                type="checkbox"
                checked={value.use_rope_kernels}
                onChange={(event) => {
                  patchField('use_rope_kernels', event.target.checked)
                }}
              />
              <span className="switch-field-copy">
                <span>RoPE kernels</span>
                <TooltipMark
                  label="RoPE kernels"
                  tooltip={INPUT_PANEL_HELP.advanced.ropeKernels}
                />
              </span>
            </label>

            <label className="switch-field">
              <input
                type="checkbox"
                checked={value.use_fused_chunked_ce_loss}
                onChange={(event) => {
                  patchField('use_fused_chunked_ce_loss', event.target.checked)
                }}
              />
              <span className="switch-field-copy">
                <span>Fused chunked CE</span>
                <TooltipMark
                  label="Fused chunked CE"
                  tooltip={INPUT_PANEL_HELP.advanced.fusedChunkedCe}
                />
              </span>
            </label>

            <label className="switch-field">
              <input
                type="checkbox"
                checked={value.use_faster_moe_kernels}
                disabled={value.architecture !== 'MoE'}
                onChange={(event) => {
                  patchField('use_faster_moe_kernels', event.target.checked)
                }}
              />
              <span className="switch-field-copy">
                <span>Faster MoE kernels</span>
                <TooltipMark
                  label="Faster MoE kernels"
                  tooltip={INPUT_PANEL_HELP.advanced.fasterMoeKernels}
                />
              </span>
            </label>

            <label className="switch-field">
              <input
                type="checkbox"
                checked={value.use_packing || value.packing}
                onChange={(event) => {
                  onChange({
                    use_packing: event.target.checked,
                    packing: event.target.checked,
                  })
                }}
              />
              <span className="switch-field-copy">
                <span>Sequence packing</span>
                <TooltipMark
                  label="Sequence packing"
                  tooltip={INPUT_PANEL_HELP.advanced.sequencePacking}
                />
              </span>
            </label>

            <label className="switch-field">
              <input
                type="checkbox"
                checked={value.full_finetuning}
                onChange={(event) => {
                  patchField('full_finetuning', event.target.checked)
                }}
              />
              <span className="switch-field-copy">
                <span>Full finetuning mode</span>
                <TooltipMark
                  label="Full finetuning mode"
                  tooltip={INPUT_PANEL_HELP.advanced.fullFinetuningMode}
                />
              </span>
            </label>
          </div>
          <span className="field-hint">
            Packing now drives both `use_packing` and `packing` so the control cannot become inert.
          </span>
          {normalizationsByField.get('full_finetuning')?.map((event) => (
            <span key={`${event.rule_id}:${event.field}`} className="field-hint field-hint-warn">
              Effective full-finetuning flag: {formatUnknownValue(event.normalized_to)}. {event.reason}
            </span>
          ))}
        </fieldset>
      )}
    </section>
  )
}
