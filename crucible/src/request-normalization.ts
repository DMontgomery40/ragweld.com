import type { EstimateRequest, NormalizationEvent, TrainingType } from './types'

const TRAINING_TYPE_VALUES: TrainingType[] = ['SFT', 'GRPO', 'GSPO', 'DPO', 'PPO', 'ORPO', 'SimPO']
const TRAINING_TYPE_SET = new Set<TrainingType>(TRAINING_TYPE_VALUES)

export interface LegacyEstimateRequestFields {
  training_type?: unknown
  rl?: unknown
  rl_algorithm?: unknown
  grpo_num_generations?: unknown
  rl_generations_per_prompt?: unknown
  max_seq_length?: unknown
  context_length?: unknown
  num_epochs?: unknown
  epochs?: unknown
}

interface NormalizedLegacyRequestResult {
  request: EstimateRequest
  normalizations: NormalizationEvent[]
  warnings: string[]
}

function isTrainingType(value: unknown): value is TrainingType {
  return typeof value === 'string' && TRAINING_TYPE_SET.has(value as TrainingType)
}

function normalizeTrainingTypeValue(value: unknown): TrainingType | null {
  if (isTrainingType(value)) {
    return value
  }
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().toUpperCase()
  return TRAINING_TYPE_VALUES.find((candidate) => candidate.toUpperCase() === normalized) ?? null
}

function asPositiveNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null
  }
  return value
}

function isTruthyFlag(value: unknown): boolean {
  if (value === true || value === 1) {
    return true
  }
  if (typeof value !== 'string') {
    return false
  }

  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes'
}

function normalizeLegacyTrainingType(input: LegacyEstimateRequestFields): {
  trainingType: TrainingType
  reason: string | null
  warning: string | null
} {
  const canonicalTrainingType = normalizeTrainingTypeValue(input.training_type)
  if (canonicalTrainingType) {
    return {
      trainingType: canonicalTrainingType,
      reason: null,
      warning: null,
    }
  }

  const normalizedInput =
    typeof input.training_type === 'string' ? input.training_type.trim().toUpperCase() : ''
  const legacyAlgorithm = normalizeTrainingTypeValue(input.rl_algorithm)

  if (legacyAlgorithm) {
    return {
      trainingType: legacyAlgorithm,
      reason:
        normalizedInput === 'RL'
          ? 'Legacy training_type "RL" now resolves through rl_algorithm.'
          : 'Legacy rl_algorithm is mapped onto the current training_type field.',
      warning: null,
    }
  }

  if (normalizedInput === 'RL' || isTruthyFlag(input.rl)) {
    return {
      trainingType: 'GRPO',
      reason:
        'Legacy RL mode without a supported rl_algorithm defaults to GRPO so the planner stays operable.',
      warning:
        'Legacy RL mode did not specify a supported rl_algorithm, so training_type defaulted to GRPO.',
    }
  }

  return {
    trainingType: 'SFT',
    reason: normalizedInput.length > 0 ? 'Unknown training_type defaulted to SFT.' : null,
    warning:
      normalizedInput.length > 0
        ? `Unknown training_type "${input.training_type}" defaulted to SFT.`
        : null,
  }
}

export function normalizeLegacyEstimateRequest(
  request: EstimateRequest & LegacyEstimateRequestFields,
): NormalizedLegacyRequestResult {
  const normalizations: NormalizationEvent[] = []
  const warnings: string[] = []
  const normalized: EstimateRequest = { ...request }

  const trainingType = normalizeLegacyTrainingType(request)
  if (normalized.training_type !== trainingType.trainingType) {
    normalizations.push({
      rule_id: 'legacy_training_type_alias',
      field: 'training_type',
      input: request.training_type ?? null,
      normalized_to: trainingType.trainingType,
      reason:
        trainingType.reason ?? 'Legacy training type was mapped onto the current training_type field.',
      source_ids: ['legacy-api-compat'],
    })
    normalized.training_type = trainingType.trainingType
  }
  if (trainingType.warning) {
    warnings.push(trainingType.warning)
  }

  const legacyEpochs = asPositiveNumber(request.epochs)
  if (!asPositiveNumber(request.num_epochs) && legacyEpochs !== null) {
    normalizations.push({
      rule_id: 'legacy_epochs_alias',
      field: 'num_epochs',
      input: request.epochs,
      normalized_to: legacyEpochs,
      reason: 'Legacy epochs is mapped onto num_epochs.',
      source_ids: ['legacy-api-compat'],
    })
    normalized.num_epochs = legacyEpochs
  }

  const legacyContextLength = asPositiveNumber(request.context_length)
  if (!asPositiveNumber(request.max_seq_length) && legacyContextLength !== null) {
    normalizations.push({
      rule_id: 'legacy_context_length_alias',
      field: 'max_seq_length',
      input: request.context_length,
      normalized_to: legacyContextLength,
      reason: 'Legacy context_length is mapped onto max_seq_length.',
      source_ids: ['legacy-api-compat'],
    })
    normalized.max_seq_length = legacyContextLength
  }

  const legacyGenerations = asPositiveNumber(request.rl_generations_per_prompt)
  if (!asPositiveNumber(request.grpo_num_generations) && legacyGenerations !== null) {
    normalizations.push({
      rule_id: 'legacy_rl_generations_alias',
      field: 'grpo_num_generations',
      input: request.rl_generations_per_prompt,
      normalized_to: legacyGenerations,
      reason: 'Legacy rl_generations_per_prompt is mapped onto grpo_num_generations.',
      source_ids: ['legacy-api-compat'],
    })
    normalized.grpo_num_generations = legacyGenerations
  }

  return {
    request: normalized,
    normalizations,
    warnings,
  }
}
