// reflex in Claude Code: while you type, a line above the prompt says what Enter will do on this
// Mac; on Enter, an action runs here and the prompt never reaches Claude. Anything that is not
// wholly an action goes to Claude as typed, and a leading \ always does.
//
// The deciding is the CLI's (src/cli.mjs): this module only asks it, draws and intercepts.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Plan } from './preview.ts'
import { mightBeAction, previewLine } from './preview.ts'
import { bashFacts, callSucceeded, record, recordItem, recordUrl, urlsIn, writtenPath } from '../src/recent.mjs'
import { createObserver } from '../src/observe.mjs'

const preview = atom({ plugin: 'reflex', key: 'preview' } as const, null)
// What Claude wrote or showed this session, newest first: files and web addresses (src/recent.mjs keeps the rules). Plugin state, so the CLI keeps none.
const recent = atom({ plugin: 'reflex', key: 'recent' } as const, [])

// What use teaches, logged locally (src/learnlog.mjs). It only observes: never awaited for a decision,
// and a failure in it never reaches the prompt or a tool call.
let watch: ReturnType<typeof createObserver> | undefined
// The hooks module has no node:*, so a record goes to the CLI, which writes the file: fire and forget.
const observer = ($: EngineInterface) => watch ??= createObserver({
  ask: async text => (await ask($, text).catch(() => null)) as any,
  log: entry => { void cli($, ['learn', '--record', JSON.stringify(entry)]).catch(() => {}) },
})

let latest = 0 // the newest draft asked about; an answer for an older one is dropped

function cli($: EngineInterface, args: string[], timeoutMs = 10_000) {
  return $.process.run(['node', `${$.plugin.root}/src/cli.mjs`, ...args], { timeoutMs })
}

// `--recent <json>` when there is a list: what lets "open it" mean the file Claude just made. Without one, nothing is passed.
async function recentArgs($: EngineInterface): Promise<string[]> {
  try {
    const list = await read($, recent)
    return Array.isArray(list) && list.length ? ['--recent', JSON.stringify(list)] : []
  } catch { return [] }
}

async function ask($: EngineInterface, text: string, withRecent: string[] = []): Promise<(Plan & { home?: string }) | null> {
  const { exitCode, stdout } = await cli($, ['--json', ...withRecent, text])
  if (exitCode !== 0) return null
  try { return JSON.parse(stdout) } catch { return null }
}

// Each change of the draft asks again; an answer for an older draft is dropped.
async function refresh($: EngineInterface, text: string) {
  const ticket = ++latest
  if (!mightBeAction(text)) {
    if ((await read($, preview)) !== null) await update($, preview, () => null)
    return
  }
  await $.clock.sleep(120) // let a burst of keys settle
  if (ticket !== latest) return
  const plan = await ask($, text, await recentArgs($)).catch(() => null)
  if (ticket !== latest) return
  const line = plan ? previewLine(plan, plan.home ?? '') : null
  await update($, preview, () => (line ? { text, line } : null))
}


