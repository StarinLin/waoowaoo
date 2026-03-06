import { describe, expect, it } from 'vitest'
import { BaseImageGenerator, type GenerateResult, type ImageGenerateParams } from '@/lib/generators/base'

class FlakyImageGenerator extends BaseImageGenerator {
  private attemptCount = 0
  private readonly failUntil: number
  private readonly maxRetries: number

  constructor(input: { failUntil: number; maxRetries: number }) {
    super()
    this.failUntil = input.failUntil
    this.maxRetries = input.maxRetries
  }

  protected getMaxRetries(): number {
    return this.maxRetries
  }

  protected getRetryDelayMs(): number {
    return 0
  }

  protected async doGenerate(_params: ImageGenerateParams): Promise<GenerateResult> {
    this.attemptCount += 1
    if (this.attemptCount <= this.failUntil) {
      throw new Error(`fail-${this.attemptCount}`)
    }
    return { success: true, imageUrl: 'http://example.local/image.png' }
  }
}

describe('BaseImageGenerator retry policy', () => {
  it('retries up to getMaxRetries and returns success when a later attempt succeeds', async () => {
    const generator = new FlakyImageGenerator({ failUntil: 3, maxRetries: 4 })
    const result = await generator.generate({ userId: 'u', prompt: 'p' })
    expect(result.success).toBe(true)
    expect(result.imageUrl).toBe('http://example.local/image.png')
  })

  it('returns failure when all attempts throw', async () => {
    const generator = new FlakyImageGenerator({ failUntil: 3, maxRetries: 3 })
    const result = await generator.generate({ userId: 'u', prompt: 'p' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('fail-3')
  })
})

