import { BaseVideoGenerator, type GenerateResult, type VideoGenerateParams } from '../base'
import { getProviderConfig } from '@/lib/api-config'
import { getImageBase64Cached } from '@/lib/image-cache'
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

function matchesSignature(buffer: Uint8Array, signature: number[], offset = 0): boolean {
  if (buffer.length < offset + signature.length) return false
  for (let index = 0; index < signature.length; index += 1) {
    if (buffer[offset + index] !== signature[index]) return false
  }
  return true
}

function detectImageMimeType(buffer: Buffer): string | null {
  if (matchesSignature(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (matchesSignature(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (matchesSignature(buffer, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61])) return 'image/gif'
  if (matchesSignature(buffer, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) return 'image/gif'
  if (matchesSignature(buffer, [0x52, 0x49, 0x46, 0x46]) && matchesSignature(buffer, [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp'
  }

  const leadingText = buffer.subarray(0, Math.min(buffer.length, 256)).toString('utf8').trimStart()
  if (leadingText.startsWith('<svg') || (leadingText.startsWith('<?xml') && leadingText.includes('<svg'))) {
    return 'image/svg+xml'
  }

  return null
}

function normalizeGenericImageDataUrl(dataUrl: string): string {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(dataUrl.trim())
  if (!match) return dataUrl

  const mimeType = match[1].trim().toLowerCase()
  if (mimeType.startsWith('image/') || mimeType !== 'application/octet-stream') {
    return dataUrl
  }

  const detectedMimeType = detectImageMimeType(Buffer.from(match[2], 'base64'))
  if (!detectedMimeType) return dataUrl
  return `data:${detectedMimeType};base64,${match[2]}`
}

async function normalizeImageUrlToDataUrl(imageUrl: string): Promise<string> {
  const trimmed = imageUrl.trim()
  if (!trimmed) {
    throw new Error('FLOW2API_VIDEO_IMAGE_URL_REQUIRED')
  }
  const dataUrl = trimmed.startsWith('data:')
    ? trimmed
    : await getImageBase64Cached(trimmed, { logPrefix: '[Flow2API Video]' })
  return normalizeGenericImageDataUrl(dataUrl)
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
