---
layout: ../../../layouts/BlogPostLayout.astro
title: "Qwen3 LoRA Learning Reranker on Apple Silicon"
date: 2026-02-04
slug: learning-reranker-qwen3-mlx
author: RagWeld Team
tags: [reranking, mlx, apple-silicon, qwen3, lora, production-rag]
summary: "How we implemented a Qwen3 LoRA learning reranker with yes/no logits on Apple Silicon, plus the five implementation bugs that silently degrade scoring quality."
---

We needed a reranker that *trains* on Apple Silicon. Not inference-only, not “export to CoreML and hope” — actually trains LoRA adapters locally so it learns from user feedback and improves over time.

That’s the core loop in TriBridRAG’s learning reranker: users give thumbs up/down, we mine triplets, we fine-tune, retrieval gets better.

Our existing backend uses `sentence-transformers` `CrossEncoder` on PyTorch MPS. It works. It’s also slow to train, memory-hungry, and tethered to a framework that still treats Apple Silicon as an afterthought. We wanted native **MLX** — Apple’s lazy-evaluation ML framework that actually uses unified memory properly.

So we went looking. What we found changed how we think about reranking entirely.

## The landscape isn’t what we expected

We surveyed what was available in early 2026: `jina-ai/mlx-retrieval`, ModernBERT MLX ports, Jina Reranker v3 MLX, PyTorch MPS fallback paths. What we kept running into was a fork in the road that didn’t exist two years ago.

The older encoder-classifier architecture — `BERT([CLS] query [SEP] document) → linear head → score` — has increasingly been replaced by decoder-style reranking in many newer systems.

The new approach: format the query-document pair as a chat prompt, feed it through a small language model, and compare the logit for **"yes"** against the logit for **"no"**.

No classification head. No `[CLS]` token. The model literally answers *“is this document relevant?”* and you read the probability distribution over two tokens.

```text
System: Judge whether the document is relevant to the search query.
        Respond only with "yes" or "no".
User:   <query>how does RRF fuse graph results</query>
        <document>{chunk content}</document>
Assistant: <think>...</think>
```

We score a candidate with:

```text
score = P("yes") / (P("yes") + P("no"))
```

Qwen3-Reranker-0.6B (using this approach) gave us the quality/latency tradeoff we wanted for a trainable learning reranker on Apple Silicon.

The reason is almost embarrassingly intuitive: even a small language model has richer semantic understanding than a BERT encoder with a bolted-on classification head, because it was trained to *reason* about text, not just encode it.

## What we built

We went with **Qwen3-Reranker-0.6B** as the base, with LoRA fine-tuning via `mlx_lm`, targeting the `q/k/v/o` projection matrices. The adapter is tiny — roughly ~2MB on top of a ~1.2GB base model in FP16.

Training runs at ~800–1200 tokens/sec on an M2 Pro, fast enough to retrain nightly from accumulated feedback.

Integration-wise, we replaced TriBridRAG’s learning reranker backend. Same config surface, same training triggers, same hot-reload — but the engine underneath is fundamentally different.

A config flag (`learning_reranker_backend: "auto"`) detects macOS ARM64 and routes to MLX automatically. Linux and CI fall back to the existing `sentence-transformers` path. No one’s workflow breaks.

But getting from *“this should work”* to *“this actually works correctly in production”* surfaced five bugs that will bite anyone building this.

## Five bugs that silently corrupt your scores

### 1) Token ID resolution is cursed

You cannot just call `tokenizer.convert_tokens_to_ids("yes")`.

On Qwen-style tokenizers, `"yes"` can map to different token IDs depending on whether it’s the first generated token or appears mid-sentence. If you get this wrong, you’ll compute perfectly “reasonable-looking” scores that are based on the wrong logits.

The robust fix: encode the exact assistant prefix that will precede generation, append `"yes"`, and take the **last** token ID.

### 2) Batched decoder scoring reads the wrong position

Qwen3 is a decoder, not an encoder. When you right-pad sequences to batch them, the “last real token” is at a different position for each sequence.

If you read `logits[:, -1, :]`, you’re reading padding-position logits for every sequence shorter than the longest.

You need per-sequence indexing: `logits[i, seq_lengths[i] - 1, :]`.

This one is insidious because your scores still fall in `[0, 1]` and distributions look plausible — they’re just wrong.

### 3) Gradient accumulation in MLX can’t follow the PyTorch pattern

Calling `mx.eval()` inside the micro-batch loop forces materialization and kills MLX’s lazy evaluation benefits.

The correct pattern: accumulate gradients across micro-steps, average once, call `optimizer.update()` once, and call `mx.eval()` once per *effective* step.

Getting this wrong doesn’t crash — it just makes training 3–5× slower with similar loss curves, so you’ll miss it unless you profile.

### 4) Numerically-stable loss needs `logsumexp`

With only two logits (yes/no), naive softmax works fine in float32.

In float16 (common on MLX), the subtraction in `log(exp(yes) / (exp(yes) + exp(no)))` can overflow.

Use the numerically-stable form:

```text
loss = logsumexp([yes, no]) - target_logit
```

Same math; less 2am NaN pain.

### 5) Backend mismatch on promotion gating

If you train with the Transformers backend, then switch to MLX, your “promotion” logic can try to evaluate an old HuggingFace checkpoint as a Qwen3 LoRA adapter.

Best case: it crashes. Worst case: it “works” and produces garbage baseline metrics.

The fix: store/check backend type in the model manifest before comparing. Treat mismatches as “no baseline exists.”

## The tradeoff

Decoder-based scoring is slower than BERT classification — roughly ~50–100ms per query-document pair on an M2 Pro versus ~2–5ms for MiniLM.

For 50 rerank candidates, that’s 2.5–5 seconds of wall time. We mitigate with batched inference and recommend keeping `topN` at ~20–30 for interactive use. For offline eval runs, score everything.

The training loop also produces larger artifacts than a fine-tuned MiniLM. But the quality gap is real: in our internal eval on code-retrieval queries, a Qwen3 adapter trained on ~200 feedback triplets outperformed a MiniLM cross-encoder trained on the same data by a margin wide enough that we stopped testing MiniLM.

## What this actually means

The reranking community quietly moved from **“encode and classify”** to **“reason and judge”** sometime in 2025, and most production systems haven’t caught up.

If you’re still fine-tuning `cross-encoder/ms-marco-MiniLM-L-6-v2`, you’re leaving retrieval quality on the table — and the replacement is smaller, cheaper to fine-tune, and runs natively on the hardware already sitting on your desk.

The adapter is ~2MB. The base model is ~1.2GB. Training takes minutes, not hours. And it actually learns your domain.

Built in the open at RagWeld. TriBridRAG source on GitHub: https://github.com/DMontgomery40/tribrid-rag
