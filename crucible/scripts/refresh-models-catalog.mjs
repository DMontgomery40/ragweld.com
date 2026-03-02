#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const CRUCIBLE_ROOT = path.resolve(__dirname, '..')
const CATALOG_PATH = path.resolve(CRUCIBLE_ROOT, 'data/models.json')
const RAGWELD_LOCAL_MODELS_PATH = path.resolve(CRUCIBLE_ROOT, '../../ragweld/web/public/models.json')
const RAGWELD_REMOTE_MODELS_URL =
  process.env.RAGWELD_MODELS_SOURCE_URL ??
  'https://raw.githubusercontent.com/DMontgomery40/ragweld/main/web/public/models.json'

const HF_CONFIG_CANDIDATES = (repoId) => [
  `https://huggingface.co/${repoId}/raw/main/config.json`,
  `https://huggingface.co/${repoId}/resolve/main/config.json`,
]

const DEFAULT_HF_SEEDS = [
  'unsloth/Llama-3.3-70B-Instruct',
  'unsloth/Llama-3.1-8B',
  'unsloth/Llama-3.1-70B',
  'unsloth/Qwen2.5-7B-Instruct',
  'unsloth/Qwen2.5-14B-Instruct',
  'unsloth/gemma-2-9b-it',
  'mistralai/Mistral-7B-Instruct-v0.3',
  'Qwen/Qwen2.5-7B-Instruct',
  'Qwen/Qwen2.5-14B-Instruct',
  'meta-llama/Llama-3.2-3B-Instruct',
]

function hasFlag(flag) {
  return process.argv.slice(2).includes(flag)
}

function normalizeRepoId(value) {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim().replace(/^hf:\/\//i, '')
  const parts = trimmed.split('/').filter(Boolean)
  if (parts.length !== 2) {
    return null
  }
  return `${parts[0]}/${parts[1]}`
}

function slugifyRepoId(repoId) {
  return repoId.toLowerCase().replaceAll('/', '-').replaceAll('_', '-')
}

function humanizeModelName(repoId) {
  const name = repoId.split('/').pop() ?? repoId
  return name
    .replaceAll('-', ' ')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function asNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return null
}

function asPositiveInt(value) {
  const parsed = asNumber(value)
  if (parsed === null || parsed <= 0) {
    return null
  }
  return Math.trunc(parsed)
}

function isRecord(value) {
  return typeof value === 'object' && value !== null
}

function kvHeadDim(hiddenSize, numAttentionHeads, numKVHeads) {
  if (numAttentionHeads <= 0 || numKVHeads <= 0) {
    return hiddenSize
  }
  const ratio = hiddenSize / numAttentionHeads
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return hiddenSize
  }
  return Math.max(1, Math.round(ratio * numKVHeads))
}

function estimateParamsBillions({
  hiddenSize,
  layers,
  numAttentionHeads,
  numKVHeads,
  intermediateSize,
  vocabSize,
  fromHubParamCount,
}) {
  if (fromHubParamCount && fromHubParamCount > 0) {
    return Number((fromHubParamCount / 1e9).toFixed(2))
  }

  const kvOut = kvHeadDim(hiddenSize, numAttentionHeads, numKVHeads)
  const qProj = hiddenSize * hiddenSize
  const kProj = hiddenSize * kvOut
  const vProj = hiddenSize * kvOut
  const oProj = hiddenSize * hiddenSize
  const mlp = 3 * hiddenSize * intermediateSize
  const perLayer = qProj + kProj + vProj + oProj + mlp
  const embedding = vocabSize * hiddenSize
  const totalParams = perLayer * layers + embedding
  return Number((totalParams / 1e9).toFixed(2))
}

function extractMaxPosition(config) {
  const direct = asPositiveInt(config.max_position_embeddings)
  if (direct) {
    return direct
  }
  const nPositions = asPositiveInt(config.n_positions)
  if (nPositions) {
    return nPositions
  }
  if (isRecord(config.rope_scaling)) {
    const ropeMax = asPositiveInt(config.rope_scaling.original_max_position_embeddings)
    if (ropeMax) {
      return ropeMax
    }
  }
  return 32768
}

function parseRepoIdFromConfigSource(configSource) {
  if (typeof configSource !== 'string' || !configSource.includes('huggingface.co/')) {
    return null
  }
  try {
    const url = new URL(configSource)
    if (url.hostname !== 'huggingface.co') {
      return null
    }
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length < 2) {
      return null
    }
    return `${parts[0]}/${parts[1]}`
  } catch {
    return null
  }
}

