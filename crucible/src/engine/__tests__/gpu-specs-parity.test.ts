import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GPU_SPECS } from '../gpu-specs'

interface DataGPUSpec {
  id: keyof typeof GPU_SPECS
  vram_gb: number
  tflops: {
    fp32: number | null
    fp16: number | null
    bf16: number | null
    fp8: number | null
  }
}

interface GPUDataFile {
  gpus: DataGPUSpec[]
}

describe('GPU spec parity', () => {
  it('keeps runtime GPU specs aligned with data/gpu-specs.json', () => {
    const raw = readFileSync(new URL('../../../data/gpu-specs.json', import.meta.url), 'utf8')
    const data = JSON.parse(raw) as GPUDataFile

    for (const row of data.gpus) {
      const runtime = GPU_SPECS[row.id]
      expect(runtime, `Missing runtime GPU spec for ${row.id}`).toBeDefined()
      expect(runtime.vram_gb).toBe(row.vram_gb)
      expect(runtime.tflops.fp32 ?? null).toBe(row.tflops.fp32)
      expect(runtime.tflops.fp16 ?? null).toBe(row.tflops.fp16)
      expect(runtime.tflops.bf16 ?? null).toBe(row.tflops.bf16)
      expect(runtime.tflops.fp8 ?? null).toBe(row.tflops.fp8)
    }
  })
})
