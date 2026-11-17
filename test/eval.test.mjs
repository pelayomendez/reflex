import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { evaluate, percentile } from '../src/eval.mjs'

const fixture = JSON.parse(readFileSync(new URL('./phrases/fixture.json', import.meta.url), 'utf8'))
const withModel = askModel => ({ ...fixture, zoxide: () => undefined, config: { ...fixture.config, model: { url: 'http://x', name: 'm' } }, askModel })
const noModel = withModel(undefined)
const act = (verb, value) => ({ status: 'action', verb, value })
const run = (cases, deps = noModel) => evaluate(cases.map(([phrase, expect]) => ({ phrase, expect, tags: [] })), deps)
const outcomes = report => report.results.map(r => r.outcome)

test('classifies right, wrong, missed and passed', async () => {
  const report = await run([
    ['abre brand', act('open', '/code/brand')],       // right
    ['abre brand', act('open', '/code/reflex')],      // wrong: acted on another target
    ['abre brand', act('reveal', '/code/brand')],     // wrong: another verb
    ['¿me abres brand?', act('open', '/code/brand')], // missed: no model, the template passes
    ['no abras brand', { status: 'pass' }],           // passed
    ['abre brand', { status: 'pass' }],               // wrong: acted when it should have gone to Claude
    ['abre el README', { status: 'choose' }],         // right: asks which one
    ['abre brand', { status: 'choose' }],             // wrong: acted without asking
  ])
  assert.deepEqual(outcomes(report), ['right', 'wrong', 'wrong', 'missed', 'passed', 'wrong', 'right', 'wrong'])
  assert.deepEqual({ ...report.summary, byStep: undefined, p50: undefined, p95: undefined }, { total: 8, right: 2, wrong: 4, missed: 1, passed: 1, byStep: undefined, p50: undefined, p95: undefined })
})

test('splits the totals by the step that answered', async () => {
  const report = await run([
    ['abre brand', act('open', '/code/brand')],
    ['¿me abres brand?', act('open', '/code/brand')],
    ['¿me abres figma?', act('open', '/code/brand')],
    ['qué hora es', { status: 'pass' }],
  ], withModel(async phrase => ({ verb: 'open', target: phrase.includes('figma') ? 'figma' : 'brand' })))
  assert.deepEqual(outcomes(report), ['right', 'right', 'wrong', 'passed'])
  assert.deepEqual(report.summary.byStep.template, { right: 1, wrong: 0, missed: 0, passed: 0 })
  assert.deepEqual(report.summary.byStep.model, { right: 1, wrong: 1, missed: 0, passed: 0 })
  assert.deepEqual(report.summary.byStep.claude, { right: 0, wrong: 0, missed: 0, passed: 1 })
})

test('the model is only asked when the config has one, and cannot invent a target', async () => {
  let asked = 0
  const invent = async () => { asked++; return { verb: 'open', target: 'nowhere' } }
  const report = await run([['¿me abres nowhere?', { status: 'pass' }]], withModel(invent))
  assert.equal(asked, 1)
  assert.deepEqual(outcomes(report), ['passed'])
  asked = 0
  await run([['¿me abres brand?', act('open', '/code/brand')]], { ...withModel(invent), config: { ...fixture.config, model: {} } })
  assert.equal(asked, 0)
})

test('reports latency percentiles', async () => {
  const report = await run([['abre brand', act('open', '/code/brand')], ['no abras brand', { status: 'pass' }]])
  assert.ok(report.summary.p50 >= 0 && report.summary.p95 >= report.summary.p50)
  const times = report.results.map(r => r.ms).sort((a, b) => a - b)
  assert.equal(report.summary.p50, percentile(times, 50))
  assert.equal(report.summary.p95, percentile(times, 95))
  assert.ok(report.results.every(r => typeof r.ms === 'number'))
})

