import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import pg from 'pg';

import {
  buildComparisonEvidence,
  buildEvalAnalysisUserInput,
  DEMO_EVAL_ANALYSIS_MODEL,
  DEMO_EVAL_ANALYSIS_PROMPT,
  DEMO_EVAL_CORPUS_ID,
  getSeededEvalRuns,
  seedDemoEvalScenarios,
} from '../netlify/lib/demo-eval-scenarios.js';

const { Pool } = pg;

function sha256Hex(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function extractResponsesText(data) {
  const outputText = String(data?.output_text || '').trim();
  if (outputText) return outputText;
  const output = Array.isArray(data?.output) ? data.output : [];
  const parts = [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (part?.type === 'output_text' && typeof part?.text === 'string' && part.text) {
        parts.push(part.text);
      } else if (typeof part?.text === 'string' && part.text) {
        parts.push(part.text);
      }
    }
  }
  return parts.join('\n').trim();
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rest] = match;
    if (process.env[key]) continue;
    let value = rest.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function getEnvValue(name) {
  return String(process.env[name] || '').trim();
}

function getNetlifyEnvValue(name) {
  try {
    return String(
      execFileSync('netlify', ['env:get', name], {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    ).trim();
  } catch {
    return '';
  }
}

function resolveDatabaseUrl() {
  return (
    getEnvValue('RAGWELD_DATABASE_URL') ||
    getEnvValue('NETLIFY_DATABASE_URL') ||
    getEnvValue('DATABASE_URL') ||
    getNetlifyEnvValue('NETLIFY_DATABASE_URL') ||
    getNetlifyEnvValue('NETLIFY_DATABASE_URL_UNPOOLED')
  );
}

async function ensureCacheTable(sql) {
  await sql.query(`
    CREATE TABLE IF NOT EXISTS eval_analysis_cache (
      current_run_id TEXT NOT NULL,
      baseline_run_id TEXT NOT NULL,
      prompt_hash TEXT NOT NULL,
      model TEXT NOT NULL,
      reasoning_effort TEXT NOT NULL,
      max_output_tokens INTEGER NOT NULL,
      input_hash TEXT NOT NULL,
      analysis_text TEXT NOT NULL,
      model_used TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (
        current_run_id,
        baseline_run_id,
        prompt_hash,
        model,
        reasoning_effort,
        max_output_tokens,
        input_hash
      )
    );
  `);
}

function getScenarioPairs(runs) {
  const byScenario = new Map();
  for (const run of runs) {
    const scenarioId = String(run?.scenario_id || '').trim();
    if (!scenarioId) continue;
    if (!byScenario.has(scenarioId)) byScenario.set(scenarioId, {});
    const group = byScenario.get(scenarioId);
    group[String(run.stage || '').trim()] = run;
  }
  return Array.from(byScenario.values())
    .filter((group) => group.current && group.baseline)
    .map((group) => ({ current: group.current, baseline: group.baseline }));
}

async function fetchAnalysis(apiKey, currentRun, baselineRun) {
  const evidence = buildComparisonEvidence(currentRun, baselineRun);
  const userInput = buildEvalAnalysisUserInput({ currentRun, baselineRun, evidence });
  const startedAt = Date.now();
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: DEMO_EVAL_ANALYSIS_MODEL.model,
      instructions: DEMO_EVAL_ANALYSIS_PROMPT,
      input: userInput,
      reasoning: { effort: DEMO_EVAL_ANALYSIS_MODEL.reasoningEffort },
      max_output_tokens: DEMO_EVAL_ANALYSIS_MODEL.maxOutputTokens,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAI error (${res.status}): ${text || res.statusText}`);
  }
  const data = await res.json();
  return {
    evidence,
    analysis: extractResponsesText(data),
    modelUsed: String(data?.model || DEMO_EVAL_ANALYSIS_MODEL.model).trim() || DEMO_EVAL_ANALYSIS_MODEL.model,
    durationMs: Date.now() - startedAt,
  };
}

async function cacheAnalysis(sql, currentRun, baselineRun, evidence, analysis, modelUsed) {
  const key = {
    currentRunId: String(currentRun.run_id || ''),
    baselineRunId: String(baselineRun.run_id || ''),
    promptHash: sha256Hex(DEMO_EVAL_ANALYSIS_PROMPT),
    model: DEMO_EVAL_ANALYSIS_MODEL.model,
    reasoningEffort: DEMO_EVAL_ANALYSIS_MODEL.reasoningEffort,
    maxOutputTokens: DEMO_EVAL_ANALYSIS_MODEL.maxOutputTokens,
    inputHash: sha256Hex(JSON.stringify(evidence)),
  };
  await sql.query(
    `INSERT INTO eval_analysis_cache (
      current_run_id,
      baseline_run_id,
      prompt_hash,
      model,
      reasoning_effort,
      max_output_tokens,
      input_hash,
      analysis_text,
      model_used
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (
      current_run_id,
      baseline_run_id,
      prompt_hash,
      model,
      reasoning_effort,
      max_output_tokens,
      input_hash
    ) DO UPDATE
    SET analysis_text = EXCLUDED.analysis_text,
        model_used = EXCLUDED.model_used,
        created_at = now();`,
    [
      key.currentRunId,
      key.baselineRunId,
      key.promptHash,
      key.model,
      key.reasoningEffort,
      key.maxOutputTokens,
      key.inputHash,
      analysis,
      modelUsed,
    ],
  );
}

async function findReusableAnalysis(sql, currentRun, baselineRun) {
  const res = await sql.query(
    `SELECT analysis_text, model_used
     FROM eval_analysis_cache
     WHERE current_run_id = $1
       AND baseline_run_id = $2
       AND prompt_hash = $3
       AND model = $4
       AND reasoning_effort = $5
       AND max_output_tokens = $6
     ORDER BY created_at DESC
     LIMIT 1;`,
    [
      String(currentRun.run_id || ''),
      String(baselineRun.run_id || ''),
      sha256Hex(DEMO_EVAL_ANALYSIS_PROMPT),
      DEMO_EVAL_ANALYSIS_MODEL.model,
      DEMO_EVAL_ANALYSIS_MODEL.reasoningEffort,
      DEMO_EVAL_ANALYSIS_MODEL.maxOutputTokens,
    ],
  );
  const row = res.rows?.[0];
  return row
    ? {
        analysis: String(row.analysis_text || ''),
        modelUsed: row.model_used == null ? DEMO_EVAL_ANALYSIS_MODEL.model : String(row.model_used),
      }
    : null;
}

async function main() {
  loadEnvFile(path.join(process.cwd(), '.env'));

  const apiKey = getEnvValue('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required. Load .env or export it before running this script.');
  }

  const connectionString = resolveDatabaseUrl();
  if (!connectionString) {
    throw new Error('A database URL is required. Set NETLIFY_DATABASE_URL/RAGWELD_DATABASE_URL/DATABASE_URL or make sure `netlify env:get NETLIFY_DATABASE_URL` works.');
  }

  const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
  const sql = new Pool({
    connectionString,
    max: 1,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  try {
    await ensureCacheTable(sql);
    await seedDemoEvalScenarios(sql);

    const runs = getSeededEvalRuns().filter((run) => String(run.corpus_id || '') === DEMO_EVAL_CORPUS_ID);
    const pairs = getScenarioPairs(runs);
    console.log(`Warming ${pairs.length} eval analysis cache entries...`);

    for (const pair of pairs) {
      console.log(`\n[${pair.current.scenario_id}] ${pair.baseline.run_id} -> ${pair.current.run_id}`);
      const reusable = await findReusableAnalysis(sql, pair.current, pair.baseline);
      if (reusable?.analysis) {
        const evidence = buildComparisonEvidence(pair.current, pair.baseline);
        await cacheAnalysis(sql, pair.current, pair.baseline, evidence, reusable.analysis, reusable.modelUsed);
        console.log(`reused cached analysis for ${pair.current.scenario_id} using ${reusable.modelUsed}`);
        continue;
      }

      const result = await fetchAnalysis(apiKey, pair.current, pair.baseline);
      if (!result.analysis) {
        throw new Error(`Empty analysis returned for ${pair.current.scenario_id}`);
      }
      await cacheAnalysis(sql, pair.current, pair.baseline, result.evidence, result.analysis, result.modelUsed);
      console.log(`cached ${pair.current.scenario_id} in ${result.durationMs} ms using ${result.modelUsed}`);
    }

    console.log('\nEval analysis cache warm complete.');
  } finally {
    await sql.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
