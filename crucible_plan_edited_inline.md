# CRUCIBLE — Real-Time GPU Training Cost Calculator

## Claude Code Build Prompt

You are building **Crucible**, a real-time GPU training cost calculator and comparison tool for LLM fine-tuning. It will be deployed to **ragweld.com/crucible** via Netlify.

This tool exists because nothing like it does — there's no single place where you can input your actual training parameters, pull live GPU pricing from multiple cloud providers, factor in modern optimization frameworks like Unsloth, and get a real cost/time estimate with provider comparisons. Every "estimate" online is either stale, made up, or buried in a blog post with no math behind it.

Crucible fixes that.

---

## PROJECT OVERVIEW

### What It Is
A web application with two interfaces:
1. **Web UI** — Beautiful, interactive calculator at `ragweld.com/crucible`
2. **API/CLI** — JSON API at `ragweld.com/crucible/api/v1/*` so AI agents and scripts can compute costs programmatically

### Core Flow
User inputs training parameters → Crucible estimates VRAM, compute FLOPs, training duration → pulls live GPU pricing from cloud providers → outputs cost comparison matrix across providers, GPU types, and pricing tiers (on-demand, spot, reserved).

### Tech Stack
- **Framework**: React (Vite) with TypeScript
- **Styling**: Tailwind CSS — industrial/utilitarian aesthetic, not startup-slop
- **Deployment**: Netlify (static site + Netlify Functions for API/backend)
- **API layer**: Netlify Functions (serverless) for GPU price fetching and caching
- **Caching**: Netlify KV or simple in-memory TTL cache for GPU prices (refresh every 15 min)
- **No database needed** — all computation is client-side or stateless serverless

---

## PRICING DATA SOURCES

### Primary: Shadeform API (Aggregator)
Shadeform aggregates 30+ GPU cloud providers through a single API. This is the backbone.

**Endpoint**: `GET https://api.shadeform.ai/v1/instances/types`
**Auth**: `X-API-KEY` header (user provides their own key, or we use a project key)
**Query params**: `gpu_type`, `num_gpus`, `available`, `sort=price`

**Response shape** (per instance):
```json
{
  "cloud": "runpod",
  "shade_instance_type": "A100_80G",
  "cloud_instance_type": "NVIDIA A100 80GB PCIe",
  "configuration": {
    "memory_in_gb": 125,
    "storage_in_gb": 250,
    "vcpus": 8,
    "num_gpus": 1,
    "gpu_type": "A100_80G",
    "interconnect": "pcie",
    "vram_per_gpu_in_gb": 80
  },
  "hourly_price": 203,
  "availability": [{ "region": "any", "available": true }]
}
```

**GPU types to query**: H100, H200, A100_80G, A100, L40S, L40, A6000, RTX_4090, RTX_3090, RTX_5090 (when available), B200 (when available)

### Secondary: Direct Provider APIs (Fallback / Supplement)
If Shadeform is down or for spot pricing not in their API:

- **Vast.ai**: `GET https://console.vast.ai/api/v0/bundles?q=...` (public, no auth needed for search)
- **RunPod**: Their GraphQL API at `https://api.runpod.io/graphql` (needs API key)
- **Lambda Labs**: `GET https://cloud.lambdalabs.com/api/v1/instance-types` (needs API key)

### Tertiary: Scraped/Static Fallback
For providers without APIs (AWS, GCP, Azure), maintain a static JSON of known GPU instance pricing that gets updated weekly. Structure:
```json
{
  "aws": {
    "p5.48xlarge": { "gpu": "H100", "num_gpus": 8, "vram_per_gpu": 80, "on_demand_hourly": 98.32, "spot_hourly_estimate": 35.0 },
    "p4d.24xlarge": { "gpu": "A100", "num_gpus": 8, "vram_per_gpu": 40, "on_demand_hourly": 32.77 }
  },
  "gcp": { "...": {} },
  "azure": { "...": {} }
}
```

---

## TRAINING PARAMETER INPUTS

The UI should accept ALL of these. Group them into logical sections with smart defaults and progressive disclosure (basic → advanced toggle).

