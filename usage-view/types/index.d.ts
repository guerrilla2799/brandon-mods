export type UvProfile = { email: string; plan: string; org: string }
export type UvLimit = { kind: string; percentUsed: number; resetsAt?: string }
export type UvUsage = { tokens?: number; window: number; percent?: number; limits: UvLimit[]; usd?: number; at: number }

declare module 'claude-code' {
  interface PluginState {
    'usage-view': { profile: UvProfile | null; usage: UvUsage | null }
  }
}
