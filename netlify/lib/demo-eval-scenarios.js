import crypto from 'node:crypto';

export const DEMO_EVAL_CORPUS_ID = 'epstein-files-1';
export const DEFAULT_DEMO_EVAL_DATASET_ID = 'eval-structured-docs-v1';
export const DEMO_EVAL_ANALYSIS_PROMPT = `Be rigorous:
1. Question whether the config changes ACTUALLY explain the performance delta
2. Flag when results seem counterintuitive (e.g., disabling a feature improving results)
3. Consider confounding variables: Was the index rebuilt? Did the test set change?
4. Provide actionable suggestions only when you have reasonable confidence

Format your response with clear sections using markdown headers.`;
export const DEMO_EVAL_ANALYSIS_MODEL = Object.freeze({
  model: 'gpt-5-mini',
  reasoningEffort: 'high',
  maxOutputTokens: 8192,
});

function toJsonbParam(value) {
  return JSON.stringify(value ?? null);
}

const RESULT_SOURCES = ['vector', 'sparse', 'graph', 'vector', 'sparse'];

function flattenConfigSnapshot(cfg) {
  const out = {};
  const walk = (obj, prefix) => {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      if (prefix) out[prefix] = obj;
      return;
    }
    for (const [key, value] of Object.entries(obj)) {
      walk(value, prefix ? `${prefix}.${key}` : key);
    }
  };
  walk(cfg, '');
  return out;
}

function rotate(values, offset) {
  if (!Array.isArray(values) || values.length === 0) return [];
  const safe = ((offset % values.length) + values.length) % values.length;
  return [...values.slice(safe), ...values.slice(0, safe)];
}

