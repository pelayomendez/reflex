import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { FRESH_MS, RECENT_CAP, callSucceeded, fitsKind, parseRecent, record, resolveDeictic, writtenPath } from '../src/context.mjs'
import { evaluate, fakeDeps } from '../src/eval.mjs'
import { plan } from '../src/plan.mjs'

const NOW = 1_800_000_000_000
const at = secondsAgo => NOW - secondsAgo * 1000
const entry = (path, secondsAgo) => ({ path, at: at(secondsAgo) })
const here = () => true
const resolve = (phrase, recent, isFile = here) => resolveDeictic(phrase, recent, { now: NOW, isFile })
const outcome = ({ status, action, reason }) => status === 'action' ? { status, verb: action.verb, value: action.target.value } : { status, reason }

test('recording: newest first, each path once, capped at 20, absolute paths only', () => {
  let list = []
  list = record(list, '/w/a.md', 1)
  list = record(list, '/w/b.md', 2)
  assert.deepEqual(list.map(e => e.path), ['/w/b.md', '/w/a.md'])
  // writing a again moves it to the front with the new time, without a second copy
  list = record(list, '/w/a.md', 3)
  assert.deepEqual(list, [{ path: '/w/a.md', at: 3 }, { path: '/w/b.md', at: 2 }])
  for (let n = 0; n < 30; n++) list = record(list, `/w/f${n}.md`, 10 + n)
  assert.equal(list.length, RECENT_CAP)
  assert.equal(RECENT_CAP, 20)
  assert.equal(list[0].path, '/w/f29.md')
  assert.equal(list.at(-1).path, '/w/f10.md')
  // not a path reflex could open later: ignored, the list is untouched
  assert.equal(record(list, 'relative/file.md', 99), list)
  assert.equal(record(list, '', 99), list)
  assert.equal(record(list, undefined, 99), list)
  assert.equal(record(list, '/w/evil‮.md', 99), list)
  assert.equal(record(list, '/w/x.md', NaN), list)
  assert.deepEqual(record(undefined, '/w/x.md', 5), [{ path: '/w/x.md', at: 5 }])
})

test('which tool call is a write: the path of Write, Edit and NotebookEdit, and only a call that went through', () => {
  assert.equal(writtenPath({ file_path: '/w/a.md', content: 'x' }), '/w/a.md')
  assert.equal(writtenPath({ notebook_path: '/w/n.ipynb' }), '/w/n.ipynb')
  assert.equal(writtenPath({ command: 'ls' }), undefined)
  assert.equal(writtenPath(undefined), undefined)
  assert.equal(callSucceeded({ ok: true }), true)
  assert.equal(callSucceeded(undefined), true)
  assert.equal(callSucceeded({ isError: true }), false)
  assert.equal(callSucceeded({ is_error: true }), false)
  assert.equal(callSucceeded({ error: 'file not found' }), false)
  assert.equal(callSucceeded({ deny: 'refused by a hook' }), false)
})

test('the list the hooks hand over is read defensively', () => {
  assert.deepEqual(parseRecent('[{"path":"/w/a.md","at":5},{"path":3},null,{"path":"/w/b.md","at":"x"}]'), [{ path: '/w/a.md', at: 5 }])
  assert.deepEqual(parseRecent('not json'), [])
  assert.deepEqual(parseRecent('{"path":"/w/a.md","at":5}'), [])
  assert.deepEqual(parseRecent(''), [])
})

test('kinds: a doc, an image, or anything', () => {
  for (const ext of ['md', 'txt', 'docx', 'pdf', 'rtf', 'html', 'PDF']) assert.equal(fitsKind('doc', `/w/a.${ext}`), true, ext)
  for (const ext of ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'PNG']) assert.equal(fitsKind('image', `/w/a.${ext}`), true, ext)
  for (const ext of ['png', 'json', 'csv', 'mjs']) assert.equal(fitsKind('doc', `/w/a.${ext}`), false, ext)
  for (const ext of ['md', 'pdf', 'json', 'tiff']) assert.equal(fitsKind('image', `/w/a.${ext}`), false, ext)
  assert.equal(fitsKind('any', '/w/anything.xyz'), true)
  assert.equal(fitsKind('doc', '/w/README'), false)
})

