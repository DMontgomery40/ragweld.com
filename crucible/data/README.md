# Crucible Data Reference

This folder contains machine-consumable reference datasets used by Crucible's estimator and API fallback logic.

For source-backed compatibility guardrails and refresh notes, see [docs/crucible-estimator-source-ledger.md](/Users/davidmontgomery/ragweld.com/crucible/docs/crucible-estimator-source-ledger.md).

## Files

- `models.json`: Crucible-owned model structure catalog with architecture fields and precomputed `module_shapes` for LoRA target modules (`q`, `k`, `v`, `o`, `gate`, `up`, `down`).
- `gpu-specs.json`: GPU VRAM, memory bandwidth, and precision-specific throughput reference values.
- `static-pricing.json`: Static provider pricing snapshot fallback with spot and reserved estimates plus source timestamps. The live `/prices` feed also merges in non-duplicate static direct-cloud rows so AWS/GCP/Azure/CoreWeave remain visible even when Shadeform is healthy.
- `unsloth-changelog.json`: Performance-relevant Unsloth release history and metrics.

## Ownership Boundaries

- `models.json` is the model structure source of truth for Crucible's training math. It is separate from the landing-page/demo catalog.
- `static-pricing.json` is a fallback snapshot for the live provider pricing catalog exposed via `/crucible/api/v1/prices`, and a supplemental source for direct-cloud rows/tier backfill when the live feed is incomplete.
- Unsloth compatibility and provider/workflow support rules live in Crucible engine source alongside the estimator because they are executable planner logic, not passive catalog rows.

## Primary Sources

- Unsloth model configs (live `config.json`): https://huggingface.co/unsloth
- Cloud instance pricing snapshots: https://instances.vantage.sh
- Unsloth releases/changelog: https://github.com/unslothai/unsloth/releases
- GPU specs (vendor + consolidated references):
  - https://www.nvidia.com/en-us/data-center/
  - https://resources.nvidia.com/
  - https://www.techpowerup.com/gpu-specs/

## Update Notes

- `models.json`
  - Re-pull `config.json` from each mapped `unsloth_model_id` / `hf_repo_id`.
  - Recompute `module_shapes` from hidden size, head counts, head dim, and MLP dimensions.
  - Keep `params_billions` and MoE active/total expert fields aligned with model naming and release notes.
  - Daily refresh automation:
    - Workflow: `.github/workflows/refresh-crucible-models.yml`
    - Script: `crucible/scripts/refresh-models-catalog.mjs`
    - Seeds from this catalog plus `../ragweld/web/public/models.json` (or remote fallback) for Hugging Face repo ids.

- `static-pricing.json`
  - Refresh on-demand/spot/reserved values from instance pages.
  - Preserve `last_updated` and per-instance `scraped_at`.
  - If spot/reserved values are unavailable, keep fallback estimates explicit via `*_source` fields.

- `gpu-specs.json`
  - Update when new GPU SKUs or revised vendor throughput figures are published.
  - Keep precision keys stable (`fp32`, `fp16`, `bf16`, `fp8`).

- `unsloth-changelog.json`
  - Append performance-relevant releases only.
  - Prefer normalized numeric metrics in `performance_signals` for downstream rules.

## Consistency Rules

- Keep all timestamps in ISO-like UTC date form (`YYYY-MM-DD` for dataset-level fields).
- Preserve stable IDs (`id`, `instance_type`, `tag`) for diff-friendly updates.
- Avoid schema drift: append fields only when they are broadly useful across most entries.
