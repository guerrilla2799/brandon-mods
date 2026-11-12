import { describe, expect, test } from 'claude-code/testing'

import { classify, decide, isMachine } from '../hooks/rules'

describe('rules', () => {
  test('picks a tier per kind of prompt', () => {
    expect(classify('rename the file to v2').tier).toBe('haiku')
    expect(classify('summarize the Acme session context').tier).toBe('sonnet')
    expect(classify('draft a LinkedIn post about pipeline math').tier).toBe('opus')
    expect(classify('debug why the hook never fires').tier).toBe('opus')
    expect(classify('rework the positioning for Globex').tier).toBe('fable')
    expect(classify('yes, go ahead').isStrong).toBe(false)
  })

  test('sticky: weak signals keep the model, long sessions never step down', () => {
    expect(decide('opus', classify('yes, go ahead'), 5).tier).toBe('opus')
    expect(decide('opus', classify('rename the file to v2'), 10).tier).toBe('haiku')
    expect(decide('opus', classify('rename the file to v2'), 200).tier).toBe('opus')
    expect(decide('haiku', classify('debug the router'), 200).tier).toBe('opus')
  })
})

// One turn: its first request routes, then the assistant's reply closes it.
async function turn($: any, seen: { rows: { role: string; text: string; toolUses: never[] }[] }): Promise<void> {
  const stream = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: seen.rows.length })
  for await (const _ of stream) void _
  seen.rows.push({ role: 'assistant', text: 'done', toolUses: [] })
}

function engine(on: any, answer = 'Use Fable this time') {
  const lines: (string | undefined)[] = []
  const asked: string[] = []
  const seen = { model: '', text: '', rows: [] as { role: string; text: string; toolUses: never[] }[] }
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1000, window: 200000, percent: 1 }, rateLimits: [] } }))
  on('session.messages', () => ({ value: seen.rows }))
  on('turn.step', async function* (_: unknown, e: { model: string; turnId: string; index: number }) {
    seen.model = e.model
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] }
  })
  on('command.register', () => ({ value: { command: 'route' } }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('ui.status', (_: unknown, e: { text?: string }) => (lines.push(e.text), { value: undefined }))
  on('tool.call', { tool: 'AskUserQuestion' }, (_: unknown, e: { questions: { question: string }[] }) => {
    const q = e.questions[0]?.question ?? ''
    asked.push(q)
    return { result: { questions: e.questions, answers: { [q]: answer } } }
  })
  on('prompt.submit', (_: unknown, e: { text: string }) => {
    seen.text = e.text
    seen.rows.push({ role: 'user', text: e.text, toolUses: [] })
    return { text: e.text }
  })
  return { lines, asked, seen }
}

test('a drafting prompt routes the turn to Opus', async ($, on) => {
  const { lines, seen } = engine(on)
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })
  await $.prompt.submit({ text: 'draft a newsletter intro on Claude Mods' } as never)
  await turn($, seen)
  expect(lines.at(-1)).toBe('Model: Opus (auto: drafting buyer-facing prose)')
  expect(seen.model).toBe('opus')
})

test('!haiku forces this prompt and strips the prefix', async ($, on) => {
  const { lines, seen } = engine(on)
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })
  await $.prompt.submit({ text: '!haiku draft a newsletter intro' } as never)
  expect(seen.text).toBe('draft a newsletter intro')
  await turn($, seen)
  expect(lines.at(-1)).toBe('Model: Haiku (forced for this prompt)')
  expect(seen.model).toBe('haiku')
})

test('Fable asks first, and a no falls back to Opus', async ($, on) => {
  const { lines, asked, seen } = engine(on, 'Use Opus instead')
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })
  await $.prompt.submit({ text: 'rework the positioning for Globex' } as never)
  await turn($, seen)
  expect(seen.model).toBe('opus')
  expect(asked.length).toBe(1)
  expect(lines.at(-1)).toBe('Model: Opus (auto: Fable declined, Opus instead)')
})

test('/route pins a model until /route auto', async ($, on) => {
  const { lines, seen } = engine(on)
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })
  const out = await $.command.run({ command: 'route', args: 'sonnet' })
  expect(out.text).toBe('Routing to Sonnet (pinned).')
  await $.prompt.submit({ text: 'draft a LinkedIn post' } as never)
  await turn($, seen)
  expect(lines.at(-1)).toContain('Sonnet (pinned')
  expect(seen.model).toBe('sonnet')
  await $.command.run({ command: 'route', args: 'auto' })
  await $.prompt.submit({ text: 'draft a LinkedIn post' } as never)
  await turn($, seen)
  expect(lines.at(-1)).toContain('Opus (auto')
})

test('a prompt queued mid-turn does not reroute the turn already running', async ($, on) => {
  const { seen } = engine(on)
  await $.session.start({ cwd: '/', surface: 'vscode', isInteractive: true })
  await $.prompt.submit({ text: 'debug why the hook never fires' } as never)
  await turn($, seen)
  expect(seen.model).toBe('opus')
  // Queued while the next turn's first request is out: routing reads the turn's own text, not the queue.
  await $.prompt.submit({ text: 'rename the file to v2' } as never)
  await turn($, seen)
  expect(seen.model).toBe('haiku')
})

test('never steps down when the context is too big, and ignores machine turns', () => {
  expect(decide('opus', classify('rename the file to v2'), 5, 400_000).tier).toBe('opus')
  expect(decide('opus', classify('rename the file to v2'), 5, 20_000).tier).toBe('haiku')
  expect(isMachine('<task-notification><summary>done</summary></task-notification>')).toBe(true)
  expect(isMachine('draft a post')).toBe(false)
})
