import { Suspense, lazy, useCallback, useMemo, useState } from 'react'
import { CrucibleFooter } from './components/CrucibleFooter'
import { InputPanel } from './components/InputPanel'
import { ResultsPanel } from './components/ResultsPanel'
import { useGPUPricing } from './hooks/useGPUPricing'
import { useTrainingEstimate } from './hooks/useTrainingEstimate'
import { useURLState } from './hooks/useURLState'
import type { EstimateRequest, ResolvedModelPayload } from './types'

const MathCodeWorkbenchPage = lazy(() =>
  import('./components/MathCodeWorkbenchPage').then((module) => ({
    default: module.MathCodeWorkbenchPage,
  })),
)

const DEFAULT_REQUEST: EstimateRequest = {
  model_name: 'qwen3-32b',
  model_hf_repo_id: '',
  auto_resolve_model_metadata: true,
  model_params_billions: 29.72,
  model_active_params_billions: null,
  architecture: 'Dense',
  moe_total_experts: 1,
  moe_active_experts: 1,

  method: 'QLoRA',
  quantization_bits: 4,
  quantization_profile: 'nf4',
  use_qat: false,
  qat_scheme: 'int4',
  lora_rank: 32,
  lora_alpha: 64,
  lora_target_modules: ['q', 'k', 'v', 'o', 'gate', 'up', 'down'],
  use_gradient_checkpointing: true,
  full_finetuning: false,

  dataset_tokens: 10_000_000,
  dataset_rows: null,
  avg_tokens_per_row: 512,
  num_epochs: 3,
  batch_size: 2,
  gradient_accumulation_steps: 8,
  max_seq_length: 4096,
  learning_rate: 0.0002,
  optimizer: 'muon',
  lr_scheduler: 'cosine',
  warmup_ratio: 0.03,
  precision: 'bf16',
  packing: true,

  framework: 'Unsloth',
  workflow_mode: 'custom_pipeline',
  unsloth_version: 'latest',
  use_flash_attention: true,
  use_triton_kernels: true,
  use_rope_kernels: true,
  use_fused_chunked_ce_loss: true,
  use_faster_moe_kernels: true,
  use_packing: true,
  custom_speed_multiplier: 1,

  target_gpu: ['B200', 'H200', 'H100', 'A100_80G', 'L40S'],
  target_providers: [],
  target_regions: [],
  target_interconnects: [],
  target_instance_types: [],
  num_gpus: 4,
  num_nodes: 1,
  pricing_tier: ['on_demand'],
  min_vram_gb: null,

  training_type: 'SFT',
  importance_sampling_level: 'token',
  grpo_num_generations: 4,
  reward_model_size: null,
  vllm_batch_size: 8,
  reference_model_pct: 100,
  num_runs: 1,
}

const MAIN_RAGWELD_URL = 'https://ragweld.com/'
const SHADEFORM_URL = 'https://www.shadeform.ai/'

