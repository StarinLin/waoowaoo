import {
  extractFlow2APIErrorMessage,
  extractFlow2APISuccessUrl,
  extractOpenAIChatCompletionContent,
} from './parse'

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

type Flow2APISsePushResult = {
  done: boolean
  content?: string
  errorMessage?: string
}

function doneWithLastContent(lastContent: string | null): Flow2APISsePushResult {
  return lastContent ? { done: true, content: lastContent } : { done: true }
}

export class Flow2APISseParser {
  private pending = ''
  private lastContent: string | null = null
  private lastReasoningContent: string | null = null
  private lastErrorMessage: string | null = null

  push(chunkText: string): Flow2APISsePushResult {
    // Normalize CRLF to LF to make event splitting consistent.
    this.pending += chunkText.replace(/\r/g, '')

    return this.processPending(false)
  }

  flush(): Flow2APISsePushResult {
    return this.processPending(true)
  }

  getFinalContent(): string | null {
    return this.lastContent
  }

  getFinalReasoningContent(): string | null {
    return this.lastReasoningContent
  }

  getFinalErrorMessage(): string | null {
    return this.lastErrorMessage
  }

  private processPending(flushRemainder: boolean): Flow2APISsePushResult {
    while (true) {
      const separatorIndex = this.pending.indexOf('\n\n')
      if (separatorIndex === -1) {
        if (!flushRemainder) break
        const block = this.pending.trim()
        this.pending = ''
        if (!block) break
        const result = this.processBlock(block)
        if (result.done) return result
        break
      }

      const block = this.pending.slice(0, separatorIndex)
      this.pending = this.pending.slice(separatorIndex + 2)
      const result = this.processBlock(block)
      if (result.done) return result
    }

    return { done: false }
  }

  private processBlock(block: string): Flow2APISsePushResult {
    const lines = block.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice('data:'.length).trim()
      if (!data) continue
      const result = this.processDataLine(data)
      if (result.done) return result
    }

    return { done: false }
  }

  private processDataLine(data: string): Flow2APISsePushResult {
    if (data === '[DONE]') {
      return doneWithLastContent(this.lastContent)
    }

    const parsed = JSON.parse(data) as unknown

    const successUrl = extractFlow2APISuccessUrl(parsed)
    if (successUrl) {
      this.lastContent = successUrl
      return { done: true, content: successUrl }
    }

    const errorMessage = extractFlow2APIErrorMessage(parsed)
    if (errorMessage) {
      this.lastErrorMessage = errorMessage
      return { done: true, errorMessage }
    }

    const completionContent = extractOpenAIChatCompletionContent(parsed)
    if (completionContent) {
      this.lastContent = completionContent
      return { done: true, content: completionContent }
    }

    const delta = extractStreamDelta(parsed)
    if (!delta) return { done: false }

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
      return doneWithLastContent(this.lastContent)
    }

    return { done: false }
  }
}