### Section 1: Model Configuration
| Parameter | Type | Default | Notes |
|---|---|---|---|
| `model_name` | dropdown + search | "Llama-3.3-70B" | Popular models pre-loaded with known param counts |
| `model_params_billions` | number | auto from model_name | Override if custom model |
| `architecture` | dropdown | "Dense" | Dense, MoE (specify active/total experts) |
| `moe_total_experts` | number | 8 | Only if MoE |
| `moe_active_experts` | number | 2 | Only if MoE |

### Section 2: Fine-Tuning Method
| Parameter | Type | Default | Notes |
|---|---|---|---|
| `method` | radio | "QLoRA" | Full Fine-Tune, LoRA, QLoRA |
| `quantization_bits` | dropdown | 4 | 4, 8, 16, 32 (auto-set based on method) |
| `lora_rank` | number | 16 | r value: 4, 8, 16, 32, 64, 128 |
| `lora_alpha` | number | 16 | Scaling factor |
| `lora_target_modules` | multi-select | q,k,v,o,gate,up,down | Which layers get LoRA adapters |
| `use_gradient_checkpointing` | toggle | true | Unsloth's "unsloth" mode saves extra VRAM |
| `full_finetuning` | toggle | false | Only if method = FFT |

### Section 3: Training Configuration
| Parameter | Type | Default | Notes |
|---|---|---|---|
| `dataset_tokens` | number | 10_000_000 | Total tokens in training dataset |
| `dataset_rows` | number | null | Alternative: row count + avg tokens/row |
| `avg_tokens_per_row` | number | 512 | Used with dataset_rows |
| `num_epochs` | number | 3 | |
| `batch_size` | number | 2 | Per-device batch size |
| `gradient_accumulation_steps` | number | 4 | Effective batch = batch_size × grad_accum × num_gpus |
| `max_seq_length` | dropdown | 4096 | 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072 |
| `learning_rate` | number | 2e-4 | |
| `optimizer` | dropdown | "adamw_8bit" | adamw, adamw_8bit, sgd, paged_adamw_8bit |
| `lr_scheduler` | dropdown | "cosine" | cosine, linear, constant |
| `warmup_ratio` | number | 0.03 | |
| `precision` | dropdown | "bf16" | fp32, fp16, bf16, fp8 |
| `packing` | toggle | true | Unsloth packing — fit more samples per batch, and can reduce activation waste |

### Section 4: Optimization Framework
| Parameter | Type | Default | Notes |
|---|---|---|---|
| `framework` | dropdown | "Unsloth" | Unsloth, HuggingFace+TRL, Axolotl, LLaMA-Factory, torchtune, Custom |
| `unsloth_version` | text | "latest" | For referencing specific optimizations |
| `use_flash_attention` | toggle | true | |
| `use_triton_kernels` | toggle | true | Unsloth's custom Triton kernels |
| `use_rope_kernels` | toggle | true | RoPE + MLP kernels: faster and can reduce VRAM |
| `use_packing` | toggle | true | Padding-free packing |

### Section 5: Hardware Preferences
| Parameter | Type | Default | Notes |
|---|---|---|---|
| `target_gpu` | multi-select | ["H100", "A100_80G"] | GPUs to compare |
| `num_gpus` | number | 1 | Per-node GPU count |
| `num_nodes` | number | 1 | Multi-node (for very large runs) |
| `pricing_tier` | multi-select | ["on_demand", "spot"] | on_demand, spot, reserved_1mo, reserved_3mo |
| `min_vram_gb` | number | auto-calculated | Override minimum VRAM filter |

### Section 6: RL / Advanced (Collapsible)
| Parameter | Type | Default | Notes |
|---|---|---|---|
| `training_type` | dropdown | "SFT" | SFT, GRPO, DPO, PPO, ORPO |
| `grpo_num_generations` | number | 8 | For GRPO: samples per prompt |
| `reward_model_size` | number | null | If using separate reward model |
| `vllm_batch_size` | number | 8 | For RL with vLLM inference |

---

## COMPUTATION ENGINE

This is the brain. All math must be transparent — show the user HOW the numbers are derived.

### Step 1: VRAM Estimation

