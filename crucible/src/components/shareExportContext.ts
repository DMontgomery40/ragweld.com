import { serializeEstimateRequestQuery } from '../hooks/useURLState'
import type { EstimateRequest, EstimateResponse } from '../types'

export interface ShareExportContext {
  activeEstimate: EstimateResponse | null
  effectiveRequest: EstimateRequest
  shareQueryString: string
}

export function resolveShareExportContext(input: {
  request: EstimateRequest
  estimate: EstimateResponse | null
  estimateIsCurrent: boolean
  queryString: string
}): ShareExportContext {
  if (input.estimate && input.estimateIsCurrent) {
    const effectiveRequest = input.estimate.effective_request ?? input.request
    return {
      activeEstimate: input.estimate,
      effectiveRequest,
      shareQueryString: serializeEstimateRequestQuery(effectiveRequest),
    }
  }

  return {
    activeEstimate: null,
    effectiveRequest: input.request,
    shareQueryString: input.queryString,
  }
}
