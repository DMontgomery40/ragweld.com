import type {
  EstimateRequest,
  ModelFieldProvenance,
  ModelResolution,
  NormalizationEvent,
  ResolvedModelPayload,
} from '../../crucible/src/types/index'
import { getModelsCatalog } from './crucible-shared'

const HF_HOST = 'huggingface.co'
const MODEL_RESOLUTION_CACHE_TTL_MS = 6 * 60 * 60 * 1000

interface HuggingFaceModelInfo {
  id?: unknown
  safetensors?: {
    total?: unknown
  }
}

interface CatalogModelRecord {
  id?: unknown
  display_name?: unknown
  hf_repo_id?: unknown
  unsloth_model_id?: unknown
  params_billions?: unknown
  active_params_billions?: unknown
  hidden_size?: unknown
  num_layers?: unknown
  num_attention_heads?: unknown
  num_kv_heads?: unknown
  intermediate_size?: unknown
  vocab_size?: unknown
  max_position_embeddings?: unknown
  architecture?: unknown
  moe_total_experts?: unknown
  moe_active_experts?: unknown
  module_shapes?: unknown
  config_source?: unknown
}

interface ModelCardSummary {
  total_params_billions?: number
  active_params_billions?: number
  moe_total_experts?: number
  moe_active_experts?: number
}

interface ResolveModelOptions {
  preferCache?: boolean
}

interface HydratedEstimateRequestResult {
  request: EstimateRequest
  model_resolution: ModelResolution | null
  normalizations: NormalizationEvent[]
  warnings: string[]
}

interface CachedModelResolution {
  expiresAt: number
  resolution: ModelResolution
}

const modelResolutionCache = new Map<string, CachedModelResolution>()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return null
}

function asPositiveInt(value: unknown): number | null {
  const parsed = asNumber(value)
  if (parsed === null || parsed <= 0) {
    return null
  }
  return Math.trunc(parsed)
}

function slugify(repoId: string): string {
  return repoId.toLowerCase().replaceAll('/', '-').replaceAll('_', '-')
}

function humanizeName(repoId: string): string {
  const name = repoId.split('/').pop() ?? repoId
  return name
    .replaceAll('-', ' ')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase().replace(/[_\s/]+/g, '-')
}

function tryParseURL(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

export function parseHuggingFaceRepoId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }

  const url = tryParseURL(trimmed)
  if (url) {
    if (url.hostname !== HF_HOST) {
      return null
    }
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length < 2) {
      return null
    }
    if (parts[0] === 'models' && parts.length >= 3) {
      return `${parts[1]}/${parts[2]}`
    }
    return `${parts[0]}/${parts[1]}`
  }

  const candidate = trimmed.replace(/^hf:\/\//i, '')
  const parts = candidate.split('/').filter(Boolean)
  if (parts.length !== 2) {
    return null
  }
  return `${parts[0]}/${parts[1]}`
}

function kvHeadDim(hiddenSize: number, numAttentionHeads: number, numKVHeads: number): number {
  if (numAttentionHeads <= 0 || numKVHeads <= 0) {
    return hiddenSize
  }
  const ratio = hiddenSize / numAttentionHeads
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return hiddenSize
  }
  return Math.max(1, Math.round(ratio * numKVHeads))
}

