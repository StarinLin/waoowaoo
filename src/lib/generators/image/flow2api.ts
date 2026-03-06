import { BaseImageGenerator, type GenerateResult, type ImageGenerateParams } from '../base'
import { getProviderConfig } from '@/lib/api-config'
import { getImageBase64Cached } from '@/lib/image-cache'
import { streamFlow2APIChatCompletion, type Flow2APIChatMessage } from '@/lib/flow2api/client'
import {
  extractFlow2APISuccessUrl,
  extractImageUrlFromFlow2APIContent,
  isLikelyUrl,
  parseJsonIfPossible,
  tryExtractBase64FromImageUrl,
} from '@/lib/flow2api/parse'

function readStringOption(value: unknown, optionName: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') {
    throw new Error(`FLOW2API_IMAGE_OPTION_INVALID: ${optionName}`)
  }
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`FLOW2API_IMAGE_OPTION_INVALID: ${optionName}`)
  }
  return trimmed
}

function normalizeModelId(value: unknown): string | undefined {
  return readStringOption(value, 'modelId')
}

function toAbsoluteUrlIfNeeded(value: string): string {
  if (!value.startsWith('/')) return value
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
  return `${baseUrl}${value}`
}

async function normalizeImageSourceToDataUrl(source: string): Promise<string> {
  const trimmed = source.trim()
  if (!trimmed) {
    throw new Error('FLOW2API_IMAGE_REFERENCE_INVALID: empty')
  }
  if (trimmed.startsWith('data:')) return trimmed
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/')) {
    return await getImageBase64Cached(toAbsoluteUrlIfNeeded(trimmed), { logPrefix: '[Flow2API]' })
  }
  // Assume raw base64
  return `data:image/png;base64,${trimmed}`
}

export class Flow2APIImageGenerator extends BaseImageGenerator {
  private readonly modelId?: string
  private readonly providerId?: string

  constructor(modelId?: string, providerId?: string) {
    super()
    this.modelId = modelId
    this.providerId = providerId
  }

  protected getMaxRetries(): number {
    return 6
  }

  protected async doGenerate(params: ImageGenerateParams): Promise<GenerateResult> {
    const { userId, prompt, referenceImages = [], options = {} } = params
    const providerId =
      readStringOption(options.provider, 'provider')
      || this.providerId
      || 'flow2api'
    const config = await getProviderConfig(userId, providerId)
    if (!config.baseUrl) {
      throw new Error(`PROVIDER_BASE_URL_MISSING: ${config.id}`)
    }

    const model =
      this.modelId
      || normalizeModelId(options.modelId)
    if (!model) {
      throw new Error('FLOW2API_IMAGE_MODEL_MISSING')
    }

    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt) {
      throw new Error('FLOW2API_IMAGE_PROMPT_REQUIRED')
    }

    let messages: Flow2APIChatMessage[]
    if (referenceImages.length > 0) {
      const parts = [
        { type: 'text' as const, text: trimmedPrompt },
        ...await Promise.all(referenceImages.map(async (img) => ({
          type: 'image_url' as const,
          image_url: { url: await normalizeImageSourceToDataUrl(img) },
        }))),
      ]
      messages = [{ role: 'user', content: parts }]
    } else {
      messages = [{ role: 'user', content: trimmedPrompt }]
    }

    const content = await streamFlow2APIChatCompletion({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model,
      messages,
    })

    const imageUrl =
      extractImageUrlFromFlow2APIContent(content)
      || (isLikelyUrl(content) ? content.trim() : null)
      || extractFlow2APISuccessUrl(parseJsonIfPossible(content))
    if (!imageUrl) {
      throw new Error(`FLOW2API_IMAGE_PARSE_FAILED: ${content.slice(0, 200)}`)
    }

    const base64 = tryExtractBase64FromImageUrl(imageUrl)
    return {
      success: true,
      imageUrl,
      ...(base64 ? { imageBase64: base64.base64 } : {}),
    }
  }
}
