import assert from 'node:assert/strict'
import { test } from 'node:test'
import { appendFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { exportExamples, summarise, targetWords } from '../src/learn.mjs'
import { appendEntry, logEnabled, readLog, recordEntry } from '../src/learnlog.mjs'
import { createObserver } from '../src/observe.mjs'
import { actionFromBash } from '../src/oracle.mjs'

const home = '/Users/me'
const act = command => actionFromBash(command, { home })
const tmp = () => join(mkdtempSync(join(tmpdir(), 'reflex-log-')), 'sub', 'log.jsonl')

test('bash to action: open, open -a, open -R, pbcopy of a path, open url', () => {
  assert.deepEqual(act('open /code/brand'), { verb: 'open', target: { type: 'path', value: '/code/brand' } })
  assert.deepEqual(act('open ~/Downloads/'), { verb: 'open', target: { type: 'path', value: '/Users/me/Downloads' } })
  assert.deepEqual(act('open -a Figma'), { verb: 'open', target: { type: 'app', value: 'Figma' } })
  assert.deepEqual(act('open -a "Google Chrome"'), { verb: 'open', target: { type: 'app', value: 'Google Chrome' } })
  assert.deepEqual(act('open /Applications/Figma.app'), { verb: 'open', target: { type: 'app', value: '/Applications/Figma.app' } })
  assert.deepEqual(act('open -R /code/brand/cards/a.png'), { verb: 'reveal', target: { type: 'path', value: '/code/brand/cards/a.png' } })
  assert.deepEqual(act('open https://example.com/docs'), { verb: 'open', target: { type: 'url', value: 'https://example.com/docs' } })
  assert.deepEqual(act('open "https://example.com/a?x=1&y=2"'), { verb: 'open', target: { type: 'url', value: 'https://example.com/a?x=1&y=2' } })
  assert.deepEqual(act('echo -n /code/brand | pbcopy'), { verb: 'copy', target: { type: 'text', value: '/code/brand' } })
  assert.deepEqual(act("printf '%s' '/code/my brand' | pbcopy"), { verb: 'copy', target: { type: 'text', value: '/code/my brand' } })
})

test('bash to action: quoting and paths with spaces', () => {
  assert.deepEqual(act('open "/code/my brand/notes.md"'), { verb: 'open', target: { type: 'path', value: '/code/my brand/notes.md' } })
  assert.deepEqual(act("open '/code/it\\'s'")?.target.value, undefined) // an unterminated single quote is not a command we read
  assert.deepEqual(act("open '/code/it s'"), { verb: 'open', target: { type: 'path', value: '/code/it s' } })
  assert.deepEqual(act('open /code/my\\ brand'), { verb: 'open', target: { type: 'path', value: '/code/my brand' } })
  assert.deepEqual(act('  open   -R   "/a b/c d"  '), { verb: 'reveal', target: { type: 'path', value: '/a b/c d' } })
})

test('bash to action: anything else is none', () => {
  for (const command of [
    'ls /code', 'open', 'open -a', 'open -a Figma /code/brand/a.md', 'open -g /code/brand', 'open -n -a Figma', 'open -b com.figma.Desktop',
    'open /a /b', 'open brand', 'open -R brand', 'open ftp://x.org/a', 'cd /code && open /code/brand', 'open /code/brand; rm -rf /',
    'open /code/brand | cat', 'open $(pwd)', 'open "$HOME/x"', 'open /code/*', 'open /code/brand > /dev/null', 'open "/unterminated',
    'echo hi | pbcopy', 'echo /code/brand /x | pbcopy', 'cat /code/brand | pbcopy', 'pbcopy < /code/brand', 'echo /a | pbcopy | cat', 'git open /x', '', undefined,
  ]) assert.equal(act(command), null, String(command))
})

test('log writer: appends lines, adds a time, creates the directory', () => {
  const path = tmp()
  assert.equal(appendEntry({ kind: 'accepted', phrase: 'abre brand', verb: 'open' }, { path, config: {} }), true)
  assert.equal(appendEntry({ kind: 'oracle', phrase: 'pasame brand', verb: 'open' }, { path, config: {} }), true)
  const entries = readLog(path)
  assert.deepEqual(entries.map(e => [e.kind, e.phrase]), [['accepted', 'abre brand'], ['oracle', 'pasame brand']])
  assert.match(entries[0].t, /^\d{4}-\d\d-\d\dT/)
  assert.equal(readFileSync(path, 'utf8').split('\n').filter(Boolean).length, 2)
})

test('log writer: [learn] log = "off" writes nothing', () => {
  const path = tmp()
  assert.equal(logEnabled({ learn: { log: 'off' } }), false)
  assert.equal(logEnabled({ learn: { log: 'OFF' } }), false)
  assert.equal(logEnabled({ learn: { log: 'on' } }), true)
  assert.equal(logEnabled({}), true)
  assert.equal(appendEntry({ kind: 'accepted', phrase: 'abre brand' }, { path, config: { learn: { log: 'off' } } }), false)
  assert.equal(existsSync(path), false)
})

test('log writer: never throws, rejects entries with no kind or phrase', () => {
  const path = tmp()
  assert.equal(appendEntry({ kind: 'weird', phrase: 'x' }, { path, config: {} }), false)
  assert.equal(appendEntry({ kind: 'accepted', phrase: '  ' }, { path, config: {} }), false)
  assert.equal(appendEntry(null, { path, config: {} }), false)
  assert.equal(appendEntry({ kind: 'accepted', phrase: 'x' }, { path: '/dev/null/nope/log.jsonl', config: {} }), false)
})

test('record: an oracle arrives as a command and is mapped; an unmappable one is not logged', () => {
  const path = tmp()
  assert.equal(recordEntry({ kind: 'oracle', phrase: 'pásame brand', command: 'open -R /code/brand' }, { path, config: {} }), true)
  assert.equal(recordEntry({ kind: 'oracle', phrase: 'pásame brand', command: 'ls' }, { path, config: {} }), false)
  assert.equal(recordEntry('junk', { path, config: {} }), false)
  const [entry] = readLog(path)
  assert.deepEqual([entry.kind, entry.verb, entry.target, entry.command], ['oracle', 'reveal', { type: 'path', value: '/code/brand' }, undefined])
})

test('home is expanded only when given', () => {
  assert.equal(actionFromBash('open ~/x').target.value, '~/x')
})

test('log reader: skips malformed, blank and unknown lines; missing file is empty', () => {
  const path = tmp()
  assert.deepEqual(readLog(path), [])
  appendEntry({ kind: 'accepted', phrase: 'abre brand', verb: 'open' }, { path, config: {} })
  appendFileSync(path, 'not json\n\n{"kind":"accepted"}\n{"kind":"nope","phrase":"x"}\n[1]\n{"kind":"override","phrase":"abre figma"')
  appendFileSync(path, '\n{"kind":"override","phrase":"abre figma","verb":"open"}\n')
  assert.deepEqual(readLog(path).map(e => [e.kind, e.phrase]), [['accepted', 'abre brand'], ['override', 'abre figma']])
})

test('observer: the first mappable Bash call of a passed turn is the oracle, once', () => {
  const log = []
  const watch = createObserver({ log: e => log.push(e) })
  watch.passed('pásame el brand')
  watch.toolCall('Read', { command: 'open /code/brand' })
  watch.toolCall('Bash', { command: 'ls' })
  watch.toolCall('Bash', { command: 'open /code/brand' })
  watch.toolCall('Bash', { command: 'open /code/other' })
  assert.deepEqual(log, [{ kind: 'oracle', phrase: 'pásame el brand', command: 'open /code/brand' }])
})

test('observer: no oracle without a passed phrase, after reflex acted, or after a slash command', () => {
  const log = []
  const watch = createObserver({ log: e => log.push(e) })
  watch.toolCall('Bash', { command: 'open /code/brand' })
  watch.passed('pásame el brand')
  watch.accepted('abre brand', { step: 'template' }, { verb: 'open', target: { type: 'folder', value: '/code/brand' } })
  watch.toolCall('Bash', { command: 'open /code/brand' })
  watch.passed('pásame el brand')
  watch.other()
  watch.toolCall('Bash', { command: 'open /code/brand' })
  assert.deepEqual(log.map(e => e.kind), ['accepted'])
})

test('observer: override logs what reflex would have done, only when it would have acted', async () => {
  const log = []
  const plans = {
    'abre brand': { status: 'action', step: 'model', action: { verb: 'open', target: { type: 'folder', value: '/code/brand', label: 'x' } }, trace: [{ parsed: { target: 'brand' } }] },
    'hola': { status: 'pass', reason: 'no' },
  }
  const watch = createObserver({ log: e => log.push(e), ask: async text => plans[text] ?? null })
  await watch.override('abre brand')
  await watch.override('hola')
  await watch.override('unknown')
  assert.deepEqual(log, [{ kind: 'override', phrase: 'abre brand', verb: 'open', target: { type: 'folder', value: '/code/brand' }, step: 'model', words: 'brand' }])
})

test('observer: a failing log or ask never throws', async () => {
  const watch = createObserver({ log: () => { throw new Error('disk') }, ask: async () => { throw new Error('cli') } })
  watch.passed('x'); watch.toolCall('Bash', { command: 'open /a' }); watch.accepted('x', {}, { verb: 'open' })
  await watch.override('abre brand')
})

// learn --export
const index = {
  folders: { brand: '/code/brand', reflex: '/code/reflex' },
  apps: { figma: '/Applications/Figma.app' },
  shortcuts: [],
  files: ['/code/brand/cards/watchmen-post.png'],
}
const deps = { index, config: { aliases: {}, model: {} }, heldout: ['abre la carpeta de descargas'], zoxide: () => undefined }
const lines = file => readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
const answer = line => line.messages[2]

test('export: oracle and accepted entries become grounded positives in teach format', async () => {
  const file = tmp()
  const result = await exportExamples([
    { kind: 'oracle', phrase: 'pásame el brand', verb: 'open', target: { type: 'path', value: '/code/brand' } },
    { kind: 'oracle', phrase: 'lanza figma ya', verb: 'open', target: { type: 'app', value: 'Figma' } },
    { kind: 'accepted', phrase: 'enséñame reflex', verb: 'reveal', target: { type: 'folder', value: '/code/reflex' }, words: 'reflex' },
  ], file, deps)
  assert.equal(result.summary.kept, 3)
  const out = lines(file)
  assert.deepEqual(out.map(l => answer(l).tool_calls[0].function), [
    { name: 'open', arguments: { target: 'brand' } },
    { name: 'open', arguments: { target: 'figma' } },
    { name: 'reveal', arguments: { target: 'reflex' } },
  ])
  assert.equal(out[0].messages[1].content, 'pásame el brand')
})

test('export: drops what teach would: ungrounded, not copied, held out, exam, unknown verb, duplicates', async () => {
  const file = tmp()
  const result = await exportExamples([
    { kind: 'oracle', phrase: 'pásame el zorgblat', verb: 'open', target: { type: 'path', value: '/code/zorgblat' } },
    { kind: 'oracle', phrase: 'pásame lo otro', verb: 'open', target: { type: 'path', value: '/code/brand' } },
    { kind: 'oracle', phrase: 'abre la carpeta de descargas', verb: 'open', target: { type: 'path', value: '/code/brand' } },
    { kind: 'accepted', phrase: 'edita brand', verb: 'edit', target: { type: 'folder', value: '/code/brand' }, words: 'brand' },
    { kind: 'oracle', phrase: 'pásame el brand', verb: 'open', target: { type: 'path', value: '/code/brand' } },
    { kind: 'oracle', phrase: 'Pásame el brand', verb: 'open', target: { type: 'path', value: '/code/brand' } },
  ], file, deps)
  assert.equal(result.summary.kept, 1)
  assert.deepEqual(result.dropped.map(d => d.reason).sort(), [
    'duplicate', 'held-out phrase', 'target does not ground in the index', 'target is not copied from the phrase', 'unknown verb "edit"',
  ])
})

test('export: the real exams are excluded without a heldout override', async () => {
  const file = tmp()
  const exam = JSON.parse(readFileSync(new URL('./phrases/heldout.jsonl', import.meta.url), 'utf8').split('\n')[0]).phrase
  const result = await exportExamples([{ kind: 'oracle', phrase: exam, verb: 'open', target: { type: 'path', value: '/code/brand' } }], file, { ...deps, heldout: undefined })
  assert.equal(result.summary.kept, 0)
  assert.deepEqual(result.dropped.map(d => d.reason), ['held-out phrase'])
})

test('export: an override is a "-" negative when reflex would not act on the phrase by itself', async () => {
  const file = tmp()
  const result = await exportExamples([
    { kind: 'override', phrase: 'quiero que me hables de brand', verb: 'open', target: { type: 'folder', value: '/code/brand' }, step: 'model' },
    { kind: 'override', phrase: 'abre brand', verb: 'open', target: { type: 'folder', value: '/code/brand' }, step: 'template' },
  ], file, deps)
  assert.equal(result.summary.kept, 1)
  assert.deepEqual(answer(lines(file)[0]), { role: 'assistant', content: '-' })
  assert.deepEqual(result.dropped.map(d => d.reason), ['reflex would act on this phrase'])
})

test('export: a phrase logged as wanted and as not wanted is dropped both ways', async () => {
  const file = tmp()
  const result = await exportExamples([
    { kind: 'oracle', phrase: 'pásame el brand', verb: 'open', target: { type: 'path', value: '/code/brand' } },
    { kind: 'override', phrase: 'pásame el brand', verb: 'open', target: { type: 'folder', value: '/code/brand' }, step: 'model' },
  ], file, deps)
  assert.equal(result.summary.kept, 0)
  assert.equal(result.dropped.length, 2)
  assert.equal(readFileSync(file, 'utf8'), '')
})

test('target words: recorded words first, then a name of the target the phrase says', () => {
  assert.equal(targetWords({ phrase: 'x', words: 'mi brand', target: { value: '/a/b' } }), 'mi brand')
  assert.equal(targetWords({ phrase: 'abre el watchmen post', target: { type: 'path', value: '/c/watchmen-post.png' } }), 'watchmen post')
  assert.equal(targetWords({ phrase: 'abre notes', target: { type: 'path', value: '/c/notes.md' } }), 'notes')
  assert.equal(targetWords({ phrase: 'abre docs', target: { type: 'url', value: 'https://www.example.com/docs' } }), 'example')
})

test('export: every example carries where it came from; the summary lists misfired templates', async () => {
  const file = tmp()
  await exportExamples([
    { kind: 'oracle', phrase: 'pásame el brand', verb: 'open', target: { type: 'path', value: '/code/brand' } },
    { kind: 'accepted', phrase: 'enséñame reflex', verb: 'reveal', target: { type: 'folder', value: '/code/reflex' }, words: 'reflex' },
  ], file, deps)
  assert.deepEqual(lines(file).map(l => l.source), ['oracle', 'accepted'])
  const s = summarise([{ kind: 'override', phrase: 'abre brand', verb: 'open', target: { value: '/code/brand' }, step: 'template' }, { kind: 'override', phrase: 'x', step: 'model' }])
  assert.deepEqual(s.misfired, [{ phrase: 'abre brand', action: 'open /code/brand' }])
})

test('summary: counts by kind and the top passed phrases with their action', () => {
  const s = summarise([
    { kind: 'accepted', phrase: 'a' }, { kind: 'override', phrase: 'b' },
    { kind: 'oracle', phrase: 'pásame brand', verb: 'open', target: { value: '/code/brand' } },
    { kind: 'oracle', phrase: 'Pásame brand', verb: 'open', target: { value: '/code/brand' } },
    { kind: 'oracle', phrase: 'lanza figma', verb: 'open', target: { value: 'Figma' } },
  ])
  assert.deepEqual(s.kinds, { accepted: 1, override: 1, oracle: 3 })
  assert.deepEqual(s.passed, [
    { phrase: 'pásame brand', count: 2, action: 'open /code/brand' },
    { phrase: 'lanza figma', count: 1, action: 'open Figma' },
  ])
})
