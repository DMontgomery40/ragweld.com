import type { EstimateRequest } from '../types'

interface PresetButtonsProps {
  value: EstimateRequest
  onApply: (patch: Partial<EstimateRequest>) => void
}

interface PresetDefinition {
  id: string
  label: string
  description: string
  patch: Partial<EstimateRequest>
}

const PRESETS: PresetDefinition[] = [
  {
    id: 'h100-70b-qlora',
    label: '70B QLoRA on H100',
    description: 'High-throughput setup for large dense models.',
    patch: {
      model_name: 'llama-3.3-70b',
      model_params_billions: 70.6,
      architecture: 'Dense',
      method: 'QLoRA',
      quantization_bits: 4,
      lora_rank: 32,
      lora_alpha: 64,
      dataset_tokens: 10_000_000,
      num_epochs: 3,
      batch_size: 2,
      gradient_accumulation_steps: 8,
      max_seq_length: 4096,
      framework: 'Unsloth',
      target_gpu: ['H100', 'A100_80G'],
      num_gpus: 8,
      num_nodes: 1,
      pricing_tier: ['on_demand', 'spot'],
      training_type: 'SFT',
      num_runs: 1,
    },
  },
  {
    id: 'budget-7b-lora',
    label: '7B LoRA cheap',
    description: 'Single-GPU budget run tuned for cost control.',
    patch: {
      model_name: 'llama-3.1-8b',
      model_params_billions: 8,
      architecture: 'Dense',
      method: 'LoRA',
      quantization_bits: 16,
      lora_rank: 16,
      lora_alpha: 32,
      dataset_tokens: 2_000_000,
      num_epochs: 2,
      batch_size: 2,
      gradient_accumulation_steps: 4,
      max_seq_length: 2048,
      framework: 'Unsloth',
      target_gpu: ['L40S', 'RTX_4090', 'RTX_3090'],
      num_gpus: 1,
      num_nodes: 1,
      pricing_tier: ['spot', 'on_demand'],
      training_type: 'SFT',
      num_runs: 1,
    },
  },
  {
    id: 'reasoning-grpo',
    label: 'Reasoning model (GRPO)',
    description: 'RL-style training profile with generation overhead.',
    patch: {
      model_name: 'qwen-2.5-14b',
      model_params_billions: 14,
      architecture: 'Dense',
      method: 'QLoRA',
      quantization_bits: 4,
      lora_rank: 32,
      lora_alpha: 64,
      dataset_tokens: 5_000_000,
      num_epochs: 1,
      batch_size: 1,
      gradient_accumulation_steps: 16,
      max_seq_length: 8192,
      framework: 'HuggingFace+TRL',
      training_type: 'GRPO',
      grpo_num_generations: 8,
      vllm_batch_size: 8,
      target_gpu: ['H100', 'A100_80G', 'H200'],
      num_gpus: 4,
      num_nodes: 1,
      pricing_tier: ['on_demand', 'spot'],
      num_runs: 3,
    },
  },
]

function arraysEqual(left: unknown, right: unknown): boolean {
  if (!Array.isArray(left) || !Array.isArray(right)) {
    return false
  }

  if (left.length !== right.length) {
    return false
  }

  return left.every((value, index) => value === right[index])
}

function isPresetActive(value: EstimateRequest, preset: PresetDefinition): boolean {
  const entries = Object.entries(preset.patch) as Array<
    [keyof EstimateRequest, EstimateRequest[keyof EstimateRequest]]
  >

  return entries.every(([key, expected]) => {
    const current = value[key]
    if (Array.isArray(expected)) {
      return arraysEqual(current, expected)
    }

    return current === expected
  })
}

export function PresetButtons({ value, onApply }: PresetButtonsProps) {
  return (
    <section className="card preset-section" aria-label="Quick presets">
      <div className="section-head">
        <h2>Presets</h2>
        <span className="section-meta">Quick loadouts</span>
      </div>
      <div className="preset-grid">
        {PRESETS.map((preset) => {
          const active = isPresetActive(value, preset)

          return (
            <button
              key={preset.id}
              type="button"
              className={`preset-button ${active ? 'is-active' : ''}`}
              onClick={() => onApply(preset.patch)}
            >
              <span className="preset-label">{preset.label}</span>
              <span className="preset-description">{preset.description}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
