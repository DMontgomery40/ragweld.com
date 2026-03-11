import type {
  AgentTrainDiffResponse,
  AgentTrainMetricEvent,
  AgentTrainRun,
  AgentTrainRunMeta,
  AgentTrainRunSummary,
  CorpusEvalProfile,
  RerankerLegacyStatus,
  RerankerTrainDiffResponse,
  RerankerTrainMetricEvent,
  RerankerTrainRun,
  RerankerTrainRunMeta,
  RerankerTrainRunSummary,
} from '@/types/generated';

const CORPUS_ID = 'epstein-files-1';

type RerankerPoint = {
  step: number;
  epoch: number;
  percent: number;
  trainLoss: number;
  evalLoss: number;
  mrr: number;
  ndcg: number;
  map: number;
  lr: number;
  gradNorm: number;
  stepTimeMs: number;
  sampleCount: number;
  projX: number;
  projY: number;
  message: string;
};

type AgentPoint = {
  step: number;
  epoch: number;
  percent: number;
  trainLoss: number;
  evalLoss: number;
  valPerplexity: number;
  tokensPerSec: number;
  lr: number;
  gradNorm: number;
  paramNorm: number;
  updateNorm: number;
  stepTimeMs: number;
  sampleCount: number;
  projX: number;
  projY: number;
  message: string;
};

function isoFrom(baseMs: number, offsetMs: number): string {
  return new Date(baseMs + offsetMs).toISOString();
}

