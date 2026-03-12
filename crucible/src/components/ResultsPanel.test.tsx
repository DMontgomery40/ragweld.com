// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { makeEstimateRequest, makePricingFreshness } from '../engine/__tests__/helpers'
import type { CostComparisonEntry, EstimateResponse, Range3 } from '../types'
import { ResultsPanel } from './ResultsPanel'

vi.mock('./CostComparison', () => ({
  CostComparison: () => <div data-testid="cost-comparison" />,
}))

vi.mock('./GPUAvailability', () => ({
  GPUAvailability: () => <div data-testid="gpu-availability" />,
}))

vi.mock('./MathExplainer', () => ({
  MathExplainer: () => <div data-testid="math-explainer" />,
}))

vi.mock('./ShareExport', () => ({
  ShareExport: () => <div data-testid="share-export" />,
}))

vi.mock('./VRAMBreakdown', () => ({
  VRAMBreakdown: () => <div data-testid="vram-breakdown" />,
}))

afterEach(() => {
  cleanup()
})

function makeRange(value: number): Range3 {
  return {
    optimistic: value,
    typical: value,
    conservative: value,
  }
}

function makeCostComparisonEntry(overrides: Partial<CostComparisonEntry> = {}): CostComparisonEntry {
  return {
    provider: 'hyperstack',
    gpu: 'H100',
    cloud_instance_type: 'H100 x4',
    num_gpus: 4,
    vram_total_gb: 320,
    hourly_price_cents: 513,
    spot_price_cents: null,
    reserved_1mo_price_cents: null,
    reserved_3mo_price_cents: null,
    estimated_hours: 0.72,
    estimated_hours_range: makeRange(0.72),
    total_cost_dollars: 5.13,
    cost_range_dollars: makeRange(5.13),
    spot_cost_dollars: null,
    reserved_1mo_cost_dollars: null,
    reserved_3mo_cost_dollars: null,
    available: true,
    fits_in_vram: true,
    fit_status: 'likely_fit',
    selected_pricing_tier: 'on_demand',
    provider_support_tier: 'inferred',
    provider_support_reasons: [],
    price_source: 'shadeform',
    price_fetched_at: '2026-03-01T00:00:00Z',
    price_stale_after: null,
    fallback_reason: null,
    pricing_freshness: makePricingFreshness(),
    source: 'shadeform',
    ...overrides,
  }
}

function makeEstimate(overrides: Partial<EstimateResponse> = {}): EstimateResponse {
  return {
    vram_range_gb: {
      optimistic: 20.26,
      typical: 21.46,
      conservative: 23.43,
    },
    hours_range: {
      optimistic: 0.54,
      typical: 0.72,
      conservative: 0.92,
    },
    cost_range_dollars: {
      optimistic: 4.1,
      typical: 5.13,
      conservative: 7,
    },
    vram_estimate_gb: 21.46,
    vram_estimate_bands_gb: {
      tight: 20.26,
      typical: 21.46,
      conservative: 23.43,
    },
    vram_breakdown: {
      model_weights: 13.84,
      quant_metadata: 1.38,
      lora_adapters: 0.47,
      optimizer_states: 0.95,
      gradients: 0.47,
      activations: 0.28,
      rl_logits: 0,
      kv_cache: 0,
      non_weight_after_framework: 1.56,
      buffer: 2.5,
    },
    training_estimate: {
      total_tokens: 30_000_000,
      effective_batch_tokens: 32_768,
      total_steps: 121,
      total_flops: 1,
      total_flops_range: makeRange(1),
      estimated_hours_by_gpu: {},
      estimated_hours_by_gpu_range: {},
      assumptions: {
        token_utilization: 1,
        lora_compute_discount: 1,
        mfu: 1,
        speed_multiplier: 1,
        attention_penalty: 1,
      },
      intermediates: {},
      range_reasons: [],
      warnings: [],
    },
    cost_comparison: [makeCostComparisonEntry()],
    math: {
      vram: {},
      training: {},
      cost: {},
    },
    support_tier: 'inferred',
    support_reasons: [],
    normalizations: [],
    pricing_freshness: makePricingFreshness({
      fallback_reason: 'Snapshot fallback active.',
    }),
    source_ledger_version: '2026-03-11',
    warnings: [],
    effective_request: makeEstimateRequest(),
    model_resolution: {
      strategy: 'catalog',
      source_input: 'qwen3-32b',
      applied: true,
      model: {
        id: 'qwen3-32b',
        display_name: 'Qwen3 32B',
        hf_repo_id: 'unsloth/Qwen3-32B',
        params_billions: 29.72,
        hidden_size: 5120,
        num_layers: 64,
        num_attention_heads: 64,
        num_kv_heads: 8,
        intermediate_size: 25_600,
        vocab_size: 151_936,
        max_position_embeddings: 40_960,
        architecture: 'dense',
        module_shapes: {},
        source: 'catalog',
        field_provenance: [
          {
            field: 'hf_repo_id',
            source: 'catalog',
            source_ref: 'https://huggingface.co/unsloth/Qwen3-32B/raw/main/config.json',
          },
        ],
        warnings: [],
      },
      warnings: [],
    },
    meta: {
      prices_fetched_at: '2026-03-01T00:00:00Z',
      framework_used: 'Unsloth',
      workflow_mode: 'custom_pipeline',
      support_tier: 'inferred',
      computation_version: 'test',
      source_ledger_version: '2026-03-11',
      model_name: 'qwen3-32b',
      model_hf_repo_id: 'unsloth/Qwen3-32B',
      model_source: 'catalog',
    },
    ...overrides,
  }
}