test('a deictic phrase opens the newest recent file of the kind it names', () => {
  const recent = [entry('/w/pic.png', 20), entry('/w/plan.md', 600), entry('/w/data.json', 900)]
  assert.deepEqual(outcome(resolve('abre ese doc', recent)), { status: 'action', verb: 'open', value: '/w/plan.md' })
  assert.deepEqual(outcome(resolve('abre esa imagen', recent)), { status: 'action', verb: 'open', value: '/w/pic.png' })
  assert.deepEqual(outcome(resolve('open that image', recent)), { status: 'action', verb: 'open', value: '/w/pic.png' })
  assert.deepEqual(outcome(resolve('ábrelo', recent)), { status: 'action', verb: 'open', value: '/w/pic.png' })
  assert.deepEqual(outcome(resolve('open the doc you made', recent)), { status: 'action', verb: 'open', value: '/w/plan.md' })
  // the verb is a reveal for "show", with or without the closing place
  assert.deepEqual(outcome(resolve('muéstramelo en el Finder', recent)), { status: 'action', verb: 'reveal', value: '/w/pic.png' })
  assert.deepEqual(outcome(resolve('show me that', recent)), { status: 'action', verb: 'reveal', value: '/w/pic.png' })
})

test('the list is read newest first by time, whatever order it arrives in', () => {
  const recent = [entry('/w/old.md', 900), entry('/w/new.md', 30)]
  assert.equal(resolve('ábrelo', recent).action.target.value, '/w/new.md')
})

test('staleness: 30 minutes is the edge, and a clock that disagrees is no evidence', () => {
  assert.equal(FRESH_MS, 30 * 60 * 1000)
  assert.equal(resolve('ábrelo', [entry('/w/a.md', 30 * 60)]).status, 'action')
  assert.equal(resolve('ábrelo', [entry('/w/a.md', 30 * 60 + 1)]).status, 'pass')
  assert.equal(resolve('ábrelo', [entry('/w/a.md', -5)]).status, 'pass')
})

test('a missing file passes, and an older file does not take its place', () => {
  const recent = [entry('/w/gone.md', 20), entry('/w/older.md', 900)]
  const got = resolve('abre ese doc', recent, path => path !== '/w/gone.md')
  assert.equal(got.status, 'pass')
  assert.match(got.reason, /no longer there/)
})

test('nothing of that kind passes', () => {
  assert.match(resolve('abre esa imagen', [entry('/w/a.md', 5)]).reason, /not .* image|none of the files/)
  assert.equal(resolve('abre ese doc', [entry('/w/a.csv', 5), entry('/w/b.png', 6)]).status, 'pass')
})

test('ambiguity: two fitting files written close together pass; an old or missing second does not block', () => {
  const same = [entry('/w/a.md', 30), entry('/w/b.md', 90)]
  const got = resolve('abre ese doc', same)
  assert.equal(got.status, 'pass')
  assert.match(got.reason, /more than one/)
  // a file that does not fit the kind is not the rival
  assert.equal(resolve('abre ese doc', [entry('/w/a.md', 30), entry('/w/b.png', 31)]).status, 'action')
  // the rival is an hour older, or stale, or gone
  assert.equal(resolve('abre ese doc', [entry('/w/a.md', 30), entry('/w/b.md', 3600)]).status, 'action')
  assert.equal(resolve('abre ese doc', [entry('/w/a.md', 30), entry('/w/b.md', 40)], path => path === '/w/a.md').status, 'action')
  // "it" fits anything: a doc and an image written together are two candidates
  assert.equal(resolve('ábrelo', [entry('/w/a.md', 30), entry('/w/b.png', 40)]).status, 'pass')
})

test('no list: a deictic phrase passes, with a reason; a phrase that is not deictic is not touched', () => {
  for (const recent of [undefined, [], 'x']) assert.equal(resolve('ábrelo', recent).status, 'pass')
  assert.match(resolve('open that doc', []).reason, /no files Claude wrote/)
  assert.equal(resolve('abre brand', [entry('/w/a.md', 5)]), undefined)
  assert.equal(resolve('open the roadmap', [entry('/w/a.md', 5)]), undefined)
  assert.equal(resolve('busca el roadmap y ábrelo', [entry('/w/a.md', 5)]), undefined)
})

