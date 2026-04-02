export const STYLE_PRESETS = [
  {
    value: 'horror-suspense',
    label: '恐怖悬疑',
    description: '压迫氛围',
  },
] as const

export type StylePresetOption = (typeof STYLE_PRESETS)[number]
export type StylePresetValue = StylePresetOption['value']

export const DEFAULT_STYLE_PRESET_VALUE: StylePresetValue = 'horror-suspense'

export function getStylePresetOption(value: string): StylePresetOption {
  return STYLE_PRESETS.find((preset) => preset.value === value) ?? STYLE_PRESETS[0]
}
