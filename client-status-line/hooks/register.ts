import type { EngineInterface, Register } from 'claude-code'

import type { Active } from '../types'

type Info = { brand: string }

const PLUGIN = 'client-status-line'
const ACTIVE = { plugin: 'client-status-line', key: 'active' } as const
const STRAYS = { plugin: 'client-status-line', key: 'strays' } as const

// The client a path sits under: 01-Clients/<Client>/... or 01-Clients/Closed/<Client>/...
const ROOT = /01-Clients\/(?:(Closed)\/)?([^/'"\n]+?)\//g

type Hit = { name: string; isClosed: boolean }

function clientsIn(text: string): Hit[] {
  const hits: Hit[] = []
  for (const m of text.replaceAll('\\ ', ' ').matchAll(ROOT)) {
    const name = m[2] ?? ''
    if (!name || name.includes('.') || hits.some(h => h.name === name)) continue
    hits.push({ name, isClosed: m[1] === 'Closed' })
  }
  return hits
}

// Paths a file tool names, or the whole command for Bash (only clients on file count there).
function hitsOf(e: object): Hit[] {
  const f = e as Record<string, unknown>
  if (typeof f.command === 'string') {
    return clientsIn(f.command).filter(h => h.isClosed || h.name in clients)
  }
  const paths = ['file_path', 'notebook_path', 'path']
    .map(k => f[k])
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
  return paths.flatMap(p => clientsIn(absolute(p.endsWith('/') ? p : `${p}/`)))
}

const WRITES = ['Edit', 'Write', 'NotebookEdit']

let clients: Record<string, Info> = {}
let cwd = ''

const absolute = (p: string) => (p.startsWith('/') ? p : `${cwd}/${p}`)

async function draw($: EngineInterface) {
  const { value: a = null } = await $.state.get(ACTIVE)
  const { value: away = [] } = await $.state.get(STRAYS)
  if (!a) {
    $.ui.status('Client: none yet (vault-wide)')
    return
  }
  const info = clients[a.name] ?? { brand: 'not in clients.json' }
  const pin = a.how === 'pinned' ? ' (pinned)' : ''
  const warn = away.length ? `  ⚠ also opened: ${away.join(', ')}` : ''
  $.ui.status(`Client: ${a.name}${pin} · Brand: ${info.brand}${warn}`)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    cwd = await $.session.cwd()
    try {
      clients = JSON.parse(await $.fs.read(`${$.plugin.root}/clients.json`)) as Record<string, Info>
    } catch {
      $.ui.toast(`${PLUGIN}: clients.json is missing or not valid JSON`)
    }
    await $.command.register({
      name: 'client',
      description: 'Show or pin the session client: /client <name>, /client clear',
    })
    const here = clientsIn(`${cwd}/`)[0]
    const { value: current = null } = await $.state.get(ACTIVE)
    if (here && current === null) {
      await $.state.set(ACTIVE, { name: here.name, how: 'folder' })
    }
    await draw($)
    return started
  })

  on('command.run', { command: 'client' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'clear') {
      await $.state.set(ACTIVE, null)
      await $.state.set(STRAYS, [])
    } else if (arg) {
      const name = Object.keys(clients).find(c => c.toLowerCase() === arg.toLowerCase()) ?? arg
      await $.state.set(ACTIVE, { name, how: 'pinned' })
      await $.state.set(STRAYS, [])
    }
    await draw($)
    const { value: a = null } = await $.state.get(ACTIVE)
    return { text: a ? `Session client: ${a.name} (${a.how}).` : 'No session client set.' }
  }).catch(() => ({ text: 'client-status-line: /client failed.' }))

  on('tool.call', async ($, e, next) => {
    const hits = hitsOf(e)
    for (const hit of hits) {
      const { value: a = null } = await $.state.get(ACTIVE)
      if (!a) {
        await $.state.set(ACTIVE, { name: hit.name, how: 'first-touch' })
      } else if (hit.name !== a.name) {
        const verb = WRITES.includes(e.tool) ? 'is editing' : 'opened'
        const closed = hit.isClosed ? ' (closed client)' : ''
        $.ui.toast(`⚠ ${a.name} session: Claude ${verb} a file from ${hit.name}${closed}`, { timeoutMs: 8000 })
        const { value: away = [] } = await $.state.get(STRAYS)
        if (!away.includes(hit.name)) await $.state.set(STRAYS, [...away, hit.name])
      }
    }
    if (hits.length) await draw($)
    return next(e)
  }).catch(($, e, next) => next(e))
}