**Goal:** produce **(tight, typical, conservative)** VRAM estimates and a component breakdown.

```
// Bytes per param for stored weights
// QLoRA NF4/FP4 storage is ~4-bit for weights, but there is metadata + scaling overhead.
// Model this explicitly rather than pretending weights are purely 0.5 bytes/param.

weight_bytes_per_param = {4: 0.5, 8: 1, 16: 2, 32: 4}[quantization_bits]
model_weight_vram_gb = (model_params_billions * 1e9 * weight_bytes_per_param) / (1024^3)

// Quantization metadata overhead (group scales, zeros, etc.)
// Calibrate this term so that known Unsloth reference points land correctly.
quant_metadata_multiplier = {
  4: 1.10,   // start point; calibration may tune per architecture
  8: 1.02,
  16: 1.00,
  32: 1.00
}[quantization_bits]
model_vram_gb = model_weight_vram_gb * quant_metadata_multiplier

// MoE note:
// Do NOT assume only active experts are loaded unless you explicitly model expert offload/sharding.
// Use moe_active_experts primarily to scale compute, not weight VRAM.
if architecture == "MoE":
    model_vram_gb = model_weight_vram_gb * quant_metadata_multiplier

// LoRA adapter VRAM
// IMPORTANT: compute LoRA params using the real module matrix shapes from models.json.
// Hidden-size-only shortcuts are wrong for gate/up/down projections.
// For each target module, sum: (in_dim * r + r * out_dim) per layer.
if method in ["LoRA", "QLoRA"]:
    lora_params = 0
    for layer in range(num_layers):
        for module_name in lora_target_modules:
            (in_dim, out_dim) = module_shape(module_name, model_config)
            lora_params += (in_dim * lora_rank) + (lora_rank * out_dim)
    // LoRA weights typically stored in fp16/bf16
    lora_vram_gb = (lora_params * 2) / (1024^3)

// Trainable params (LoRA vs full fine-tune)
trainable_params = (lora_params if method in ["LoRA", "QLoRA"] else model_params_billions * 1e9)

// Optimizer states
if optimizer == "adamw":
    optimizer_vram_bytes = trainable_params * 8  // 2 fp32 states
elif optimizer in ["adamw_8bit", "paged_adamw_8bit"]:
    optimizer_vram_bytes = trainable_params * 2  // 8-bit states + small overhead
elif optimizer == "sgd":
    optimizer_vram_bytes = trainable_params * 4
optimizer_vram_gb = optimizer_vram_bytes / (1024^3)

// Gradient VRAM
gradient_bytes_per_param = (2 if precision in ["fp16", "bf16"] else 4)
gradient_vram_gb = (trainable_params * gradient_bytes_per_param) / (1024^3)

// Activation VRAM
// Key idea: activations scale with effective tokens processed, not just max_seq_length.
// Packing reduces padding waste, which reduces activation memory at a fixed max_seq_length.

// Approx token utilization (fraction of max_seq_length that is real tokens)
// Without packing: depends on dataset; start with a conservative default.
utilization = 0.70
if use_packing:
    utilization = 0.95

effective_seq = max_seq_length * utilization

// Rough activation bytes per layer
activation_bytes_per_layer = batch_size * effective_seq * hidden_size * 2

if use_gradient_checkpointing:
    // checkpointing reduces stored activations; keep as heuristic + calibrate
    activation_vram_gb = (activation_bytes_per_layer * sqrt(num_layers)) / (1024^3)
else:
    activation_vram_gb = (activation_bytes_per_layer * num_layers) / (1024^3)

// Framework multipliers apply mainly to non-weight components
framework_overhead_multiplier = {
    "Unsloth": 0.35,        // baseline starting point, then apply feature multipliers below
    "HuggingFace+TRL": 1.0,
    "Axolotl": 0.85,
    "LLaMA-Factory": 0.80,
    "torchtune": 0.90,
    "Custom": 1.0
}[framework]

// Unsloth feature multipliers (compose them)
if framework == "Unsloth":
    if use_gradient_checkpointing:
        activation_vram_gb *= 0.70
    if use_rope_kernels:
        activation_vram_gb *= 0.70
    if use_triton_kernels:
        // keep conservative; true effect is model-dependent
        activation_vram_gb *= 0.95

// Combine non-weight pieces, then apply framework overhead multiplier
non_weight_vram_gb = lora_vram_gb + optimizer_vram_gb + gradient_vram_gb + activation_vram_gb
non_weight_vram_gb *= framework_overhead_multiplier

// Safety buffer
buffer_multiplier = 1.15

vram_tight_gb = (model_vram_gb + non_weight_vram_gb) * 1.05
vram_typical_gb = (model_vram_gb + non_weight_vram_gb) * buffer_multiplier
vram_conservative_gb = (model_vram_gb + non_weight_vram_gb) * 1.25

// Calibration check against Unsloth published reference table.
// If vram_typical differs by >25%, warn and show both.
```

