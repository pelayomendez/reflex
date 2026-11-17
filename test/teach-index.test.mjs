import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { readIndexFile } from '../src/index.mjs'
import { examPhrases, teach } from '../src/teach.mjs'

// --index: teach from someone else's (invented) index, so a public model never sees this Mac's names.
const other = {
  folders: { zorvak: '/Users/dana/code/zorvak', 'mi-tienda': '/Users/dana/code/mi-tienda' },
  apps: { kiwi: '/Applications/Kiwi.app' },
  shortcuts: ['Cena lista'],
  files: ['/Users/dana/code/zorvak/notas-q3.md'],
}
const tmp = () => mkdtempSync(join(tmpdir(), 'reflex-teach-index-'))
const writeIndex = (value = other) => { const file = join(tmp(), 'index.json'); writeFileSync(file, JSON.stringify(value)); return file }
const call = (name, target) => ({ name, arguments: { target } })

test('readIndexFile reads the shape loadIndex() returns and rejects anything else', () => {
  assert.deepEqual(readIndexFile(writeIndex()), other)
  assert.throws(() => readIndexFile(writeIndex({ folders: {}, apps: {} })), /not an index/)
  assert.throws(() => readIndexFile(join(tmp(), 'missing.json')), /cannot read/)
  const bad = join(tmp(), 'bad.json')
  writeFileSync(bad, 'nope')
  assert.throws(() => readIndexFile(bad), /not JSON/)
})

test('teach --index: the prompts carry the given index', async () => {
  const prompts = []
  await teach({ count: 5, out: tmp(), indexFile: writeIndex() }, { heldout: [], teacher: async prompt => { prompts.push(prompt); return '[]' } })
  assert.equal(prompts.length, 1)
  assert.match(prompts[0], /Folders: .*zorvak/)
  assert.match(prompts[0], /Folders: .*mi-tienda/)
  assert.match(prompts[0], /Shortcuts: Cena lista/)
  assert.match(prompts[0], /Files: notas-q3\.md/)
})

test('teach --index: targets ground in that index only, and this Mac aliases do not count', async () => {
  const config = join(tmp(), 'config.toml')
  writeFileSync(config, '[aliases]\nmigithub = "/Users/someone/real-private-repo"\n')
  const previous = process.env.REFLEX_CONFIG
  process.env.REFLEX_CONFIG = config
  try {
    const reply = JSON.stringify([
      { phrase: 'abre zorvak', lang: 'es', call: call('open', 'zorvak') },
      { phrase: 'abre migithub', lang: 'es', call: call('open', 'migithub') },
      { phrase: 'open brand', lang: 'en', call: call('open', 'brand') },
    ])
    const out = tmp()
    const result = await teach({ count: 5, out, indexFile: writeIndex() }, { heldout: [], teacher: async () => reply })
    assert.equal(result.summary.kept, 1)
    assert.deepEqual(result.dropped.map(d => d.reason), ['target does not ground in the index', 'target does not ground in the index'])
    const written = readFileSync(join(out, 'train.jsonl'), 'utf8') + readFileSync(join(out, 'valid.jsonl'), 'utf8')
    assert.match(written, /zorvak/)
    assert.doesNotMatch(written, /migithub|brand/)
  } finally {
    if (previous === undefined) delete process.env.REFLEX_CONFIG
    else process.env.REFLEX_CONFIG = previous
  }
})

test('teach --index still drops every exam phrase, foreign ones included', async () => {
  const exam = examPhrases().find(phrase => /^abre \S+$/i.test(phrase))
  assert.ok(exam)
  const target = exam.replace(/^abre /i, '')
  const index = { ...other, folders: { ...other.folders, [target]: `/Users/dana/${target}` } }
  const reply = JSON.stringify([{ phrase: exam, lang: 'es', call: call('open', target) }, { phrase: 'abre zorvak', lang: 'es', call: call('open', 'zorvak') }])
  const result = await teach({ count: 5, out: tmp(), indexFile: writeIndex(index) }, { teacher: async () => reply })
  assert.equal(result.summary.kept, 1)
  assert.deepEqual(result.dropped.map(d => d.reason), ['held-out phrase'])
})

test('the CLI: teach --index needs a readable index, and --print-prompt uses it', () => {
  const cli = args => spawnSync('node', [new URL('../src/cli.mjs', import.meta.url).pathname, 'teach', ...args], { encoding: 'utf8' })
  const missing = cli(['--index', join(tmp(), 'nope.json'), '--print-prompt'])
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /cannot read/)
  assert.equal(cli(['--index']).status, 2)
  const shown = cli(['--index', writeIndex(), '--print-prompt', '--count', '10'])
  assert.equal(shown.status, 0)
  assert.match(shown.stdout, /Folders: .*zorvak/)
})
