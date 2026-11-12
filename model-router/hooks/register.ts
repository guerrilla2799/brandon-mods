import type { EngineInterface, Register } from 'claude-code'

import type { ModelTier } from '../types'
import { classify, decide, forced, isMachine, LABEL, TIERS } from './rules'

const PIN = { plugin: 'model-router', key: 'pin' } as const
const CURRENT = { plugin: 'model-router', key: 'active' } as const
const ONCE = { plugin: 'model-router', key: 'once' } as const
const WHY = { plugin: 'model-router', key: 'why' } as const
const FABLE_OK = { plugin: 'model-router', key: 'fableOk' } as const
const FORCES = { plugin: 'model-router', key: 'forces' } as const

async function target($: EngineInterface): Promise<ModelTier | null> {
  const { value: pin = null } = await $.state.get(PIN)
  const { value: once = null } = await $.state.get(ONCE)
  const { value: current = null } = await $.state.get(CURRENT)
  return pin ?? once ?? current
}

async function draw($: EngineInterface) {
  const { value: pin = null } = await $.state.get(PIN)
  const { value: once = null } = await $.state.get(ONCE)
  const { value: why = '' } = await $.state.get(WHY)
  const tier = await target($)
  if (!tier) {
    $.ui.status('Model: auto (picks on your first prompt)')
    return
  }
  if (pin) $.ui.status(`Model: ${LABEL[tier]} (pinned, /route auto to release)`)
  else if (once) $.ui.status(`Model: ${LABEL[tier]} (forced for this prompt)`)
  else $.ui.status(`Model: ${LABEL[tier]} (auto: ${why})`)
}

// Fable only runs once Brandon says yes; the answer holds for the session.
async function approveFable($: EngineInterface, why: string): Promise<boolean> {
  const { value: ok = false } = await $.state.get(FABLE_OK)
  if (ok) return true
  try {
    const answer = await $.ui.ask(`This prompt looks like ${why}. Route it to Fable?`, {
      header: 'Fable',
      options: ['Use Fable this time', 'Use Fable all session', 'Use Opus instead'],
    })
    if (answer === 'Use Fable all session') await $.state.set(FABLE_OK, true)
    return answer.startsWith('Use Fable')
  } catch {
    return false
  }
}

// The user text this turn answers: every user row after the last assistant reply (queued prompts merge).
async function turnText($: EngineInterface): Promise<string> {
  const rows = await $.session.messages()
  const out: string[] = []
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]
    if (!row) continue
    if (row.role === 'assistant') break
    if (row.text.trim()) out.unshift(row.text.trim())
  }
  return out.join('\n')
}

async function route($: EngineInterface, messageCount: number) {
  await $.state.set(ONCE, null)
  const text = await turnText($)
  const { value: forces = [] } = await $.state.get(FORCES)
  const hit = forces.find(f => f.text && text.includes(f.text))
  if (hit) {
    await $.state.set(FORCES, forces.filter(f => f !== hit))
    await $.state.set(ONCE, hit.tier)
    await draw($)
    return
  }
  const { value: pin = null } = await $.state.get(PIN)
  if (pin || !text || isMachine(text)) return draw($)
  const { value: current = null } = await $.state.get(CURRENT)
  const { context } = await $.session.usage()
  const choice = decide(current, classify(text), messageCount, context.tokens ?? 0)
  let tier = choice.tier
  let why = choice.why
  if (tier === 'fable' && current !== 'fable' && !(await approveFable($, choice.why))) {
    tier = 'opus'
    why = 'Fable declined, Opus instead'
  }
  await $.state.set(CURRENT, tier)
  await $.state.set(WHY, why)
  await draw($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'route',
      description: 'Model router: /route opus pins a model, /route auto releases it, /route shows the state',
    })
    await draw($)
    return started
  })

  on('command.run', { command: 'route' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'auto') {
      await $.state.set(PIN, null)
    } else if ((TIERS as readonly string[]).includes(arg)) {
      await $.state.set(PIN, arg as ModelTier)
      if (arg === 'fable') await $.state.set(FABLE_OK, true)
    } else if (arg) {
      return { text: `Unknown model "${arg}". Use haiku, sonnet, opus, fable or auto.` }
    }
    await draw($)
    const tier = await target($)
    const { value: pin = null } = await $.state.get(PIN)
    return { text: tier ? `Routing to ${LABEL[tier]}${pin ? ' (pinned)' : ' (auto)'}.` : 'Auto routing; nothing picked yet.' }
  }).catch(() => ({ text: 'model-router: /route failed; routing is unchanged.' }))

  // Only strips a force prefix and remembers it. Routing waits for the turn, so a prompt queued
  // while Claude works cannot reroute the turn that is already running.
  on('prompt.submit', async ($, e, next) => {
    if (e.isMeta || e.command) return next(e)
    const force = forced(e.text)
    if (!force) return next(e)
    const { value: forces = [] } = await $.state.get(FORCES)
    await $.state.set(FORCES, [...forces, { text: force.rest.trim(), tier: force.tier }].slice(-10))
    return next({ ...e, text: force.rest })
  }).catch(($, e, next) => next(e))

  // Main loop only: subagents keep the model their definition names (eval-judge etc.).
  on('turn.step', async function* ($, e, next) {
    if (e.agentId !== undefined) return yield* next(e)
    if (e.index === 0) {
      // A routing failure must never cost the turn: it runs on whatever model was already set.
      try {
        await route($, e.messageCount)
      } catch {
        $.ui.log('model-router: routing failed, kept the current model', { to: 'debug' })
      }
    }
    const tier = await target($)
    return yield* next(tier ? { ...e, model: tier } : e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) await $.state.set(ONCE, null)
    return next(e)
  })
}