### Step 2: Training Duration Estimation

```
// Total training tokens
total_tokens = dataset_tokens * num_epochs

// Effective batch size in tokens
// Note: packing increases effective tokens/step for a given max_seq_length
utilization = (0.95 if use_packing else 0.70)
effective_batch_tokens = batch_size * gradient_accumulation_steps * num_gpus * (max_seq_length * utilization)

total_steps = ceil(total_tokens / effective_batch_tokens)

// FLOPs estimation (keep transparent, but avoid the LoRA trap)
// For transformer training, backward compute still flows through the network.
// LoRA reduces *parameter-gradient storage* a lot, not overall backprop compute proportionally.

base_total_flops = 6 * (model_params_billions * 1e9) * total_tokens

if method in ["LoRA", "QLoRA"]:
    // Apply a modest compute discount rather than trainable_params scaling.
    // Make this a visible knob in Show Math.
    lora_compute_discount = 0.90
    total_flops = base_total_flops * lora_compute_discount
else:
    total_flops = base_total_flops

// Long context warning:
// At very large seq lengths, attention cost can dominate.
// Add a penalty term or show a warning when max_seq_length >= 32768.
if max_seq_length >= 32768:
    attention_penalty = (max_seq_length / 32768)
    total_flops *= attention_penalty

// GPU throughput (theoretical TFLOPS → practical)
// Treat these tables as reference, but rely on MFU and framework multipliers.

gpu_tflops = {
    "H100": {"bf16": 989, "fp16": 989, "fp8": 1979, "fp32": 67},
    "H200": {"bf16": 989, "fp16": 989, "fp8": 1979, "fp32": 67},
    "A100_80G": {"bf16": 312, "fp16": 312, "fp32": 19.5},
    "A100": {"bf16": 312, "fp16": 312, "fp32": 19.5},
    "L40S": {"bf16": 362, "fp16": 362, "fp32": 22.6},
    "RTX_4090": {"bf16": 330, "fp16": 330, "fp32": 82.6},
    "RTX_5090": {"bf16": 419, "fp16": 419, "fp32": 105},
    "A6000": {"bf16": 155, "fp16": 155, "fp32": 38.7},
    "B200": {"bf16": 2250, "fp16": 2250, "fp8": 4500, "fp32": 70}
}

mfu = {
    "Unsloth": 0.45,
    "HuggingFace+TRL": 0.25,
    "Axolotl": 0.35,
    "LLaMA-Factory": 0.35,
    "torchtune": 0.30,
    "Custom": 0.30
}[framework]

speed_multiplier = 1.0
if framework == "Unsloth":
    speed_multiplier *= 2.0
    if use_rope_kernels:
        speed_multiplier *= 1.5

practical_flops_per_sec_per_gpu = gpu_tflops[gpu][precision] * 1e12 * mfu * speed_multiplier
training_seconds = total_flops / (practical_flops_per_sec_per_gpu * num_gpus * num_nodes)
training_hours = training_seconds / 3600
```

### Step 3: Cost Calculation

```
// For each provider+GPU combo from pricing data:
cost_on_demand = training_hours * hourly_price_on_demand
cost_spot = training_hours * hourly_price_spot
cost_reserved = training_hours * hourly_price_reserved

num_runs = user_input

total_cost = cost_per_run * num_runs
```

---

## OUTPUT / RESULTS

### Results Display

Show a comparison table/matrix:

| Provider | GPU | VRAM | Hourly ($) | Est. Hours | Total Cost | Spot Cost | Availability |
|---|---|---|---|---|---|---|---|
| RunPod | A100 80G | 80 GB | $2.03 | 14.2 hrs | $28.83 | $11.52 | ✅ Available |
| Lambda | H100 | 80 GB | $2.49 | 8.1 hrs | $20.17 | $0.87* | ✅ Available |
| Vast.ai | RTX 4090 | 24 GB | $0.28 | OOM ⚠️ | — | — | ✅ |
| AWS | p5.48xlarge (8xH100) | 640 GB | $98.32 | 1.01 hrs | $99.30 | ~$35.00 | — |

### Visual Outputs
1. **Cost bar chart** — horizontal bars comparing total cost per provider
2. **Time vs Cost scatter** — training time on X, cost on Y, bubble size = VRAM headroom
3. **VRAM breakdown** — stacked bar showing model weights, quant metadata, optimizer, activations, LoRA, buffer
4. **Savings callout** — "Using Unsloth saves ~$X vs baseline HuggingFace" with percentage

### Computation Transparency
Every result should have an expandable "Show Math" section that displays the exact formulas and intermediate values used. No black boxes.

---

## API SPECIFICATION

### Base URL: `ragweld.com/crucible/api/v1`

### `POST /estimate`
Accepts the full parameter set as JSON body. Returns:
```json
{
  "vram_estimate_gb": 42.3,
  "vram_estimate_bands_gb": { "tight": 39.2, "typical": 42.3, "conservative": 46.8 },
  "vram_breakdown": {
    "model_weights": 35.0,
    "quant_metadata": 3.2,
    "lora_adapters": 0.02,
    "optimizer_states": 2.1,
    "gradients": 0.5,
    "activations": 3.2,
    "buffer": 1.5
  },
  "training_estimate": {
    "total_tokens": 30000000,
    "total_steps": 3662,
    "total_flops": 4.2e17,
    "assumptions": {
      "token_utilization": 0.95,
      "lora_compute_discount": 0.90,
      "mfu": 0.45,
      "speed_multiplier": 3.0
    },
    "estimated_hours_by_gpu": {
      "H100": 8.1,
      "A100_80G": 14.2,
      "L40S": 18.7
    }
  },
  "cost_comparison": [
    {
      "provider": "runpod",
      "gpu": "A100_80G",
      "hourly_price_cents": 203,
      "estimated_hours": 14.2,
      "total_cost_dollars": 28.83,
      "spot_cost_dollars": 11.52,
      "available": true,
      "fits_in_vram": true
    }
  ],
  "meta": {
    "prices_fetched_at": "2026-03-01T12:00:00Z",
    "framework_used": "Unsloth",
    "computation_version": "1.0.0"
  }
}
```

### `GET /prices`
Returns cached GPU pricing data. Optional query params: `gpu_type`, `provider`, `available_only`.

### `GET /models`
Returns the list of known models with their parameter counts, hidden sizes, num layers, etc.

### `GET /health`
Standard health check.

---

## MODEL DATABASE

Pre-populate a JSON file with known model configurations. This is critical for auto-filling parameters.

```json
{
  "llama-3.3-70b": {
    "params_billions": 70.6,
    "hidden_size": 8192,
    "num_layers": 80,
    "num_attention_heads": 64,
    "num_kv_heads": 8,
    "intermediate_size": 28672,
    "vocab_size": 128256,
    "max_position_embeddings": 131072,
    "architecture": "dense"
  }
}
```

Extend this significantly. Include every model Unsloth supports from their model catalog.

---

## UNSLOTH-SPECIFIC VRAM REFERENCE DATA

From Unsloth's documentation, hardcode published VRAM requirements as a validation/calibration reference.

