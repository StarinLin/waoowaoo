import { describe, expect, it } from 'vitest'
import { getAddableModelTypesForProvider, getVisibleModelTypesForProvider } from '@/app/[locale]/profile/components/api-config/provider-card/ProviderAdvancedFields'
import type { CustomModel } from '@/app/[locale]/profile/components/api-config/types'

describe('provider advanced fields visible model types', () => {
  it('shows all Flow2API tabs even when only image models exist', () => {
    const groupedModels: Partial<Record<'llm' | 'image' | 'video' | 'audio', CustomModel[]>> = {
      image: [{
        modelId: 'gemini-3.1-flash-image-landscape',
        modelKey: 'flow2api::gemini-3.1-flash-image-landscape',
        name: 'Flow2API Image',
        type: 'image',
        provider: 'flow2api',
        price: 0,
        enabled: true,
      }],
    }

    expect(getAddableModelTypesForProvider('flow2api')).toEqual(['llm', 'image', 'video'])
    expect(getVisibleModelTypesForProvider('flow2api', groupedModels)).toEqual(['llm', 'image', 'video'])
  })
})

