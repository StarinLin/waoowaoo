export const GEMINI_SDK_API_MODE = 'gemini-sdk' as const
export const OPENAI_OFFICIAL_API_MODE = 'openai-official' as const
export const OPENAI_RESPONSES_API_MODE = 'openai-responses' as const

export type ProviderApiMode =
  | typeof GEMINI_SDK_API_MODE
  | typeof OPENAI_OFFICIAL_API_MODE
  | typeof OPENAI_RESPONSES_API_MODE

export function isProviderApiMode(value: unknown): value is ProviderApiMode {
  return value === GEMINI_SDK_API_MODE
    || value === OPENAI_OFFICIAL_API_MODE
    || value === OPENAI_RESPONSES_API_MODE
}

export function getDefaultProviderApiMode(providerKey: string): ProviderApiMode | undefined {
  if (providerKey === 'gemini-compatible') return GEMINI_SDK_API_MODE
  if (providerKey === 'openai-compatible') return OPENAI_RESPONSES_API_MODE
  return undefined
}

export function isOpenAIResponsesApiMode(value: ProviderApiMode | undefined): boolean {
  return value === OPENAI_RESPONSES_API_MODE
}
