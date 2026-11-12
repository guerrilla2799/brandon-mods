import type { ModelTier } from '../types'

export const TIERS: readonly ModelTier[] = ['haiku', 'sonnet', 'opus', 'fable']
export const RANK: Record<ModelTier, number> = { haiku: 0, sonnet: 1, opus: 2, fable: 3 }
export const LABEL: Record<ModelTier, string> = { haiku: 'Haiku', sonnet: 'Sonnet', opus: 'Opus', fable: 'Fable' }

// Past this many messages the cache is worth more than a cheaper model: never switch down.
export const LONG_SESSION = 60
// Past this many context tokens a smaller model may not hold the conversation: never switch down.
export const BIG_CONTEXT = 150_000

// Turns the person did not type (a background task's notice, a channel message) keep the model.
const MACHINE = /^\s*<(task-notification|system-reminder|channel|scheduled|local-command)/i
export const isMachine = (text: string) => MACHINE.test(text)

export type Pick = { tier: ModelTier; isStrong: boolean; why: string }

// Ordered: the first rule that matches wins. Strong rules may move a sticky session; weak ones only pick the first model.
const RULES: { tier: ModelTier; isStrong: boolean; why: string; test: RegExp }[] = [
  { tier: 'fable', isStrong: true, why: 'positioning / narrative / one-way-door strategy',
    test: /\b(positioning|master narrative|category design|board deck|fundrais\w*|one-way door|pricing strategy|gtm strategy|messaging framework)\b/i },
  { tier: 'opus', isStrong: true, why: 'drafting buyer-facing prose',
    test: /\b(draft|write|rewrite|ghostwrite)\b.*\b(post|newsletter|issue|email|sow|deck|one-pager|copy|landing page|case study|caption|hook)s?\b/i },
  { tier: 'opus', isStrong: true, why: 'eval, debugging or building',
    test: /\b(evaluate|eval loop|debug|root cause|build (a|the|me)|create (a|the) (mod|skill|plugin|workflow|script)|architect\w*|refactor|plan (the|a|my)|diagnos\w*|audit)\b/i },
  { tier: 'sonnet', isStrong: true, why: 'summary, edit or research',
    test: /\b(summari[sz]e|explain|research|compare|analy[sz]e|update|edit|review|outline|find|search)\b/i },
  { tier: 'haiku', isStrong: true, why: 'lookup or mechanical change',
    test: /^(what('s| is) the (path|url|link|date)|where is|list|show me|rename|move|copy|format|convert|fix (the )?typo|git (status|log|diff)|commit|ls|open)\b/i },
]

const FORCE = /^\s*!(haiku|sonnet|opus|fable)\b\s*/i

export function forced(text: string): { tier: ModelTier; rest: string } | null {
  const m = FORCE.exec(text)
  if (!m) return null
  return { tier: (m[1] ?? 'sonnet').toLowerCase() as ModelTier, rest: text.slice(m[0].length) }
}

export function classify(text: string): Pick {
  // A long prompt or a paste carries context worth a stronger model.
  if (text.length > 2500) return { tier: 'opus', isStrong: true, why: 'long prompt or paste' }
  for (const r of RULES) {
    if (r.tier === 'haiku' && text.length > 160) continue
    if (r.test.test(text)) return { tier: r.tier, isStrong: r.isStrong, why: r.why }
  }
  return { tier: 'sonnet', isStrong: false, why: 'no strong signal' }
}

// Sticky: keep the current model unless the signal is strong, and never step down on a long session.
export function decide(current: ModelTier | null, pick: Pick, lastCount: number, tokens = 0): { tier: ModelTier; why: string } {
  if (current === null) return { tier: pick.tier, why: pick.why }
  if (!pick.isStrong || pick.tier === current) return { tier: current, why: 'kept (sticky)' }
  if (RANK[pick.tier] < RANK[current] && tokens > BIG_CONTEXT) {
    return { tier: current, why: 'kept: context too big for a smaller model' }
  }
  if (RANK[pick.tier] < RANK[current] && lastCount > LONG_SESSION) {
    return { tier: current, why: 'kept: long session, cache beats a cheaper model' }
  }
  return { tier: pick.tier, why: pick.why }
}