test('the held-out set is well formed and big enough', () => {
  const cases = readFileSync(new URL('./phrases/heldout.jsonl', import.meta.url), 'utf8').trim().split('\n').map(line => JSON.parse(line))
  assert.ok(cases.length >= 120)
  for (const c of cases) {
    assert.equal(typeof c.phrase, 'string')
    assert.ok(['action', 'choose', 'pass'].includes(c.expect.status), c.phrase)
    if (c.expect.status === 'action') assert.ok(c.expect.verb && c.expect.value, c.phrase)
    assert.ok(Array.isArray(c.tags) && c.tags.length, c.phrase)
  }
  assert.equal(new Set(cases.map(c => c.phrase)).size, cases.length)
})

test('choose: a question when a pass was expected is wrong, when an action was expected it is missed', async () => {
  const report = await run([
    ['abre el README', { status: 'pass' }],
    ['abre el README', act('open', '/code/reflex/README.md')],
  ])
  assert.deepEqual(outcomes(report), ['wrong', 'missed'])
  assert.equal(report.summary.byStep.template.wrong, 1)
  assert.equal(report.summary.byStep.template.missed, 1)
})

test('percentile picks the nearest rank', () => {
  const hundred = Array.from({ length: 100 }, (_, i) => i + 1)
  assert.equal(percentile(hundred, 50), 50)
  assert.equal(percentile(hundred, 95), 95)
  assert.equal(percentile([10, 20, 30, 40, 50], 50), 30)
  assert.equal(percentile([10, 20, 30, 40, 50], 95), 50)
  assert.equal(percentile([7], 95), 7)
  assert.equal(percentile([], 50), 0)
})

const cli = (args, { config, input } = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'reflex-eval-'))
  const file = join(dir, 'cases.jsonl')
  if (input !== undefined) writeFileSync(file, input)
  const env = { ...process.env, REFLEX_CONFIG: config ?? join(dir, 'none.toml') }
  const run = spawnSync(process.execPath, [new URL('../src/cli.mjs', import.meta.url).pathname, 'eval', ...args.map(a => a === '$FILE' ? file : a)], { encoding: 'utf8', env, timeout: 20000 })
  return { ...run, dir }
}
const line = (phrase, expect) => JSON.stringify({ phrase, expect, tags: ['t'] })

test('reflex eval exits 1 on a wrong action and 0 otherwise, and --json parses', () => {
  const good = cli(['$FILE'], { input: line('abre brand', act('open', '/code/brand')) + '\n' })
  assert.equal(good.status, 0, good.stderr)
  const bad = cli(['--json', '$FILE'], { input: line('abre brand', act('open', '/code/nowhere')) + '\n' })
  assert.equal(bad.status, 1)
  const parsed = JSON.parse(bad.stdout)
  assert.equal(parsed.summary.wrong, 1)
  assert.equal(parsed.results[0].outcome, 'wrong')
})

test('reflex eval --model with no model configured exits 2', () => {
  const { status, stderr } = cli(['--model', '$FILE'], { input: line('abre brand', act('open', '/code/brand')) + '\n' })
  assert.equal(status, 2)
  assert.match(stderr, /^reflex eval: /)
})

test('reflex eval turns bad input into one line and exit 2', () => {
  const cases = {
    'missing file': undefined,
    'blank line': line('abre brand', act('open', '/code/brand')) + '\n\n' + line('qué hora es', { status: 'pass' }) + '\n',
    'no expect': JSON.stringify({ phrase: 'abre brand', tags: [] }) + '\n',
    'not json': 'abre brand\n',
  }
  for (const [name, input] of Object.entries(cases)) {
    const { status, stderr } = cli(['$FILE'], { input })
    assert.equal(status, 2, name)
    assert.match(stderr, /^reflex eval: [^\n]+\n$/, name)
  }
})

