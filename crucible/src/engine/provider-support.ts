import { resolveGPUType } from './gpu-specs'
import type { EstimateRequest, ProviderPricing, SupportReason, SupportTier } from '../types/index'

interface ProviderCapabilityRecord {
  provider: string
  family: 'generic_cuda_vm'
  description: string
  verified_on: string
  source_ids: string[]
}

const DEFAULT_SOURCE_IDS = ['unsloth-install', 'unsloth-docker', 'unsloth-requirements']
const PROVIDER_CAPABILITY_VERSION = '2026-03-05'

export const PROVIDER_CAPABILITY_CATALOG: ProviderCapabilityRecord[] = [
  'amaya',
  'aws',
  'azure',
  'boostrun',
  'coreweave',
  'crusoe',
  'cudo',
  'denvr',
  'digitalocean',
  'evergreen',
  'excesssupply',
  'fpt',
  'gcp',
  'horizon',
  'hyperstack',
  'imwt',
  'lambdalabs',
  'latitude',
  'massedcompute',
  'nebius',
  'paperspace',
  'scaleway',
  'verda',
  'voltagepark',
  'vultr',
].map((provider) => ({
  provider,
  family: 'generic_cuda_vm' as const,
  description:
    'Treated as a generic self-managed CUDA VM / container host. Crucible does not claim provider-specific Unsloth certification.',
  verified_on: PROVIDER_CAPABILITY_VERSION,
  source_ids: DEFAULT_SOURCE_IDS,
}))

function normalizeLower(value: string): string {
  return value.trim().toLowerCase()
}

function findCapabilityRecord(provider: string): ProviderCapabilityRecord {
  return (
    PROVIDER_CAPABILITY_CATALOG.find((entry) => normalizeLower(entry.provider) === normalizeLower(provider)) ?? {
      provider,
      family: 'generic_cuda_vm',
      description:
        'Unknown provider treated as a generic self-managed CUDA VM / container host until a provider-specific rule is added.',
      verified_on: PROVIDER_CAPABILITY_VERSION,
      source_ids: DEFAULT_SOURCE_IDS,
    }
  )
}

function addReason(
  reasons: SupportReason[],
  ruleId: string,
  tier: SupportTier,
  reason: string,
  sourceIds: string[],
): void {
  reasons.push({
    rule_id: ruleId,
    tier,
    reason,
    source_ids: sourceIds,
  })
}

function isLikelyCudaRow(row: ProviderPricing): boolean {
  const normalizedGpu = resolveGPUType(String(row.gpu))
  return typeof normalizedGpu === 'string' && normalizedGpu.length > 0
}

export function assessProviderSupport(
  params: EstimateRequest,
  row: ProviderPricing,
): { tier: SupportTier; reasons: SupportReason[]; capability_family: string } {
  const capability = findCapabilityRecord(row.provider)
  const reasons: SupportReason[] = []

  if (params.framework !== 'Unsloth') {
    addReason(
      reasons,
      'framework_outside_unsloth_catalog',
      'custom',
      'Only Unsloth currently has a source-backed compatibility catalog in Crucible. Provider support for other frameworks is custom.',
      [],
    )
    return {
      tier: 'custom',
      reasons,
      capability_family: capability.family,
    }
  }

  if (!isLikelyCudaRow(row)) {
    addReason(
      reasons,
      'provider_non_cuda_unknown',
      'custom',
      'This row does not resolve to a known CUDA-backed GPU profile, so Unsloth support is treated as custom.',
      DEFAULT_SOURCE_IDS,
    )
    return {
      tier: 'custom',
      reasons,
      capability_family: capability.family,
    }
  }

  if (params.num_nodes > 1) {
    addReason(
      reasons,
      'provider_multi_node_custom',
      'custom',
      'Multi-node Unsloth deployments remain custom-pipeline territory in Crucible.',
      ['unsloth-multi-gpu', 'unsloth-ddp'],
    )
    return {
      tier: 'custom',
      reasons,
      capability_family: capability.family,
    }
  }

  if (params.workflow_mode === 'guided') {
    if (row.num_gpus > 1 || params.num_gpus > 1) {
      addReason(
        reasons,
        'guided_multi_gpu_custom',
        'custom',
        'Guided mode does not treat multi-GPU cloud rows as documented or easy-path; these require manual distributed setup.',
        ['unsloth-multi-gpu', 'unsloth-ddp'],
      )
      return {
        tier: 'custom',
        reasons,
        capability_family: capability.family,
      }
    }

    addReason(
      reasons,
      'guided_single_gpu_inferred',
      'inferred',
      `${capability.provider} is treated as a generic CUDA VM host. Single-GPU guided runs are inferred from Unsloth's documented install/Docker requirements, not provider docs.`,
      capability.source_ids,
    )
    return {
      tier: 'inferred',
      reasons,
      capability_family: capability.family,
    }
  }

  addReason(
    reasons,
    'custom_pipeline_cuda_inferred',
    'inferred',
    `${capability.provider} is treated as a generic CUDA VM host for custom pipelines. Support is inferred from environment requirements, not a provider certification list.`,
    capability.source_ids,
  )

  return {
    tier: 'inferred',
    reasons,
    capability_family: capability.family,
  }
}