export function estimateParamsBillions(input: {
  hiddenSize: number
  layers: number
  numAttentionHeads: number
  numKVHeads: number
  intermediateSize: number
  vocabSize: number
  architecture?: 'dense' | 'moe'
  moeTotalExperts?: number
  fromHub?: number | null
}): number {
  if (input.fromHub && input.fromHub > 0) {
    return Number((input.fromHub / 1e9).toFixed(2))
  }

  const kvOut = kvHeadDim(input.hiddenSize, input.numAttentionHeads, input.numKVHeads)
  const qProj = input.hiddenSize * input.hiddenSize
  const kProj = input.hiddenSize * kvOut
  const vProj = input.hiddenSize * kvOut
  const oProj = input.hiddenSize * input.hiddenSize
  const attention = qProj + kProj + vProj + oProj
  const mlp = 3 * input.hiddenSize * input.intermediateSize
  const expertMultiplier =
    input.architecture === 'moe' ? Math.max(1, Math.round(input.moeTotalExperts ?? 1)) : 1
  const router = input.architecture === 'moe' && expertMultiplier > 1 ? input.hiddenSize * expertMultiplier : 0
  const perLayer = attention + mlp * expertMultiplier + router
  const embedding = input.vocabSize * input.hiddenSize
  const totalParams = perLayer * input.layers + embedding
  return Number((totalParams / 1e9).toFixed(2))
}

function extractMaxPosition(config: Record<string, unknown>): number {
  const direct = asPositiveInt(config.max_position_embeddings)
  if (direct) {
    return direct
  }
  const nPositions = asPositiveInt(config.n_positions)
  if (nPositions) {
    return nPositions
  }
  const ropeScaling = config.rope_scaling
  if (isRecord(ropeScaling)) {
    const ropeMax = asPositiveInt(ropeScaling.original_max_position_embeddings)
    const ropeFactor = asNumber(ropeScaling.factor)
    if (ropeMax && ropeFactor && ropeFactor > 1) {
      return Math.round(ropeMax * ropeFactor)
    }
    if (ropeMax) {
      return ropeMax
    }
  }
  return 32768
}

function parseMagnitude(value: string): number | null {
  const normalized = value.replace(/,/g, '').trim().toLowerCase()
  const match = normalized.match(/([0-9]+(?:\.[0-9]+)?)\s*([kmbt])\b/)
  const wordMatch = normalized.match(
    /([0-9]+(?:\.[0-9]+)?)\s*(thousand|million|billion|trillion)\b/,
  )

  const base = Number(match?.[1] ?? wordMatch?.[1] ?? normalized)
  if (!Number.isFinite(base)) {
    return null
  }

  const suffix = match?.[2] ?? wordMatch?.[2]
  switch (suffix) {
    case 'k':
    case 'thousand':
      return base * 1e3
    case 'm':
    case 'million':
      return base * 1e6
    case 'b':
    case 'billion':
      return base * 1e9
    case 't':
    case 'trillion':
      return base * 1e12
    default:
      return base
  }
}

function parseMagnitudeToBillions(value: string): number | null {
  const parsed = parseMagnitude(value)
  if (parsed === null) {
    return null
  }
  return Number((parsed / 1e9).toFixed(2))
}