test('the phrase must be wholly deictic: anything more passes', () => {
  const recent = [entry('/w/a.md', 5)]
  for (const phrase of ['abre ese doc de brand', 'ábrelo en el editor', 'open it with Preview', 'open that doc and delete it', 'show it in the browser', 'abre lo último de descargas', 'open it again now'])
    assert.equal(resolve(phrase, recent).status, 'pass', phrase)
  // a file really named like a deictic head is a different phrase: not caught
  assert.equal(resolve('open that.pdf', recent), undefined)
  assert.equal(resolve('open iterm', recent), undefined)
})

test('open never runs what it opens: a script or an app is shown in Finder at most', () => {
  for (const name of ['go.command', 'go.sh', 'go.py', 'Tool.app', 'a.dmg', 'noextension']) {
    assert.equal(resolve('ábrelo', [entry(`/w/${name}`, 5)]).status, 'pass', name)
    assert.equal(resolve('muéstramelo', [entry(`/w/${name}`, 5)]).status, 'action', name)
  }
})

test('through plan(): recorded files ground the phrase, and the model never sees it', async () => {
  let asked = 0
  const deps = { index: { folders: {}, apps: {}, shortcuts: [], files: ['/w/it.md'] }, config: { aliases: {}, model: { url: 'http://x', name: 'x' } }, zoxide: () => undefined, askModel: async () => { asked++; return { verb: 'open', target: 'it' } } }
  const got = await plan('ábrelo', { ...deps, recent: [entry('/w/plan.md', 5)], now: NOW, isFile: here })
  assert.deepEqual(outcome(got), { status: 'action', verb: 'open', value: '/w/plan.md' })
  assert.equal(got.step, 'template')
  // with no list, or a refusal, it is Claude's, never the model's, and never a file called "it"
  for (const extra of [{}, { recent: [] }, { recent: [entry('/w/plan.md', 99999)], now: NOW, isFile: here }]) {
    assert.equal((await plan('open it', { ...deps, ...extra })).status, 'pass')
    assert.equal((await plan('abre ese doc', { ...deps, ...extra })).status, 'pass')
  }
  assert.equal(asked, 0)
})

test('the CLI reads --recent, keeps no state, and runs nothing under --json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'reflex-context-'))
  const file = join(dir, 'made.md')
  writeFileSync(file, '# made')
  const cli = new URL('../src/cli.mjs', import.meta.url).pathname
  const run = (...args) => JSON.parse(execFileSync('node', [cli, '--json', ...args], { encoding: 'utf8' }))
  const recent = JSON.stringify([{ path: file, at: Date.now() - 5000 }])
  const got = run('--recent', recent, 'ábrelo')
  assert.deepEqual(outcome(got), { status: 'action', verb: 'open', value: file })
  assert.deepEqual(outcome(run('--recent', recent, 'open that doc')), { status: 'action', verb: 'open', value: file })
  // the next call without the list knows nothing
  assert.equal(run('ábrelo').status, 'pass')
  assert.equal(run('--recent', 'garbage', 'ábrelo').status, 'pass')
  assert.equal(run('--recent', JSON.stringify([{ path: join(dir, 'gone.md'), at: Date.now() }]), 'ábrelo').status, 'pass')
})

test('the context exam: every line answers as written, none wrong', async () => {
  const cases = readFileSync(new URL('./phrases/context.jsonl', import.meta.url), 'utf8').trim().split('\n').map(line => JSON.parse(line))
  assert.ok(cases.length >= 200)
  assert.ok(cases.every(c => Array.isArray(c.recent)), 'each line carries recent')
  // The exam's own world, as `reflex eval` builds it: the fixture's folders, aliases and repos (a project's website reads them).
  const fixture = JSON.parse(readFileSync(new URL('./phrases/fixture.json', import.meta.url), 'utf8'))
  const { results, summary } = await evaluate(cases, { index: fixture.index, config: { ...fixture.config, model: {} }, env: {}, ...fakeDeps(fixture.fs) })
  assert.deepEqual(results.filter(r => r.outcome === 'wrong' || r.outcome === 'missed').map(r => r.phrase), [])
  assert.equal(summary.wrong, 0)
  assert.equal(summary.missed, 0)
})

