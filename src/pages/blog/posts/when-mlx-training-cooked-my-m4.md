---
layout: ../../../layouts/BlogPostLayout.astro
title: "When MLX Training Cooked My M4 Pro: A Unified Memory Horror Story"
date: 2026-02-07
slug: when-mlx-training-cooked-my-m4
author: RagWeld Team
tags: [mlx, apple-silicon, training, debugging, unified-memory, production-rag, postmortem]
summary: "A 0.6B parameter reranker training run hard-froze a 48GB M4 Pro Mac Mini — twice. Here's the forensic timeline from the run logs, why unified memory makes GPU OOM act like a kernel panic, and the specific code changes that prevent it."
---

Last night I hit the Train button in ragweld's Learning Reranker studio and my M4 Pro Mac Mini — 48GB unified memory, comfortably runs 20B LLMs — went completely dark. One monitor down, the other frozen. Mouse dead. Had to hold the power button for ten seconds.

Then I did it again. Same result.

This is the story of how a 0.6B parameter LoRA fine-tune brought Apple's flagship chip to its knees, told through the actual run logs, git diffs, and Colima crash artifacts from the session.

## The setup

ragweld's [learning reranker](/blog/posts/learning-reranker-qwen3-mlx) trains Qwen3-0.6B with LoRA adapters on user feedback. You mine triplets from thumbs-up/down signals, then fine-tune so retrieval improves over time. We'd just shipped MLX as the native Apple Silicon backend — the whole point being that MLX uses unified memory "properly" instead of PyTorch's MPS shim.

The training corpus was our Epstein Files dataset: 180 materialized triplets from messy OCR documents. Tiny. Should be a five-minute job.

## The forensic timeline

I'm reconstructing this from the actual `metrics.jsonl` files left behind by each run, because obviously there are no system logs surviving a hard power cycle.

**21:10:12 — Run starts on transformers fallback.** The first attempt (`epstein-files-1__20260206_211012`) resolved `backend=auto` to `transformers` because MLX deps weren't installed yet. Each step took ~25 seconds at batch_size=16, max_length=512. Slow but stable. Loss dropped from 4.22 to 0.48 over 14 steps across four minutes.

```
step  1: loss=4.2215  step_time=27,547ms  batch=16
step 10: loss=0.4842  step_time=25,733ms  batch=16
step 14: loss=0.7260  step_time=26,953ms  batch=16
```

This run was manually cancelled when we noticed MLX wasn't being used.

**21:20:41 — The ghost run.** After installing MLX extras via `uv sync --extra mlx`, a second run started (`epstein-files-1__20260206_212041`). Its metrics file tells the whole story in six lines:

```
21:20:41 — "Primary metric locked: ndcg@10"
21:20:41 — "Queued background training job."
21:20:43 — "Training on 180 materialized triplets"
21:20:43 — status: running
21:58:02 — status: cancelled (by operator, 37 minutes later)
```

Notice what's missing: *zero training steps*. No loss, no grad_norm, no step_time. The run queued, started materializing, and then... silence. For 37 minutes. Until I held down the power button and, much later, an AI assistant force-cancelled the orphaned run record.

**~21:21 — The freeze.** Somewhere between "Training on 180 materialized triplets" and the heat death of my display pipeline, MLX began computing its first forward pass. That's where things went wrong.

## Why a 0.6B model can freeze a 48GB machine

The intuition "0.6B is tiny, this should be fine" is correct for inference. It's wrong for training with these specific settings, and the reason comes down to three multipliers:

**1. Full logit materialization.** The MLX trainer computes logits for the entire vocabulary at every position, then slices to extract the last-token yes/no scores:

```python
# mlx_qwen3_trainer.py, the problematic path
logits = model(input_ids, ...)   # shape: (B, L, V)
last_logits = logits[:, -1, :]   # only need this, but full tensor exists
```

