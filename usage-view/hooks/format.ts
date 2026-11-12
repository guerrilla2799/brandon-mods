import type { UvLimit, UvProfile } from '../types'

const PLANS: Record<string, string> = {
  claude_max: 'Max', claude_pro: 'Pro', claude_team: 'Team', claude_enterprise: 'Enterprise',
}
const WINDOWS: Record<string, string> = { five_hour: '5-hour', seven_day: 'Weekly', spend_limit: 'Spend' }

// The signed-in account, from the config file Claude Code keeps (.claude.json, oauthAccount).
export function profileFrom(json: string): UvProfile | null {
  const a = (JSON.parse(json) as { oauthAccount?: Record<string, string | undefined> }).oauthAccount
  if (!a?.emailAddress) return null
  const type = a.organizationType ?? ''
  return {
    email: a.emailAddress,
    plan: PLANS[type] ?? (type || a.billingType || 'unknown plan'),
    org: a.organizationName ?? '',
  }
}

export const windowName = (kind: string) => WINDOWS[kind] ?? kind

export function k(tokens: number): string {
  return tokens >= 1000 ? `${Math.round(tokens / 1000)}k` : String(tokens)
}

export function resetIn(resetsAt: string | undefined, now: number): string {
  if (!resetsAt) return ''
  const ms = Date.parse(resetsAt) - now
  if (!(ms > 0)) return 'resetting'
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h >= 24 ? `resets in ${Math.floor(h / 24)}d ${h % 24}h` : `resets in ${h}h ${m}m`
}

export function bar(percent: number, width = 20): string {
  const filled = Math.max(0, Math.min(width, Math.round((percent / 100) * width)))
  // Circles, not shade blocks: the VS Code panel's font draws ░ as hatched boxes.
  return '●'.repeat(filled) + '○'.repeat(width - filled)
}

export function limitLine(l: UvLimit): string {
  return `${windowName(l.kind)} ${Math.round(l.percentUsed)}%`
}
