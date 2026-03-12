import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildComparisonEvidence,
  buildEvalAnalysisUserInput,
  DEFAULT_DEMO_EVAL_DATASET_ID,
  DEMO_EVAL_ANALYSIS_MODEL,
  DEMO_EVAL_ANALYSIS_PROMPT,
  filterDatasetEntriesForEval,
  getSeededEvalDatasetEntries,
  getSeededEvalRuns,
  validateComparableRuns,
} from '../netlify/lib/demo-eval-scenarios.js';

test('seeded eval runs expose three scenario pairs with the newest structured-doc pair first', () => {
  const runs = getSeededEvalRuns();
  assert.equal(runs.length, 6);
  assert.equal(runs[0].scenario_id, 'structured-docs');
  assert.equal(runs[1].scenario_id, 'structured-docs');
  assert.equal(runs[0].stage, 'current');
  assert.equal(runs[1].stage, 'baseline');
  assert.equal(runs[0].topk_accuracy, 0.6);
  assert.equal(runs[1].topk_accuracy, 0.9);
  assert.equal(runs[2].scenario_id, 'identifier-hybrid');
  assert.equal(runs[4].scenario_id, 'ann-confounder');
});

test('default dataset selection stays pinned to the structured-doc scenario', () => {
  const entries = getSeededEvalDatasetEntries();
  const selected = filterDatasetEntriesForEval(entries, DEFAULT_DEMO_EVAL_DATASET_ID);
  assert.equal(selected.length, 10);
  assert.ok(selected.every((entry) => entry.tags.includes(`dataset:${DEFAULT_DEMO_EVAL_DATASET_ID}`)));
});

test('cross-scenario comparisons are rejected before analysis generation', () => {
  const runs = getSeededEvalRuns();
  const currentStructured = runs.find((run) => run.run_id === 'epstein-files-1__20260310_094500');
  const baselineIdentifiers = runs.find((run) => run.run_id === 'epstein-files-1__20260308_074000');
  const comparability = validateComparableRuns(currentStructured, baselineIdentifiers);
  assert.equal(comparability.ok, false);
  assert.match(comparability.error || '', /different demo scenarios/i);
});

test('structured-doc evidence highlights structure-sensitive regressions', () => {
  const runs = getSeededEvalRuns();
  const current = runs.find((run) => run.run_id === 'epstein-files-1__20260310_094500');
  const baseline = runs.find((run) => run.run_id === 'epstein-files-1__20260309_091500');
  const evidence = buildComparisonEvidence(current, baseline);

  assert.equal(evidence.summary.topk_regression_count, 4);
  assert.equal(evidence.summary.topk_improvement_count, 1);
  assert.deepEqual(
    evidence.regressionPatterns.failure_signatures.map((item) => item.label),
    ['appendix-ref', 'table-lookup'],
  );
  assert.ok(
    evidence.warnings.some((warning) => /tables and appendices/i.test(warning)),
    'expected structure-sensitive warning',
  );

  const userInput = buildEvalAnalysisUserInput({ currentRun: current, baselineRun: baseline, evidence });
  assert.match(userInput, /authoritative evidence/i);
  assert.match(userInput, /config_diffs/);
});

test('ann confounder evidence stays cautious and keeps the required model settings', () => {
  const runs = getSeededEvalRuns();
  const current = runs.find((run) => run.run_id === 'epstein-files-1__20260307_064000');
  const baseline = runs.find((run) => run.run_id === 'epstein-files-1__20260306_083500');
  const evidence = buildComparisonEvidence(current, baseline);

  assert.ok(
    evidence.warnings.some((warning) => /ANN\/search-maintenance knobs changed/i.test(warning)),
    'expected ANN caution warning',
  );
  assert.deepEqual(DEMO_EVAL_ANALYSIS_MODEL, {
    model: 'gpt-5-mini',
    reasoningEffort: 'high',
    maxOutputTokens: 8192,
  });
  assert.match(DEMO_EVAL_ANALYSIS_PROMPT, /^Be rigorous:/);
});