function formatTime(value: string | null): string {
  if (!value) {
    return 'n/a'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  const pad = (part: number) => String(part).padStart(2, '0')
  return `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return 'n/a'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString('en-US')
}

function formatSourceLabel(value: string | null | undefined): string {
  if (!value) {
    return 'Unknown feed'
  }

  return value
    .split(/[_-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function resolveRoute(pathname: string): 'workbench' | 'math-code' {
  const normalized = pathname.replace(/\/+$/, '')
  if (normalized.endsWith('/math-code')) {
    return 'math-code'
  }
  return 'workbench'
}

function EstimatorWorkbench() {
  const { state, setState, queryString } = useURLState(DEFAULT_REQUEST)
  const [modelResolveLoading, setModelResolveLoading] = useState(false)
  const [modelResolveError, setModelResolveError] = useState<string | null>(null)
  const [modelResolveMessage, setModelResolveMessage] = useState<string | null>(null)
  const routePrefix =
    typeof window !== 'undefined' && window.location.pathname.startsWith('/crucible') ? '/crucible' : ''
  const mathCodeHref = `${routePrefix}/math-code`

  const {
    data: estimate,
    loading: estimateLoading,
    error: estimateError,
    requestedAt: estimateRequestedAt,
    completedRequest,
    refetch: refetchEstimate,
  } = useTrainingEstimate(state, { debounceMs: 300 })

  const {
    data: pricing,
    loading: pricingLoading,
    error: pricingError,
    fetchedAt: pricingFetchedAt,
    pricingMeta,
    refetch: refetchPricing,
  } = useGPUPricing({ refreshMs: 180_000 })

  const pricingSourceLabel = formatSourceLabel(pricingMeta?.source ?? null)
  const fetchedTimeLabel = formatTime(pricingMeta?.fetched_at ?? pricingFetchedAt)
  const staleAfterLabel = formatDateTime(pricingMeta?.stale_after ?? null)
  const snapshotLabel = pricingMeta?.snapshot_updated_at ? formatDateTime(pricingMeta.snapshot_updated_at) : null
  const pricingRowLabel = `${pricing.length} pricing row${pricing.length === 1 ? '' : 's'}`
  const targetGpuLabel =
    state.target_gpu.length > 0
      ? `${state.target_gpu.length} target GPU famil${state.target_gpu.length === 1 ? 'y' : 'ies'}`
      : 'All GPU families in scope'
  const freshnessHeadline = pricingMeta?.is_stale ? 'Stale pricing window' : 'Within freshness window'
  const fallbackHeadline = pricingMeta?.fallback_reason ? 'Snapshot fallback active' : 'Direct feed only'
  const cacheHeadline = pricingMeta?.cached ? 'Cache warm' : 'Fresh network response'
  const estimateIsCurrent = useMemo(() => {
    if (estimate === null || completedRequest === null) {
      return false
    }
    return JSON.stringify(completedRequest) === JSON.stringify(state)
  }, [completedRequest, estimate, state])

  const handleInputChange = useCallback(
    (patch: Partial<EstimateRequest>) => {
      setState(patch)
    },
    [setState],
  )

  const handleResolveModel = useCallback(
    async (input: string) => {
      setModelResolveLoading(true)
      setModelResolveError(null)
      setModelResolveMessage(null)

      try {
        const response = await fetch('/crucible/api/v1/resolve-model', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ input }),
        })

        const payload = (await response.json().catch(() => null)) as
          | { model?: ResolvedModelPayload; error?: string }
          | null
        if (!response.ok || !payload?.model) {
          throw new Error(payload?.error ?? 'Model resolution failed.')
        }

        const resolved = payload.model
        const architecture = resolved.architecture === 'moe' ? 'MoE' : 'Dense'

        setState({
          model_name: resolved.hf_repo_id,
          model_hf_repo_id: resolved.hf_repo_id,
          auto_resolve_model_metadata: false,
          model_params_billions: resolved.params_billions,
          model_active_params_billions: resolved.active_params_billions ?? null,
          architecture,
          moe_total_experts: architecture === 'MoE' ? (resolved.moe_total_experts ?? 8) : 1,
          moe_active_experts: architecture === 'MoE' ? (resolved.moe_active_experts ?? 2) : 1,
          model_hidden_size: resolved.hidden_size,
          model_num_layers: resolved.num_layers,
          model_num_attention_heads: resolved.num_attention_heads,
          model_num_kv_heads: resolved.num_kv_heads,
          model_intermediate_size: resolved.intermediate_size,
          model_vocab_size: resolved.vocab_size,
          model_max_position_embeddings: resolved.max_position_embeddings,
          model_module_shapes: resolved.module_shapes,
        })
        setModelResolveMessage(
          `Loaded ${resolved.display_name} (${resolved.params_billions}B total${
            resolved.active_params_billions ? ` / ${resolved.active_params_billions}B active` : ''
          }, ${resolved.num_layers} layers).`,
        )
      } catch (error) {
        setModelResolveError(error instanceof Error ? error.message : 'Model resolution failed.')
      } finally {
        setModelResolveLoading(false)
      }
    },
    [setState],
  )

  return (
    <div className="app-shell">
      <header className="card app-header estimator-header">
        <div className="estimator-header-grid">
          <div className="estimator-hero">
            <div className="brand-wrap estimator-brand">
              <p className="brand-kicker">ragweld engineering tools</p>
              <div className="estimator-title-row">
                <h1>crucible</h1>
                <span className="estimator-title-chip">Operator Range Planner</span>
              </div>
              <p className="tagline">Know what your training costs before you burn the credits.</p>
            </div>

            <div className="estimator-purpose-card">
              <p className="estimator-purpose-kicker">Planner posture</p>
              <p className="estimator-purpose-copy">
                This is an operator planning tool with visible assumptions and ranges, not a benchmark
                database.
              </p>
            </div>
          </div>

          <div className="estimator-status-deck">
            <article className="estimator-status-card">
              <span className="estimator-status-label">Price feed</span>
              <strong className="estimator-status-main">{pricingLoading ? 'Refreshing feed…' : pricingSourceLabel}</strong>
              <span className="estimator-status-meta">
                {pricingRowLabel} • fetched {fetchedTimeLabel}
              </span>
            </article>

            <article className="estimator-status-card">
              <span className="estimator-status-label">Freshness</span>
              <strong
                className={`estimator-status-main ${
                  pricingMeta?.is_stale ? 'estimator-status-main-warn' : 'estimator-status-main-good'
                }`}
              >
                {freshnessHeadline}
              </strong>
              <span className="estimator-status-meta">Stale after {staleAfterLabel}</span>
            </article>

            <article className="estimator-status-card">
              <span className="estimator-status-label">Search scope</span>
              <strong className="estimator-status-main">{targetGpuLabel}</strong>
              <span className="estimator-status-meta">{cacheHeadline}</span>
            </article>

            <article
              className={`estimator-status-card estimator-status-card-wide ${
                pricingMeta?.fallback_reason ? 'estimator-status-card-alert' : ''
              }`}
            >
              <span className="estimator-status-label">Fallback state</span>
              <strong
                className={`estimator-status-main ${
                  pricingMeta?.fallback_reason ? 'estimator-status-main-warn' : 'estimator-status-main-good'
                }`}
              >
                {fallbackHeadline}
              </strong>
              <span className="estimator-status-meta">
                {pricingMeta?.fallback_reason ?? 'No snapshot fallback is currently shaping the feed.'}
              </span>
            </article>
          </div>
        </div>

        <div className="estimator-header-footer">
          <div className="estimator-header-notes">
            <span className="header-provider-pill">
              Live GPU pricing via{' '}
              <a href={SHADEFORM_URL} target="_blank" rel="noopener noreferrer">
                Shadeform
              </a>
            </span>
            {snapshotLabel ? <span className="info-chip">Snapshot {snapshotLabel}</span> : null}
          </div>

          <div className="header-actions estimator-header-actions">
            <a className="ghost-link-button" href={mathCodeHref}>
              Math Code Workbench
            </a>
            <a className="ghost-link-button ghost-link-button-subtle" href={MAIN_RAGWELD_URL} target="_blank" rel="noopener noreferrer">
              Ragweld Surface
            </a>
            <button
              type="button"
              className="ghost-button"
              onClick={() => refetchPricing({ forceRefresh: true })}
            >
              Refresh Pricing
            </button>
            <button type="button" className="ghost-button" onClick={refetchEstimate}>
              Recompute Now
            </button>
          </div>
        </div>
      </header>

      <main className="layout-grid">
        <InputPanel
          value={state}
          onChange={handleInputChange}
          estimate={estimate}
          pricing={pricing}
          pricingLoading={pricingLoading}
          onResolveModel={handleResolveModel}
          modelResolveLoading={modelResolveLoading}
          modelResolveError={modelResolveError}
          modelResolveMessage={modelResolveMessage}
        />
        <ResultsPanel
          request={state}
          estimate={estimate}
          estimateIsCurrent={estimateIsCurrent}
          estimateLoading={estimateLoading}
          estimateError={estimateError}
          estimateRequestedAt={estimateRequestedAt}
          pricing={pricing}
          pricingLoading={pricingLoading}
          pricingError={pricingError}
          queryString={queryString}
          onRetryEstimate={refetchEstimate}
        />
      </main>

      <CrucibleFooter />
    </div>
  )
}

function App() {
  const route = useMemo(() => {
    if (typeof window === 'undefined') {
      return 'workbench'
    }
    return resolveRoute(window.location.pathname)
  }, [])

  if (route === 'math-code') {
    return (
      <Suspense
        fallback={
          <div className="app-shell">
            <main className="layout-grid">
              <section className="card results-head">
                <p>Loading math code…</p>
              </section>
            </main>
          </div>
        }
      >
        <MathCodeWorkbenchPage />
      </Suspense>
    )
  }

  return <EstimatorWorkbench />
}

export default App
