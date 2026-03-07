import { describe, expect, it, vi } from 'vitest'
import { streamFlow2APIChatCompletion } from '@/lib/flow2api/client'

describe('flow2api client errors', () => {
  it('surfaces DNS failure details when fetch throws', async () => {
    const originalFetch = globalThis.fetch
    const dnsCause = Object.assign(new Error('getaddrinfo ENOTFOUND flow2api-headed'), {
      code: 'ENOTFOUND',
      hostname: 'flow2api-headed',
    })
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('fetch failed', { cause: dnsCause })
    }) as unknown as typeof fetch

    try {
      await expect(streamFlow2APIChatCompletion({
        baseUrl: 'http://flow2api-headed:8000/v1',
        apiKey: 'test',
        model: 'gemini-3.0-pro-image-portrait',
        messages: [{ role: 'user', content: 'ping' }],
      })).rejects.toThrow(/\(ENOTFOUND flow2api-headed getaddrinfo ENOTFOUND flow2api-headed\)/)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('returns url when server responds with flow2api success json', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({
        status: 'success',
        url: 'http://localhost:8000/tmp/a.jpg',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }) as unknown as typeof fetch

    try {
      const content = await streamFlow2APIChatCompletion({
        baseUrl: 'http://flow2api-headed:8000/v1',
        apiKey: 'test',
        model: 'gemini-3.0-pro-image-portrait',
        messages: [{ role: 'user', content: 'ping' }],
      })
      expect(content).toBe('http://localhost:8000/tmp/a.jpg')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('returns url when SSE success payload omits choices delta', async () => {
    const originalFetch = globalThis.fetch
    const streamBody = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder()
        controller.enqueue(encoder.encode('data: {"status":"success","url":"http://localhost:8000/tmp/v.mp4"}\n\n'))
        controller.close()
      },
    })
    globalThis.fetch = vi.fn(async () => {
      return new Response(streamBody, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    }) as unknown as typeof fetch

    try {
      const content = await streamFlow2APIChatCompletion({
        baseUrl: 'http://flow2api-headed:8000/v1',
        apiKey: 'test',
        model: 'veo_3_1_i2v_s_fast_fl_portrait',
        messages: [{ role: 'user', content: 'ping' }],
      })
      expect(content).toBe('http://localhost:8000/tmp/v.mp4')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('throws flow2api error when SSE error payload omits choices delta', async () => {
    const originalFetch = globalThis.fetch
    const streamBody = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder()
        controller.enqueue(encoder.encode('data: {"error":{"message":"provider overloaded"}}\n\n'))
        controller.close()
      },
    })
    globalThis.fetch = vi.fn(async () => {
      return new Response(streamBody, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    }) as unknown as typeof fetch

    try {
      await expect(streamFlow2APIChatCompletion({
        baseUrl: 'http://flow2api-headed:8000/v1',
        apiKey: 'test',
        model: 'veo_3_1_i2v_s_fast_fl_portrait',
        messages: [{ role: 'user', content: 'ping' }],
      })).rejects.toThrow('FLOW2API_ERROR: provider overloaded')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
