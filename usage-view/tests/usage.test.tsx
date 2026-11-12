import { expect, test } from 'claude-code/testing'

import { profileFrom, resetIn } from '../hooks/format'

const CONFIG = JSON.stringify({
  oauthAccount: { emailAddress: 'brandon@example.com', organizationType: 'claude_max', organizationName: 'Personal' },
})
const PANE = {
  plugin: 'usage-view', component: 'Pane', requestId: 'usage-view',
  props: { title: 'Profile & usage', isFocused: false, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const
const NOW = Date.parse('2026-11-08T12:00:00Z')

test('reads the profile and plan from the config file', () => {
  expect(profileFrom(CONFIG)).toEqual({ email: 'brandon@example.com', plan: 'Max', org: 'Personal' })
  expect(profileFrom('{}')).toBe(null)
  expect(resetIn('2026-11-08T14:30:00Z', NOW)).toBe('resets in 2h 30m')
})

test('status line and pane show profile, context and both windows', async ($, on) => {
  const lines: (string | undefined)[] = []
  on('env.get', () => ({ value: '/Users/b' }))
  on('fs.read', () => ({ value: CONFIG }))
  on('clock.now', () => ({ value: NOW }))
  on('session.usage', () => ({
    value: {
      startedAt: NOW,
      context: { tokens: 84000, window: 200000, percent: 42 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 31, resetsAt: '2026-11-08T14:30:00Z' },
        { kind: 'seven_day', percentUsed: 12.5, resetsAt: '2026-11-11T12:00:00Z' },
      ],
    },
  }))
  on('command.register', () => ({ value: { command: 'usage-view' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.status', (_, e) => (lines.push(e.text), { value: undefined }))

  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })
  expect(lines.at(-1)).toBe('brandon@example.com (Max) · ctx 42% · 5-hour 31% · Weekly 13%')

  for (const surface of ['terminal', 'vscode', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /brandon@example\.com/ }))?.text).toBe('brandon@example.com')
    expect((await ui.find({ type: 'Text', text: /84k of 200k/ }))?.text).toBe('84k of 200k tokens')
    expect((await ui.find({ type: 'Text', text: /resets in 2h 30m/ }))?.text).toBe('resets in 2h 30m')
    expect((await ui.find({ type: 'Text', text: /resets in 3d/ }))?.text).toBe('resets in 3d 0h')
    await ui.unmount()
  }
})