function renderResultsPanel(estimate: EstimateResponse): void {
  render(
    <ResultsPanel
      request={makeEstimateRequest()}
      estimate={estimate}
      estimateIsCurrent
      estimateLoading={false}
      estimateError={null}
      estimateRequestedAt="2026-03-01T00:00:00Z"
      pricing={[]}
      pricingLoading={false}
      pricingError={null}
      queryString=""
      onRetryEstimate={vi.fn()}
    />,
  )
}

describe('ResultsPanel normalization summaries', () => {
  it('uses source-aware wording for structural model summaries', () => {
    renderResultsPanel(
      makeEstimate({
        normalizations: [
          {
            rule_id: 'model_metadata_model_hidden_size',
            field: 'model_hidden_size',
            input: null,
            normalized_to: 5120,
            reason: 'Normalized to metadata resolved from Hugging Face for this model.',
            source_ids: ['huggingface-config'],
          },
          {
            rule_id: 'model_metadata_model_num_layers',
            field: 'model_num_layers',
            input: null,
            normalized_to: 64,
            reason: 'Normalized to metadata resolved from Hugging Face for this model.',
            source_ids: ['huggingface-config'],
          },
        ],
        meta: {
          prices_fetched_at: '2026-03-01T00:00:00Z',
          framework_used: 'Unsloth',
          workflow_mode: 'custom_pipeline',
          support_tier: 'inferred',
          computation_version: 'test',
          source_ledger_version: '2026-03-11',
          model_name: 'Qwen/Qwen3-32B',
          model_hf_repo_id: 'Qwen/Qwen3-32B',
          model_source: 'huggingface',
        },
      }),
    )

    const summaryItem = screen.getByText('Structural model fields').closest('li')
    expect(summaryItem?.textContent).toContain('from Hugging Face metadata')
  })

  it('shows legacy-only normalizations in the default summary', () => {
    renderResultsPanel(
      makeEstimate({
        normalizations: [
          {
            rule_id: 'legacy_training_type_alias',
            field: 'training_type',
            input: 'RL',
            normalized_to: 'GSPO',
            reason: 'Legacy training type was mapped onto the current training_type field.',
            source_ids: ['legacy-api-compat'],
          },
          {
            rule_id: 'legacy_epochs_alias',
            field: 'num_epochs',
            input: 12,
            normalized_to: 12,
            reason: 'Legacy epochs is mapped onto num_epochs.',
            source_ids: ['legacy-api-compat'],
          },
          {
            rule_id: 'legacy_context_length_alias',
            field: 'max_seq_length',
            input: 32768,
            normalized_to: 32768,
            reason: 'Legacy context_length is mapped onto max_seq_length.',
            source_ids: ['legacy-api-compat'],
          },
          {
            rule_id: 'legacy_rl_generations_alias',
            field: 'grpo_num_generations',
            input: 6,
            normalized_to: 6,
            reason: 'Legacy rl_generations_per_prompt is mapped onto grpo_num_generations.',
            source_ids: ['legacy-api-compat'],
          },
        ],
      }),
    )

    expect(screen.getByText('Training type')).toBeTruthy()
    expect(screen.getByText('Epochs')).toBeTruthy()
    expect(screen.getByText('Max seq length')).toBeTruthy()
    expect(screen.getByText('GRPO generations')).toBeTruthy()
  })

  it('keeps provenance and full normalization disclosures collapsed by default', () => {
    renderResultsPanel(
      makeEstimate({
        normalizations: [
          {
            rule_id: 'model_metadata_model_name',
            field: 'model_name',
            input: 'qwen3-32b',
            normalized_to: 'unsloth/Qwen3-32B',
            reason: 'Normalized to the Crucible model catalog entry for this model.',
            source_ids: ['catalog'],
          },
        ],
      }),
    )

    expect(screen.getByText('Field provenance').closest('details')?.getAttribute('open')).toBeNull()
    expect(screen.getByText('Show full normalized field list').closest('details')?.getAttribute('open')).toBeNull()
  })

  it('renders object-valued normalization details as JSON in the expanded log', async () => {
    const user = userEvent.setup()

    renderResultsPanel(
      makeEstimate({
        normalizations: [
          {
            rule_id: 'model_metadata_model_module_shapes',
            field: 'model_module_shapes',
            input: null,
            normalized_to: {
              q: { in_dim: 5120, out_dim: 5120 },
            },
            reason: 'Normalized to the Crucible model catalog entry for this model.',
            source_ids: ['catalog'],
          },
        ],
      }),
    )

    await user.click(screen.getByText('Show full normalized field list'))

    expect(screen.queryByText(/\[object\]/)).toBeNull()
    expect(screen.getByText(/"q":\{"in_dim":5120,"out_dim":5120\}/)).toBeTruthy()
  })
})