| Model Size | Method | VRAM (Unsloth) | VRAM (Baseline HF) |
|---|---|---|---|
| 1.5B | QLoRA 4-bit | ~2 GB | ~6 GB |
| 3B | QLoRA 4-bit | ~4 GB | ~12 GB |
| 7-8B | QLoRA 4-bit | ~6 GB | ~18 GB |
| 14B | QLoRA 4-bit | ~10 GB | ~30 GB |
| 32B | QLoRA 4-bit | ~18 GB | ~54 GB |
| 70B | QLoRA 4-bit | ~40 GB | ~120 GB |
| 7-8B | LoRA 16-bit | ~16 GB | ~48 GB |
| 70B | LoRA 16-bit | ~80+ GB | OOM on most |

Use these to calibrate and validate the computation engine. If computed VRAM differs by >25%, show a warning.

---

## UI/UX DESIGN DIRECTION

### Aesthetic
Industrial. Utilitarian. Like a real engineering tool, not a SaaS landing page.
- Dark theme by default (eyes-on-terminal energy)
- Monospace font for numbers and calculations (`JetBrains Mono` or `IBM Plex Mono`)
- Clean sans-serif for labels (`Inter` is fine here — it's a calculator, not a portfolio)
- High contrast: bright accent colors on dark backgrounds
- Data-dense — show lots of information without hiding it behind modals
- Color coding: green = fits/good, amber = tight, red = OOM/won't fit

### Layout
```
┌─────────────────────────────────────────────────────┐
│  🔥 CRUCIBLE — GPU Training Cost Calculator         │
│  by ragweld                                         │
├──────────────────────┬──────────────────────────────┤
│                      │                               │
│  [INPUT PANEL]       │  [RESULTS PANEL]             │
│                      │                               │
│  Model: [dropdown]   │  VRAM Typical: 42.3 GB       │
│  Method: ○ QLoRA     │  Bands: 39.2 / 42.3 / 46.8   │
│  LoRA rank: [16]     │  ┌──────────────────────┐   │
│  Dataset: [tokens]   │  │ VRAM BREAKDOWN CHART  │   │
│  Epochs: [3]         │  └──────────────────────┘   │
│  Batch: [2]          │                               │
│  Seq len: [4096]     │  Provider Comparison:         │
│  Framework: Unsloth  │  ┌──────────────────────┐   │
│                      │  │ COST TABLE / CHART    │   │
│  [▸ Advanced]        │  └──────────────────────┘   │
│                      │                               │
│                      │  [▸ Show Math]               │
│  [CALCULATE]         │  [📋 Copy API Request]       │
│                      │  [↗ Share Link]              │
└──────────────────────┴──────────────────────────────┘
```

### Interactive Features
- **Real-time calculation** — results update as you type (debounced 300ms)
- **URL state** — all parameters encoded in URL query string for sharing (`/crucible?model=llama-3.3-70b&method=qlora&...`)
- **Preset buttons** — "Quick Start" presets: "70B QLoRA on H100", "7B LoRA cheap", "Reasoning model (GRPO)"
- **Copy as curl** — one-click copy the equivalent API request
- **Export** — download results as JSON or CSV
- **GPU availability indicator** — show if GPUs are actually available right now (from Shadeform data)

---

## DEPLOYMENT

### Netlify Config
```toml
# netlify.toml
[build]
  command = "npm run build"
  publish = "dist"
  functions = "netlify/functions"

# Prefer function-level routing via `export const config = { path: ... }` in each function.
# Keep redirects minimal and only for SPA routing.

[[redirects]]
  from = "/crucible/*"
  to = "/crucible/index.html"
  status = 200
```

### Netlify Functions Structure
```
netlify/
  functions/
    estimate.ts       # POST /crucible/api/v1/estimate
    prices.ts         # GET  /crucible/api/v1/prices
    models.ts         # GET  /crucible/api/v1/models
    health.ts         # GET  /crucible/api/v1/health
```

### Vite Base Path (IMPORTANT)
Crucible is served under `/crucible/`, so configure Vite base:
- `vite.config.ts`: `base: "/crucible/"`

### Environment Variables (Netlify)
```
SHADEFORM_API_KEY=xxx
VAST_AI_API_KEY=xxx        # optional
RUNPOD_API_KEY=xxx         # optional
LAMBDA_API_KEY=xxx         # optional
```

---

## REPO STRUCTURE

```
crucible/
├── public/
│   └── favicon.svg
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css
│   ├── components/
│   │   ├── InputPanel.tsx
│   │   ├── ResultsPanel.tsx
│   │   ├── VRAMBreakdown.tsx
│   │   ├── CostComparison.tsx
│   │   ├── MathExplainer.tsx
│   │   ├── PresetButtons.tsx
│   │   ├── GPUAvailability.tsx
│   │   └── ShareExport.tsx
│   ├── engine/
│   │   ├── vram.ts
│   │   ├── training.ts
│   │   ├── cost.ts
│   │   ├── models.ts
│   │   ├── gpu-specs.ts
│   │   └── index.ts
│   ├── hooks/
│   │   ├── useTrainingEstimate.ts
│   │   ├── useGPUPricing.ts
│   │   └── useURLState.ts
│   └── types/
│       └── index.ts
├── netlify/
│   └── functions/
│       ├── estimate.ts
│       ├── prices.ts
│       ├── models.ts
│       └── health.ts
├── data/
│   ├── models.json
│   ├── gpu-specs.json
│   ├── static-pricing.json
│   └── unsloth-changelog.json
├── netlify.toml
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── README.md
```

---

## KEY IMPLEMENTATION NOTES

1. **All computation logic lives in `src/engine/`** — pure functions, no React dependencies.

2. **The API and the UI share the same engine.** Netlify Functions import the same pure compute code.

3. **Pricing data is fetched server-side** to protect API keys.

4. **Caching**: cache for 15 minutes in function memory (or Netlify KV). Add `Cache-Control` headers.

5. **Error handling**: If Shadeform is down, fall back to static pricing with a clear banner.

6. **The math must be auditable.** Every intermediate value must be accessible.

7. **Mobile responsive** but desktop-first.

8. **No auth required for the web UI**, but be serious about abuse:
   - enforce rate limiting server-side (not only headers)
   - cache aggressively
   - optionally support “bring your own Shadeform key” for heavy users

9. **SEO**: proper meta tags and Open Graph.

---

## UNSLOTH CHANGELOG AWARENESS

Unsloth ships fast. Track major performance-relevant releases in `data/unsloth-changelog.json`.

```json
[
  {
    "date": "2026-02",
    "feature": "MoE 12x faster training, 35% less VRAM",
    "affects": "moe_speed_multiplier",
    "value": 12.0
  },
  {
    "date": "2026-01",
    "feature": "RoPE + MLP Triton kernels: 3x faster, 30% less VRAM",
    "affects": "kernel_speed_multiplier",
    "value": 3.0
  },
  {
    "date": "2025-11",
    "feature": "FP8 RL support",
    "affects": "fp8_support",
    "value": true
  },
  {
    "date": "2025-02",
    "feature": "GRPO with 80% less VRAM vs HF+FA2",
    "affects": "grpo_vram_multiplier",
    "value": 0.20
  }
]
```

---

## WHAT SUCCESS LOOKS LIKE

1. A user puts in "Llama 3.3 70B, QLoRA, 10M tokens, 3 epochs, Unsloth" and instantly sees: VRAM bands + breakdown, which GPUs fit, how long it takes, what it costs across providers, and the complete math.

2. An AI agent hits `POST /crucible/api/v1/estimate` and gets structured JSON back fast.

3. Someone shares a URL like `ragweld.com/crucible?model=llama-3.3-70b&method=qlora&tokens=10000000&epochs=3` and the recipient sees the exact same calculation.

4. The "Show Math" section is so clear that the assumptions are obvious and adjustable.

---

## WHAT THIS IS NOT

- Not a GPU provisioning tool (we don't launch instances)
- Not a training execution tool (we don't run training)
- Not a benchmark database (we compute estimates, not measured results)
- We are transparent that these are **estimates** — always show confidence ranges and encourage users to run small validation tests

---

## BRANDING

- **Name**: Crucible
- **Tagline**: "Know what your training costs before you burn the credits."
- **URL**: ragweld.com/crucible
- **Logo concept**: A crucible vessel icon with a GPU chip melting into it (simple, geometric, monochrome)

---

## AGENT TEAMS — WORK DECOMPOSITION

This project should be built using Claude Code Agent Teams. The lead session orchestrates, spawns teammates, and handles final integration. Teammates work in parallel on isolated file boundaries — no two teammates should ever edit the same file.

**NOTE:** Agent Teams is experimental and must be enabled in Claude Code before use.

### Team Name: `crucible-build`

### Phase 0: Lead Setup (before spawning teammates)
The lead does this alone:

1. Initialize the Vite + React + TypeScript project
2. Install dependencies: `tailwindcss`, `recharts`, `lucide-react`, `@netlify/functions`
3. Create `netlify.toml`
4. Create `src/types/index.ts` — ALL shared TypeScript interfaces
5. Create `tailwind.config.js` with dark industrial theme tokens
6. Configure `vite.config.ts` base path: `base: "/crucible/"`
7. Commit scaffolding

### Phase 1: Parallel Build (4 teammates, no file overlap)

Spawn all four simultaneously. Each owns a distinct set of files.

**Team quality gates (recommended):** use hooks so tasks cannot be marked complete unless:
- JSON parses
- engine tests pass
- `npm run build` passes

Also: for engine + API, require plan approval before code changes.

#### Teammate 1: `engine-smith`
**Owns**: `src/engine/*`
**Prompt**:
```
You are building the computation engine for a GPU training cost calculator.
Your files: src/engine/vram.ts, src/engine/training.ts, src/engine/cost.ts,
src/engine/models.ts, src/engine/gpu-specs.ts, src/engine/index.ts.

Import types from src/types/index.ts (already exists).
All functions must be pure.

Implement the updated COMPUTATION ENGINE formulas in this prompt.
Output VRAM estimate bands (tight/typical/conservative) and all intermediate values.

Export:
  computeEstimate(params: EstimateRequest, pricing: ProviderPricing[]): EstimateResponse

Write unit tests in src/engine/__tests__/.
```

#### Teammate 2: `data-forge`
**Owns**: `data/*`
**Prompt**:
```
You are building reference data files.
Populate models.json with every major Unsloth-supported model.
Populate gpu-specs.json with TFLOPS by precision, VRAM, bandwidth.
Populate static-pricing.json (AWS/GCP/Azure) with on-demand + spot and last_updated.
Populate unsloth-changelog.json with performance-relevant releases.

Validate all JSON parses.
Include data/README.md with sources.
```

#### Teammate 3: `api-smith`
**Owns**: `netlify/functions/*`
**Prompt**:
```
You are building the Netlify Functions API.
Your files: netlify/functions/estimate.ts, prices.ts, models.ts, health.ts.

IMPORTANT:
- Shadeform pricing uses GET https://api.shadeform.ai/v1/instances/types
- Use SHADEFORM_API_KEY
- Implement in-memory TTL cache (15 min)
- Fall back to static-pricing.json if Shadeform is unreachable

Use function-level routing:
export const config = { path: "/crucible/api/v1/..." }

estimate.ts:
- POST EstimateRequest
- Fetch prices via shared pricing module
- Call computeEstimate()

Add CORS.
Enforce rate limiting server-side (not only headers).
Return structured errors.
```

#### Teammate 4: `ui-smith`
**Owns**: `src/components/*`, `src/hooks/*`, `src/App.tsx`, `src/main.tsx`, `src/index.css`
**Prompt**:
```
You are building the frontend UI for Crucible.
Industrial, utilitarian, dark theme.

Import types from src/types/index.ts.
Import computation from src/engine/index.ts.
Use Recharts.

Build components and hooks as specified.

Ensure URLs work under /crucible/ base path.
Fetch pricing from /crucible/api/v1/prices.
```

### Phase 2: Integration (Lead takes over)

After all teammates complete:

1. Run `npm run build`
2. Run engine tests
3. Verify API routes `/crucible/api/v1/health` and `/crucible/api/v1/prices`
4. Smoke test: Llama 70B QLoRA Unsloth should land near published Unsloth reference (~40 GB) with bands.
5. Deploy to Netlify

---

## CONTEXT: WHY THIS EXISTS

This project was born from a real conversation where a user asked for a cost estimate for fine-tuning a 70B model with QLoRA + Unsloth. The goal here is: transparent math, live pricing, and a tool that can be audited.

Build it.