test('an unreachable model counts as passes and does not crash', () => {
  const dir = mkdtempSync(join(tmpdir(), 'reflex-eval-'))
  const config = join(dir, 'c.toml')
  writeFileSync(config, '[model]\nurl = "http://127.0.0.1:1/v1"\nname = "x"\n')
  const { status, stdout } = cli(['--model', '--json', '$FILE'], { config, input: line('¿me abres brand?', act('open', '/code/brand')) + '\n' })
  assert.equal(status, 0)
  assert.equal(JSON.parse(stdout).results[0].outcome, 'missed')
})

test('reflex eval leaves cases tagged quoted out of the score, unless --quoted', () => {
  const input = [JSON.stringify({ phrase: 'abre brand', expect: act('open', '/code/brand'), tags: ['t'] }),
    JSON.stringify({ phrase: "copy 'x' to the clipboard", expect: act('copy', 'x'), tags: ['t', 'quoted'] })].join('\n') + '\n'
  assert.equal(JSON.parse(cli(['--json', '$FILE'], { input }).stdout).summary.total, 1)
  assert.equal(JSON.parse(cli(['--json', '--quoted', '$FILE'], { input }).stdout).summary.total, 2)
})

const foreignIndex = (extra = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'reflex-index-'))
  const path = join(dir, 'index.json')
  writeFileSync(path, JSON.stringify({ builtAt: 0, folders: { tangerine: '/Users/alex/code/tangerine' }, apps: {}, shortcuts: [], files: [], ...extra }))
  return path
}

test('reflex eval --index scores against that index instead of the fixture, and drops the fixture aliases', () => {
  const input = [line('abre tangerine', act('open', '/Users/alex/code/tangerine')), line('abre brand', { status: 'pass' })].join('\n') + '\n'
  const foreign = cli(['--json', '--index', foreignIndex(), '$FILE'], { input })
  assert.equal(foreign.status, 0, foreign.stderr)
  assert.deepEqual(JSON.parse(foreign.stdout).results.map(r => r.outcome), ['right', 'passed'])
  const own = cli(['--json', '$FILE'], { input })
  assert.deepEqual(JSON.parse(own.stdout).results.map(r => r.outcome), ['missed', 'wrong'])
  const alias = cli(['--json', '--index', foreignIndex(), '$FILE'], { input: line('abre mi github', { status: 'pass' }) + '\n' })
  assert.equal(JSON.parse(alias.stdout).summary.passed, 1)
})

test('the foreign-index exam is well formed and the templates alone never act wrongly on it', async () => {
  const dir = new URL('./phrases/foreign/', import.meta.url)
  const index = JSON.parse(readFileSync(new URL('index.json', dir), 'utf8'))
  const cases = readFileSync(new URL('phrases.jsonl', dir), 'utf8').trim().split('\n').map(text => JSON.parse(text))
  assert.ok(cases.length >= 150)
  assert.equal(new Set(cases.map(c => c.phrase)).size, cases.length)
  assert.ok(Object.keys(index.folders).length >= 25 && Object.keys(index.apps).length >= 20 && index.files.length >= 60 && index.shortcuts.length >= 3)
  const report = await evaluate(cases, { index, config: { aliases: {}, model: {} }, env: {}, zoxide: () => undefined })
  assert.equal(report.summary.wrong, 0, report.results.filter(r => r.outcome === 'wrong').map(r => r.phrase).join('; '))
})

test('reflex eval --index turns an unreadable or malformed index into one line and exit 2', () => {
  const dir = mkdtempSync(join(tmpdir(), 'reflex-index-'))
  const bad = join(dir, 'bad.json')
  writeFileSync(bad, '{"folders": 3}')
  for (const path of [join(dir, 'missing.json'), bad]) {
    const { status, stderr } = cli(['--index', path, '$FILE'], { input: line('abre brand', act('open', '/code/brand')) + '\n' })
    assert.equal(status, 2)
    assert.match(stderr, /^reflex eval: [^\n]+\n$/)
  }
  assert.equal(cli(['--index'], { input: '' }).status, 2)
})
