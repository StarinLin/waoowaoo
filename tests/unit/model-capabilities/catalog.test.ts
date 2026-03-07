import { beforeEach, describe, expect, it } from 'vitest'
import {
  findBuiltinCapabilities,
  resetBuiltinCapabilityCatalogCacheForTest,
} from '@/lib/model-capabilities/catalog'

describe('model-capabilities/catalog', () => {
  beforeEach(() => {
    resetBuiltinCapabilityCatalogCacheForTest()
  })

  it('maps flow2api veo fast first-last-frame model to builtin google video capabilities', () => {
    const capabilities = findBuiltinCapabilities('video', 'flow2api', 'veo_3_1_i2v_s_fast_fl_portrait')

    expect(capabilities?.video?.firstlastframe).toBe(true)
    expect(capabilities?.video?.generationModeOptions).toEqual(
      expect.arrayContaining(['normal', 'firstlastframe']),
    )
  })

  it('maps flow2api shared canonical model ids by unique builtin video modelId', () => {
    const capabilities = findBuiltinCapabilities('video', 'flow2api', 'viduq3-pro')

    expect(capabilities?.video?.firstlastframe).toBe(true)
    expect(capabilities?.video?.supportGenerateAudio).toBe(true)
  })
})
