import type OpenAI from 'openai'
import type {
  EasyInputMessage,
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseOutputItem,
} from 'openai/resources/responses/responses'
import type { ChatCompletionOptions, ChatMessage } from '../types'
import { buildReasoningAwareContent, getConversationMessages, getSystemPrompt } from '../utils'
import { buildOpenAIChatCompletion } from './openai-compat'

export interface OpenAIResponsesParts {
  text: string
  reasoning: string
  usage: {
    promptTokens: number
    completionTokens: number
  }
}

interface OpenAIResponsesFallbackParts {
  text?: string
  reasoning?: string
}

function joinTextSegments(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join('\n')
}

function toInputMessage(message: ChatMessage): EasyInputMessage {
  return {
    role: message.role,
    content: [{ type: 'input_text', text: message.content }],
  }
}

function getResponseOutputItems(response: Response): ResponseOutputItem[] {
  return Array.isArray(response.output) ? response.output : []
}

function extractOutputText(output: ResponseOutputItem[]): string {
  const textParts: string[] = []

  for (const item of output) {
    if (item.type !== 'message') continue

    const contentParts = Array.isArray(item.content)
      ? item.content
        .filter((part) => part.type === 'output_text')
        .map((part) => part.text)
      : []
    if (contentParts.length > 0) {
      textParts.push(joinTextSegments(contentParts))
    }
  }

  return joinTextSegments(textParts)
}

function extractReasoningText(output: ResponseOutputItem[]): string {
  const reasoningParts: string[] = []

  for (const item of output) {
    if (item.type !== 'reasoning') continue

    const reasoningContent = Array.isArray(item.content)
      ? item.content
        .filter((part) => part.type === 'reasoning_text')
        .map((part) => part.text)
      : []
    const reasoningSummary = Array.isArray(item.summary)
      ? item.summary
        .filter((part) => part.type === 'summary_text')
        .map((part) => part.text)
      : []
    const preferredParts = reasoningContent.length > 0 ? reasoningContent : reasoningSummary
    if (preferredParts.length > 0) {
      reasoningParts.push(joinTextSegments(preferredParts))
    }
  }

  return joinTextSegments(reasoningParts)
}

export function buildOpenAIResponsesRequest(
  modelId: string,
  messages: ChatMessage[],
  options: ChatCompletionOptions = {},
): Omit<ResponseCreateParamsNonStreaming, 'stream'> {
  const useReasoning = options.reasoning ?? true
  const systemPrompt = getSystemPrompt(messages)
  const conversationMessages = getConversationMessages(messages)
  const inputMessages = conversationMessages.map(toInputMessage)

  return {
    model: modelId,
    ...(systemPrompt ? { instructions: systemPrompt } : {}),
    ...(inputMessages.length > 0 ? { input: inputMessages } : {}),
    ...(useReasoning
      ? { reasoning: { effort: options.reasoningEffort || 'high' } }
      : {
        reasoning: { effort: 'minimal' },
        temperature: options.temperature ?? 0.7,
      }),
  }
}

export function extractOpenAIResponsesParts(
  response: Response,
  fallback: OpenAIResponsesFallbackParts = {},
): OpenAIResponsesParts {
  const output = getResponseOutputItems(response)
  const text = response.output_text || extractOutputText(output) || fallback.text || ''
  const reasoning = extractReasoningText(output) || fallback.reasoning || ''

  return {
    text,
    reasoning,
    usage: {
      promptTokens: response.usage?.input_tokens ?? 0,
      completionTokens: response.usage?.output_tokens ?? 0,
    },
  }
}

export function buildOpenAIResponsesChatCompletion(
  modelId: string,
  response: Response,
  fallback: OpenAIResponsesFallbackParts = {},
): OpenAI.Chat.Completions.ChatCompletion {
  const parts = extractOpenAIResponsesParts(response, fallback)
  return buildOpenAIChatCompletion(
    modelId,
    buildReasoningAwareContent(parts.text, parts.reasoning),
    parts.usage,
  )
}
