# Crucible Help Backlog

This file tracks the remaining work for Crucible's educational help system.

## Rules

- Crucible help is local to `crucible/`.
- Do not reuse `ragweld` glossary content as source text.
- Do not assume definitions from model memory when current behavior may have changed.
- Research-backed cards must use current sources.
- Verbosity should vary with complexity. Some controls only need a compact explanation. Others need a full operator-facing educational card.

## Done

- `InputPanel` help is centralized in [inputPanelHelp.ts](../src/help/inputPanelHelp.ts).
- The form now references registry entries instead of inline tooltip strings.
- The tooltip renderer in [InputPanel.tsx](../src/components/InputPanel.tsx) supports:
  - short summaries
  - badges
  - structured sections
  - source links
- `LoRA rank` is the current exemplar rich card.

## Batch 1: InputPanel Research Rewrite

Priority: highest

Research and rewrite the centralized cards in [inputPanelHelp.ts](../src/help/inputPanelHelp.ts) by domain:

1. Model and adapter concepts
2. Quantization and QAT
3. Training loop and optimization
4. Hardware, provider, and runtime assumptions
5. RL-specific controls
6. Kernel and packing toggles

## Batch 2: Results Interpretation

Priority: high

Components:

- [ResultsPanel.tsx](../src/components/ResultsPanel.tsx)
- [VRAMBreakdown.tsx](../src/components/VRAMBreakdown.tsx)
- [CostComparison.tsx](../src/components/CostComparison.tsx)
- [GPUAvailability.tsx](../src/components/GPUAvailability.tsx)

Focus:

- explain ranges
- explain support and freshness
- explain fit vs availability vs recommendation
- explain VRAM buckets
- explain cost status and provider support tiers

## Batch 3: Math and Audit Surfaces

Priority: high

Components:

- [MathExplainer.tsx](../src/components/MathExplainer.tsx)
- [MathCodeWorkbenchPage.tsx](../src/components/MathCodeWorkbenchPage.tsx)

Focus:

- operator summary vs expert detail
- definitions for estimator assumptions
- reading order through the code workbench
- mapping UI outputs to implementation files

## Batch 4: Export and Operational Actions

Priority: medium

Components:

- [ShareExport.tsx](../src/components/ShareExport.tsx)

Focus:

- explain what each export artifact is for
- explain what is static versus live
- explain prerequisites for downstream actions like Shadeform handoff

## Research Workflow

For each batch:

1. Inventory the controls and concepts.
2. Research current behavior and recent references.
3. Write cards into a local Crucible registry file.
4. Review for tone and consistency.
5. Wire the cards into the relevant component.
6. Validate rendering and interaction behavior.

## No-Assumption Areas

These areas should always be treated as current-research topics:

- framework-specific behavior
- quantization profiles and QAT schemes
- provider support tiers and pricing/freshness semantics
- FlashAttention, Triton, RoPE, fused CE, faster MoE kernels
- RL-specific controls
- vLLM-related behavior
