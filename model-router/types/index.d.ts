export type ModelTier = 'haiku' | 'sonnet' | 'opus' | 'fable'

declare module 'claude-code' {
  interface PluginState {
    'model-router': {
      pin: ModelTier | null
      active: ModelTier | null
      once: ModelTier | null
      why: string
      fableOk: boolean
      forces: { text: string; tier: ModelTier }[]
    }
  }
}
