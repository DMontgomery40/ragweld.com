# Crucible Estimator Source Ledger

Last verified: 2026-03-05

This ledger records the external sources currently used to justify Crucible's planner rules.
It is intentionally narrow: only rules that materially change normalization, support tiering, or provider/workflow posture are listed here.

## Current Guardrails

1. `workflow_mode=guided` means "stay close to explicitly documented setup paths."
   Sources:
   - https://unsloth.ai/docs/get-started/install
   - https://unsloth.ai/docs/get-started/unsloth-notebooks
   - https://unsloth.ai/docs/get-started/install/docker

2. Unsloth multi-GPU should not be treated as the easy path.
   Reason:
   - Unsloth documents multi-GPU via Accelerate / DeepSpeed / FSDP / DDP and calls out manual setup flows.
   Sources:
   - https://unsloth.ai/docs/basics/multi-gpu-training-with-unsloth
   - https://unsloth.ai/docs/basics/multi-gpu-training-with-unsloth/ddp

3. QLoRA is modeled as 4-bit adapter training.
   Reason:
   - Unsloth's fine-tuning guide separates 4-bit loading from LoRA/full fine-tune modes and describes QLoRA via `load_in_4bit`.
   Source:
   - https://unsloth.ai/docs/get-started/fine-tuning-llms-guide

4. Full fine-tune should not silently run with 4-bit base-weight planning.
   Reason:
   - Current source-backed guide documents full fine-tuning and 8-bit fine-tuning, but not 4-bit full fine-tuning as the normal path.
   Source:
   - https://unsloth.ai/docs/get-started/fine-tuning-llms-guide

5. QAT warnings are only source-backed for Unsloth's LoRA-style guidance.
   Reason:
   - The current QAT guide explicitly frames QAT in combination with LoRA fine-tuning.
   Source:
   - https://unsloth.ai/docs/get-started/fine-tuning-llms-guide/lora-hyperparameters-guide

6. Blackwell planning is source-backed only for NVIDIA paths today.
   Reason:
   - Unsloth documents Blackwell-specific requirements and dependency floors.
   Sources:
   - https://unsloth.ai/docs/get-started/fine-tuning-for-beginners/unsloth-requirements
   - https://unsloth.ai/docs/blog/fine-tuning-llms-with-blackwell-rtx-50-series-and-unsloth

7. Cloud provider rows are ranked as `inferred` or `custom`, not `documented`.
   Reason:
   - Unsloth documents environment requirements and setup paths, not a provider certification matrix.
   - Crucible treats cloud providers as generic CUDA/Docker environments unless a provider-specific rule is later added.
   Sources:
   - https://unsloth.ai/docs/get-started/install
   - https://unsloth.ai/docs/get-started/install/docker
   - https://unsloth.ai/docs/get-started/fine-tuning-for-beginners/unsloth-requirements

8. Crucible is now a range planner, not an exact estimator.
   Reason:
   - Throughput, VRAM overhead, and pricing freshness are partly heuristic or environment-dependent.
   - Crucible surfaces optimistic / typical / conservative bands plus normalization and freshness metadata instead of pretending one scalar is authoritative.
   Sources:
   - This rule is a product posture built on the source-backed limits above rather than a single external source.

## Non-Goals

- This file is not a provider certification list. Unsloth documents environment requirements, not a universal cloud-provider compatibility matrix.
- This file does not claim that every exposed Crucible hyperparameter is fully modeled. Some fields remain informational or heuristic.
- This file does not claim exact benchmarking fidelity. Crucible exposes uncertainty bands where the source base is heuristic or freshness-sensitive.

## Refresh Protocol

1. Re-check every URL above.
2. Update this file's `Last verified` date.
3. Update `SOURCE_LEDGER_VERSION` in [compatibility.ts](/Users/davidmontgomery/ragweld.com/crucible/src/engine/compatibility.ts).
4. Re-run `npm test` and confirm normalization events, support tiers, and warnings still match the documented rule set.