function extractMarkdownTableValue(markdown: string, label: string): string | null {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  const regex = new RegExp(
    `\\|\\s*(?:\\*\\*)?${escapedLabel}(?:\\*\\*)?\\s*\\|\\s*([^|\\n]+?)\\s*\\|`,
    'i',
  )
  const match = markdown.match(regex)
  return match ? match[1].replace(/[*_`]/g, '').trim() : null
}

function extractSentenceMagnitude(markdown: string, pattern: RegExp): number | null {
  const match = markdown.match(pattern)
  if (!match) {
    return null
  }
  return parseMagnitudeToBillions(match[1])
}

function parseModelCardSummary(markdown: string): ModelCardSummary {
  const totalFromTable = extractMarkdownTableValue(markdown, 'Total Parameters')
  const activeFromTable = extractMarkdownTableValue(markdown, 'Activated Parameters')
  const expertsFromTable = extractMarkdownTableValue(markdown, 'Number of Experts')
  const activeExpertsFromTable = extractMarkdownTableValue(markdown, 'Selected Experts per Token')

  const totalFromSentence = extractSentenceMagnitude(
    markdown,
    /with\s+[0-9.]+\s*(?:billion|b|trillion|t)\s+activated parameters\s+and\s+([0-9.]+\s*(?:billion|b|trillion|t))/i,
  )
  const activeFromSentence = extractSentenceMagnitude(
    markdown,
    /with\s+([0-9.]+\s*(?:billion|b|trillion|t))\s+activated parameters/i,
  )

  return {
    total_params_billions: totalFromTable ? parseMagnitudeToBillions(totalFromTable) ?? undefined : totalFromSentence ?? undefined,
    active_params_billions: activeFromTable ? parseMagnitudeToBillions(activeFromTable) ?? undefined : activeFromSentence ?? undefined,
    moe_total_experts: expertsFromTable ? asPositiveInt(expertsFromTable) ?? undefined : undefined,
    moe_active_experts: activeExpertsFromTable ? asPositiveInt(activeExpertsFromTable) ?? undefined : undefined,
  }
}

function buildModuleShapes(hiddenSize: number, intermediateSize: number, numAttentionHeads: number, numKVHeads: number) {
  const kvOut = kvHeadDim(hiddenSize, numAttentionHeads, numKVHeads)
  return {
    q: { in_dim: hiddenSize, out_dim: hiddenSize },
    k: { in_dim: hiddenSize, out_dim: kvOut },
    v: { in_dim: hiddenSize, out_dim: kvOut },
    o: { in_dim: hiddenSize, out_dim: hiddenSize },
    gate: { in_dim: hiddenSize, out_dim: intermediateSize },
    up: { in_dim: hiddenSize, out_dim: intermediateSize },
    down: { in_dim: intermediateSize, out_dim: hiddenSize },
  }
}

function addFieldProvenance(
  collection: ModelFieldProvenance[],
  field: string,
  source: ModelFieldProvenance['source'],
  sourceRef?: string | null,
  note?: string,
): void {
  collection.push({
    field,
    source,
    source_ref: sourceRef ?? null,
    note,
  })
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'crucible-model-resolver/2.0',
    },
  })

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) at ${url}`)
  }

  return response.json()
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/plain, text/markdown;q=0.9, */*;q=0.1',
      'User-Agent': 'crucible-model-resolver/2.0',
    },
  })

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) at ${url}`)
  }

  return response.text()
}

async function fetchConfig(repoId: string): Promise<{ config: Record<string, unknown>; source: string }> {
  const candidates = [
    `https://huggingface.co/${repoId}/raw/main/config.json`,
    `https://huggingface.co/${repoId}/resolve/main/config.json`,
  ]

  let lastError: unknown = null
  for (const candidate of candidates) {
    try {
      const payload = await fetchJson(candidate)
      if (!isRecord(payload)) {
        throw new Error('Model config response was not a JSON object.')
      }
      return { config: payload, source: candidate }
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unable to fetch model config from Hugging Face.')
}

async function fetchModelInfo(repoId: string): Promise<{ payload: HuggingFaceModelInfo | null; source: string | null }> {
  const source = `https://huggingface.co/api/models/${repoId}`
  try {
    const payload = await fetchJson(source)
    if (!isRecord(payload)) {
      return { payload: null, source }
    }
    return { payload: payload as HuggingFaceModelInfo, source }
  } catch {
    return { payload: null, source }
  }
}

async function fetchModelCard(repoId: string): Promise<{ markdown: string | null; source: string | null }> {
  const candidates = [
    `https://huggingface.co/${repoId}/raw/main/README.md`,
    `https://huggingface.co/${repoId}/resolve/main/README.md`,
  ]

  for (const candidate of candidates) {
    try {
      const markdown = await fetchText(candidate)
      return { markdown, source: candidate }
    } catch {
      continue
    }
  }

  return { markdown: null, source: null }
}

function buildResolvedModelFromCatalog(
  record: CatalogModelRecord | null,
  sourceInput: string,
): ModelResolution | null {
  if (!record) {
    return null
  }

  const id = typeof record.id === 'string' ? record.id : null
  const displayName = typeof record.display_name === 'string' ? record.display_name : null
  const repoId =
    (typeof record.hf_repo_id === 'string' && record.hf_repo_id.trim().length > 0 ? record.hf_repo_id : null) ??
    (typeof record.unsloth_model_id === 'string' && record.unsloth_model_id.trim().length > 0 ? record.unsloth_model_id : null)
  const paramsBillions = asNumber(record.params_billions)
  const hiddenSize = asPositiveInt(record.hidden_size)
  const numLayers = asPositiveInt(record.num_layers)
  const numAttentionHeads = asPositiveInt(record.num_attention_heads)
  const numKVHeads = asPositiveInt(record.num_kv_heads)
  const intermediateSize = asPositiveInt(record.intermediate_size)
  const vocabSize = asPositiveInt(record.vocab_size)
  const maxPosition = asPositiveInt(record.max_position_embeddings)

  if (
    !id ||
    !displayName ||
    !repoId ||
    paramsBillions === null ||
    hiddenSize === null ||
    numLayers === null ||
    numAttentionHeads === null ||
    numKVHeads === null ||
    intermediateSize === null ||
    vocabSize === null ||
    maxPosition === null
  ) {
    return null
  }

  const fieldProvenance: ModelFieldProvenance[] = []
  const configSource =
    typeof record.config_source === 'string' && record.config_source.trim().length > 0
      ? record.config_source
      : null

  const sourceRef = configSource ?? `catalog:${id}`
  addFieldProvenance(fieldProvenance, 'hf_repo_id', 'catalog', sourceRef)
  for (const field of [
    'params_billions',
    'hidden_size',
    'num_layers',
    'num_attention_heads',
    'num_kv_heads',
    'intermediate_size',
    'vocab_size',
    'max_position_embeddings',
  ]) {
    addFieldProvenance(fieldProvenance, field, 'catalog', sourceRef)
  }

  const architecture = String(record.architecture ?? 'dense').toLowerCase() === 'moe' ? 'moe' : 'dense'
  const totalExperts = asPositiveInt(record.moe_total_experts) ?? undefined
  const activeExperts = asPositiveInt(record.moe_active_experts) ?? undefined
  const activeParams = asNumber(record.active_params_billions) ?? undefined

  if (activeParams) {
    addFieldProvenance(fieldProvenance, 'active_params_billions', 'catalog', sourceRef)
  }
  if (totalExperts) {
    addFieldProvenance(fieldProvenance, 'moe_total_experts', 'catalog', sourceRef)
  }
  if (activeExperts) {
    addFieldProvenance(fieldProvenance, 'moe_active_experts', 'catalog', sourceRef)
  }

  return {
    strategy: 'catalog',
    source_input: sourceInput,
    applied: false,
    warnings: [],
    model: {
      id,
      display_name: displayName,
      hf_repo_id: repoId,
      params_billions: paramsBillions,
      active_params_billions: activeParams,
      hidden_size: hiddenSize,
      num_layers: numLayers,
      num_attention_heads: numAttentionHeads,
      num_kv_heads: numKVHeads,
      intermediate_size: intermediateSize,
      vocab_size: vocabSize,
      max_position_embeddings: maxPosition,
      architecture,
      moe_total_experts: architecture === 'moe' ? totalExperts : undefined,
      moe_active_experts: architecture === 'moe' ? activeExperts : undefined,
      module_shapes: isRecord(record.module_shapes)
        ? (record.module_shapes as ResolvedModelPayload['module_shapes'])
        : buildModuleShapes(hiddenSize, intermediateSize, numAttentionHeads, numKVHeads),
      source: sourceRef,
      config_source: configSource,
      model_card_source: null,
      hub_api_source: null,
      field_provenance: fieldProvenance,
      warnings: [],
    },
  }
}

async function findCatalogModel(sourceInput: string): Promise<ModelResolution | null> {
  const catalog = await getModelsCatalog()
  if (!isRecord(catalog) || !Array.isArray(catalog.models)) {
    return null
  }

  const lookup = new Map<string, CatalogModelRecord>()
  for (const rawModel of catalog.models) {
    if (!isRecord(rawModel)) {
      continue
    }

    const model = rawModel as CatalogModelRecord
    const keys = [
      typeof model.id === 'string' ? model.id : null,
      typeof model.display_name === 'string' ? model.display_name : null,
      typeof model.hf_repo_id === 'string' ? model.hf_repo_id : null,
      typeof model.unsloth_model_id === 'string' ? model.unsloth_model_id : null,
      typeof model.hf_repo_id === 'string' ? slugify(model.hf_repo_id) : null,
    ]

    for (const key of keys) {
      if (key) {
        lookup.set(normalizeLookupKey(key), model)
      }
    }
  }

  const directMatch = lookup.get(normalizeLookupKey(sourceInput))
  if (directMatch) {
    return buildResolvedModelFromCatalog(directMatch, sourceInput)
  }

  const repoId = parseHuggingFaceRepoId(sourceInput)
  if (!repoId) {
    return null
  }

  return buildResolvedModelFromCatalog(
    lookup.get(normalizeLookupKey(repoId)) ?? lookup.get(normalizeLookupKey(slugify(repoId))) ?? null,
    sourceInput,
  )
}

function buildResolvedModelFromHuggingFace(
  repoId: string,
  config: Record<string, unknown>,
  modelInfo: HuggingFaceModelInfo | null,
  modelCard: { markdown: string | null; source: string | null },
  configSource: string,
): ModelResolution {
  const fieldProvenance: ModelFieldProvenance[] = []
  const warnings: string[] = []
  const modelCardSummary = modelCard.markdown ? parseModelCardSummary(modelCard.markdown) : {}

  const hiddenSize =
    asPositiveInt(config.hidden_size) ??
    asPositiveInt(config.d_model) ??
    asPositiveInt(config.n_embd) ??
    4096
  addFieldProvenance(fieldProvenance, 'hf_repo_id', 'hf_config', configSource)
  addFieldProvenance(fieldProvenance, 'hidden_size', 'hf_config', configSource)

  const numLayers =
    asPositiveInt(config.num_hidden_layers) ??
    asPositiveInt(config.n_layer) ??
    asPositiveInt(config.num_layers) ??
    32
  addFieldProvenance(fieldProvenance, 'num_layers', 'hf_config', configSource)

  const numAttentionHeads =
    asPositiveInt(config.num_attention_heads) ??
    asPositiveInt(config.n_head) ??
    asPositiveInt(config.num_heads) ??
    32
  addFieldProvenance(fieldProvenance, 'num_attention_heads', 'hf_config', configSource)

  const numKVHeads =
    asPositiveInt(config.num_key_value_heads) ??
    asPositiveInt(config.n_head_kv) ??
    asPositiveInt(config.num_kv_heads) ??
    numAttentionHeads
  addFieldProvenance(fieldProvenance, 'num_kv_heads', 'hf_config', configSource)

  const intermediateSize =
    asPositiveInt(config.intermediate_size) ??
    asPositiveInt(config.ffn_dim) ??
    asPositiveInt(config.n_inner) ??
    4 * hiddenSize
  addFieldProvenance(fieldProvenance, 'intermediate_size', 'hf_config', configSource)

  const vocabSize = asPositiveInt(config.vocab_size) ?? 128000
  addFieldProvenance(fieldProvenance, 'vocab_size', 'hf_config', configSource)

  const maxPosition = extractMaxPosition(config)
  addFieldProvenance(fieldProvenance, 'max_position_embeddings', 'hf_config', configSource)

  const moeTotalExperts =
    modelCardSummary.moe_total_experts ??
    asPositiveInt(config.n_routed_experts) ??
    asPositiveInt(config.num_experts) ??
    asPositiveInt(config.num_local_experts) ??
    undefined
  if (moeTotalExperts) {
    addFieldProvenance(
      fieldProvenance,
      'moe_total_experts',
      modelCardSummary.moe_total_experts ? 'hf_model_card' : 'hf_config',
      modelCardSummary.moe_total_experts ? modelCard.source : configSource,
    )
  }

  const moeActiveExperts =
    modelCardSummary.moe_active_experts ??
    asPositiveInt(config.num_experts_per_tok) ??
    asPositiveInt(config.num_experts_per_token) ??
    asPositiveInt(config.moe_top_k) ??
    undefined
  if (moeActiveExperts) {
    addFieldProvenance(
      fieldProvenance,
      'moe_active_experts',
      modelCardSummary.moe_active_experts ? 'hf_model_card' : 'hf_config',
      modelCardSummary.moe_active_experts ? modelCard.source : configSource,
    )
  }

  const architecture = moeTotalExperts && moeTotalExperts > 1 ? 'moe' : 'dense'

  const hubParamTotal = isRecord(modelInfo?.safetensors) ? asNumber(modelInfo.safetensors.total) : null
  const paramsBillions =
    modelCardSummary.total_params_billions ??
    (hubParamTotal ? Number((hubParamTotal / 1e9).toFixed(2)) : null) ??
    estimateParamsBillions({
      hiddenSize,
      layers: numLayers,
      numAttentionHeads,
      numKVHeads,
      intermediateSize,
      vocabSize,
      architecture,
      moeTotalExperts,
      fromHub: hubParamTotal,
    })
  addFieldProvenance(
    fieldProvenance,
    'params_billions',
    modelCardSummary.total_params_billions ? 'hf_model_card' : hubParamTotal ? 'hf_hub_api' : 'hf_config',
    modelCardSummary.total_params_billions
      ? modelCard.source
      : hubParamTotal
        ? `https://huggingface.co/api/models/${repoId}`
        : configSource,
  )

  if (!modelCardSummary.total_params_billions && !hubParamTotal && architecture === 'moe') {
    warnings.push(
      'Total parameters were estimated heuristically from config and expert count because the model card or hub API did not publish a total.',
    )
  }

  const activeParamsBillions = modelCardSummary.active_params_billions ?? undefined
  if (activeParamsBillions) {
    addFieldProvenance(
      fieldProvenance,
      'active_params_billions',
      'hf_model_card',
      modelCard.source,
    )
  } else if (moeTotalExperts && moeActiveExperts && moeActiveExperts < moeTotalExperts) {
    warnings.push(
      'MoE active-parameter count was not published in the model card, so compute remains conservative on total parameters.',
    )
  }

  if (activeParamsBillions && activeParamsBillions >= paramsBillions) {
    warnings.push('Ignoring active-parameter value because it is not smaller than total parameters.')
  }

  return {
    strategy: 'huggingface',
    source_input: repoId,
    applied: false,
    warnings,
    model: {
      id: slugify(repoId),
      display_name: humanizeName(repoId),
      hf_repo_id: repoId,
      params_billions: paramsBillions,
      active_params_billions:
        activeParamsBillions && activeParamsBillions < paramsBillions ? activeParamsBillions : undefined,
      hidden_size: hiddenSize,
      num_layers: numLayers,
      num_attention_heads: numAttentionHeads,
      num_kv_heads: numKVHeads,
      intermediate_size: intermediateSize,
      vocab_size: vocabSize,
      max_position_embeddings: maxPosition,
      architecture,
      moe_total_experts: architecture === 'moe' ? moeTotalExperts : undefined,
      moe_active_experts: architecture === 'moe' ? moeActiveExperts : undefined,
      module_shapes: buildModuleShapes(hiddenSize, intermediateSize, numAttentionHeads, numKVHeads),
      source: configSource,
      config_source: configSource,
      model_card_source: modelCard.source,
      hub_api_source: `https://huggingface.co/api/models/${repoId}`,
      field_provenance: fieldProvenance,
      warnings,
    },
  }
}

export async function resolveModelReference(
  input: string,
  options: ResolveModelOptions = {},
): Promise<ModelResolution | null> {
  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }

  const catalogMatch = await findCatalogModel(trimmed)
  if (catalogMatch) {
    return catalogMatch
  }

  const repoId = parseHuggingFaceRepoId(trimmed)
  if (!repoId) {
    return null
  }

  const cacheKey = repoId.toLowerCase()
  const now = Date.now()
  const cached = modelResolutionCache.get(cacheKey)
  if (options.preferCache !== false && cached && cached.expiresAt > now) {
    return {
      ...cached.resolution,
      source_input: trimmed,
    }
  }

  const [configResult, modelInfo, modelCard] = await Promise.all([
    fetchConfig(repoId),
    fetchModelInfo(repoId),
    fetchModelCard(repoId),
  ])

  const resolution = buildResolvedModelFromHuggingFace(
    repoId,
    configResult.config,
    modelInfo.payload,
    modelCard,
    configResult.source,
  )

  modelResolutionCache.set(cacheKey, {
    expiresAt: now + MODEL_RESOLUTION_CACHE_TTL_MS,
    resolution,
  })

  return resolution
}

function patchField(
  normalizations: NormalizationEvent[],
  strategy: ModelResolution['strategy'],
  field: string,
  input: unknown,
  normalizedTo: unknown,
  model: ResolvedModelPayload,
): void {
  if (input === normalizedTo) {
    return
  }

  const provenanceField =
    field === 'model_hf_repo_id'
      ? 'hf_repo_id'
      : field === 'model_active_params_billions'
        ? 'active_params_billions'
        : field === 'architecture'
          ? 'moe_total_experts'
          : field === 'model_name'
            ? 'hf_repo_id'
            : field === 'model_hidden_size'
        ? 'hidden_size'
        : field === 'model_num_layers'
          ? 'num_layers'
          : field === 'model_num_attention_heads'
            ? 'num_attention_heads'
            : field === 'model_num_kv_heads'
              ? 'num_kv_heads'
              : field === 'model_intermediate_size'
                ? 'intermediate_size'
                : field === 'model_vocab_size'
                  ? 'vocab_size'
                  : field === 'model_max_position_embeddings'
                    ? 'max_position_embeddings'
                    : field === 'model_module_shapes'
                      ? 'module_shapes'
                      : field

  const primarySources =
    model.field_provenance
      ?.filter((entry) => entry.field === provenanceField)
      .map((entry) => {
        switch (entry.source) {
          case 'catalog':
            return 'catalog'
          case 'hf_model_card':
            return 'huggingface-model-card'
          case 'hf_hub_api':
            return 'huggingface-hub-api'
          case 'hf_config':
          default:
            return 'huggingface-config'
        }
      }) ?? []

  normalizations.push({
    rule_id: `model_metadata_${field}`,
    field,
    input,
    normalized_to: normalizedTo,
    reason:
      strategy === 'catalog'
        ? 'Normalized to the Crucible model catalog entry for this model.'
        : 'Normalized to metadata resolved from Hugging Face for this model.',
    source_ids: Array.from(new Set(primarySources)),
  })
}

function applyModelResolutionToRequest(
  request: EstimateRequest,
  resolution: ModelResolution,
): HydratedEstimateRequestResult {
  const model = resolution.model
  const architecture = model.architecture === 'moe' ? 'MoE' : 'Dense'
  const nextRequest: EstimateRequest = {
    ...request,
    model_name: model.hf_repo_id || request.model_name,
    model_hf_repo_id: model.hf_repo_id,
    model_params_billions: model.params_billions,
    model_active_params_billions: model.active_params_billions ?? null,
    architecture,
    moe_total_experts: architecture === 'MoE' ? (model.moe_total_experts ?? request.moe_total_experts) : 1,
    moe_active_experts: architecture === 'MoE' ? (model.moe_active_experts ?? request.moe_active_experts) : 1,
    model_hidden_size: model.hidden_size,
    model_num_layers: model.num_layers,
    model_num_attention_heads: model.num_attention_heads,
    model_num_kv_heads: model.num_kv_heads,
    model_intermediate_size: model.intermediate_size,
    model_vocab_size: model.vocab_size,
    model_max_position_embeddings: model.max_position_embeddings,
    model_module_shapes: model.module_shapes,
  }

  const normalizations: NormalizationEvent[] = []
  patchField(normalizations, resolution.strategy, 'model_name', request.model_name, nextRequest.model_name, model)
  patchField(
    normalizations,
    resolution.strategy,
    'model_hf_repo_id',
    request.model_hf_repo_id,
    nextRequest.model_hf_repo_id,
    model,
  )
  patchField(
    normalizations,
    resolution.strategy,
    'model_params_billions',
    request.model_params_billions,
    nextRequest.model_params_billions,
    model,
  )
  patchField(
    normalizations,
    resolution.strategy,
    'model_active_params_billions',
    request.model_active_params_billions,
    nextRequest.model_active_params_billions,
    model,
  )
  patchField(normalizations, resolution.strategy, 'architecture', request.architecture, nextRequest.architecture, model)
  patchField(
    normalizations,
    resolution.strategy,
    'moe_total_experts',
    request.moe_total_experts,
    nextRequest.moe_total_experts,
    model,
  )
  patchField(
    normalizations,
    resolution.strategy,
    'moe_active_experts',
    request.moe_active_experts,
    nextRequest.moe_active_experts,
    model,
  )
  patchField(
    normalizations,
    resolution.strategy,
    'model_hidden_size',
    request.model_hidden_size,
    nextRequest.model_hidden_size,
    model,
  )
  patchField(
    normalizations,
    resolution.strategy,
    'model_num_layers',
    request.model_num_layers,
    nextRequest.model_num_layers,
    model,
  )
  patchField(
    normalizations,
    resolution.strategy,
    'model_num_attention_heads',
    request.model_num_attention_heads,
    nextRequest.model_num_attention_heads,
    model,
  )
  patchField(
    normalizations,
    resolution.strategy,
    'model_num_kv_heads',
    request.model_num_kv_heads,
    nextRequest.model_num_kv_heads,
    model,
  )
  patchField(
    normalizations,
    resolution.strategy,
    'model_intermediate_size',
    request.model_intermediate_size,
    nextRequest.model_intermediate_size,
    model,
  )
  patchField(
    normalizations,
    resolution.strategy,
    'model_vocab_size',
    request.model_vocab_size,
    nextRequest.model_vocab_size,
    model,
  )
  patchField(
    normalizations,
    resolution.strategy,
    'model_max_position_embeddings',
    request.model_max_position_embeddings,
    nextRequest.model_max_position_embeddings,
    model,
  )
  if (request.model_module_shapes !== nextRequest.model_module_shapes) {
    patchField(
      normalizations,
      resolution.strategy,
      'model_module_shapes',
      request.model_module_shapes,
      nextRequest.model_module_shapes,
      model,
    )
  }

  return {
    request: nextRequest,
    model_resolution: {
      ...resolution,
      applied: normalizations.length > 0,
    },
    normalizations,
    warnings: resolution.warnings,
  }
}

export async function hydrateEstimateRequestModel(
  request: EstimateRequest,
): Promise<HydratedEstimateRequestResult> {
  if (request.auto_resolve_model_metadata === false) {
    return {
      request,
      model_resolution: null,
      normalizations: [],
      warnings: [],
    }
  }

  const sourceInput = request.model_hf_repo_id.trim() || request.model_name.trim()
  const resolution = await resolveModelReference(sourceInput)
  if (!resolution) {
    return {
      request,
      model_resolution: null,
      normalizations: [],
      warnings: [],
    }
  }

  return applyModelResolutionToRequest(request, resolution)
}
