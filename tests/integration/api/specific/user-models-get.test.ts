import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import {
  installAuthMocks,
  mockAuthenticated,
  mockUnauthenticated,
  resetAuthMockState,
} from '../../../helpers/auth'

type UserPreferenceSnapshot = {
  customProviders: string | null
  customModels: string | null
}

const prismaMock = vi.hoisted(() => ({
  userPreference: {
    findUnique: vi.fn<(...args: unknown[]) => Promise<UserPreferenceSnapshot | null>>(),
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

describe('api specific - user models GET', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    resetAuthMockState()

    prismaMock.userPreference.findUnique.mockResolvedValue({
      customProviders: null,
      customModels: null,
    })
  })

  it('returns unauthorized when user is not authenticated', async () => {
    installAuthMocks()
    mockUnauthenticated()
    const route = await import('@/app/api/user/models/route')
    const req = buildMockRequest({
      path: '/api/user/models',
      method: 'GET',
    })

    const res = await route.GET(req)

    expect(res.status).toBe(401)
  })

  it('returns builtin first-last-frame capabilities for flow2api veo video models', async () => {
    installAuthMocks()
    mockAuthenticated('user-1')
    prismaMock.userPreference.findUnique.mockResolvedValue({
      customProviders: JSON.stringify([
        {
          id: 'flow2api',
          name: 'Flow2API',
          baseUrl: 'http://flow2api.test/v1',
          apiKey: 'flow-key',
        },
      ]),
      customModels: JSON.stringify([
        {
          type: 'video',
          provider: 'flow2api',
          modelId: 'veo_3_1_i2v_s_fast_fl_portrait',
          modelKey: 'flow2api::veo_3_1_i2v_s_fast_fl_portrait',
          name: 'Flow2API Veo FL',
        },
      ]),
    })
    const route = await import('@/app/api/user/models/route')
    const req = buildMockRequest({
      path: '/api/user/models',
      method: 'GET',
    })

    const res = await route.GET(req)
    const body = await res.json() as {
      video: Array<{
        value: string
        capabilities?: {
          video?: {
            firstlastframe?: boolean
            generationModeOptions?: string[]
          }
        }
      }>
    }

    expect(res.status).toBe(200)
    expect(body.video).toHaveLength(1)
    expect(body.video[0]?.value).toBe('flow2api::veo_3_1_i2v_s_fast_fl_portrait')
    expect(body.video[0]?.capabilities?.video?.firstlastframe).toBe(true)
    expect(body.video[0]?.capabilities?.video?.generationModeOptions).toEqual(
      expect.arrayContaining(['normal', 'firstlastframe']),
    )
  })
})
