import type { GPUType, Precision } from '../types/index'

export interface GPUSpec {
  vram_gb: number
  tflops: Partial<Record<Precision, number>>
}

// Hardware table used by estimator math.
// TFLOPS values are theoretical upper bounds and are later discounted by MFU/speed factors.
export const GPU_SPECS: Record<GPUType, GPUSpec> = {
  H100: {
    vram_gb: 80,
    tflops: { bf16: 989, fp16: 989, fp8: 1979, fp32: 67 },
  },
  H200: {
    vram_gb: 141,
    tflops: { bf16: 989, fp16: 989, fp8: 1979, fp32: 67 },
  },
  A100_80G: {
    vram_gb: 80,
    tflops: { bf16: 312, fp16: 312, fp32: 19.5 },
  },
  A100: {
    vram_gb: 40,
    tflops: { bf16: 312, fp16: 312, fp32: 19.5 },
  },
  L40S: {
    vram_gb: 48,
    tflops: { bf16: 362, fp16: 362, fp8: 733, fp32: 91.6 },
  },
  L40: {
    vram_gb: 48,
    tflops: { bf16: 181, fp16: 181, fp8: 362, fp32: 90.5 },
  },
  A6000: {
    vram_gb: 48,
    tflops: { bf16: 155, fp16: 155, fp32: 38.7 },
  },
  RTX_4090: {
    vram_gb: 24,
    tflops: { bf16: 330, fp16: 330, fp32: 82.6 },
  },
  RTX_3090: {
    vram_gb: 24,
    tflops: { bf16: 142, fp16: 142, fp32: 35.6 },
  },
  RTX_5090: {
    vram_gb: 32,
    tflops: { bf16: 419, fp16: 419, fp32: 105 },
  },
  B200: {
    vram_gb: 192,
    tflops: { bf16: 2250, fp16: 2250, fp8: 4500, fp32: 90 },
  },
}

// Provider catalogs use inconsistent naming; aliases map those names onto canonical GPUType keys.
const GPU_ALIASES: Record<string, GPUType> = {
  H100: 'H100',
  H200: 'H200',
  A100_80G: 'A100_80G',
  A100_80GB: 'A100_80G',
  A100: 'A100',
  L40S: 'L40S',
  L40: 'L40',
  A6000: 'A6000',
  RTX_4090: 'RTX_4090',
  RTX4090: 'RTX_4090',
  RTX_3090: 'RTX_3090',
  RTX3090: 'RTX_3090',
  RTX_5090: 'RTX_5090',
  RTX5090: 'RTX_5090',
  B200: 'B200',
}

function normalizeGPUName(gpu: string): string {
  return gpu.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_')
}

export function resolveGPUType(gpu: GPUType | string): GPUType | undefined {
  if (gpu in GPU_SPECS) {
    return gpu as GPUType
  }
  const normalized = normalizeGPUName(gpu)
  return GPU_ALIASES[normalized]
}

export function getGPUSpec(gpu: GPUType | string): GPUSpec | undefined {
  const resolved = resolveGPUType(gpu)
  if (!resolved) {
    return undefined
  }
  return GPU_SPECS[resolved]
}

export function getGPUVRAMGB(gpu: GPUType | string): number | undefined {
  return getGPUSpec(gpu)?.vram_gb
}

export function getGPUTFlops(gpu: GPUType | string, precision: Precision): number | undefined {
  const spec = getGPUSpec(gpu)
  if (!spec) {
    return undefined
  }

  const byPrecision = spec.tflops[precision]
  if (byPrecision) {
    return byPrecision
  }

  // bf16 frequently piggybacks fp16 tensor-core throughput on many SKUs.
  if (precision === 'bf16' && spec.tflops.fp16) {
    return spec.tflops.fp16
  }

  // Do not synthesize fp8 throughput from lower precisions. If fp8 is missing, treat as unsupported.
  if (precision === 'fp8') {
    return undefined
  }

  if (spec.tflops.fp16) {
    return spec.tflops.fp16
  }

  return spec.tflops.fp32
}
