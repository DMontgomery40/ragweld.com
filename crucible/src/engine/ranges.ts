import type { Range3, SupportTier } from '../types/index'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function buildRangeFromTypical(
  typical: number,
  options: { optimisticSpread: number; conservativeSpread: number },
): Range3 {
  const optimisticSpread = clamp(options.optimisticSpread, 0, 0.8)
  const conservativeSpread = clamp(options.conservativeSpread, 0, 2)
  return {
    optimistic: typical * (1 - optimisticSpread),
    typical,
    conservative: typical * (1 + conservativeSpread),
  }
}

export function multiplyRanges(left: Range3, right: Range3): Range3 {
  return {
    optimistic: left.optimistic * right.optimistic,
    typical: left.typical * right.typical,
    conservative: left.conservative * right.conservative,
  }
}

export function rangeFromTriplet(optimistic: number, typical: number, conservative: number): Range3 {
  return {
    optimistic,
    typical,
    conservative,
  }
}

export function rangeTypical(range: Range3): number {
  return range.typical
}

export function deriveSupportUncertaintyTier(tier: SupportTier): number {
  if (tier === 'documented') {
    return 0
  }
  if (tier === 'inferred') {
    return 0.1
  }
  return 0.2
}

export function roundRange(range: Range3, digits = 4): Range3 {
  const precision = 10 ** digits
  return {
    optimistic: Math.round(range.optimistic * precision) / precision,
    typical: Math.round(range.typical * precision) / precision,
    conservative: Math.round(range.conservative * precision) / precision,
  }
}
