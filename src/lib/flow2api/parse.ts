function parseDataUrl(value: string): { mimeType: string; base64: string } | null {
  const marker = ';base64,'
  const markerIndex = value.indexOf(marker)
  if (!value.startsWith('data:') || markerIndex === -1) return null
  const mimeType = value.slice(5, markerIndex)
  const base64 = value.slice(markerIndex + marker.length)
  if (!mimeType || !base64) return null
  return { mimeType, base64 }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function extractImageUrlFromFlow2APIContent(content: string): string | null {
  // Expected: ![Generated Image](<url>)
  const match = content.match(/!\[[^\]]*]\(([^)\s]+)\)/)
  const url = match?.[1]?.trim()
  return url ? url : null
}

export function extractVideoUrlFromFlow2APIContent(content: string): string | null {
  // Stream mode returns: <video src='...'></video> (possibly wrapped in code fences)
  const match = content.match(/<video[^>]*\ssrc=['"]([^'"]+)['"][^>]*>/i)
  const url = match?.[1]?.trim()
  return url ? url : null
}

export function tryExtractBase64FromImageUrl(url: string): { mimeType: string; base64: string } | null {
  return parseDataUrl(url)
}

export function isLikelyUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  return trimmed.startsWith('http://')
    || trimmed.startsWith('https://')
    || trimmed.startsWith('data:')
}

export function parseJsonIfPossible(text: string): unknown | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null
  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return null
  }
}

export function extractFlow2APIErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) return null
  const error = payload.error
  if (isRecord(error)) {
    const message = readTrimmedString(error.message)
    if (message) return message
  }
  const detail = readTrimmedString(payload.detail)
  if (detail) return detail
  return null
}

export function extractFlow2APISuccessUrl(payload: unknown): string | null {
  if (!isRecord(payload)) return null
  const status = readTrimmedString(payload.status)
  const url = readTrimmedString(payload.url)
  if (status === 'success' && url) return url
  return null
}

export function extractOpenAIChatCompletionContent(payload: unknown): string | null {
  if (!isRecord(payload)) return null
  const choices = payload.choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  const first = choices[0]
  if (!isRecord(first)) return null
  const message = first.message
  if (!isRecord(message)) return null
  const content = readTrimmedString(message.content)
  return content || null
}
