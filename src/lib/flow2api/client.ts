import { Flow2APISseParser } from './sse'
import {
  extractFlow2APIErrorMessage,
  extractFlow2APISuccessUrl,
  extractOpenAIChatCompletionContent,
  parseJsonIfPossible,
} from './parse'

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function joinUrl(baseUrl: string, pathname: string): string {
  const trimmedBase = baseUrl.replace(/\/+$/, '')
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`
  return `${trimmedBase}${normalizedPath}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function extractErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) return null
  const error = payload.error
  if (!isRecord(error)) return null
  const message = error.message
  return typeof message === 'string' ? message : null
}

type Flow2APIMessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export type Flow2APIChatMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string | Flow2APIMessageContentPart[]
}

export async function streamFlow2APIChatCompletion(input: {
  baseUrl: string
  apiKey: string
  model: string
  messages: Flow2APIChatMessage[]
  signal?: AbortSignal
}): Promise<string> {
  const baseUrl = readTrimmedString(input.baseUrl)
  const apiKey = readTrimmedString(input.apiKey)
  const model = readTrimmedString(input.model)
  if (!baseUrl) throw new Error('FLOW2API_BASE_URL_MISSING')
  if (!apiKey) throw new Error('FLOW2API_API_KEY_MISSING')
  if (!model) throw new Error('FLOW2API_MODEL_MISSING')

  const url = joinUrl(baseUrl, '/chat/completions')
  const payload = {
    model,
    messages: input.messages,
    stream: true,
  }

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: input.signal,
    })
  } catch (error: unknown) {
    const cause = (error && typeof error === 'object' && 'cause' in error)
      ? (error as { cause?: unknown }).cause
      : undefined
    const causeRecord = (cause && typeof cause === 'object') ? (cause as Record<string, unknown>) : null
    const code = causeRecord && typeof causeRecord.code === 'string' ? causeRecord.code : null
    const hostname = causeRecord && typeof causeRecord.hostname === 'string' ? causeRecord.hostname : null
    const message = cause instanceof Error ? cause.message : (error instanceof Error ? error.message : String(error))
    const suffix = [
      code ? code : null,
      hostname ? hostname : null,
      message ? message : null,
    ].filter((item): item is string => typeof item === 'string' && item.trim().length > 0).join(' ')
    throw new Error(`FLOW2API_FETCH_FAILED: ${url}${suffix ? ` (${suffix})` : ''}`)
  }

  const contentType = response.headers.get('content-type') || ''
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`FLOW2API_HTTP_ERROR: ${response.status} ${text.slice(0, 200)}`)
  }

  if (!contentType.toLowerCase().includes('text/event-stream')) {
    const text = await response.text()
    const parsed = parseJsonIfPossible(text)
    const errorMessage = extractFlow2APIErrorMessage(parsed) || extractErrorMessage(parsed)
    if (errorMessage) {
      throw new Error(`FLOW2API_ERROR: ${errorMessage}`)
    }

    const openAiContent = extractOpenAIChatCompletionContent(parsed)
    if (openAiContent) return openAiContent

    const successUrl = extractFlow2APISuccessUrl(parsed)
    if (successUrl) return successUrl

    throw new Error(`FLOW2API_UNEXPECTED_RESPONSE: ${text.slice(0, 200)}`)
  }

  if (!response.body) {
    throw new Error('FLOW2API_STREAM_BODY_MISSING')
  }

  const parser = new Flow2APISseParser()
  const decoder = new TextDecoder()
  const reader = response.body.getReader()
  let transcriptTail = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    if (!value) continue
    const chunkText = decoder.decode(value, { stream: true })
    if (chunkText) {
      transcriptTail = `${transcriptTail}${chunkText}`.slice(-16_384)
    }
    const result = parser.push(chunkText)
    if (result.done) {
      if (result.errorMessage) {
        throw new Error(`FLOW2API_ERROR: ${result.errorMessage}`)
      }
      const content = result.content || parser.getFinalContent()
      if (!content) break
      return content
    }
  }

  const flushResult = parser.flush()
  if (flushResult.done) {
    if (flushResult.errorMessage) {
      throw new Error(`FLOW2API_ERROR: ${flushResult.errorMessage}`)
    }
    const content = flushResult.content || parser.getFinalContent()
    if (content) return content
  }

  const finalContent = parser.getFinalContent()
  if (!finalContent) {
    const finalErrorMessage = parser.getFinalErrorMessage()
    if (finalErrorMessage) {
      throw new Error(`FLOW2API_ERROR: ${finalErrorMessage}`)
    }

    const tailParsed = parseJsonIfPossible(transcriptTail)
    const streamErrorMessage = extractFlow2APIErrorMessage(tailParsed) || extractErrorMessage(tailParsed)
    if (streamErrorMessage) {
      throw new Error(`FLOW2API_ERROR: ${streamErrorMessage}`)
    }
    const successUrl = extractFlow2APISuccessUrl(tailParsed)
    if (successUrl) return successUrl

    const openAiContent = extractOpenAIChatCompletionContent(tailParsed)
    if (openAiContent) return openAiContent

    const lastReasoning = parser.getFinalReasoningContent()
    if (lastReasoning && lastReasoning.trim().length > 0) {
      throw new Error(`FLOW2API_STREAM_EMPTY: ${lastReasoning.slice(0, 200)}`)
    }

    throw new Error('FLOW2API_STREAM_EMPTY')
  }
  return finalContent
}
