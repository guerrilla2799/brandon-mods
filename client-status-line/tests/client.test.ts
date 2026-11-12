import { expect, test } from 'claude-code/testing'

const CLIENTS = JSON.stringify({
  Acme: { brand: 'acme-brand skill' },
  'Globex': { brand: 'Globex/Globex Design System' },
})
const V = '/Users/me/Vault/01-Clients'

test('an Acme session warns when Claude opens a Globex file', async ($, on) => {
  const lines: (string | undefined)[] = []
  const toasts: string[] = []
  on('fs.read', () => ({ value: CLIENTS }))
  on('session.cwd', () => ({ value: `${V}/Acme` }))
  on('command.register', () => ({ value: { command: 'client' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.status', (_, e) => (lines.push(e.text), { value: undefined }))
  on('ui.toast', (_, e) => (toasts.push(e.text), { value: undefined }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: `${V}/Acme`, surface: 'vscode', isInteractive: true })
  expect(lines.at(-1)).toBe('Client: Acme · Brand: acme-brand skill')

  await $.tool.call({ tool: 'Read', file_path: `${V}/Acme/SESSION-CONTEXT.md` })
  expect(toasts.length).toBe(0)

  await $.tool.call({ tool: 'Bash', command: `cat "${V}/Globex/CLAUDE.md"` })
  expect(toasts[0]).toBe('⚠ Acme session: Claude opened a file from Globex')
  expect(lines.at(-1)).toContain('⚠ also opened: Globex')
})

test('/client pins a client and clears the warnings', async ($, on) => {
  const lines: (string | undefined)[] = []
  on('fs.read', () => ({ value: CLIENTS }))
  on('session.cwd', () => ({ value: '/Users/me/Vault' }))
  on('command.register', () => ({ value: { command: 'client' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.status', (_, e) => (lines.push(e.text), { value: undefined }))
  on('ui.toast', () => ({ value: undefined }))

  await $.session.start({ cwd: '/Users/me/Vault', surface: 'vscode', isInteractive: true })
  expect(lines.at(-1)).toBe('Client: none yet (vault-wide)')

  const out = await $.command.run({ command: 'client', args: 'globex' })
  expect(out.text).toBe('Session client: Globex (pinned).')
  expect(lines.at(-1)).toContain('Client: Globex (pinned)')
})