async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8')
  return JSON.parse(raw)
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'crucible-model-refresh/1.0',
    },
  })
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) at ${url}`)
  }
  return response.json()
}

async function loadRagweldCatalog() {
  try {
    return await readJson(RAGWELD_LOCAL_MODELS_PATH)
  } catch {
    return fetchJson(RAGWELD_REMOTE_MODELS_URL)
  }
}

function collectRagweldHfRepos(catalog) {
  if (!isRecord(catalog) || !Array.isArray(catalog.models)) {
    return []
  }
  const repos = []
  for (const row of catalog.models) {
    if (!isRecord(row)) {
      continue
    }
    const provider = String(row.provider ?? '').trim().toLowerCase()
    if (provider !== 'huggingface') {
      continue
    }
    const repoId = normalizeRepoId(row.model)
    if (repoId) {
      repos.push(repoId)
    }
  }
  return repos
}

async function fetchModelInfo(repoId) {
  try {
    const payload = await fetchJson(`https://huggingface.co/api/models/${repoId}`)
    return isRecord(payload) ? payload : null
  } catch {
    return null
  }
}

async function fetchModelConfig(repoId) {
  let lastError = null
  for (const candidate of HF_CONFIG_CANDIDATES(repoId)) {
    try {
      const payload = await fetchJson(candidate)
      if (!isRecord(payload)) {
        throw new Error('Model config response was not an object.')
      }
      return { config: payload, source: candidate }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError ?? new Error(`Unable to fetch config for ${repoId}`)
}

function buildModelRecord(repoId, config, modelInfo, existing) {
  const hiddenSize =
    asPositiveInt(config.hidden_size) ??
    asPositiveInt(config.d_model) ??
    asPositiveInt(config.n_embd) ??
    existing?.hidden_size ??
    4096
  const numLayers =
    asPositiveInt(config.num_hidden_layers) ??
    asPositiveInt(config.n_layer) ??
    asPositiveInt(config.num_layers) ??
    existing?.num_layers ??
    32
  const numAttentionHeads =
    asPositiveInt(config.num_attention_heads) ??
    asPositiveInt(config.n_head) ??
    asPositiveInt(config.num_heads) ??
    existing?.num_attention_heads ??
    32
  const numKVHeads =
    asPositiveInt(config.num_key_value_heads) ??
    asPositiveInt(config.n_head_kv) ??
    asPositiveInt(config.num_kv_heads) ??
    existing?.num_kv_heads ??
    numAttentionHeads
  const intermediateSize =
    asPositiveInt(config.intermediate_size) ??
    asPositiveInt(config.ffn_dim) ??
    asPositiveInt(config.n_inner) ??
    existing?.intermediate_size ??
    hiddenSize * 4
  const vocabSize = asPositiveInt(config.vocab_size) ?? existing?.vocab_size ?? 128000
  const maxPosition = extractMaxPosition(config)

  const moeTotalExperts =
    asPositiveInt(config.num_experts) ??
    asPositiveInt(config.num_local_experts) ??
    existing?.moe_total_experts
  const moeActiveExperts =
    asPositiveInt(config.num_experts_per_tok) ??
    asPositiveInt(config.num_experts_per_token) ??
    asPositiveInt(config.moe_top_k) ??
    existing?.moe_active_experts
  const architecture = moeTotalExperts && moeTotalExperts > 1 ? 'moe' : 'dense'

  const hubParamCount = isRecord(modelInfo?.safetensors) ? asNumber(modelInfo.safetensors.total) : null
  const paramsBillions = estimateParamsBillions({
    hiddenSize,
    layers: numLayers,
    numAttentionHeads,
    numKVHeads,
    intermediateSize,
    vocabSize,
    fromHubParamCount: hubParamCount,
  })

  const kvOut = kvHeadDim(hiddenSize, numAttentionHeads, numKVHeads)
  const id = existing?.id ?? slugifyRepoId(repoId)
  const displayName = existing?.display_name ?? humanizeModelName(repoId)
  const today = new Date().toISOString().slice(0, 10)

  return {
    ...(existing ?? {}),
    id,
    display_name: displayName,
    hf_repo_id: repoId,
    params_billions: paramsBillions,
    hidden_size: hiddenSize,
    num_layers: numLayers,
    num_attention_heads: numAttentionHeads,
    num_kv_heads: numKVHeads,
    intermediate_size: intermediateSize,
    vocab_size: vocabSize,
    max_position_embeddings: maxPosition,
    architecture,
    moe_total_experts: architecture === 'moe' ? moeTotalExperts ?? 8 : undefined,
    moe_active_experts: architecture === 'moe' ? moeActiveExperts ?? 2 : undefined,
    module_shapes: {
      q: { in_dim: hiddenSize, out_dim: hiddenSize },
      k: { in_dim: hiddenSize, out_dim: kvOut },
      v: { in_dim: hiddenSize, out_dim: kvOut },
      o: { in_dim: hiddenSize, out_dim: hiddenSize },
      gate: { in_dim: hiddenSize, out_dim: intermediateSize },
      up: { in_dim: hiddenSize, out_dim: intermediateSize },
      down: { in_dim: intermediateSize, out_dim: hiddenSize },
    },
    config_source: `https://huggingface.co/${repoId}/raw/main/config.json`,
    config_refreshed_at: today,
  }
}

function unique(values) {
  return Array.from(new Set(values))
}

function serializeCatalog(catalog) {
  return `${JSON.stringify(catalog, null, 2)}\n`
}

async function main() {
  const apply = hasFlag('--apply')
  const catalog = await readJson(CATALOG_PATH)
  const existingModels = Array.isArray(catalog.models) ? [...catalog.models] : []

  const existingByRepoId = new Map()
  for (const model of existingModels) {
    if (!isRecord(model)) {
      continue
    }
    const repoId =
      normalizeRepoId(model.hf_repo_id) ??
      normalizeRepoId(model.unsloth_model_id) ??
      parseRepoIdFromConfigSource(model.config_source)
    if (repoId) {
      existingByRepoId.set(repoId, model)
    }
  }

  const ragweldCatalog = await loadRagweldCatalog()
  const ragweldRepos = collectRagweldHfRepos(ragweldCatalog)
  const candidateRepos = unique([...DEFAULT_HF_SEEDS, ...Array.from(existingByRepoId.keys()), ...ragweldRepos])

  const refreshedByRepo = new Map()
  const failures = []

  for (const repoId of candidateRepos) {
    try {
      const [configResult, modelInfo] = await Promise.all([fetchModelConfig(repoId), fetchModelInfo(repoId)])
      const modelRecord = buildModelRecord(
        repoId,
        configResult.config,
        modelInfo,
        existingByRepoId.get(repoId),
      )
      modelRecord.config_source = configResult.source
      refreshedByRepo.set(repoId, modelRecord)
      process.stdout.write(`refreshed ${repoId}\n`)
    } catch (error) {
      failures.push({ repoId, reason: error instanceof Error ? error.message : String(error) })
      process.stdout.write(`skipped ${repoId} (${failures[failures.length - 1].reason})\n`)
    }
  }

  const finalModels = []
  const seenIds = new Set()

  for (const model of existingModels) {
    if (!isRecord(model)) {
      continue
    }
    const repoId =
      normalizeRepoId(model.hf_repo_id) ??
      normalizeRepoId(model.unsloth_model_id) ??
      parseRepoIdFromConfigSource(model.config_source)
    if (repoId && refreshedByRepo.has(repoId)) {
      const refreshed = refreshedByRepo.get(repoId)
      if (refreshed && !seenIds.has(refreshed.id)) {
        finalModels.push(refreshed)
        seenIds.add(refreshed.id)
      }
      refreshedByRepo.delete(repoId)
      continue
    }
    if (typeof model.id === 'string' && !seenIds.has(model.id)) {
      finalModels.push(model)
      seenIds.add(model.id)
    }
  }

  for (const refreshed of refreshedByRepo.values()) {
    if (typeof refreshed.id !== 'string' || seenIds.has(refreshed.id)) {
      continue
    }
    finalModels.push(refreshed)
    seenIds.add(refreshed.id)
  }

  finalModels.sort((a, b) => {
    const aParams = asNumber(a.params_billions) ?? 0
    const bParams = asNumber(b.params_billions) ?? 0
    if (aParams !== bParams) {
      return aParams - bParams
    }
    return String(a.display_name ?? a.id ?? '').localeCompare(String(b.display_name ?? b.id ?? ''))
  })

  const updatedCatalog = {
    ...catalog,
    last_updated: new Date().toISOString().slice(0, 10),
    model_count: finalModels.length,
    models: finalModels,
    source_catalog:
      'https://huggingface.co + https://raw.githubusercontent.com/DMontgomery40/ragweld/main/web/public/models.json',
  }

  const nextText = serializeCatalog(updatedCatalog)
  const currentText = serializeCatalog(catalog)

  process.stdout.write(`candidates=${candidateRepos.length}\n`)
  process.stdout.write(`refreshed=${candidateRepos.length - failures.length}\n`)
  process.stdout.write(`failed=${failures.length}\n`)
  if (failures.length > 0) {
    process.stdout.write(
      `failed_repos=${failures
        .slice(0, 10)
        .map((failure) => failure.repoId)
        .join(',')}\n`,
    )
  }

  if (nextText === currentText) {
    process.stdout.write('result=no_changes\n')
    return
  }

  if (!apply) {
    process.stdout.write('result=changes_detected\n')
    return
  }

  await writeFile(CATALOG_PATH, nextText, 'utf8')
  process.stdout.write('result=updated\n')
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exit(1)
})
