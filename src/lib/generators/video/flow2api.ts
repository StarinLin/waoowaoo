import { BaseVideoGenerator, type GenerateResult, type VideoGenerateParams } from '../base'
import { getProviderConfig } from '@/lib/api-config'
import { imageUrlToBase64 } from '@/lib/cos'
import { streamFlow2APIChatCompletion, type Flow2APIChatMessage } from '@/lib/flow2api/client'
import {
  extractFlow2APISuccessUrl,
  extractVideoUrlFromFlow2APIContent,
  isLikelyUrl,
  parseJsonIfPossible,
} from '@/lib/flow2api/parse'

function readStringOption(value: unknown, optionName: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') {
    throw new Error(`FLOW2API_VIDEO_OPTION_INVALID: ${optionName}`)
  }
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`FLOW2API_VIDEO_OPTION_INVALID: ${optionName}`)
  }
  return trimmed
}

function normalizeModelId(value: unknown): string | undefined {
  return readStringOption(value, 'modelId')
}

async function normalizeImageUrlToDataUrl(imageUrl: string): Promise<string> {
  const trimmed = imageUrl.trim()
  if (!trimmed) {
    throw new Error('FLOW2API_VIDEO_IMAGE_URL_REQUIRED')
  }
  return trimmed.startsWith('data:') ? trimmed : await imageUrlToBase64(trimmed)
}

export class Flow2APIVideoGenerator extends BaseVideoGenerator {
  private readonly providerId?: string

  constructor(providerId?: string) {
    super()
    this.providerId = providerId
  }

  protected getMaxRetries(): number {
    return 6
  }

  protected async doGenerate(params: VideoGenerateParams): Promise<GenerateResult> {
    const { userId, imageUrl, prompt = '', options = {} } = params
    const providerId =
      readStringOption(options.provider, 'provider')
      || this.providerId
      || 'flow2api'
    const config = await getProviderConfig(userId, providerId)
    if (!config.baseUrl) {
      throw new Error(`PROVIDER_BASE_URL_MISSING: ${config.id}`)
    }

    const model = normalizeModelId(options.modelId)
    if (!model) {
      throw new Error('FLOW2API_VIDEO_MODEL_MISSING')
    }
    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt) {
      throw new Error('FLOW2API_VIDEO_PROMPT_REQUIRED')
    }

    const lastFrameImageUrl = readStringOption(options.lastFrameImageUrl, 'lastFrameImageUrl')
    const dataUrls: string[] = []
    if (imageUrl && imageUrl.trim().length > 0) {
      dataUrls.push(await normalizeImageUrlToDataUrl(imageUrl))
    }
    if (lastFrameImageUrl) {
      dataUrls.push(await normalizeImageUrlToDataUrl(lastFrameImageUrl))
    }

    const messages: Flow2APIChatMessage[] = [
      {
        role: 'user',
        content: dataUrls.length > 0
          ? [
            { type: 'text', text: trimmedPrompt },
            ...dataUrls.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
          ]
          : trimmedPrompt,
      },
    ]

    const content = await streamFlow2APIChatCompletion({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model,
      messages,
    })

    const videoUrl =
      extractVideoUrlFromFlow2APIContent(content)
      || (isLikelyUrl(content) ? content.trim() : null)
      || extractFlow2APISuccessUrl(parseJsonIfPossible(content))
    if (!videoUrl) {
      throw new Error(`FLOW2API_VIDEO_PARSE_FAILED: ${content.slice(0, 200)}`)
    }

    return {
      success: true,
      videoUrl,
    }
  }
}
