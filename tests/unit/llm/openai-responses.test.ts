import { describe, expect, it } from 'vitest'
import type { Response } from 'openai/resources/responses/responses'
import {
  buildOpenAIResponsesChatCompletion,
  buildOpenAIResponsesRequest,
  extractOpenAIResponsesParts,
} from '@/lib/llm/providers/openai-responses'
import { getCompletionParts } from '@/lib/llm/completion-parts'
import { extractStreamDeltaParts } from '@/lib/llm/utils'

describe('llm/openai-responses', () => {
  it('[system + conversation] -> builds Responses API payload with instructions and input items', () => {
    const request = buildOpenAIResponsesRequest(
      'gpt-5.2',
      [
        { role: 'system', content: 'You are concise.' },
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
      ],
      { reasoning: true, reasoningEffort: 'medium' },
    )

    expect(request.instructions).toBe('You are concise.')
    expect(request.reasoning).toEqual({ effort: 'medium' })
    expect(request.input).toEqual([
      {
        role: 'user',
        content: [{ type: 'input_text', text: 'hello' }],
      },
      {
        role: 'assistant',
        content: [{ type: 'input_text', text: 'hi' }],
      },
    ])
  })

  it('[reasoning disabled] -> uses minimal reasoning and keeps temperature', () => {
    const request = buildOpenAIResponsesRequest(
      'gpt-5.2',
      [{ role: 'user', content: 'hello' }],
      { reasoning: false, temperature: 0.2 },
    )

    expect(request.reasoning).toEqual({ effort: 'minimal' })
    expect(request.temperature).toBe(0.2)
  })

  it('[final response] -> extracts output text, reasoning, and usage', () => {
    const response = {
      output_text: 'Final answer',
      output: [
        {
          id: 'rs_1',
          type: 'reasoning',
          summary: [{ type: 'summary_text', text: 'Reasoning summary' }],
        },
      ],
      usage: {
        input_tokens: 11,
        output_tokens: 7,
      },
    } as unknown as Response

    const parts = extractOpenAIResponsesParts(response)

    expect(parts).toEqual({
      text: 'Final answer',
      reasoning: 'Reasoning summary',
      usage: {
        promptTokens: 11,
        completionTokens: 7,
      },
    })
  })

  it('[response output items] -> extracts text from message content when output_text is empty', () => {
    const response = {
      output_text: '',
      output: [
        {
          id: 'msg_1',
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: 'Final via output items', annotations: [] }],
        },
        {
          id: 'rs_1',
          type: 'reasoning',
          summary: [{ type: 'summary_text', text: 'Reasoning summary' }],
        },
      ],
      usage: {
        input_tokens: 5,
        output_tokens: 3,
      },
    } as unknown as Response

    const parts = extractOpenAIResponsesParts(response)

    expect(parts).toEqual({
      text: 'Final via output items',
      reasoning: 'Reasoning summary',
      usage: {
        promptTokens: 5,
        completionTokens: 3,
      },
    })
  })

  it('[streamed fallback] -> keeps streamed text when final response text fields are empty', () => {
    const response = {
      output_text: '',
      output: [],
      usage: {
        input_tokens: 9,
        output_tokens: 4,
      },
    } as unknown as Response

    const completion = buildOpenAIResponsesChatCompletion(
      'gpt-5.2',
      response,
      { text: 'Streamed final text', reasoning: 'Streamed reasoning' },
    )

    expect(getCompletionParts(completion)).toEqual({
      text: 'Streamed final text',
      reasoning: 'Streamed reasoning',
    })
  })

  it('[responses stream events] -> extracts text and reasoning deltas', () => {
    expect(extractStreamDeltaParts({
      type: 'response.output_text.delta',
      delta: 'Hello',
    })).toEqual({ textDelta: 'Hello', reasoningDelta: '' })

    expect(extractStreamDeltaParts({
      type: 'response.reasoning_text.delta',
      delta: 'Thinking',
    })).toEqual({ textDelta: '', reasoningDelta: 'Thinking' })
  })
})
