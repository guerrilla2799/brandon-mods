export type Active = { name: string; how: 'folder' | 'first-touch' | 'pinned' }

declare module 'claude-code' {
  interface PluginState {
    'client-status-line': {
      active: Active | null
      strays: string[]
    }
  }
}