export const register: Register = (on) => {
  on('prompt.edit', async ($, e, next) => {
    const box = await next(e)
    void refresh($, box.text)
    return box
  })
  on('prompt.change', async ($, e, next) => {
    void refresh($, e.text)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const shown = await read($, preview)
    if (!shown) return next(e)
    const below = await next(e)
    const { Box, Text } = $.ui.resolve(e)
    const mine = (
      <Box key="reflex">
        <Text color="cyan" wrap="truncate-end">{shown.line}</Text>
      </Box>
    )
    return below ? <Box flexDirection="column">{mine}{below}</Box> : mine
  })

  on('prompt.submit', async ($, e, next) => {
    const watching = observer($)
    // Only what the person typed at the prompt, never a slash command, a queued or a plugin's prompt.
    if (e.command || e.origin.kind !== 'composer' || e.wait) { watching.other(); return next(e) }
    if (e.text.trimStart().startsWith('\\')) {
      void watching.override(e.text.trimStart().slice(1))
      return next({ ...e, text: e.text.trimStart().slice(1) })
    }
    const toClaude = () => { watching.passed(e.text); return next(e) }
    if (!mightBeAction(e.text)) return toClaude()

    latest++
    await update($, preview, () => null)
    const withRecent = await recentArgs($)
    // `--count` is for Enter only: it lets a Trash phrase read its item count from Finder (never while previewing).
    const plan = await ask($, e.text, [...withRecent, '--count']).catch(() => null)
    if (!plan || plan.status === 'pass') return toClaude()

    // A query is already answered by the CLI (read-only): shown as a transcript line, not sent to the model.
    if (plan.status === 'answer') {
      watching.accepted(e.text, plan, plan.action)
      $.ui.log(`⚡ ${plan.answer} · without Claude`)
      return { drop: plan.answer }
    }

    // Empty Trash: a question with "No" first. Only "Yes" goes on, and only with the count that was shown; any other
    // answer (No, dismissed, free text) drops the prompt: it does not run and does not go to Claude.
    let confirmed: number | undefined
    if (plan.status === 'confirm') {
      if (!plan.question || !plan.labels || plan.labels.length !== 2 || !plan.count) return toClaude()
      const chosen = await $.ui.ask(plan.question, { options: plan.labels, header: 'reflex' }).catch(() => undefined)
      if (chosen !== plan.labels[1]) { $.ui.log('⚡ reflex: not done'); return { drop: 'reflex: cancelled' } }
      confirmed = plan.count
    }

    let pick: number | undefined
    if (plan.status === 'choose') {
      const labels = plan.candidates.slice(0, 4).map(candidate => candidate.label)
      if (labels.length < 2) return toClaude()
      const chosen = await $.ui.ask(`Which one?`, labels).catch(() => undefined)
      pick = chosen === undefined ? undefined : labels.indexOf(chosen) + 1
      if (!pick) return { drop: 'reflex: nothing chosen' }
    }

    // A confirmed Trash can take a while to empty: it gets a longer leash than a lookup.
    const { exitCode, stdout, stderr } = await cli($, [...(pick ? ['--pick', String(pick)] : []), ...(confirmed ? ['--confirmed', String(confirmed)] : []), ...withRecent, e.text], confirmed ? 120_000 : 10_000)
    if (exitCode !== 0) {
      $.ui.log(`⚡ reflex could not do it: ${(stderr || stdout).trim()}`)
      return { drop: 'reflex: failed' }
    }
    const done = stdout.trim()
    const action = plan.status === 'action' || plan.status === 'confirm' ? plan.action : { verb: plan.verb, target: plan.candidates[(pick ?? 1) - 1] }
    watching.accepted(e.text, plan, action)
    $.ui.log(`${done} · without Claude`)
    return { drop: done }
  }).catch(($, e, next) => next(e)) // fail open: if reflex itself throws, the prompt goes to Claude as typed, and nothing was run

  // Observes only: Claude's first Bash command in a turn that began with a passed phrase, when reflex
  // could have run it, is logged as what the phrase should have done. Never blocks or rewrites.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    try { observer($).toolCall('Bash', { command: (e as { command?: string }).command }) } catch {}
    return next(e)
  }).catch(($, e, next) => next(e)) // observing only: if this throws, the call goes on untouched

  // What a Bash command made or showed, for "open the doc" / "open the website": a file `open` was given, a file the command
  // wrote (`-output x.docx`, `> x.md`: it exists and was touched during the call), and the web addresses it opened or held.
  // Only after the call went through. The CLI reads the disk (this module has no node:*); an address alone needs no disk.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const since = Date.now()
    const result = await next(e)
    try {
      const command = (e as { command?: string }).command
      if (typeof command !== 'string' || !callSucceeded(result)) return result
      const facts = bashFacts(command)
      const onDisk = facts.opened.paths.length > 0 || facts.named.some(word => /[./]/.test(word))
      let items: unknown[] = facts.urls.map(url => ({ url }))
      if (onDisk) {
        const cwd = await Promise.resolve().then(() => $.session.cwd()).catch(() => undefined)
        const { exitCode, stdout } = await cli($, ['touched', '--since', String(since), ...(cwd ? ['--cwd', cwd] : []), '--', command], 5_000)
        const found = exitCode === 0 ? JSON.parse(stdout) : undefined
        if (Array.isArray(found)) items = found
      }
      const now = Date.now()
      if (items.length) await update($, recent, list => [...items].reverse().reduce((kept: any, item) => recordItem(kept, item, now), list))
    } catch {}
    return result
  }).catch(($, e, next) => next(e))

  // The web addresses in Claude's own reply (a site it just published, a PR it opened): "open the website" can mean one.
  // The main loop's final text of a turn only, never a subagent's.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    try {
      const answer = (e as { answer?: string; agentId?: string }).answer
      if (typeof answer === 'string' && !(e as { agentId?: string }).agentId) {
        const urls = urlsIn(answer)
        const now = Date.now()
        if (urls.length) await update($, recent, list => [...urls].reverse().reduce((kept: any, url) => recordUrl(kept, url, now), list))
      }
    } catch {}
    return result
  }).catch(($, e, next) => next(e))

  // Records the files Claude writes, for "open it" / "abre ese doc". Only after the call went through, so a failed write is
  // never "the file Claude made"; a read never reaches here (Read is not listed). Observes only: the call is never touched.
  for (const tool of ['Write', 'Edit', 'NotebookEdit']) {
    on('tool.call', { tool }, async ($, e, next) => {
      const result = await next(e)
      try {
        const path = writtenPath(e)
        if (path && callSucceeded(result)) await update($, recent, list => record(list, path, Date.now()))
      } catch {}
      return result
    }).catch(($, e, next) => next(e))
  }
}
