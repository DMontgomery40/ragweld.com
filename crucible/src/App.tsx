import { useCallback, useState } from 'react'
import { InputPanel } from './components/InputPanel'
import { ResultsPanel } from './components/ResultsPanel'
import { useGPUPricing } from './hooks/useGPUPricing'
import { useTrainingEstimate } from './hooks/useTrainingEstimate'
import { useURLState } from './hooks/useURLState'
import type { EstimateRequest, ResolvedModelPayload } from './types'

const DEFAULT_REQUEST: EstimateRequest = {
  model_name: 'qwen3-32b',
  model_params_billions: 29.72,
  architecture: 'Dense',
  moe_total_experts: 1,
  moe_active_experts: 1,

  method: 'QLoRA',
  quantization_bits: 4,
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
  unsloth_version: 'latest',
  use_flash_attention: true,
  use_triton_kernels: true,
  use_rope_kernels: true,
  use_packing: true,

  target_gpu: ['B200', 'H200', 'H100', 'A100_80G', 'L40S'],
  target_providers: [],
  target_regions: [],
  target_interconnects: [],
  target_instance_types: [],
  num_gpus: 4,
  num_nodes: 1,
  pricing_tier: ['on_demand', 'spot'],
  min_vram_gb: null,

  training_type: 'SFT',
  grpo_num_generations: 4,
  reward_model_size: null,
  vllm_batch_size: 8,
  num_runs: 1,
}

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

function App() {
  const { state, setState, queryString } = useURLState(DEFAULT_REQUEST)
  const [modelResolveLoading, setModelResolveLoading] = useState(false)
  const [modelResolveError, setModelResolveError] = useState<string | null>(null)
  const [modelResolveMessage, setModelResolveMessage] = useState<string | null>(null)

  const {
    data: estimate,
    loading: estimateLoading,
    error: estimateError,
    requestedAt: estimateRequestedAt,
    refetch: refetchEstimate,
  } = useTrainingEstimate(state, { debounceMs: 300 })

  const {
    data: pricing,
    loading: pricingLoading,
    error: pricingError,
    fetchedAt: pricingFetchedAt,
    refetch: refetchPricing,
  } = useGPUPricing({ refreshMs: 180_000 })

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
          model_name: resolved.id,
          model_params_billions: resolved.params_billions,
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
          `Loaded ${resolved.display_name} (${resolved.params_billions}B, ${resolved.num_layers} layers).`,
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
      <header className="card app-header">
        <div className="brand-wrap">
          <p className="brand-kicker">ragweld engineering tools</p>
          <h1>CRUCIBLE</h1>
          <p className="tagline">Know what your training costs before you burn the credits.</p>
        </div>

        <div className="header-meta mono">
          <span>Target GPUs: {state.target_gpu.length}</span>
          <span>Pricing rows: {pricing.length}</span>
          <span>Pricing refreshed: {formatTime(pricingFetchedAt)}</span>
        </div>

        <div className="header-actions">
          <button type="button" className="ghost-button" onClick={refetchPricing}>
            Refresh Pricing
          </button>
          <button type="button" className="ghost-button" onClick={refetchEstimate}>
            Recompute Now
          </button>
        </div>
      </header>

      <main className="layout-grid">
        <InputPanel
          value={state}
          onChange={handleInputChange}
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
    </div>
  )
}

export default App