With batch_size=16, max_length=512, and Qwen3's ~152K vocabulary, the logits tensor alone is `16 × 512 × 152,000 × 2 bytes ≈ 2.3 GB` in fp16. That's before the backward pass doubles it, before gradient accumulation retains another copy, and before optimizer state.

**2. Aggressive pair expansion.** The trainer's `negative_ratio=5` means each triplet becomes 6 labeled pairs (1 positive + 5 negatives). Our 180 triplets expand to 1,080 training pairs. With batch_size=16, that's 67 gradient steps per epoch, each materializing the full logit tensor.

**3. MLX lazy evaluation without forced realization.** MLX is lazy by design — operations build a computation graph that's evaluated on demand. The original code accumulated gradients across steps without calling `mx.eval()` between them, letting the lazy graph grow unbounded. Each micro-step added another 2.3 GB node to a graph that MLX had to hold in memory simultaneously.

**The unified memory trap.** On discrete-GPU systems, an OOM kills the offending CUDA process and you get a stack trace. On Apple Silicon, GPU memory *is* system memory. When MLX's lazy graph consumes enough of the unified pool, macOS can't allocate for WindowServer (the process that drives your displays), the compositing pipeline stalls, and you get a UI freeze that looks like a kernel panic but is actually GPU memory pressure starving the display server.

There's no graceful degradation path. No "your process has been killed" dialog. Just darkness.

## The cascade: Colima and the startup death spiral

After the hard reboot, the fun continued. The ragweld stack wouldn't start:

```
$ ./start.sh
unable to get image 'neo4j:5.26.20-community':
Cannot connect to the Docker daemon at
unix:///Users/davidmontgomery/.colima/default/docker.sock.
Is the docker daemon running?
```

Colima (the Docker runtime for macOS) uses Apple's Virtualization.framework to run a Linux VM. Hard power cycles leave Colima's VM in an indeterminate state — the hypervisor thinks the instance is still attached, but the processes that manage it are gone.

```
$ colima start
FATA[0004] error starting vm: error at 'starting': exit status 1
```

The hostagent log showed the specific failure: `failed to run attach disk "colima", in use by instance "colima"`. A stale VZ attachment from the pre-crash session was blocking the new boot. The fix was clearing orphaned Lima helper processes and restarting, but `start.sh` had no awareness of any of this — it just called `docker compose up` and died.

And *then*, even after Colima recovered, `docker compose up` failed with container name conflicts because the `tribrid-postgres` and `tribrid-neo4j` containers still existed from a different compose project namespace. Three layers of failure from one power cycle.

## The fix: 784 lines across 12 files

The changes break into three categories: memory safety, run control, and startup resilience.

### MLX memory pressure caps

The headline fix clamps training parameters to a safe envelope when running on Apple Silicon:

```python
if backend == "mlx_qwen3":
    train_batch_size = max(1, min(orig_batch, 1))
    train_max_length = max(32, min(orig_maxlen, 256))
    train_grad_accum_steps = max(1, min(orig_grad, 8))
```

batch_size=16 becomes 1. max_length=512 becomes 256. The logit tensor drops from 2.3 GB to `1 × 256 × 152,000 × 2 ≈ 74 MB`. That's a 31× reduction in peak memory per forward pass.

We also added forced `mx.eval()` calls after every micro-step to prevent lazy graph accumulation:

```python
loss, grads = loss_and_grad(batch)
mx.eval(loss)                         # force-realize loss
mx.eval(*_tree_leaves(grads))         # force-realize gradients
accumulated_grads = accumulate_grads(accumulated_grads, grads)
mx.eval(*_tree_leaves(accumulated_grads))  # force-realize accumulator
```

This is the key insight: MLX's laziness is a feature for inference (build a big graph, evaluate once efficiently) but a hazard for training loops where you're accumulating state across steps. Each `mx.eval()` call materializes and frees the intermediate graph, capping peak memory at one step's worth instead of N steps' worth.

### Cooperative cancellation