function uniquePaths(paths) {
  const seen = new Set();
  const out = [];
  for (const path of paths || []) {
    const value = String(path || '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function extensionForPath(path) {
  const value = String(path || '').trim();
  const match = value.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : 'md';
}

function stableOffset(value) {
  const hash = crypto.createHash('sha256').update(String(value || '')).digest('hex');
  return parseInt(hash.slice(0, 8), 16);
}

function recallAtK(expectedPaths, retrievedPaths, k) {
  const expected = Array.isArray(expectedPaths) ? expectedPaths.filter(Boolean) : [];
  const retrieved = Array.isArray(retrievedPaths) ? retrievedPaths.slice(0, k).filter(Boolean) : [];
  if (!expected.length) return 0;
  const hits = expected.filter((expectedPath) => retrieved.includes(expectedPath)).length;
  return hits / expected.length;
}

function precisionAtK(expectedPaths, retrievedPaths, k) {
  const expected = Array.isArray(expectedPaths) ? expectedPaths.filter(Boolean) : [];
  const retrieved = Array.isArray(retrievedPaths) ? retrievedPaths.slice(0, k).filter(Boolean) : [];
  if (!retrieved.length) return 0;
  const hits = retrieved.filter((path) => expected.includes(path)).length;
  return hits / Math.max(1, k);
}

function ndcgAtK(expectedPaths, retrievedPaths, k) {
  const expected = Array.isArray(expectedPaths) ? expectedPaths.filter(Boolean) : [];
  const retrieved = Array.isArray(retrievedPaths) ? retrievedPaths.slice(0, k).filter(Boolean) : [];
  if (!expected.length || !retrieved.length) return 0;
  let dcg = 0;
  for (let index = 0; index < retrieved.length; index += 1) {
    if (expected.includes(retrieved[index])) {
      dcg += 1 / Math.log2(index + 2);
    }
  }
  const ideal = Math.min(expected.length, k);
  let idcg = 0;
  for (let index = 0; index < ideal; index += 1) {
    idcg += 1 / Math.log2(index + 2);
  }
  return idcg ? dcg / idcg : 0;
}

function percentile(values, q) {
  const clean = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!clean.length) return 0;
  const index = Math.min(clean.length - 1, Math.max(0, Math.ceil(clean.length * q) - 1));
  return clean[index];
}

function buildRankedPaths(entry, scenario, rank, finalK) {
  const expectedPath = String(entry.expected_paths?.[0] || '').trim();
  const pool = uniquePaths([
    ...(entry.related_paths || []),
    ...(scenario.extra_paths || []),
    ...scenario.entries
      .map((candidate) => String(candidate.expected_paths?.[0] || '').trim())
      .filter((candidatePath) => candidatePath && candidatePath !== expectedPath),
  ]);
  const rotated = rotate(pool, stableOffset(entry.entry_id));
  const withoutExpected = rotated.filter((candidatePath) => candidatePath !== expectedPath);
  if (!Number.isInteger(rank) || rank < 0 || rank >= finalK) {
    return withoutExpected.slice(0, finalK);
  }
  const before = withoutExpected.slice(0, rank);
  const after = withoutExpected.slice(rank);
  return uniquePaths([...before, expectedPath, ...after]).slice(0, finalK);
}

function buildEvalResult({ entry, scenario, rank, latencyMs, finalK }) {
  const rankedPaths = buildRankedPaths(entry, scenario, rank, finalK);
  const expectedPaths = Array.isArray(entry.expected_paths) ? entry.expected_paths : [];
  const hitIndex = rankedPaths.findIndex((path) => expectedPaths.includes(path));
  const top1Hit = hitIndex === 0;
  const topkHit = hitIndex !== -1;
  const reciprocalRank = hitIndex === -1 ? 0 : 1 / (hitIndex + 1);
  const recall = recallAtK(expectedPaths, rankedPaths, finalK);

  return {
    entry_id: entry.entry_id,
    question: entry.question,
    expected_paths: expectedPaths,
    expected_answer: entry.expected_answer,
    retrieved_paths: rankedPaths,
    top_paths: rankedPaths.slice(0, finalK),
    top1_path: rankedPaths.slice(0, 1),
    top1_hit: top1Hit,
    topk_hit: topkHit,
    reciprocal_rank: Number(reciprocalRank.toFixed(4)),
    recall: Number(recall.toFixed(4)),
    latency_ms: Number(latencyMs.toFixed(2)),
    duration_secs: Number((latencyMs / 1000).toFixed(3)),
    tags: [...entry.tags],
    docs: rankedPaths.slice(0, finalK).map((filePath, index) => ({
      file_path: filePath,
      start_line: 1 + ((stableOffset(filePath) + index * 11) % 120),
      score: Number(Math.max(0.08, 0.96 - index * 0.11).toFixed(3)),
      source: RESULT_SOURCES[index % RESULT_SOURCES.length],
    })),
  };
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function summarizeEvalResults(results) {
  const total = results.length;
  const top1Hits = results.filter((result) => result.top1_hit).length;
  const topkHits = results.filter((result) => result.topk_hit).length;
  const latencies = results.map((result) => Number(result.latency_ms || 0));
  const mrr = average(results.map((result) => Number(result.reciprocal_rank || 0)));
  const durationSecs = results.reduce(
    (sum, result) => sum + (result.duration_secs || (result.latency_ms || 0) / 1000),
    0,
  );
  return {
    total,
    top1Hits,
    topkHits,
    top1Accuracy: total ? Number((top1Hits / total).toFixed(4)) : 0,
    topkAccuracy: total ? Number((topkHits / total).toFixed(4)) : 0,
    durationSecs: Number(durationSecs.toFixed(2)),
    metrics: {
      mrr: Number(mrr.toFixed(4)),
      recall_at_5: Number(average(results.map((result) => recallAtK(result.expected_paths, result.retrieved_paths, 5))).toFixed(4)),
      recall_at_10: Number(average(results.map((result) => recallAtK(result.expected_paths, result.retrieved_paths, 10))).toFixed(4)),
      recall_at_20: Number(average(results.map((result) => recallAtK(result.expected_paths, result.retrieved_paths, 20))).toFixed(4)),
      precision_at_5: Number(average(results.map((result) => precisionAtK(result.expected_paths, result.retrieved_paths, 5))).toFixed(4)),
      ndcg_at_10: Number(average(results.map((result) => ndcgAtK(result.expected_paths, result.retrieved_paths, 10))).toFixed(4)),
      latency_p50_ms: Number(percentile(latencies, 0.5).toFixed(2)),
      latency_p95_ms: Number(percentile(latencies, 0.95).toFixed(2)),
    },
  };
}

function buildEvalRun({ scenario, stage, createdAt, completedAt, configSnapshot, placements, latencies, runId, demoSeedRank }) {
  const finalK = Number(configSnapshot?.retrieval?.final_k || 5) || 5;
  const results = scenario.entries.map((entry, index) =>
    buildEvalResult({
      entry,
      scenario,
      rank: placements[index],
      latencyMs: latencies[index],
      finalK,
    })
  );
  const summary = summarizeEvalResults(results);
  return {
    run_id: runId,
    corpus_id: DEMO_EVAL_CORPUS_ID,
    dataset_id: scenario.datasetId,
    scenario_id: scenario.scenarioId,
    demo_seed_kind: 'scenario',
    demo_seed_rank: demoSeedRank,
    demo_seed_version: DEMO_EVAL_SEED_VERSION,
    config_snapshot: configSnapshot,
    config: flattenConfigSnapshot(configSnapshot),
    total: summary.total,
    top1_hits: summary.top1Hits,
    topk_hits: summary.topkHits,
    top1_accuracy: summary.top1Accuracy,
    topk_accuracy: summary.topkAccuracy,
    duration_secs: summary.durationSecs,
    use_multi: Boolean(configSnapshot?.retrieval?.eval_multi ?? 1),
    final_k: finalK,
    metrics: summary.metrics,
    results,
    started_at: createdAt,
    completed_at: completedAt,
    stage,
  };
}

const SCENARIOS = [
  {
    scenarioId: 'structured-docs',
    datasetId: 'eval-structured-docs-v1',
    extra_paths: [
      'docs/release-notes/5.0/highlights.md',
      'docs/migration/5.0-faq.md',
      'docs/reference/connector-glossary.md',
      'docs/reference/storage-adapters.md',
      'docs/reference/retention-overview.md',
    ],
    entries: [
      {
        entry_id: 'structured-01',
        question: 'In the 5.0 compatibility matrix, which replication modes support rolling upgrades from 4.7?',
        expected_paths: ['docs/release-notes/5.0/compatibility-matrix.pdf'],
        expected_answer: 'Streaming mirror and async mirror are supported for rolling upgrades from 4.7.',
        tags: [
          'seed:demo-eval-scenario',
          'scenario:structured-docs',
          'dataset:eval-structured-docs-v1',
          'failure:table-lookup',
          'cluster:release-notes',
          'doc-type:pdf',
          'topic:compatibility',
        ],
        related_paths: [
          'docs/release-notes/5.0/highlights.md',
          'docs/migration/5.0-cutover-playbook.md',
          'docs/reference/retention-tiers.pdf',
        ],
      },
      {
        entry_id: 'structured-02',
        question: 'Which appendix footnote says legacy delta snapshots stay unsupported on cold-storage replicas?',
        expected_paths: ['docs/release-notes/5.0/appendix-a-storage-footnotes.pdf'],
        expected_answer: 'Appendix A footnote 7 marks legacy delta snapshots unsupported on cold-storage replicas.',
        tags: [
          'seed:demo-eval-scenario',
          'scenario:structured-docs',
          'dataset:eval-structured-docs-v1',
          'failure:appendix-ref',
          'cluster:release-notes',
          'doc-type:pdf',
          'topic:storage',
        ],
        related_paths: [
          'docs/release-notes/5.0/compatibility-matrix.pdf',
          'docs/reference/export-formats-appendix.pdf',
          'docs/reference/storage-adapters.md',
        ],
      },
      {
        entry_id: 'structured-03',
        question: 'Which new setting replaces planner.cacheWarmupThreads in the 5.0 parameter map?',
        expected_paths: ['docs/migration/5.0-parameter-map.md'],
        expected_answer: 'planner.cacheWarmupThreads is replaced by planner.warm_pool_workers.',
        tags: [
          'seed:demo-eval-scenario',
          'scenario:structured-docs',
          'dataset:eval-structured-docs-v1',
          'failure:param-matrix',
          'cluster:migration',
          'doc-type:markdown',
          'topic:parameter-map',
        ],
        related_paths: [
          'docs/migration/5.0-cutover-playbook.md',
          'docs/reference/retention-tiers.pdf',
          'docs/reference/storage-adapters.md',
        ],
      },
      {
        entry_id: 'structured-04',
        question: 'According to the connector support table, when did Snowpipe Streaming move from preview to GA?',
        expected_paths: ['docs/connectors/support-matrix.pdf'],
        expected_answer: 'Snowpipe Streaming moved to GA in the 4.9 release train.',
        tags: [
          'seed:demo-eval-scenario',
          'scenario:structured-docs',
          'dataset:eval-structured-docs-v1',
          'failure:table-lookup',
          'cluster:connectors',
          'doc-type:pdf',
          'topic:support-matrix',
        ],
        related_paths: [
          'docs/connectors/feature-overview.md',
          'docs/release-notes/4.9/whats-new.md',
          'docs/migration/5.0-faq.md',
        ],
      },
      {
        entry_id: 'structured-05',
        question: 'Which guide recommends shadow reads before enabling dual-write cutover?',
        expected_paths: ['docs/migration/5.0-cutover-playbook.md'],
        expected_answer: 'The 5.0 cutover playbook recommends shadow reads before enabling dual-write cutover.',
        tags: [
          'seed:demo-eval-scenario',
          'scenario:structured-docs',
          'dataset:eval-structured-docs-v1',
          'control:semantic-summary',
          'cluster:migration',
          'doc-type:markdown',
          'topic:cutover',
        ],
        related_paths: [
          'docs/migration/5.0-parameter-map.md',
          'docs/migration/backfill-checklist.md',
          'docs/migration/5.0-faq.md',
        ],
      },
      {
        entry_id: 'structured-06',
        question: 'Where does the appendix list the only export format that preserves row-level lineage IDs?',
        expected_paths: ['docs/reference/export-formats-appendix.pdf'],
        expected_answer: 'The appendix says parquet+manifest is the only export format that preserves row-level lineage IDs.',
        tags: [
          'seed:demo-eval-scenario',
          'scenario:structured-docs',
          'dataset:eval-structured-docs-v1',
          'failure:appendix-ref',
          'cluster:reference',
          'doc-type:pdf',
          'topic:export-formats',
        ],
        related_paths: [
          'docs/reference/storage-adapters.md',
          'docs/release-notes/5.0/appendix-a-storage-footnotes.pdf',
          'docs/reference/retention-tiers.pdf',
        ],
      },
      {
        entry_id: 'structured-07',
        question: 'Which release note introduces segment compaction windows?',
        expected_paths: ['docs/release-notes/4.9/whats-new.md'],
        expected_answer: 'Segment compaction windows are introduced in the 4.9 release notes.',
        tags: [
          'seed:demo-eval-scenario',
          'scenario:structured-docs',
          'dataset:eval-structured-docs-v1',
          'control:semantic-summary',
          'cluster:release-notes',
          'doc-type:markdown',
          'topic:release-highlights',
        ],
        related_paths: [
          'docs/release-notes/5.0/highlights.md',
          'docs/connectors/feature-overview.md',
          'docs/migration/5.0-faq.md',
        ],
      },
      {
        entry_id: 'structured-08',
        question: 'In the retention matrix, which tiers allow grace_window_days greater than 14?',
        expected_paths: ['docs/reference/retention-tiers.pdf'],
        expected_answer: 'Archive-pro and sovereign tiers allow grace_window_days above 14.',
        tags: [
          'seed:demo-eval-scenario',
          'scenario:structured-docs',
          'dataset:eval-structured-docs-v1',
          'failure:param-matrix',
          'cluster:reference',
          'doc-type:pdf',
          'topic:retention',
        ],
        related_paths: [
          'docs/reference/storage-adapters.md',
          'docs/reference/export-formats-appendix.pdf',
          'docs/migration/5.0-parameter-map.md',
        ],
      },
      {
        entry_id: 'structured-09',
        question: 'Which migration checklist step says to pause schema drift alerts during backfill replays?',
        expected_paths: ['docs/migration/backfill-checklist.md'],
        expected_answer: 'The backfill checklist says to pause schema drift alerts during replay verification.',
        tags: [
          'seed:demo-eval-scenario',
          'scenario:structured-docs',
          'dataset:eval-structured-docs-v1',
          'control:semantic-summary',
          'cluster:migration',
          'doc-type:markdown',
          'topic:backfill',
        ],
        related_paths: [
          'docs/migration/5.0-cutover-playbook.md',
          'docs/migration/5.0-faq.md',
          'docs/release-notes/5.0/highlights.md',
        ],
      },
      {
        entry_id: 'structured-10',
        question: 'The appendix crosswalk maps audit code NX-204 to what renamed validator?',
        expected_paths: ['docs/release-notes/5.0/appendix-b-code-crosswalk.md'],
        expected_answer: 'NX-204 maps to the renamed validator ingest_lineage_guard.',
        tags: [
          'seed:demo-eval-scenario',
          'scenario:structured-docs',
          'dataset:eval-structured-docs-v1',
          'failure:appendix-ref',
          'cluster:release-notes',
          'doc-type:markdown',
          'topic:code-crosswalk',
        ],
        related_paths: [
          'docs/release-notes/5.0/appendix-a-storage-footnotes.pdf',
          'docs/release-notes/5.0/highlights.md',
          'docs/migration/5.0-parameter-map.md',
        ],
      },
    ],
    baseline: {
      runId: 'epstein-files-1__20260309_091500',
      createdAt: '2026-03-09T09:13:00.000Z',
      completedAt: '2026-03-09T09:15:00.000Z',
      demoSeedRank: 590,
      placements: [0, 1, 0, 0, 2, 1, 0, 2, 0, null],
      latencies: [158, 164, 149, 171, 146, 176, 138, 181, 151, 162],
      configSnapshot: {
        chunking: {
          strategy: 'outline_markdown',
          chunk_size: 960,
          chunk_overlap: 180,
          table_header_carryover: 1,
          pdf_heading_split: 1,
          line_break_collapse: 0,
        },
        retrieval: {
          final_k: 5,
          eval_multi: 1,
          vector_weight: 0.63,
          sparse_weight: 0.37,
          chunk_neighbor_window: 2,
        },
        query_rewrite: {
          enabled: 1,
          max_queries: 3,
        },
      },
    },
    current: {
      runId: 'epstein-files-1__20260310_094500',
      createdAt: '2026-03-10T09:43:00.000Z',
      completedAt: '2026-03-10T09:45:00.000Z',
      demoSeedRank: 600,
      placements: [null, null, 2, null, 0, null, 0, 1, 0, 2],
      latencies: [111, 118, 109, 115, 101, 123, 98, 112, 104, 116],
      configSnapshot: {
        chunking: {
          strategy: 'recursive',
          chunk_size: 420,
          chunk_overlap: 40,
          table_header_carryover: 0,
          pdf_heading_split: 0,
          line_break_collapse: 1,
        },
        retrieval: {
          final_k: 5,
          eval_multi: 1,
          vector_weight: 0.68,
          sparse_weight: 0.32,
          chunk_neighbor_window: 0,
        },
        query_rewrite: {
          enabled: 1,
          max_queries: 5,
        },
      },
    },
  },
  {
    scenarioId: 'identifier-hybrid',
    datasetId: 'eval-identifier-hybrid-v1',
    extra_paths: [
      'ops/runbooks/cache-thrash-recovery.md',
      'ops/errors/request-shape-mismatch.md',
      'release/changelog/r2025.12-maintenance.md',
      'ops/flags/checkout-routing.md',
      'ops/runbooks/retry-budget.md',
    ],
    entries: [
      {
        entry_id: 'identifier-01',
        question: 'Which runbook covers INC-4821 and the read-repair backlog after regional failover?',
        expected_paths: ['ops/incidents/INC-4821-read-repair.md'],
        expected_answer: 'INC-4821 is documented in the read-repair backlog runbook.',
        tags: [
          'seed:demo-eval-scenario',
          'scenario:identifier-hybrid',
          'dataset:eval-identifier-hybrid-v1',
          'failure:exact-id',
          'cluster:incidents',
          'doc-type:markdown',
          'topic:incident-runbook',
        ],
        related_paths: [
          'ops/incidents/INC-4779-lag-spike.md',
          'ops/runbooks/failover-drills.md',
          'ops/runbooks/replay-quarantine.md',
        ],
      },
      {
        entry_id: 'identifier-02',
        question: 'Where is SQLSTATE 57P03 handled in the database recovery guide?',
        expected_paths: ['ops/db/sqlstate-reference.md'],
        expected_answer: 'SQLSTATE 57P03 is handled in the SQLSTATE reference and linked recovery steps.',
        tags: [
          'seed:demo-eval-scenario',
          'scenario:identifier-hybrid',
          'dataset:eval-identifier-hybrid-v1',
          'failure:exact-id',
          'cluster:database',
          'doc-type:markdown',
          'topic:sqlstate',
        ],
        related_paths: [
          'ops/db/connection-pool-recovery.md',
          'ops/errors/request-shape-mismatch.md',
          'ops/runbooks/retry-budget.md',
        ],
      },
      {
        entry_id: 'identifier-03',
        question: 'Which document owns the flag ledger.shadow_write_v2 rollout notes?',
        expected_paths: ['ops/flags/ledger-shadow-write.md'],
        expected_answer: 'The ledger.shadow_write_v2 rollout is documented in the ledger shadow write flag notes.',
        tags: [
          'seed:demo-eval-scenario',
          'scenario:identifier-hybrid',
          'dataset:eval-identifier-hybrid-v1',
          'failure:exact-id',
          'cluster:flags',
          'doc-type:markdown',
          'topic:feature-flags',
        ],
        related_paths: [
          'ops/flags/checkout-routing.md',
          'ops/runbooks/dark-launch-rollbacks.md',
          'release/changelog/r2025.11-hotfix3.md',
        ],
      },
      {
        entry_id: 'identifier-04',
        question: 'Which changelog entry explains r2025.11-hotfix3?',
        expected_paths: ['release/changelog/r2025.11-hotfix3.md'],
        expected_answer: 'r2025.11-hotfix3 is explained in the matching release changelog entry.',
        tags: [
          'seed:demo-eval-scenario',
          'scenario:identifier-hybrid',
          'dataset:eval-identifier-hybrid-v1',
          'failure:release-tag',
          'cluster:release',
          'doc-type:markdown',
          'topic:release-changelog',
        ],
        related_paths: [
          'release/changelog/r2025.12-maintenance.md',
          'release/changelog/schema-2025-12-17-b.md',
          'ops/errors/request-shape-mismatch.md',
        ],
      },
      {
        entry_id: 'identifier-05',
        question: 'Where is the exact error string "vector dimension mismatch: 3072 != 1536" diagnosed?',
        expected_paths: ['ops/errors/vector-dimension-mismatch.md'],
        expected_answer: 'The exact vector dimension mismatch string is diagnosed in the dedicated error guide.',
        tags: [
          'seed:demo-eval-scenario',
          'scenario:identifier-hybrid',
          'dataset:eval-identifier-hybrid-v1',
          'failure:exact-id',
          'cluster:errors',
          'doc-type:markdown',
          'topic:error-strings',
        ],
        related_paths: [
          'ops/errors/request-shape-mismatch.md',
          'ops/db/sqlstate-reference.md',
          'ops/runbooks/retry-budget.md',
        ],
      },
      {
        entry_id: 'identifier-06',
        question: 'Which runbook explains how to handle replica lag during failover drills?',
        expected_paths: ['ops/runbooks/failover-drills.md'],
        expected_answer: 'Replica lag during failover drills is covered in the failover drills runbook.',
        tags: [
          'seed:demo-eval-scenario',
          'scenario:identifier-hybrid',
          'dataset:eval-identifier-hybrid-v1',
          'control:semantic-summary',
          'cluster:runbooks',
          'doc-type:markdown',
          'topic:failover',
        ],
        related_paths: [
          'ops/runbooks/cache-thrash-recovery.md',
          'ops/incidents/INC-4821-read-repair.md',
          'ops/runbooks/replay-quarantine.md',
        ],
      },
      {
        entry_id: 'identifier-07',
        question: 'Where are dark-launch rollback criteria documented?',
        expected_paths: ['ops/runbooks/dark-launch-rollbacks.md'],
        expected_answer: 'Dark-launch rollback criteria are documented in the dark-launch rollbacks runbook.',
        tags: [
          'seed:demo-eval-scenario',
          'scenario:identifier-hybrid',
          'dataset:eval-identifier-hybrid-v1',
          'control:semantic-summary',
          'cluster:runbooks',
          'doc-type:markdown',
          'topic:dark-launch',
        ],
        related_paths: [
          'ops/flags/checkout-routing.md',
          'ops/runbooks/failover-drills.md',
          'ops/runbooks/replay-quarantine.md',
        ],
      },
      {
        entry_id: 'identifier-08',
        question: 'Which document lists the flag family checkout.payment_auth_v3.* ?',
        expected_paths: ['ops/flags/payment-auth-v3.md'],
        expected_answer: 'The checkout.payment_auth_v3.* flag family is listed in the payment auth v3 document.',
        tags: [
          'seed:demo-eval-scenario',
          'scenario:identifier-hybrid',
          'dataset:eval-identifier-hybrid-v1',
          'failure:exact-id',
          'cluster:flags',
          'doc-type:markdown',
          'topic:feature-flags',
        ],
        related_paths: [
          'ops/flags/checkout-routing.md',
          'ops/flags/ledger-shadow-write.md',
          'ops/runbooks/dark-launch-rollbacks.md',
        ],
      },
      {
        entry_id: 'identifier-09',
        question: 'Where is the procedure for replaying quarantined events?',
        expected_paths: ['ops/runbooks/replay-quarantine.md'],
        expected_answer: 'The replay-quarantine runbook documents the quarantined event replay procedure.',
        tags: [
          'seed:demo-eval-scenario',
          'scenario:identifier-hybrid',
          'dataset:eval-identifier-hybrid-v1',
          'control:semantic-summary',
          'cluster:runbooks',
          'doc-type:markdown',
          'topic:replay',
        ],
        related_paths: [
          'ops/runbooks/cache-thrash-recovery.md',
          'ops/incidents/INC-4821-read-repair.md',
          'ops/runbooks/retry-budget.md',
        ],
      },
      {
        entry_id: 'identifier-10',
        question: 'Which changelog mentions the schema patch schema-2025-12-17-b?',
        expected_paths: ['release/changelog/schema-2025-12-17-b.md'],
        expected_answer: 'schema-2025-12-17-b is described in the matching schema patch changelog entry.',
        tags: [
          'seed:demo-eval-scenario',
          'scenario:identifier-hybrid',
          'dataset:eval-identifier-hybrid-v1',
          'failure:exact-id',
          'cluster:release',
          'doc-type:markdown',
          'topic:schema-patch',
        ],
        related_paths: [
          'release/changelog/r2025.11-hotfix3.md',
          'release/changelog/r2025.12-maintenance.md',
          'ops/errors/request-shape-mismatch.md',
        ],
      },
    ],
    baseline: {
      runId: 'epstein-files-1__20260308_074000',
      createdAt: '2026-03-08T07:37:00.000Z',
      completedAt: '2026-03-08T07:40:00.000Z',
      demoSeedRank: 570,
      placements: [0, 1, 0, 1, 0, null, 1, 2, 0, 1],
      latencies: [141, 149, 144, 152, 158, 146, 143, 151, 139, 147],
      configSnapshot: {
        embedding: {
          model: 'text-embedding-3-large',
        },
        sparse_search: {
          enabled: true,
          file_path_fallback: 1,
          bm25_tokenizer: 'stemmer',
        },
        vector_search: {
          enabled: true,
          top_k: 60,
        },
        retrieval: {
          final_k: 5,
          eval_multi: 1,
          bm25_weight: 0.45,
          vector_weight: 0.55,
        },
      },
    },
    current: {
      runId: 'epstein-files-1__20260308_184500',
      createdAt: '2026-03-08T18:42:00.000Z',
      completedAt: '2026-03-08T18:45:00.000Z',
      demoSeedRank: 580,
      placements: [null, null, 2, 2, null, 0, 1, null, 0, 1],
      latencies: [103, 107, 101, 109, 111, 97, 99, 108, 95, 102],
      configSnapshot: {
        embedding: {
          model: 'text-embedding-3-small',
        },
        sparse_search: {
          enabled: false,
          file_path_fallback: 0,
          bm25_tokenizer: 'stemmer',
        },
        vector_search: {
          enabled: true,
          top_k: 90,
        },
        retrieval: {
          final_k: 5,
          eval_multi: 1,
          bm25_weight: 0.0,
          vector_weight: 1.0,
        },
      },
    },
  },
  {
    scenarioId: 'ann-confounder',
    datasetId: 'eval-ann-confounder-v1',
    extra_paths: [
      'policies/change-management/freeze-calendar.md',
      'policies/security/admin-break-glass.md',
      'runbooks/deploy/canary-thresholds.md',
      'reference/terminology/legacy-aliases.md',
      'runbooks/ingest/drain-replay-queues.md',
    ],
    entries: [
      {
        entry_id: 'ann-01',
        question: 'After the August rename, where is the traffic freeze window policy documented?',
        expected_paths: ['policies/change-management/traffic-freeze-window.md'],
        expected_answer: 'The renamed traffic freeze window policy lives under change management.',
        tags: [
          'seed:demo-eval-scenario',
          'scenario:ann-confounder',
          'dataset:eval-ann-confounder-v1',
          'failure:rename-recent',
          'cluster:policy',
          'doc-type:markdown',
          'topic:change-management',
        ],
        related_paths: [
          'policies/change-management/freeze-calendar.md',
          'policies/security/vendor-credential-rotation.md',
          'runbooks/deploy/canary-thresholds.md',
        ],
      },
      {
        entry_id: 'ann-02',
        question: 'Which page explains the alias from tenant quarantine to workspace isolation hold?',
        expected_paths: ['policies/incidents/workspace-isolation-hold.md'],
        expected_answer: 'The workspace isolation hold page explains the alias from tenant quarantine.',
        tags: [
          'seed:demo-eval-scenario',
          'scenario:ann-confounder',
          'dataset:eval-ann-confounder-v1',
          'failure:alias-match',
          'cluster:policy',
          'doc-type:markdown',
          'topic:incident-policy',
        ],
        related_paths: [
          'reference/terminology/legacy-aliases.md',
          'policies/change-management/traffic-freeze-window.md',
          'policies/security/admin-break-glass.md',
        ],
      },
      {
        entry_id: 'ann-03',
        question: 'Which checklist has the updated regional fail-closed rollout guard?',
        expected_paths: ['runbooks/network/regional-fail-closed.md'],
        expected_answer: 'The regional fail-closed rollout guard is documented in the network runbook.',
        tags: [
          'seed:demo-eval-scenario',
          'scenario:ann-confounder',
          'dataset:eval-ann-confounder-v1',
          'control:latest-policy',
          'cluster:runbooks',
          'doc-type:markdown',
          'topic:network-rollout',
        ],
        related_paths: [
          'runbooks/deploy/canary-thresholds.md',
          'runbooks/deploy/canary-queue-skew.md',
          'runbooks/network/traffic-shift-checklist.md',
        ],
      },
      {
        entry_id: 'ann-04',
        question: 'Where is bootstrap allowlist cross-walked to origin trust seed?',
        expected_paths: ['reference/terminology/origin-trust-seed.md'],
        expected_answer: 'The old bootstrap allowlist term is cross-walked in the origin trust seed terminology page.',
        tags: [
          'seed:demo-eval-scenario',
          'scenario:ann-confounder',
          'dataset:eval-ann-confounder-v1',
          'failure:alias-match',
          'cluster:reference',
          'doc-type:markdown',
          'topic:terminology',
        ],
        related_paths: [
          'reference/terminology/legacy-aliases.md',
          'policies/incidents/workspace-isolation-hold.md',
          'reference/runtime/mirror-read-timeout.md',
        ],
      },
      {
        entry_id: 'ann-05',
        question: 'Which runbook describes draining stuck ingest partitions?',
        expected_paths: ['runbooks/ingest/drain-stuck-partitions.md'],
        expected_answer: 'The drain stuck partitions runbook describes the recovery flow.',
        tags: [
          'seed:demo-eval-scenario',
          'scenario:ann-confounder',
          'dataset:eval-ann-confounder-v1',
          'control:stable-doc',
          'cluster:runbooks',
          'doc-type:markdown',
          'topic:ingest-recovery',
        ],
        related_paths: [
          'runbooks/ingest/drain-replay-queues.md',
          'runbooks/deploy/canary-queue-skew.md',
          'runbooks/network/regional-fail-closed.md',
        ],
      },
      {
        entry_id: 'ann-06',
        question: 'Where are emergency replay windows documented?',
        expected_paths: ['policies/replay/emergency-windows.md'],
        expected_answer: 'Emergency replay windows are documented in the replay policy page.',
        tags: [
          'seed:demo-eval-scenario',
          'scenario:ann-confounder',
          'dataset:eval-ann-confounder-v1',
          'control:stable-doc',
          'cluster:policy',
          'doc-type:markdown',
          'topic:replay-policy',
        ],
        related_paths: [
          'policies/security/admin-break-glass.md',
          'runbooks/ingest/drain-replay-queues.md',
          'policies/change-management/freeze-calendar.md',
        ],
      },
      {
        entry_id: 'ann-07',
        question: 'Which document now owns the October vendor credential rotation policy?',
        expected_paths: ['policies/security/vendor-credential-rotation.md'],
        expected_answer: 'Vendor credential rotation is documented in the security policy page.',
        tags: [
          'seed:demo-eval-scenario',
          'scenario:ann-confounder',
          'dataset:eval-ann-confounder-v1',
          'failure:latest-policy',
          'cluster:policy',
          'doc-type:markdown',
          'topic:security-policy',
        ],
        related_paths: [
          'policies/security/admin-break-glass.md',
          'policies/change-management/freeze-calendar.md',
          'policies/security/contractor-break-glass.md',
        ],
      },
      {
        entry_id: 'ann-08',
        question: 'Which page contains the current partner import embargo exception rules?',
        expected_paths: ['policies/data-sharing/partner-import-embargo.md'],
        expected_answer: 'The partner import embargo exception rules live in the data-sharing policy page.',
        tags: [
          'seed:demo-eval-scenario',
          'scenario:ann-confounder',
          'dataset:eval-ann-confounder-v1',
          'failure:latest-policy',
          'cluster:policy',
          'doc-type:markdown',
          'topic:data-sharing',
        ],
        related_paths: [
          'policies/change-management/freeze-calendar.md',
          'policies/security/vendor-credential-rotation.md',
          'policies/security/admin-break-glass.md',
        ],
      },
      {
        entry_id: 'ann-09',
        question: 'Where is mirror_read_timeout_ms explained?',
        expected_paths: ['reference/runtime/mirror-read-timeout.md'],
        expected_answer: 'mirror_read_timeout_ms is explained in the runtime reference page.',
        tags: [
          'seed:demo-eval-scenario',
          'scenario:ann-confounder',
          'dataset:eval-ann-confounder-v1',
          'control:stable-doc',
          'cluster:reference',
          'doc-type:markdown',
          'topic:runtime-reference',
        ],
        related_paths: [
          'reference/terminology/origin-trust-seed.md',
          'runbooks/network/regional-fail-closed.md',
          'runbooks/deploy/canary-thresholds.md',
        ],
      },
      {
        entry_id: 'ann-10',
        question: 'Which page replaced the old shadow shard holdback note?',
        expected_paths: ['runbooks/capacity/shadow-shard-retention.md'],
        expected_answer: 'The old shadow shard holdback note was replaced by the shadow shard retention runbook.',
        tags: [
          'seed:demo-eval-scenario',
          'scenario:ann-confounder',
          'dataset:eval-ann-confounder-v1',
          'failure:rename-recent',
          'cluster:runbooks',
          'doc-type:markdown',
          'topic:capacity',
        ],
        related_paths: [
          'runbooks/deploy/canary-thresholds.md',
          'runbooks/network/traffic-shift-checklist.md',
          'reference/terminology/legacy-aliases.md',
        ],
      },
      {
        entry_id: 'ann-11',
        question: 'Which guide covers canary backout after queue skew?',
        expected_paths: ['runbooks/deploy/canary-queue-skew.md'],
        expected_answer: 'Canary backout after queue skew is covered in the canary queue skew guide.',
        tags: [
          'seed:demo-eval-scenario',
          'scenario:ann-confounder',
          'dataset:eval-ann-confounder-v1',
          'control:stable-doc',
          'cluster:runbooks',
          'doc-type:markdown',
          'topic:deploy',
        ],
        related_paths: [
          'runbooks/deploy/canary-thresholds.md',
          'runbooks/ingest/drain-stuck-partitions.md',
          'runbooks/network/regional-fail-closed.md',
        ],
      },
      {
        entry_id: 'ann-12',
        question: 'Where is the new exception for contractor break-glass approvals documented?',
        expected_paths: ['policies/security/contractor-break-glass.md'],
        expected_answer: 'The contractor break-glass approval exception is documented in the security policy page.',
        tags: [
          'seed:demo-eval-scenario',
          'scenario:ann-confounder',
          'dataset:eval-ann-confounder-v1',
          'failure:latest-policy',
          'cluster:policy',
          'doc-type:markdown',
          'topic:security-policy',
        ],
        related_paths: [
          'policies/security/admin-break-glass.md',
          'policies/security/vendor-credential-rotation.md',
          'policies/change-management/freeze-calendar.md',
        ],
      },
    ],
    baseline: {
      runId: 'epstein-files-1__20260306_083500',
      createdAt: '2026-03-06T08:32:00.000Z',
      completedAt: '2026-03-06T08:35:00.000Z',
      demoSeedRank: 550,
      placements: [1, 2, 0, 1, 2, 0, null, null, 0, 1, 0, 2],
      latencies: [173, 181, 168, 176, 162, 170, 178, 184, 167, 179, 164, 172],
      configSnapshot: {
        vector_search: {
          enabled: true,
          top_k: 60,
          ann_index: 'hnsw',
        },
        retrieval: {
          final_k: 5,
          eval_multi: 1,
          vector_weight: 0.7,
          sparse_weight: 0.3,
        },
        graph_search: {
          enabled: false,
          include_alias_edges: false,
        },
        pgvector: {
          hnsw_ef_search: 120,
          hnsw_max_scan_tuples: 40000,
          maintenance_vacuum_after_bulk_update: 1,
        },
      },
    },
    current: {
      runId: 'epstein-files-1__20260307_064000',
      createdAt: '2026-03-07T06:37:00.000Z',
      completedAt: '2026-03-07T06:40:00.000Z',
      demoSeedRank: 560,
      placements: [null, null, 1, null, 0, 0, 2, 2, 0, null, 0, 1],
      latencies: [119, 126, 111, 121, 104, 109, 115, 117, 102, 123, 106, 110],
      configSnapshot: {
        vector_search: {
          enabled: true,
          top_k: 60,
          ann_index: 'hnsw',
        },
        retrieval: {
          final_k: 5,
          eval_multi: 1,
          vector_weight: 0.68,
          sparse_weight: 0.32,
        },
        graph_search: {
          enabled: true,
          include_alias_edges: true,
        },
        pgvector: {
          hnsw_ef_search: 32,
          hnsw_max_scan_tuples: 8000,
          maintenance_vacuum_after_bulk_update: 0,
        },
        reranking: {
          reranker_mode: 'local',
          reranker_local_model: 'learning-reranker-qwen3-0.6b',
        },
      },
    },
  },
];

export const DEMO_EVAL_SEED_VERSION = crypto
  .createHash('sha256')
  .update(JSON.stringify(SCENARIOS))
  .digest('hex')
  .slice(0, 12);

let seededDatasetCache = null;
let seededRunsCache = null;

function buildSeededDatasetEntries() {
  return SCENARIOS.flatMap((scenario, scenarioIndex) =>
    scenario.entries.map((entry, entryIndex) => ({
      entry_id: entry.entry_id,
      question: entry.question,
      expected_paths: [...entry.expected_paths],
      expected_answer: entry.expected_answer,
      tags: [...entry.tags],
      created_at: new Date(Date.UTC(2026, 2, 1 + scenarioIndex, 9, entryIndex, 0)).toISOString(),
    }))
  );
}

function buildSeededRuns() {
  return SCENARIOS.flatMap((scenario) => [
    buildEvalRun({
      scenario,
      stage: 'current',
      runId: scenario.current.runId,
      createdAt: scenario.current.createdAt,
      completedAt: scenario.current.completedAt,
      configSnapshot: scenario.current.configSnapshot,
      placements: scenario.current.placements,
      latencies: scenario.current.latencies,
      demoSeedRank: scenario.current.demoSeedRank,
    }),
    buildEvalRun({
      scenario,
      stage: 'baseline',
      runId: scenario.baseline.runId,
      createdAt: scenario.baseline.createdAt,
      completedAt: scenario.baseline.completedAt,
      configSnapshot: scenario.baseline.configSnapshot,
      placements: scenario.baseline.placements,
      latencies: scenario.baseline.latencies,
      demoSeedRank: scenario.baseline.demoSeedRank,
    }),
  ]);
}

export function getSeededEvalDatasetEntries() {
  if (!seededDatasetCache) seededDatasetCache = buildSeededDatasetEntries();
  return seededDatasetCache.map((entry) => ({
    ...entry,
    expected_paths: [...entry.expected_paths],
    tags: [...entry.tags],
  }));
}

export function getSeededEvalRuns() {
  if (!seededRunsCache) seededRunsCache = buildSeededRuns();
  return seededRunsCache.map((run) => JSON.parse(JSON.stringify(run)));
}

export function getSeededEvalRunMap() {
  return new Map(getSeededEvalRuns().map((run) => [run.run_id, run]));
}

export function isDemoEvalReadOnlyCorpus(corpusId) {
  return String(corpusId || '').trim() === DEMO_EVAL_CORPUS_ID;
}

function normalizeStringList(values, { sort = false } = {}) {
  const list = (Array.isArray(values) ? values : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return sort ? [...list].sort((a, b) => a.localeCompare(b)) : list;
}

function normalizeIso(value) {
  if (!value) return '';
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? '' : dt.toISOString();
}

function normalizeDatasetEntryForSeed(entry) {
  return {
    entry_id: String(entry?.entry_id || ''),
    question: String(entry?.question || '').trim(),
    expected_paths: normalizeStringList(entry?.expected_paths, { sort: true }),
    expected_answer: entry?.expected_answer == null ? null : String(entry.expected_answer),
    tags: normalizeStringList(entry?.tags, { sort: true }),
    created_at: normalizeIso(entry?.created_at),
  };
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const obj = value;
    const keys = Object.keys(obj).sort((a, b) => a.localeCompare(b));
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizeRunForSeed(run) {
  return stableStringify(run ? JSON.parse(JSON.stringify(run)) : null);
}

function buildNormalizedSeedMap(items, getId, normalizeValue) {
  const out = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const id = String(getId(item) || '').trim();
    if (!id) continue;
    out.set(id, stableStringify(normalizeValue(item)));
  }
  return out;
}

function normalizedSeedMapsMatch(expectedItems, actualItems, getId, normalizeValue) {
  const expectedMap = buildNormalizedSeedMap(expectedItems, getId, normalizeValue);
  const actualMap = buildNormalizedSeedMap(actualItems, getId, normalizeValue);
  if (expectedMap.size !== actualMap.size) return false;
  for (const [id, normalized] of expectedMap.entries()) {
    if (actualMap.get(id) !== normalized) return false;
  }
  return true;
}

export function hasDemoEvalSeedDrift({
  actualDatasetEntries,
  actualRuns,
  expectedDatasetEntries = getSeededEvalDatasetEntries(),
  expectedRuns = getSeededEvalRuns(),
}) {
  const datasetMatches = normalizedSeedMapsMatch(
    expectedDatasetEntries,
    actualDatasetEntries,
    (entry) => entry?.entry_id,
    normalizeDatasetEntryForSeed,
  );
  if (!datasetMatches) return true;

  return !normalizedSeedMapsMatch(
    expectedRuns,
    actualRuns,
    (run) => run?.run_id,
    normalizeRunForSeed,
  );
}

function hasTag(tags, expectedTag) {
  return Array.isArray(tags) && tags.some((tag) => String(tag) === expectedTag);
}

export function filterDatasetEntriesForEval(entries, datasetId) {
  const targetDatasetId = String(datasetId || DEFAULT_DEMO_EVAL_DATASET_ID).trim() || DEFAULT_DEMO_EVAL_DATASET_ID;
  return (Array.isArray(entries) ? entries : []).filter((entry) => hasTag(entry.tags, `dataset:${targetDatasetId}`));
}

export function getScenarioIdForRun(run) {
  return String(run?.scenario_id || '').trim();
}

export function getDatasetIdForRun(run) {
  return String(run?.dataset_id || '').trim();
}

export function validateComparableRuns(currentRun, baselineRun) {
  const currentScenarioId = getScenarioIdForRun(currentRun);
  const baselineScenarioId = getScenarioIdForRun(baselineRun);
  const currentDatasetId = getDatasetIdForRun(currentRun);
  const baselineDatasetId = getDatasetIdForRun(baselineRun);
  if (!currentScenarioId || !baselineScenarioId || currentScenarioId !== baselineScenarioId) {
    return {
      ok: false,
      error: 'These runs come from different demo scenarios. Compare runs from the same dataset pair only.',
    };
  }
  if (!currentDatasetId || !baselineDatasetId || currentDatasetId !== baselineDatasetId) {
    return {
      ok: false,
      error: 'These runs use different eval datasets. Compare runs from the same dataset pair only.',
    };
  }
  return { ok: true, error: null };
}

function sanitizeEvidenceTags(tags) {
  return (Array.isArray(tags) ? tags : [])
    .map((tag) => String(tag || '').trim())
    .filter(Boolean)
    .filter((tag) => !tag.startsWith('seed:'))
    .filter((tag) => !tag.startsWith('scenario:'))
    .filter((tag) => !tag.startsWith('dataset:'));
}

function buildQuestionRecord(currentResult, baselineResult) {
  const current = currentResult || {};
  const baseline = baselineResult || {};
  return {
    entry_id: String(current.entry_id || baseline.entry_id || ''),
    question: String(current.question || baseline.question || ''),
    expected_paths: Array.isArray(current.expected_paths) ? current.expected_paths : Array.isArray(baseline.expected_paths) ? baseline.expected_paths : [],
    tags: sanitizeEvidenceTags(current.tags || baseline.tags || []),
    baseline_top1_hit: Boolean(baseline.top1_hit),
    current_top1_hit: Boolean(current.top1_hit),
    baseline_topk_hit: Boolean(baseline.topk_hit),
    current_topk_hit: Boolean(current.topk_hit),
    baseline_rr: Number(baseline.reciprocal_rank || 0),
    current_rr: Number(current.reciprocal_rank || 0),
    baseline_top_paths: Array.isArray(baseline.top_paths) ? baseline.top_paths : [],
    current_top_paths: Array.isArray(current.top_paths) ? current.top_paths : [],
  };
}

function countPrefixedTags(records, prefix) {
  const counts = new Map();
  for (const record of records) {
    for (const tag of record.tags || []) {
      if (!tag.startsWith(prefix)) continue;
      const label = tag.slice(prefix.length);
      counts.set(label, (counts.get(label) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .map(([label, count]) => ({ label, count }));
}

function summarizePathPrefixes(records) {
  const counts = new Map();
  for (const record of records) {
    const expectedPath = String(record.expected_paths?.[0] || '').trim();
    if (!expectedPath) continue;
    const segments = expectedPath.split('/').filter(Boolean);
    const prefix = segments.slice(0, Math.min(2, segments.length)).join('/');
    counts.set(prefix, (counts.get(prefix) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .map(([label, count]) => ({ label, count }));
}

function diffConfigs(currentConfig, baselineConfig) {
  const current = currentConfig && typeof currentConfig === 'object' ? currentConfig : {};
  const baseline = baselineConfig && typeof baselineConfig === 'object' ? baselineConfig : {};
  const keys = Array.from(new Set([...Object.keys(current), ...Object.keys(baseline)])).sort();
  return keys
    .filter((key) => JSON.stringify(current[key]) !== JSON.stringify(baseline[key]))
    .map((key) => ({
      key,
      previous: baseline[key] ?? null,
      current: current[key] ?? null,
    }));
}

export function buildComparisonEvidence(currentRun, baselineRun) {
  const currentResults = Array.isArray(currentRun?.results) ? currentRun.results : [];
  const baselineResults = Array.isArray(baselineRun?.results) ? baselineRun.results : [];
  const currentById = new Map(currentResults.map((result) => [String(result.entry_id), result]));
  const baselineById = new Map(baselineResults.map((result) => [String(result.entry_id), result]));
  const entryIds = Array.from(new Set([...currentById.keys(), ...baselineById.keys()])).sort();

  const regressions = [];
  const improvements = [];
  const top1Regressions = [];
  const top1Improvements = [];
  const stableControls = [];

  for (const entryId of entryIds) {
    const current = currentById.get(entryId);
    const baseline = baselineById.get(entryId);
    const record = buildQuestionRecord(current, baseline);
    const baselineTopk = Boolean(baseline?.topk_hit);
    const currentTopk = Boolean(current?.topk_hit);
    const baselineTop1 = Boolean(baseline?.top1_hit);
    const currentTop1 = Boolean(current?.top1_hit);

    if (baselineTopk && !currentTopk) regressions.push(record);
    if (!baselineTopk && currentTopk) improvements.push(record);
    if (baselineTop1 && !currentTop1) top1Regressions.push(record);
    if (!baselineTop1 && currentTop1) top1Improvements.push(record);
    if (baselineTopk && currentTopk) stableControls.push(record);
  }

  const configDiffs = diffConfigs(currentRun?.config, baselineRun?.config);
  const topkDelta = Number(((Number(currentRun?.topk_accuracy || 0) - Number(baselineRun?.topk_accuracy || 0)) * 100).toFixed(1));
  const top1Delta = Number(((Number(currentRun?.top1_accuracy || 0) - Number(baselineRun?.top1_accuracy || 0)) * 100).toFixed(1));
  const mrrDelta = Number(((Number(currentRun?.metrics?.mrr || 0) - Number(baselineRun?.metrics?.mrr || 0)) * 100).toFixed(1));
  const durationDeltaSecs = Number((Number(currentRun?.duration_secs || 0) - Number(baselineRun?.duration_secs || 0)).toFixed(2));

  const warnings = [];
  if (regressions.length && improvements.length) {
    warnings.push('The change is mixed: some questions improved while other questions regressed.');
  }
  const regressionFailures = countPrefixedTags(regressions, 'failure:');
  if (regressionFailures.length > 1) {
    const topCount = regressionFailures[0]?.count || 0;
    if (topCount / Math.max(1, regressions.length) < 0.75) {
      warnings.push('Regressions are spread across multiple failure signatures, so avoid over-claiming a single cause.');
    }
  }
  if (configDiffs.length >= 5) {
    warnings.push('Multiple config changes landed together, so some observed deltas may be confounded.');
  }
  if (configDiffs.some((diff) => diff.key.startsWith('pgvector.')) && regressions.some((record) => record.tags.includes('failure:rename-recent') || record.tags.includes('failure:alias-match') || record.tags.includes('failure:latest-policy'))) {
    warnings.push('ANN/search-maintenance knobs changed at the same time that recently renamed or updated pages regressed.');
  }
  if (configDiffs.some((diff) => diff.key === 'sparse_search.enabled' || diff.key === 'retrieval.bm25_weight') && regressions.some((record) => record.tags.includes('failure:exact-id') || record.tags.includes('failure:release-tag'))) {
    warnings.push('Exact-token failures line up with sparse/hybrid retrieval changes more than with broad semantic questions.');
  }
  if (configDiffs.some((diff) => diff.key.startsWith('chunking.')) && regressions.some((record) => record.tags.includes('failure:table-lookup') || record.tags.includes('failure:appendix-ref') || record.tags.includes('failure:param-matrix'))) {
    warnings.push('Structure-sensitive questions regressed after chunking settings changed, especially for tables and appendices.');
  }

  return {
    summary: {
      current_run_id: String(currentRun?.run_id || ''),
      baseline_run_id: String(baselineRun?.run_id || ''),
      current_total: Number(currentRun?.total || 0),
      baseline_total: Number(baselineRun?.total || 0),
      current_top1_accuracy: Number(currentRun?.top1_accuracy || 0),
      baseline_top1_accuracy: Number(baselineRun?.top1_accuracy || 0),
      current_topk_accuracy: Number(currentRun?.topk_accuracy || 0),
      baseline_topk_accuracy: Number(baselineRun?.topk_accuracy || 0),
      current_mrr: Number(currentRun?.metrics?.mrr || 0),
      baseline_mrr: Number(baselineRun?.metrics?.mrr || 0),
      current_duration_secs: Number(currentRun?.duration_secs || 0),
      baseline_duration_secs: Number(baselineRun?.duration_secs || 0),
      top1_delta_points: top1Delta,
      topk_delta_points: topkDelta,
      mrr_delta_points: mrrDelta,
      duration_delta_secs: durationDeltaSecs,
      topk_regression_count: regressions.length,
      topk_improvement_count: improvements.length,
      top1_regression_count: top1Regressions.length,
      top1_improvement_count: top1Improvements.length,
    },
    configDiffs,
    regressions,
    improvements,
    stableControls: stableControls.slice(0, 5),
    regressionPatterns: {
      failure_signatures: countPrefixedTags(regressions, 'failure:'),
      clusters: countPrefixedTags(regressions, 'cluster:'),
      doc_types: countPrefixedTags(regressions, 'doc-type:'),
      path_prefixes: summarizePathPrefixes(regressions),
    },
    improvementPatterns: {
      failure_signatures: countPrefixedTags(improvements, 'failure:'),
      controls: countPrefixedTags(improvements, 'control:'),
      clusters: countPrefixedTags(improvements, 'cluster:'),
      path_prefixes: summarizePathPrefixes(improvements),
    },
    warnings,
  };
}

export function buildEvalAnalysisUserInput({ currentRun, baselineRun, evidence }) {
  const payload = {
    comparison_summary: evidence.summary,
    config_diffs: evidence.configDiffs,
    topk_regressions: evidence.regressions,
    topk_improvements: evidence.improvements,
    stable_controls: evidence.stableControls,
    regression_patterns: evidence.regressionPatterns,
    improvement_patterns: evidence.improvementPatterns,
    warnings: evidence.warnings,
    authoritative_run_metadata: {
      current_run_id: String(currentRun?.run_id || ''),
      baseline_run_id: String(baselineRun?.run_id || ''),
      current_started_at: String(currentRun?.started_at || ''),
      current_completed_at: String(currentRun?.completed_at || ''),
      baseline_started_at: String(baselineRun?.started_at || ''),
      baseline_completed_at: String(baselineRun?.completed_at || ''),
    },
  };
  return [
    'Use only the authoritative evidence below.',
    'Do not assume hidden changes beyond what is explicitly listed.',
    '',
    JSON.stringify(payload, null, 2),
  ].join('\n');
}

export async function seedDemoEvalScenarios(sql) {
  const datasetEntries = getSeededEvalDatasetEntries();
  const seededRuns = getSeededEvalRuns();
  const datasetEntryIds = datasetEntries.map((entry) => String(entry.entry_id));
  const runIds = seededRuns.map((run) => String(run.run_id));

  await sql.query(
    `DELETE FROM eval_dataset
     WHERE corpus_id = $1
       AND entry_id ~ '^[0-9]+$';`,
    [DEMO_EVAL_CORPUS_ID],
  );

  await sql.query(
    `DELETE FROM eval_dataset
     WHERE corpus_id = $1
       AND tags @> $2::jsonb
       AND NOT (entry_id = ANY($3::text[]));`,
    [DEMO_EVAL_CORPUS_ID, JSON.stringify(['seed:demo-eval-scenario']), datasetEntryIds],
  );

  await sql.query(
    `DELETE FROM eval_runs
     WHERE corpus_id = $1
       AND COALESCE(run_json->>'demo_seed_kind', '') = 'scenario'
       AND NOT (run_id = ANY($2::text[]));`,
    [DEMO_EVAL_CORPUS_ID, runIds],
  );

  for (const entry of datasetEntries) {
    await sql.query(
      `INSERT INTO eval_dataset (
        corpus_id,
        entry_id,
        question,
        expected_paths,
        expected_answer,
        tags,
        created_at
      ) VALUES ($1,$2,$3,$4::jsonb,$5,$6::jsonb,$7)
      ON CONFLICT (corpus_id, entry_id) DO UPDATE
      SET question = EXCLUDED.question,
          expected_paths = EXCLUDED.expected_paths,
          expected_answer = EXCLUDED.expected_answer,
          tags = EXCLUDED.tags,
          created_at = EXCLUDED.created_at;`,
      [
        DEMO_EVAL_CORPUS_ID,
        entry.entry_id,
        entry.question,
        toJsonbParam(entry.expected_paths),
        entry.expected_answer,
        toJsonbParam(entry.tags),
        entry.created_at,
      ],
    );
  }

  for (const run of seededRuns) {
    await sql.query(
      `INSERT INTO eval_runs (
        run_id,
        corpus_id,
        dataset_id,
        created_at,
        top1_accuracy,
        topk_accuracy,
        mrr,
        total,
        duration_secs,
        has_config,
        run_json
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
      ON CONFLICT (run_id) DO UPDATE
      SET corpus_id = EXCLUDED.corpus_id,
          dataset_id = EXCLUDED.dataset_id,
          created_at = EXCLUDED.created_at,
          top1_accuracy = EXCLUDED.top1_accuracy,
          topk_accuracy = EXCLUDED.topk_accuracy,
          mrr = EXCLUDED.mrr,
          total = EXCLUDED.total,
          duration_secs = EXCLUDED.duration_secs,
          has_config = EXCLUDED.has_config,
          run_json = EXCLUDED.run_json;`,
      [
        run.run_id,
        run.corpus_id,
        run.dataset_id,
        run.completed_at,
        run.top1_accuracy,
        run.topk_accuracy,
        run.metrics?.mrr ?? 0,
        run.total,
        run.duration_secs,
        true,
        toJsonbParam(run),
      ],
    );
  }
}

export async function ensureDemoEvalSeeded(sql) {
  const datasetEntries = getSeededEvalDatasetEntries();
  const seededRuns = getSeededEvalRuns();
  const datasetEntryIds = datasetEntries.map((entry) => String(entry.entry_id));
  const runIds = seededRuns.map((run) => String(run.run_id));

  const datasetRes = await sql.query(
    `SELECT entry_id, question, expected_paths, expected_answer, tags, created_at
     FROM eval_dataset
     WHERE corpus_id = $1
       AND entry_id = ANY($2::text[]);`,
    [DEMO_EVAL_CORPUS_ID, datasetEntryIds],
  );
  const runRes = await sql.query(
    `SELECT run_json
     FROM eval_runs
     WHERE corpus_id = $1
       AND run_id = ANY($2::text[]);`,
    [DEMO_EVAL_CORPUS_ID, runIds],
  );

  if (!hasDemoEvalSeedDrift({
    actualDatasetEntries: datasetRes.rows || [],
    actualRuns: (runRes.rows || []).map((row) => row.run_json),
    expectedDatasetEntries: datasetEntries,
    expectedRuns: seededRuns,
  })) {
    return;
  }

  await seedDemoEvalScenarios(sql);
}
