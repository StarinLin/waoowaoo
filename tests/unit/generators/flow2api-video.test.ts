import { beforeEach, describe, expect, it, vi } from 'vitest'

const getProviderConfigMock = vi.hoisted(() => vi.fn(async () => ({
  id: 'flow2api',
  apiKey: 'flow-key',
  baseUrl: 'https://flow.test/v1',
})))

const getImageBase64CachedMock = vi.hoisted(() => vi.fn(async () => 'data:image/png;base64,QQ=='))
const streamFlow2APIChatCompletionMock = vi.hoisted(() => vi.fn(async () => 'https://flow.test/video.mp4'))

vi.mock('@/lib/api-config', () => ({
  getProviderConfig: getProviderConfigMock,
}))

vi.mock('@/lib/image-cache', () => ({
  getImageBase64Cached: getImageBase64CachedMock,
}))

vi.mock('@/lib/flow2api/client', () => ({
  streamFlow2APIChatCompletion: streamFlow2APIChatCompletionMock,
}))

import { Flow2APIVideoGenerator } from '@/lib/generators/video/flow2api'

describe('Flow2APIVideoGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getProviderConfigMock.mockResolvedValue({
      id: 'flow2api',
      apiKey: 'flow-key',
      baseUrl: 'https://flow.test/v1',
    })
  })

  it('rewrites generic base64 mime types to image mime types before sending Flow2API video requests', async () => {
    const generator = new Flow2APIVideoGenerator('flow2api')

    const result = await generator.generate({
      userId: 'user-1',
      imageUrl: 'data:application/octet-stream;base64,/9j/4A==',
      prompt: 'animate this shot',
      options: {
        modelId: 'veo_3_1_i2v_s_fast_fl',
        lastFrameImageUrl: 'data:application/octet-stream;base64,iVBORw0KGgo=',
      },
    })

    expect(result.success).toBe(true)
    expect(result.videoUrl).toBe('https://flow.test/video.mp4')

    const call = streamFlow2APIChatCompletionMock.mock.calls.at(0)
    expect(call).toBeTruthy()
    if (!call) {
      throw new Error('streamFlow2APIChatCompletion should be called')
    }

    expect(call[0]).toMatchObject({
      baseUrl: 'https://flow.test/v1',
      apiKey: 'flow-key',
      model: 'veo_3_1_i2v_s_fast_fl',
    })

    const message = call[0].messages[0]
    expect(message.role).toBe('user')
    expect(message.content).toEqual([
      { type: 'text', text: 'animate this shot' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,/9j/4A==' } },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } },
    ])
  })
})