test('the hook records writes by Write, Edit and NotebookEdit, never a Read', () => {
  const source = readFileSync(new URL('../hooks/register.tsx', import.meta.url), 'utf8')
  const listed = source.match(/for \(const tool of \[([^\]]+)\]/)?.[1].split(',').map(name => name.trim().replace(/'/g, ''))
  assert.deepEqual(listed, ['Write', 'Edit', 'NotebookEdit'])
  // and it asks the CLI with the list only when there is one
  assert.match(source, /list\.length \? \['--recent'/)
})

test('html and svg are shown in Finder, never opened: the OPENABLE policy decides, not a list of this file', () => {
  for (const name of ['page.html', 'logo.svg', 'data.json', 'conf.yaml']) {
    assert.equal(resolve('abre ese archivo', [entry(`/w/${name}`, 5)]).status, 'pass', name)
    assert.equal(resolve('muéstramelo', [entry(`/w/${name}`, 5)]).status, 'action', name)
  }
  assert.equal(resolve('abre ese doc', [entry('/w/page.html', 5)]).status, 'pass')
  assert.equal(resolve('abre esa imagen', [entry('/w/logo.svg', 5)]).status, 'pass')
  assert.equal(resolve('open that image', [entry('/w/logo.png', 5)]).status, 'action')
  assert.equal(resolve('open that doc', [entry('/w/a.pdf', 5)]).status, 'action')
})

test('punctuation does not take a phrase out of the template', () => {
  const recent = [entry('/w/a.md', 5)]
  for (const phrase of ['open it, please', 'open it.', 'open it!', 'ábrelo, por favor', 'abre ese doc, porfa', 'open that doc;', 'show it, please'])
    assert.equal(resolve(phrase, recent).status, 'action', phrase)
  assert.equal(resolve('open it, and delete it', recent).status, 'pass')
  assert.equal(resolve('open that.pdf', recent), undefined)
})

test('a phrase whose target is only a deictic word is deictic: reveal it, show me it, open this, abre eso', () => {
  const recent = [entry('/w/a.md', 5)]
  const verbOf = phrase => resolve(phrase, recent)
  for (const [phrase, verb] of [['reveal it', 'reveal'], ['show me it', 'reveal'], ['show me this', 'reveal'], ['reveal that', 'reveal'], ['open this', 'open'], ['abre eso', 'open'], ['abre esto', 'open'], ['muéstrame eso', 'reveal'], ['muestra eso', 'reveal']]) {
    assert.equal(verbOf(phrase).status, 'action', phrase)
    assert.equal(verbOf(phrase).action.verb, verb, phrase)
    // without a list it is Claude's, never a name
    assert.equal(resolve(phrase, []).status, 'pass', phrase)
  }
})

test('through plan(): a deictic phrase never reaches a folder called like it', async () => {
  const deps = { index: { folders: { entities: '/w/entities', 'it-tools': '/w/it-tools' }, apps: {}, shortcuts: [], files: ['/w/it.md'] }, config: { aliases: {}, model: {} }, zoxide: () => '/w/entities' }
  for (const phrase of ['open it, please', 'reveal it', 'show me it', 'open this', 'abre eso', 'muéstrame eso', 'open it.', 'ábrelo, por favor'])
    assert.equal((await plan(phrase, deps)).status, 'pass', phrase)
})

test('parseRecent applies the checks of record(): absolute paths, no control characters', () => {
  const text = JSON.stringify([{ path: '/w/a.md', at: 1 }, { path: 'rel/b.md', at: 2 }, { path: '../c.md', at: 3 }, { path: '/w/d\u0007.md', at: 4 }, { path: '/w/e\u202e.md', at: 5 }, { path: '', at: 6 }])
  assert.deepEqual(parseRecent(text), [{ path: '/w/a.md', at: 1 }])
})
