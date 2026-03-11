import type { QATScheme, QuantizationBits } from '../types'

export type QATTargetBits = 4 | 8

export const ALL_QAT_SCHEMES: QATScheme[] = ['fp8-int4', 'fp8-fp8', 'int8-int4', 'int4']

const TARGET_BITS_BY_QAT_SCHEME: Record<QATScheme, QATTargetBits> = {
  'fp8-int4': 4,
  'fp8-fp8': 8,
  'int8-int4': 4,
  int4: 4,
}

const QAT_SCHEMES_BY_BITS: Record<QATTargetBits, QATScheme[]> = {
  4: ['fp8-int4', 'int8-int4', 'int4'],
  8: ['fp8-fp8'],
}

export function isQATTargetBits(bits: QuantizationBits): bits is QATTargetBits {
  return bits === 4 || bits === 8
}

export function qatSchemesForBits(bits: QuantizationBits): QATScheme[] {
  return isQATTargetBits(bits) ? QAT_SCHEMES_BY_BITS[bits] : []
}

export function defaultQATSchemeForBits(bits: QuantizationBits): QATScheme | null {
  const schemes = qatSchemesForBits(bits)
  return schemes[0] ?? null
}

export function normalizeQATSchemeForBits(
  bits: QuantizationBits,
  scheme: QATScheme,
): QATScheme | null {
  const schemes = qatSchemesForBits(bits)
  if (schemes.length === 0) {
    return null
  }
  return schemes.includes(scheme) ? scheme : schemes[0]
}

export function targetBitsForQATScheme(scheme: QATScheme): QATTargetBits {
  return TARGET_BITS_BY_QAT_SCHEME[scheme]
}
