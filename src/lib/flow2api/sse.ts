function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function extractStreamDelta(payload: unknown): { content: string | null; reasoningContent: string | null; finishReason: string | null } | null {
  if (!isRecord(payload)) return null
  const rawChoices = payload.choices
  if (!Array.isArray(rawChoices) || rawChoices.length === 0) return null
  const first = rawChoices[0]
  if (!isRecord(first)) return null
  const rawDelta = first.delta
  const delta = isRecord(rawDelta) ? rawDelta : null

  const content = delta ? readString(delta.content) : null
  const reasoningContent = delta ? readString(delta.reasoning_content) : null
  const finishReasonRaw = first.finish_reason
  const finishReason =
    finishReasonRaw === null
      ? null
      : readString(finishReasonRaw)
  return { content, reasoningContent, finishReason }
}

export class Flow2APISseParser {
  private pending = ''
  private lastContent: string | null = null
  private lastReasoningContent: string | null = null

  push(chunkText: string): { done: boolean; content?: string } {
    // Normalize CRLF to LF to make event splitting consistent.
    this.pending += chunkText.replace(/\r/g, '')

    while (true) {
      const separatorIndex = this.pending.indexOf('\n\n')
      if (separatorIndex === -1) break

      const block = this.pending.slice(0, separatorIndex)
      this.pending = this.pending.slice(separatorIndex + 2)

      const lines = block.split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const data = trimmed.slice('data:'.length).trim()
        if (!data) continue
        if (data === '[DONE]') {
          return this.lastContent ? { done: true, content: this.lastContent } : { done: true }
        }

        const parsed = JSON.parse(data) as unknown
        const delta = extractStreamDelta(parsed)
        if (!delta) continue

        if (typeof delta.reasoningContent === 'string' && delta.reasoningContent.trim().length > 0) {
          this.lastReasoningContent = delta.reasoningContent
        }

        const contentCandidate =
          typeof delta.content === 'string' && delta.content.trim().length > 0
            ? delta.content
            : (typeof delta.reasoningContent === 'string' && delta.reasoningContent.trim().length > 0
              ? delta.reasoningContent
              : null)
        if (contentCandidate) {
          this.lastContent = contentCandidate
        }

        if (delta.finishReason === 'stop') {
          return this.lastContent ? { done: true, content: this.lastContent } : { done: true }
        }
      }
    }

    return { done: false }
  }

  getFinalContent(): string | null {
    return this.lastContent
  }

  getFinalReasoningContent(): string | null {
    return this.lastReasoningContent
  }
}