The original training loop had no cancellation mechanism. Once a run started, it ran to completion or until the process died. After the crash, orphaned runs stayed `status: "running"` forever, and the new concurrency guard (409 on duplicate starts) meant you couldn't start a new run until someone manually edited the JSON.

The fix threads an `asyncio.Event` through the entire training pipeline:

```python
cancel_event = asyncio.Event()
_train_cancel_events[run_id] = cancel_event

# Inside training loop:
def _check_cancel():
    if should_stop is not None and should_stop():
        raise TrainingCancelledError("Training run cancelled")
```

Cancellation checks happen at every natural boundary: before config load, after materialization, before/after each epoch, before each batch, during evaluation loops, and before artifact promotion. A new `POST /api/reranker/train/run/{run_id}/cancel` endpoint sets the event, and a legacy `POST /api/reranker/stop` endpoint finds the active run for a corpus and cancels it. Orphaned runs (no in-process task but still `status: "running"`) get force-cancelled to `"cancelled"` so the UI doesn't get stuck.

### Startup resilience

`start.sh` now handles the full Colima recovery chain:

```bash
ensure_docker_daemon() {
  if docker_daemon_ready; then return 0; fi
  if have_cmd colima; then
    log "Docker daemon unavailable; attempting to start Colima..."
    colima start || return 1
  fi
}
```

When `docker compose up` fails with container name conflicts, it falls back to reusing existing named containers:

```bash
if [[ "$compose_up_failed" == "1" ]]; then
    for svc in "${services[@]}"; do
      start_existing_service_container "$svc" || true
    done
fi
```

And it verifies the critical containers actually exist before proceeding to health checks, instead of hanging forever waiting for a container that was never created.

## The proof it worked

The final run in the log (`epstein-files-1__20260206_221934`) shows the safety caps in action:

```
22:19:34 — "Applied MLX safety caps (batch_size 16->1,
            grad_accum 8->8, max_length 512->256)"
22:19:36 — step  1: loss=0.6191  step_time=2,078ms
22:19:39 — step  2: loss=1.0130  step_time=2,115ms
22:20:30 — step 24: loss=0.0728  step_time=2,837ms
```

Two-second steps instead of the 25-second steps from the transformers backend. Loss converging from 0.62 to 0.07 in under a minute. The machine stayed responsive throughout — no memory pressure, no display freezes. The model was actually *training faster* with a batch size of 1 on MLX than it was with batch size 16 on PyTorch MPS, because MLX's unified memory architecture eliminates the CPU↔GPU transfer overhead that dominates small-model training on MPS.

## Lessons

**Unified memory changes the failure mode, not the failure probability.** On discrete GPUs, OOM is a process-level error. On Apple Silicon, it's a system-level crisis. Your training code needs to be conservative about peak memory even when total memory seems abundant, because you're sharing that pool with the window manager.

**MLX laziness needs explicit fencing in training loops.** The lazy evaluation model is brilliant for inference graphs but accumulates unbounded memory in iterative training. Call `mx.eval()` after every gradient step, not just at the end of the epoch.

**Hard crashes cascade.** One power cycle corrupted Colima's VM state, which broke Docker, which broke container creation, which broke service startup. Each layer assumed the layer below was healthy. Defensive startup scripts that detect and recover from stale state are worth the complexity.

**"Just a 0.6B model" doesn't mean safe.** The vocabulary dimension (152K for Qwen3) is the hidden multiplier. At 512 sequence length, full logit materialization scales with vocabulary size, not parameter count. A 0.6B model with a 152K vocab can allocate more memory per forward pass than a 7B model with a 32K vocab.

**Always have a cancel button.** If your training UI has a start button, it needs a stop button that actually works — not just a frontend cosmetic that hopes the backend notices. Thread cancellation tokens through every loop and persist the terminal state so the UI can recover after crashes.

The complete changeset is in our repo. 290 tests passing, all validators green. And my M4 Pro lives to fight another day.