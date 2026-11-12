import type { EngineInterface, Register } from 'claude-code'

import type { UvUsage } from '../types'
import { bar, k, limitLine, profileFrom, resetIn, windowName } from './format'

const PANE = 'usage-view'
const PROFILE = { plugin: 'usage-view', key: 'profile' } as const
const USAGE = { plugin: 'usage-view', key: 'usage' } as const

async function loadProfile($: EngineInterface) {
  const dir = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? (await $.env.get('HOME'))
  try {
    const profile = profileFrom(await $.fs.read(`${dir}/.claude.json`))
    if (profile) {
      await $.state.set(PROFILE, profile)
      return
    }
  } catch {
    // Fall through to the engine's own answer: an API key or cloud provider has no oauthAccount.
  }
  const id = await $.session.identity()
  await $.state.set(PROFILE, { email: id.email ?? `signed in by ${id.kind}`, plan: id.organizationType ?? '', org: '' })
}

async function status($: EngineInterface) {
  const { value: p = null } = await $.state.get(PROFILE)
  const { value: u = null } = await $.state.get(USAGE)
  const who = p ? `${p.email}${p.plan ? ` (${p.plan})` : ''}` : 'profile unknown'
  const ctx = u?.percent !== undefined ? `ctx ${Math.round(u.percent)}%` : 'ctx –'
  const limits = u?.limits.length ? u.limits.map(limitLine).join(' · ') : 'usage –'
  $.ui.status(`${who} · ${ctx} · ${limits}`)
}

async function measure($: EngineInterface, e: { context: { tokens?: number; window: number; percent?: number }; rateLimits: readonly { kind: string; percentUsed: number; resetsAt?: string }[]; cost?: { usd: number } }) {
  const usage: UvUsage = {
    tokens: e.context.tokens,
    window: e.context.window,
    percent: e.context.percent,
    limits: e.rateLimits.map(l => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt })),
    usd: e.cost?.usd,
    at: await $.clock.now(),
  }
  await $.state.set(USAGE, usage)
  await status($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'usage-view', description: 'Open the profile, context and usage pane' })
    await loadProfile($)
    await measure($, await $.session.usage())
    return started
  })

  on('command.run', { command: 'usage-view' }, async $ => {
    await loadProfile($)
    await measure($, await $.session.usage())
    await $.ui.open({ id: PANE, title: 'Profile & usage' })
    return { text: 'Profile & usage pane opened.' }
  }).catch(() => ({ text: 'usage-view: could not open the pane.' }))

  on('session.measure', async ($, e, next) => {
    await measure($, e)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const { value: p = null } = await $.state.get(PROFILE)
    const { value: u = null } = await $.state.get(USAGE)
    const now = await $.clock.now()
    const width = Math.max(8, Math.min(24, e.props.bodyColumns - 22))

    return (
      <Box flexDirection="column">
        <Text bold>Profile</Text>
        <Text>{p ? p.email : 'unknown'}</Text>
        <Text dimColor>{p ? [p.plan, p.org].filter(Boolean).join(' · ') : ''}</Text>
        <Text> </Text>
        <Text bold>Context</Text>
        {u?.percent !== undefined ? (
          <Text>
            {bar(u.percent, width)} {Math.round(u.percent)}%
          </Text>
        ) : (
          <Text dimColor>No reading yet (fills after the first reply)</Text>
        )}
        <Text dimColor>{u ? `${u.tokens !== undefined ? k(u.tokens) : '–'} of ${k(u.window)} tokens` : ''}</Text>
        <Text> </Text>
        <Text bold>Plan usage</Text>
        {u?.limits.length ? (
          u.limits.map(l => (
            <Box flexDirection="column">
              <Text>
                {windowName(l.kind).padEnd(7)} {bar(l.percentUsed, width)} {Math.round(l.percentUsed)}%
              </Text>
              <Text dimColor>{resetIn(l.resetsAt, now)}</Text>
            </Box>
          ))
        ) : (
          <Text dimColor>No reading yet (arrives with the first reply)</Text>
        )}
        {u?.usd !== undefined && u.usd > 0 && <Text dimColor>{`Session cost (API-equivalent): $${u.usd.toFixed(2)}`}</Text>}
      </Box>
    )
  })
}
