---
layout: ../../../layouts/BlogPostLayout.astro
title: "When to Query Chat Memory vs. Your Corpus (And When to Do Both)"
date: 2026-02-02
summary: "A practical retrieval policy for deciding when to hit chat memory, when to hit the corpus, and how to avoid token/latency blowups at scale."
---

## The problem

In a RAG chat interface you effectively have two knowledge sources: the user’s conversation history (chat memory) and the indexed corpus. If you blindly query both on every message, you pay for it twice: tokens, latency, and noise.

We learned this the hard way: “query everything” looks fine in a demo, then collapses in long chats.

## Why it’s harder than it looks

People don’t announce which source they mean.

Sometimes the user is clearly asking for new knowledge (“What does `TriBridConfig` do?”). Sometimes they’re clearly referring to the conversation (“as we discussed”). Most of the time it’s mushy: pronouns (“that function”), ellipsis (“and what about the other one?”), temporal markers (“earlier you said”), or a half-formed follow-up that only makes sense if you remember the last 10 turns.

If you always pull memory, you inject stale or irrelevant context into the prompt. That’s not just extra tokens — it changes the answer. We saw the model latch onto an older hypothesis because it was “present in context,” even when the user had pivoted.

If you never pull memory, you get the opposite failure mode: the assistant feels amnesiac. It repeats questions, misses constraints, and loses the thread in exactly the scenarios where chat UX matters.

So the real problem isn’t “memory vs. corpus.” It’s deciding *when the marginal context is worth its cost*.

## What we tried (and what didn’t work)

### 1) Embedding similarity against the last N messages

The idea: embed the current user query, embed the last N turns (or sliding windows), and pull memory if the cosine similarity is above a threshold.

Two issues killed it:

- **It was too slow in the hot path.** Even with caching, embedding enough history to be robust turns into a second retrieval system sitting next to your retrieval system.
- **False positives on “common” chat language.** The similarity spikes on generic phrasing (“can you explain”, “what about”, “does that mean”) and you end up retrieving memory for the exact prompts that least benefit from it.

Net effect: we were paying retrieval costs just to decide whether to do retrieval.

### 2) Always include the last 3 messages

This is the default “cheap memory” trick. It works surprisingly well for short chats, and it makes the system feel coherent.

It also fails predictably once chats get long (tool output, logs, multi-step workflows): the “free” context becomes the biggest thing in the prompt, and often not the right thing.

## What actually worked

We stopped pretending this was a semantic similarity problem and treated it like what it is: a *routing* problem.

### 1) Lightweight trigger patterns for “memory-likely” queries

We built a fast, boring “is memory needed?” detector based on the shape of the user’s text. Not a model. Not embeddings. Just patterns.

The categories that mattered most:

- **Explicit references:** “as we discussed”, “like you said”, “in our last message”, “earlier you mentioned”
- **Implicit continuity:** pronouns + deictics (“that”, “those”, “this”, “the above”), “same thing”, “the other one”, “that function”
- **Temporal markers:** “earlier”, “before”, “previously”, “last time”

There’s nuance here: pronouns alone aren’t enough. “That function” is a strong memory signal; “that is cool” is not. We ended up weighting patterns instead of treating them as a binary match.

### 2) Two-phase retrieval: memory first, then corpus

When the detector says “memory-likely,” we don’t immediately slam both stores. We do a small memory lookup first:

- `top_k` is tiny (2–4)
- latency budget is strict (if it’s slow, skip it)

Then we decide whether memory was actually useful before we touch the corpus. The key is that “useful” has to be measurable without another expensive model call.

Our practical check was:

- do we have at least one memory hit above a score threshold?
- does the hit include an *anchor* that appears in the query (identifier, file name, error string)?
- does it resolve anaphora (it contains what “that/it/they” refers to)?

If those checks pass, we incorporate the memory hits as context and often skip corpus retrieval entirely for that turn. If they fail, we drop memory on the floor and proceed with normal corpus retrieval.

### 3) Explicit user control: pin important context

We added a lightweight “pin” concept: when something becomes a standing constraint (“we’re using Postgres, not SQLite”, “target is Node 20”), the user can pin it and we treat it as always-on context until unpinned. This reduces how often you need to query memory because the important bits aren’t trapped in the recency window.

## The confidence threshold problem

Even with a score threshold, memory retrieval almost always returns *something*. Embeddings are great at finding “kind of related” text, and that’s exactly what you don’t want to inject into an already high-variance generation step.

Treating the top similarity score as truth wasn’t reliable.

What helped was accepting that relevance is *not* just a retrieval score. It’s a conjunction:

- **retrieval score** (is the hit close?)
- **query intent** (is the user asking for continuity?)
- **grounding anchor** (does the hit contain the concrete thing being referred to?)

If any of those are missing, we assume the memory hit is a false friend and we ignore it. This is also why “query memory with low `top_k` first” works: you limit how much false-friend context can sneak in before you make the next decision.

## Minimal code sketch

This is roughly the control flow we ended up with (pseudocode):

```ts
function shouldQueryMemory(query: string): boolean {
  const patterns = [
    /\bas we (discussed|said|mentioned)\b/i,
    /\bearlier you (said|mentioned)\b/i,
    /\b(previously|before|last time)\b/i,
    /\b(that|those|the other one|same one)\b/i,
  ];
  return patterns.some((re) => re.test(query));
}

async function retrieve(query: string) {
  let memoryHits: Hit[] = [];

  if (shouldQueryMemory(query)) {
    memoryHits = await memory.search({ query, topK: 3, timeoutMs: 75 });
    if (!memoryLooksRelevant(query, memoryHits)) memoryHits = [];
  }

  const corpusHits =
    memoryHits.length > 0 ? [] : await corpus.search({ query, topK: 20 });

  return fuseAndRerank({ memoryHits, corpusHits });
}
```

The real work is in `memoryLooksRelevant`. Ours was a set of cheap string checks plus a conservative threshold. The goal wasn’t to be perfect — it was to be safe.

## The tradeoffs

This policy makes the system more predictable, but it’s not free:

- **You will miss some memory-needed turns.** The mitigation is a fast fallback: if the user corrects you (“no, I meant the earlier thing”), do a memory pass on the next turn.
- **Patterns drift.** Shorthand changes. You need feedback on “memory misses” so you can update the patterns intentionally.
- **Pinned context can be abused.** If users pin everything, you’re back to context bloat (so cap it and make it visible).

The deepest lesson for us was that “memory vs. corpus” isn’t an IR problem. It’s *a systems budgeting problem*. Retrieval is cheap compared to generation until you make it unbounded. The win comes from a small, explicit gate in front of memory, and treating “no memory” as valid.