function stddev(values: number[]): number {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function rerankerMetrics(point: RerankerPoint): Record<string, number> {
  return {
    train_loss: point.trainLoss,
    eval_loss: point.evalLoss,
    'mrr@10': point.mrr,
    'ndcg@10': point.ndcg,
    map: point.map,
  };
}

function agentMetrics(point: AgentPoint): Record<string, number> {
  return {
    train_loss: point.trainLoss,
    eval_loss: point.evalLoss,
    val_perplexity: point.valPerplexity,
    tokens_per_sec: point.tokensPerSec,
  };
}

function buildRerankerSummary(points: RerankerPoint[]): RerankerTrainRunSummary {
  const values = points.map((point) => point.ndcg);
  const best = Math.max(...values);
  const bestIndex = values.findIndex((value) => value === best);
  const tail = values.slice(-3);

  return {
    primary_metric_best: round(best),
    primary_metric_final: round(values[values.length - 1]),
    best_step: points[bestIndex]?.step ?? null,
    time_to_best_secs: bestIndex >= 0 ? (bestIndex + 1) * 72 : null,
    stability_stddev: round(stddev(tail)),
  };
}

function buildAgentSummary(points: AgentPoint[]): AgentTrainRunSummary {
  const values = points.map((point) => point.evalLoss);
  const best = Math.min(...values);
  const bestIndex = values.findIndex((value) => value === best);
  const tail = values.slice(-3);

  return {
    primary_metric_best: round(best),
    primary_metric_final: round(values[values.length - 1]),
    best_step: points[bestIndex]?.step ?? null,
    time_to_best_secs: bestIndex >= 0 ? (bestIndex + 1) * 88 : null,
    stability_stddev: round(stddev(tail)),
    primary_goal: 'minimize',
  };
}

function buildRerankerEvents(runId: string, startedAt: string, points: RerankerPoint[]): RerankerTrainMetricEvent[] {
  const startMs = new Date(startedAt).getTime();
  const events: RerankerTrainMetricEvent[] = [
    {
      type: 'state',
      ts: startedAt,
      run_id: runId,
      status: 'queued',
      percent: 0,
      message: 'Queued synthetic learning-reranker run',
    },
    {
      type: 'log',
      ts: isoFrom(startMs, 4000),
      run_id: runId,
      message: 'Loading triplets, tokenizer state, and LoRA adapter scaffold',
    },
    {
      type: 'state',
      ts: isoFrom(startMs, 9000),
      run_id: runId,
      status: 'running',
      percent: 1,
      message: 'Training started',
    },
  ];

  points.forEach((point, index) => {
    const ts = isoFrom(startMs, 72000 * (index + 1));
    const metrics = rerankerMetrics(point);

    events.push({
      type: 'progress',
      ts,
      run_id: runId,
      step: point.step,
      epoch: point.epoch,
      message: point.message,
      percent: point.percent,
      metrics,
      status: 'running',
      loss: point.trainLoss,
      lr: point.lr,
      grad_norm: point.gradNorm,
      step_time_ms: point.stepTimeMs,
      sample_count: point.sampleCount,
    });

    events.push({
      type: 'telemetry',
      ts: isoFrom(startMs, 72000 * (index + 1) + 1200),
      run_id: runId,
      step: point.step,
      epoch: point.epoch,
      message: point.message,
      percent: point.percent,
      metrics,
      status: 'running',
      loss: point.trainLoss,
      lr: point.lr,
      grad_norm: point.gradNorm,
      step_time_ms: point.stepTimeMs,
      sample_count: point.sampleCount,
      proj_x: point.projX,
      proj_y: point.projY,
    });
  });

  const lastPoint = points[points.length - 1];
  events.push({
    type: 'complete',
    ts: isoFrom(startMs, 72000 * (points.length + 1)),
    run_id: runId,
    step: lastPoint?.step ?? null,
    epoch: lastPoint?.epoch ?? null,
    message: 'Synthetic reranker run complete',
    percent: 100,
    metrics: lastPoint ? rerankerMetrics(lastPoint) : null,
    status: 'completed',
  });

  return events;
}

function buildAgentEvents(runId: string, startedAt: string, points: AgentPoint[]): AgentTrainMetricEvent[] {
  const startMs = new Date(startedAt).getTime();
  const events: AgentTrainMetricEvent[] = [
    {
      type: 'state',
      ts: startedAt,
      run_id: runId,
      status: 'queued',
      percent: 0,
      message: 'Queued synthetic ragweld-agent run',
    },
    {
      type: 'log',
      ts: isoFrom(startMs, 5000),
      run_id: runId,
      message: 'Materializing supervised conversation dataset and LoRA adapter state',
    },
    {
      type: 'state',
      ts: isoFrom(startMs, 12000),
      run_id: runId,
      status: 'running',
      percent: 2,
      message: 'Training started',
    },
  ];

  points.forEach((point, index) => {
    const ts = isoFrom(startMs, 88000 * (index + 1));
    const metrics = agentMetrics(point);

    events.push({
      type: 'progress',
      ts,
      run_id: runId,
      step: point.step,
      epoch: point.epoch,
      message: point.message,
      percent: point.percent,
      metrics,
      status: 'running',
      loss: point.trainLoss,
      lr: point.lr,
      grad_norm: point.gradNorm,
      param_norm: point.paramNorm,
      update_norm: point.updateNorm,
      step_time_ms: point.stepTimeMs,
      sample_count: point.sampleCount,
    });

    events.push({
      type: 'telemetry',
      ts: isoFrom(startMs, 88000 * (index + 1) + 1300),
      run_id: runId,
      step: point.step,
      epoch: point.epoch,
      message: point.message,
      percent: point.percent,
      metrics,
      status: 'running',
      loss: point.trainLoss,
      lr: point.lr,
      grad_norm: point.gradNorm,
      param_norm: point.paramNorm,
      update_norm: point.updateNorm,
      step_time_ms: point.stepTimeMs,
      sample_count: point.sampleCount,
      proj_x: point.projX,
      proj_y: point.projY,
    });
  });

  const lastPoint = points[points.length - 1];
  events.push({
    type: 'complete',
    ts: isoFrom(startMs, 88000 * (points.length + 1)),
    run_id: runId,
    step: lastPoint?.step ?? null,
    epoch: lastPoint?.epoch ?? null,
    message: 'Synthetic ragweld-agent run complete',
    percent: 100,
    metrics: lastPoint ? agentMetrics(lastPoint) : null,
    status: 'completed',
  });

  return events;
}

function toRerankerMeta(run: RerankerTrainRun): RerankerTrainRunMeta {
  return {
    run_id: run.run_id,
    corpus_id: run.corpus_id,
    status: run.status || 'completed',
    started_at: run.started_at,
    completed_at: run.completed_at ?? null,
    primary_metric: run.primary_metric,
    primary_k: run.primary_k,
    primary_metric_best: run.summary?.primary_metric_best ?? null,
    primary_metric_final: run.summary?.primary_metric_final ?? null,
  };
}

function toAgentMeta(run: AgentTrainRun): AgentTrainRunMeta {
  return {
    run_id: run.run_id,
    corpus_id: run.corpus_id,
    status: run.status || 'completed',
    started_at: run.started_at,
    completed_at: run.completed_at ?? null,
    primary_metric_best: run.summary?.primary_metric_best ?? null,
    primary_metric_final: run.summary?.primary_metric_final ?? null,
  };
}

const rerankerStartedA = new Date(Date.now() - 1000 * 60 * 60 * 19).toISOString();
const rerankerStartedB = new Date(Date.now() - 1000 * 60 * 60 * 67).toISOString();

const rerankerProfile: CorpusEvalProfile = {
  corpus_id: CORPUS_ID,
  label_kind: 'graded',
  avg_relevant_per_query: 2.8,
  p95_relevant_per_query: 5,
  recommended_metric: 'ndcg',
  recommended_k: 10,
  rationale: 'This corpus usually has multiple partially relevant passages per question, so nDCG@10 captures ordering quality better than a first-hit-only metric.',
};

const rerankerRunAPoints: RerankerPoint[] = [
  { step: 60, epoch: 1, percent: 18, trainLoss: 0.612, evalLoss: 0.544, mrr: 0.731, ndcg: 0.804, map: 0.671, lr: 0.000018, gradNorm: 1.41, stepTimeMs: 392, sampleCount: 720, projX: -0.92, projY: 0.44, message: 'Epoch 1 warmup stabilized; hard negatives are now contributing.' },
  { step: 120, epoch: 1, percent: 34, trainLoss: 0.554, evalLoss: 0.497, mrr: 0.758, ndcg: 0.829, map: 0.694, lr: 0.000018, gradNorm: 1.26, stepTimeMs: 401, sampleCount: 1440, projX: -0.48, projY: 0.28, message: 'Rank fusion anchors are separating cleanly in the latent view.' },
  { step: 210, epoch: 2, percent: 51, trainLoss: 0.487, evalLoss: 0.452, mrr: 0.792, ndcg: 0.861, map: 0.723, lr: 0.000016, gradNorm: 1.08, stepTimeMs: 409, sampleCount: 2520, projX: -0.08, projY: 0.16, message: 'Epoch 2 picked up the weaker itinerary examples without hurting precision.' },
  { step: 300, epoch: 2, percent: 67, trainLoss: 0.438, evalLoss: 0.421, mrr: 0.807, ndcg: 0.874, map: 0.741, lr: 0.000014, gradNorm: 0.95, stepTimeMs: 417, sampleCount: 3600, projX: 0.24, projY: 0.06, message: 'Validation curve is flattening; continuing into final pass for stability.' },
  { step: 420, epoch: 3, percent: 86, trainLoss: 0.401, evalLoss: 0.398, mrr: 0.821, ndcg: 0.8821, map: 0.756, lr: 0.000012, gradNorm: 0.89, stepTimeMs: 425, sampleCount: 5040, projX: 0.58, projY: -0.04, message: 'Best checkpoint reached after late-stage hard-negative refresh.' },
  { step: 480, epoch: 3, percent: 97, trainLoss: 0.389, evalLoss: 0.404, mrr: 0.817, ndcg: 0.8784, map: 0.751, lr: 0.000010, gradNorm: 0.86, stepTimeMs: 431, sampleCount: 5760, projX: 0.71, projY: -0.08, message: 'Final checkpoint kept near-best ranking quality with smoother loss dynamics.' },
];

const rerankerRunBPoints: RerankerPoint[] = [
  { step: 60, epoch: 1, percent: 17, trainLoss: 0.694, evalLoss: 0.621, mrr: 0.664, ndcg: 0.748, map: 0.608, lr: 0.000020, gradNorm: 1.63, stepTimeMs: 438, sampleCount: 720, projX: -1.05, projY: 0.52, message: 'Warmup pass is still noisy across the graded labels.' },
  { step: 140, epoch: 1, percent: 33, trainLoss: 0.641, evalLoss: 0.588, mrr: 0.689, ndcg: 0.771, map: 0.629, lr: 0.000020, gradNorm: 1.51, stepTimeMs: 446, sampleCount: 1680, projX: -0.71, projY: 0.39, message: 'Negative mining is helping, but recall-heavy queries are still unstable.' },
  { step: 220, epoch: 2, percent: 49, trainLoss: 0.588, evalLoss: 0.547, mrr: 0.718, ndcg: 0.796, map: 0.652, lr: 0.000018, gradNorm: 1.36, stepTimeMs: 457, sampleCount: 2640, projX: -0.39, projY: 0.21, message: 'Mid-run gains came mostly from easy positives rather than the difficult tails.' },
  { step: 320, epoch: 2, percent: 68, trainLoss: 0.552, evalLoss: 0.521, mrr: 0.731, ndcg: 0.8127, map: 0.669, lr: 0.000016, gradNorm: 1.28, stepTimeMs: 463, sampleCount: 3840, projX: -0.11, projY: 0.12, message: 'Best checkpoint hit early in epoch 2, but drift returned late.' },
  { step: 410, epoch: 3, percent: 84, trainLoss: 0.537, evalLoss: 0.534, mrr: 0.724, ndcg: 0.8051, map: 0.662, lr: 0.000013, gradNorm: 1.24, stepTimeMs: 470, sampleCount: 4920, projX: 0.17, projY: 0.08, message: 'Late-stage ranking improvements were inconsistent on long-tail passages.' },
  { step: 500, epoch: 3, percent: 97, trainLoss: 0.529, evalLoss: 0.541, mrr: 0.719, ndcg: 0.8019, map: 0.657, lr: 0.000011, gradNorm: 1.21, stepTimeMs: 476, sampleCount: 6000, projX: 0.33, projY: 0.11, message: 'Final checkpoint slightly regressed from the best epoch-2 snapshot.' },
];

const rerankerEventsA = buildRerankerEvents('rr-train-20260309-110500', rerankerStartedA, rerankerRunAPoints);
const rerankerEventsB = buildRerankerEvents('rr-train-20260305-084000', rerankerStartedB, rerankerRunBPoints);

export const mockRerankerTrainRuns: RerankerTrainRun[] = [
  {
    run_id: 'rr-train-20260309-110500',
    corpus_id: CORPUS_ID,
    status: 'completed',
    started_at: rerankerStartedA,
    completed_at: rerankerEventsA[rerankerEventsA.length - 1]?.ts ?? isoFrom(new Date(rerankerStartedA).getTime(), 540000),
    config_snapshot: {
      training: {
        learning_reranker_backend: 'mlx_qwen3',
        learning_reranker_base_model: 'Qwen/Qwen3-Reranker-0.6B',
        tribrid_reranker_model_path: 'models/learning-reranker-epstein-files-1',
        learning_reranker_lora_rank: 16,
        learning_reranker_lora_alpha: 32,
        learning_reranker_lora_dropout: 0.05,
      },
      reranking: {
        tribrid_reranker_topn: 50,
        tribrid_reranker_maxlen: 512,
      },
    },
    config: {
      'training.learning_reranker_backend': 'mlx_qwen3',
      'training.learning_reranker_base_model': 'Qwen/Qwen3-Reranker-0.6B',
      'training.tribrid_reranker_model_path': 'models/learning-reranker-epstein-files-1',
      'training.learning_reranker_lora_rank': 16,
      'training.learning_reranker_lora_alpha': 32,
      'training.learning_reranker_lora_dropout': 0.05,
      'reranking.tribrid_reranker_topn': 50,
      'reranking.tribrid_reranker_maxlen': 512,
    },
    primary_metric: 'ndcg',
    primary_k: 10,
    metrics_available: ['train_loss', 'eval_loss', 'mrr@10', 'ndcg@10', 'map'],
    metric_profile: rerankerProfile,
    epochs: 3,
    batch_size: 12,
    lr: 0.000018,
    warmup_ratio: 0.08,
    max_length: 512,
    summary: buildRerankerSummary(rerankerRunAPoints),
  },
  {
    run_id: 'rr-train-20260305-084000',
    corpus_id: CORPUS_ID,
    status: 'completed',
    started_at: rerankerStartedB,
    completed_at: rerankerEventsB[rerankerEventsB.length - 1]?.ts ?? isoFrom(new Date(rerankerStartedB).getTime(), 560000),
    config_snapshot: {
      training: {
        learning_reranker_backend: 'mlx_qwen3',
        learning_reranker_base_model: 'Qwen/Qwen3-Reranker-0.6B',
        tribrid_reranker_model_path: 'models/learning-reranker-epstein-files-1-prev',
        learning_reranker_lora_rank: 8,
        learning_reranker_lora_alpha: 16,
        learning_reranker_lora_dropout: 0.08,
      },
      reranking: {
        tribrid_reranker_topn: 40,
        tribrid_reranker_maxlen: 448,
      },
    },
    config: {
      'training.learning_reranker_backend': 'mlx_qwen3',
      'training.learning_reranker_base_model': 'Qwen/Qwen3-Reranker-0.6B',
      'training.tribrid_reranker_model_path': 'models/learning-reranker-epstein-files-1-prev',
      'training.learning_reranker_lora_rank': 8,
      'training.learning_reranker_lora_alpha': 16,
      'training.learning_reranker_lora_dropout': 0.08,
      'reranking.tribrid_reranker_topn': 40,
      'reranking.tribrid_reranker_maxlen': 448,
    },
    primary_metric: 'ndcg',
    primary_k: 10,
    metrics_available: ['train_loss', 'eval_loss', 'mrr@10', 'ndcg@10', 'map'],
    metric_profile: rerankerProfile,
    epochs: 3,
    batch_size: 16,
    lr: 0.00002,
    warmup_ratio: 0.1,
    max_length: 448,
    summary: buildRerankerSummary(rerankerRunBPoints),
  },
];

export const mockRerankerTrainRunMetas: RerankerTrainRunMeta[] = mockRerankerTrainRuns.map(toRerankerMeta);

export const mockRerankerTrainEventsByRunId: Record<string, RerankerTrainMetricEvent[]> = {
  [mockRerankerTrainRuns[0].run_id]: rerankerEventsA,
  [mockRerankerTrainRuns[1].run_id]: rerankerEventsB,
};

const agentStartedA = new Date(Date.now() - 1000 * 60 * 60 * 11).toISOString();
const agentStartedB = new Date(Date.now() - 1000 * 60 * 60 * 42).toISOString();

const agentRunAPoints: AgentPoint[] = [
  { step: 48, epoch: 1, percent: 16, trainLoss: 1.228, evalLoss: 1.072, valPerplexity: 3.48, tokensPerSec: 1340, lr: 0.000018, gradNorm: 2.14, paramNorm: 36.8, updateNorm: 0.49, stepTimeMs: 522, sampleCount: 768, projX: -0.88, projY: 0.36, message: 'Assistant turns are aligning faster once the eval-style prompts kick in.' },
  { step: 112, epoch: 1, percent: 31, trainLoss: 1.084, evalLoss: 0.962, valPerplexity: 3.05, tokensPerSec: 1378, lr: 0.000018, gradNorm: 1.97, paramNorm: 36.6, updateNorm: 0.44, stepTimeMs: 517, sampleCount: 1792, projX: -0.49, projY: 0.23, message: 'Prompt-following improved on long retrieval-grounded answers.' },
  { step: 208, epoch: 2, percent: 52, trainLoss: 0.956, evalLoss: 0.884, valPerplexity: 2.78, tokensPerSec: 1415, lr: 0.000016, gradNorm: 1.73, paramNorm: 36.1, updateNorm: 0.38, stepTimeMs: 509, sampleCount: 3328, projX: -0.11, projY: 0.11, message: 'Epoch 2 reduced refusal-style failures without overfitting the retrieval phrasing.' },
  { step: 296, epoch: 2, percent: 73, trainLoss: 0.901, evalLoss: 0.858, valPerplexity: 2.63, tokensPerSec: 1454, lr: 0.000014, gradNorm: 1.58, paramNorm: 35.8, updateNorm: 0.35, stepTimeMs: 501, sampleCount: 4736, projX: 0.18, projY: 0.04, message: 'Validation loss keeps trending down with smoother token throughput.' },
  { step: 360, epoch: 3, percent: 89, trainLoss: 0.862, evalLoss: 0.8421, valPerplexity: 2.54, tokensPerSec: 1482, lr: 0.000012, gradNorm: 1.46, paramNorm: 35.5, updateNorm: 0.31, stepTimeMs: 495, sampleCount: 5760, projX: 0.46, projY: -0.02, message: 'Best checkpoint captured the grounded-answer style we want for the demo.' },
  { step: 408, epoch: 3, percent: 98, trainLoss: 0.851, evalLoss: 0.8517, valPerplexity: 2.57, tokensPerSec: 1491, lr: 0.000010, gradNorm: 1.39, paramNorm: 35.3, updateNorm: 0.29, stepTimeMs: 492, sampleCount: 6528, projX: 0.62, projY: -0.05, message: 'Final adapter stayed close to best while improving throughput consistency.' },
];

const agentRunBPoints: AgentPoint[] = [
  { step: 48, epoch: 1, percent: 15, trainLoss: 1.486, evalLoss: 1.332, valPerplexity: 4.62, tokensPerSec: 1185, lr: 0.000020, gradNorm: 2.48, paramNorm: 37.9, updateNorm: 0.57, stepTimeMs: 563, sampleCount: 768, projX: -1.01, projY: 0.41, message: 'Baseline run opened with a wide loss gap on multi-hop answers.' },
  { step: 120, epoch: 1, percent: 30, trainLoss: 1.342, evalLoss: 1.241, valPerplexity: 4.18, tokensPerSec: 1210, lr: 0.000020, gradNorm: 2.31, paramNorm: 37.6, updateNorm: 0.53, stepTimeMs: 556, sampleCount: 1920, projX: -0.67, projY: 0.31, message: 'The model is learning the format, but still hallucinates unsupported joins.' },
  { step: 216, epoch: 2, percent: 53, trainLoss: 1.251, evalLoss: 1.1844, valPerplexity: 3.82, tokensPerSec: 1256, lr: 0.000017, gradNorm: 2.05, paramNorm: 37.1, updateNorm: 0.47, stepTimeMs: 548, sampleCount: 3456, projX: -0.28, projY: 0.18, message: 'Epoch 2 reached the best eval loss, but the tail still looks unstable.' },
  { step: 304, epoch: 2, percent: 74, trainLoss: 1.218, evalLoss: 1.197, valPerplexity: 3.91, tokensPerSec: 1271, lr: 0.000014, gradNorm: 1.93, paramNorm: 36.9, updateNorm: 0.44, stepTimeMs: 544, sampleCount: 4864, projX: 0.04, projY: 0.11, message: 'Late-epoch oscillation reintroduced small groundedness failures.' },
  { step: 392, epoch: 3, percent: 97, trainLoss: 1.204, evalLoss: 1.2088, valPerplexity: 3.99, tokensPerSec: 1288, lr: 0.000011, gradNorm: 1.87, paramNorm: 36.7, updateNorm: 0.41, stepTimeMs: 541, sampleCount: 6272, projX: 0.29, projY: 0.09, message: 'Final checkpoint regressed slightly from the best step in epoch 2.' },
];

const agentEventsA = buildAgentEvents('agent-train-20260309-172000', agentStartedA, agentRunAPoints);
const agentEventsB = buildAgentEvents('agent-train-20260308-093000', agentStartedB, agentRunBPoints);

export const mockAgentTrainRuns: AgentTrainRun[] = [
  {
    run_id: 'agent-train-20260309-172000',
    corpus_id: CORPUS_ID,
    status: 'completed',
    started_at: agentStartedA,
    completed_at: agentEventsA[agentEventsA.length - 1]?.ts ?? isoFrom(new Date(agentStartedA).getTime(), 620000),
    config_snapshot: {
      training: {
        ragweld_agent_backend: 'mlx_qwen3',
        ragweld_agent_base_model: 'mlx-community/Qwen3-1.7B-4bit',
        ragweld_agent_model_path: 'models/learning-agent-epstein-files-1',
        ragweld_agent_train_dataset_path: 'data/eval_datasets/epstein-files-1.train.json',
        ragweld_agent_lora_rank: 16,
        ragweld_agent_lora_alpha: 32,
        ragweld_agent_lora_dropout: 0.05,
        ragweld_agent_grad_accum_steps: 8,
      },
    },
    config: {
      'training.ragweld_agent_backend': 'mlx_qwen3',
      'training.ragweld_agent_base_model': 'mlx-community/Qwen3-1.7B-4bit',
      'training.ragweld_agent_model_path': 'models/learning-agent-epstein-files-1',
      'training.ragweld_agent_train_dataset_path': 'data/eval_datasets/epstein-files-1.train.json',
      'training.ragweld_agent_lora_rank': 16,
      'training.ragweld_agent_lora_alpha': 32,
      'training.ragweld_agent_lora_dropout': 0.05,
      'training.ragweld_agent_grad_accum_steps': 8,
    },
    primary_metric: 'eval_loss',
    primary_goal: 'minimize',
    metrics_available: ['train_loss', 'eval_loss', 'val_perplexity', 'tokens_per_sec'],
    epochs: 3,
    batch_size: 12,
    lr: 0.000018,
    warmup_ratio: 0.08,
    max_length: 1024,
    summary: buildAgentSummary(agentRunAPoints),
  },
  {
    run_id: 'agent-train-20260308-093000',
    corpus_id: CORPUS_ID,
    status: 'completed',
    started_at: agentStartedB,
    completed_at: agentEventsB[agentEventsB.length - 1]?.ts ?? isoFrom(new Date(agentStartedB).getTime(), 670000),
    config_snapshot: {
      training: {
        ragweld_agent_backend: 'mlx_qwen3',
        ragweld_agent_base_model: 'mlx-community/Qwen3-1.7B-4bit',
        ragweld_agent_model_path: 'models/learning-agent-epstein-files-1-prev',
        ragweld_agent_train_dataset_path: 'data/eval_datasets/epstein-files-1.train.json',
        ragweld_agent_lora_rank: 8,
        ragweld_agent_lora_alpha: 24,
        ragweld_agent_lora_dropout: 0.08,
        ragweld_agent_grad_accum_steps: 4,
      },
    },
    config: {
      'training.ragweld_agent_backend': 'mlx_qwen3',
      'training.ragweld_agent_base_model': 'mlx-community/Qwen3-1.7B-4bit',
      'training.ragweld_agent_model_path': 'models/learning-agent-epstein-files-1-prev',
      'training.ragweld_agent_train_dataset_path': 'data/eval_datasets/epstein-files-1.train.json',
      'training.ragweld_agent_lora_rank': 8,
      'training.ragweld_agent_lora_alpha': 24,
      'training.ragweld_agent_lora_dropout': 0.08,
      'training.ragweld_agent_grad_accum_steps': 4,
    },
    primary_metric: 'eval_loss',
    primary_goal: 'minimize',
    metrics_available: ['train_loss', 'eval_loss', 'val_perplexity', 'tokens_per_sec'],
    epochs: 3,
    batch_size: 16,
    lr: 0.00002,
    warmup_ratio: 0.1,
    max_length: 896,
    summary: buildAgentSummary(agentRunBPoints),
  },
];

export const mockAgentTrainRunMetas: AgentTrainRunMeta[] = mockAgentTrainRuns.map(toAgentMeta);

export const mockAgentTrainEventsByRunId: Record<string, AgentTrainMetricEvent[]> = {
  [mockAgentTrainRuns[0].run_id]: agentEventsA,
  [mockAgentTrainRuns[1].run_id]: agentEventsB,
};

export const mockRerankerTrainProfile = rerankerProfile;

export const mockRerankerLegacyStatus: RerankerLegacyStatus = {
  running: false,
  progress: 100,
  task: '',
  message: 'Synthetic learning-reranker history loaded.',
  result: {
    ok: true,
    output: 'Latest holdout summary: nDCG@10 0.8784, MRR@10 0.8170, MAP 0.7510.',
    error: null,
    metrics: rerankerMetrics(rerankerRunAPoints[rerankerRunAPoints.length - 1]),
    run_id: mockRerankerTrainRuns[0].run_id,
  },
  live_output: [
    '[synthetic] restored learning-reranker timeline',
    '[synthetic] best checkpoint: step 420',
    '[synthetic] ready for inspector diff and score probes',
  ],
  run_id: mockRerankerTrainRuns[0].run_id,
};

export const mockRerankerLogs = [
  '[2026-03-09T17:20:05Z] dataset=epstein-files-1 triplets=384 warmup=0.08',
  '[2026-03-09T17:21:17Z] epoch=1 step=60 train_loss=0.6120 eval_loss=0.5440 ndcg@10=0.8040',
  '[2026-03-09T17:24:53Z] epoch=2 step=210 train_loss=0.4870 eval_loss=0.4520 ndcg@10=0.8610',
  '[2026-03-09T17:27:17Z] epoch=3 step=420 train_loss=0.4010 eval_loss=0.3980 ndcg@10=0.8821 (best)',
  '[2026-03-09T17:28:29Z] epoch=3 step=480 train_loss=0.3890 eval_loss=0.4040 ndcg@10=0.8784 final',
];

export function getMockRerankerTrainRun(runId: string): RerankerTrainRun | null {
  return mockRerankerTrainRuns.find((run) => run.run_id === runId) || null;
}

export function getMockAgentTrainRun(runId: string): AgentTrainRun | null {
  return mockAgentTrainRuns.find((run) => run.run_id === runId) || null;
}

export function getMockRerankerTrainDiff(baselineRunId: string, currentRunId: string): RerankerTrainDiffResponse {
  const baseline = getMockRerankerTrainRun(baselineRunId);
  const current = getMockRerankerTrainRun(currentRunId);
  if (!baseline || !current) {
    return {
      ok: false,
      compatible: false,
      reason: 'Synthetic reranker run not found.',
    };
  }

  if (baseline.primary_metric !== current.primary_metric || baseline.primary_k !== current.primary_k) {
    return {
      ok: true,
      compatible: false,
      reason: 'Primary metric or @k differs between runs.',
      primary_metric: current.primary_metric,
      primary_k: current.primary_k,
    };
  }

  const baselineSummary = baseline.summary || {};
  const currentSummary = current.summary || {};

  return {
    ok: true,
    compatible: true,
    primary_metric: current.primary_metric,
    primary_k: current.primary_k,
    baseline_primary_best: baselineSummary.primary_metric_best ?? null,
    current_primary_best: currentSummary.primary_metric_best ?? null,
    delta_primary_best: round((currentSummary.primary_metric_best ?? 0) - (baselineSummary.primary_metric_best ?? 0)),
    baseline_time_to_best_secs: baselineSummary.time_to_best_secs ?? null,
    current_time_to_best_secs: currentSummary.time_to_best_secs ?? null,
    delta_time_to_best_secs: round((currentSummary.time_to_best_secs ?? 0) - (baselineSummary.time_to_best_secs ?? 0), 2),
    baseline_stability_stddev: baselineSummary.stability_stddev ?? null,
    current_stability_stddev: currentSummary.stability_stddev ?? null,
    delta_stability_stddev: round((currentSummary.stability_stddev ?? 0) - (baselineSummary.stability_stddev ?? 0)),
  };
}

export function getMockAgentTrainDiff(baselineRunId: string, currentRunId: string): AgentTrainDiffResponse {
  const baseline = getMockAgentTrainRun(baselineRunId);
  const current = getMockAgentTrainRun(currentRunId);
  if (!baseline || !current) {
    return {
      ok: false,
      compatible: false,
      reason: 'Synthetic agent run not found.',
    };
  }

  if ((baseline.primary_metric || 'eval_loss') !== (current.primary_metric || 'eval_loss')) {
    return {
      ok: true,
      compatible: false,
      reason: 'Primary metric differs between runs.',
      primary_metric: current.primary_metric || 'eval_loss',
      primary_goal: current.primary_goal || 'minimize',
    };
  }

  const baselineSummary = baseline.summary || {};
  const currentSummary = current.summary || {};
  const goal = current.primary_goal || 'minimize';
  const baselineBest = baselineSummary.primary_metric_best ?? null;
  const currentBest = currentSummary.primary_metric_best ?? null;
  const delta = baselineBest == null || currentBest == null ? null : round(currentBest - baselineBest);

  return {
    ok: true,
    compatible: true,
    primary_metric: current.primary_metric || 'eval_loss',
    primary_goal: goal,
    baseline_primary_best: baselineBest,
    current_primary_best: currentBest,
    delta_primary_best: delta,
    baseline_time_to_best_secs: baselineSummary.time_to_best_secs ?? null,
    current_time_to_best_secs: currentSummary.time_to_best_secs ?? null,
    delta_time_to_best_secs: round((currentSummary.time_to_best_secs ?? 0) - (baselineSummary.time_to_best_secs ?? 0), 2),
    baseline_stability_stddev: baselineSummary.stability_stddev ?? null,
    current_stability_stddev: currentSummary.stability_stddev ?? null,
    delta_stability_stddev: round((currentSummary.stability_stddev ?? 0) - (baselineSummary.stability_stddev ?? 0)),
    improved: delta == null ? null : (goal === 'minimize' ? delta < 0 : delta > 0),
  };
}

export function getMockRerankerScore(query: string, document: string, includeLogits = false) {
  const queryTerms = new Set(String(query || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const docTerms = new Set(String(document || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const overlap = [...queryTerms].filter((term) => docTerms.has(term)).length;
  const coverage = queryTerms.size ? overlap / queryTerms.size : 0;
  const density = docTerms.size ? overlap / Math.min(docTerms.size, 12) : 0;
  const score = Math.max(0.08, Math.min(0.98, round((coverage * 0.72) + (density * 0.28), 3)));
  const yesLogit = includeLogits ? round((score * 4.2) - 1.9, 3) : null;
  const noLogit = includeLogits ? round(((1 - score) * 3.8) - 1.6, 3) : null;

  return {
    ok: true,
    backend: 'mlx_qwen3',
    score,
    yes_logit: yesLogit,
    no_logit: noLogit,
    error: null,
  };
}
