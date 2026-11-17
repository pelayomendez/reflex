import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEVELOPER_LINE, toolsFor } from '../src/catalogue.mjs'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalise, placeVerb } from '../src/phrase.mjs'
import { PUT, REQUEST, REQUEST_FORMS } from '../src/plan.mjs'
import { CLAUDE_ARGS, FOCUSES, batchPlan, buildExamples, buildPrompt, examPhrases, indexNames, parseTeacherOutput, runClaude, teach } from '../src/teach.mjs'

const index = {
  folders: { brand: '/code/brand', reflex: '/code/reflex', descargas: '/Users/me/Downloads' },
  apps: { figma: '/Applications/Figma.app' },
  shortcuts: ['Modo foco'],
  files: ['/code/reflex/docs/design.md', '/code/brand/cards/watchmen-post.png', '/code/brand/posts/2026-11-06-watchmen.md'],
}
const config = { aliases: {}, model: {} }
const base = { index, config, heldout: ['abre la carpeta de descargas'], zoxide: () => undefined }
const call = (name, target) => ({ name, arguments: { target } })
const build = async (examples, deps = {}) => buildExamples(JSON.stringify(examples), { ...base, ...deps })
const reasons = result => result.dropped.map(d => d.reason)

test('writes mlx-lm chat lines: developer line, arguments as an object, the catalogue', async () => {
  const { lines } = await build([{ phrase: '¿me abres brand?', lang: 'es', call: call('open', 'brand') }])
  assert.equal(lines.length, 1)
  assert.deepEqual(lines[0], {
    messages: [
      { role: 'developer', content: 'You can do function calling with the following functions:' },
      { role: 'user', content: '¿me abres brand?' },
      { role: 'assistant', tool_calls: [{ type: 'function', function: { name: 'open', arguments: { target: 'brand' } } }] },
    ],
    tools: toolsFor(),
  })
  assert.equal(lines[0].messages[0].content, DEVELOPER_LINE)
})

test('a negative ends with the content "-"', async () => {
  const { lines } = await build([{ phrase: 'no abras brand', lang: 'es', call: null }])
  assert.deepEqual(lines[0].messages.at(-1), { role: 'assistant', content: '-' })
})

test('drops a call whose target does not ground, unless it is an invented-name exercise', async () => {
  const result = await build([
    { phrase: 'abre zorgblat', lang: 'es', call: call('open', 'zorgblat') },
    { phrase: 'abre zorgblat otra vez', lang: 'es', call: call('open', 'zorgblat'), invented: true },
    { phrase: 'ejecuta modo foco', lang: 'es', call: call('shortcut', 'modo foco') },
  ])
  assert.deepEqual(result.lines.map(l => l.messages[1].content), ['abre zorgblat otra vez', 'ejecuta modo foco'])
  assert.equal(result.dropped.length, 1)
  assert.equal(result.dropped[0].phrase, 'abre zorgblat')
  assert.match(result.dropped[0].reason, /does not ground/)
})

test('drops held-out phrases (ignoring case and accents) and duplicates', async () => {
  const result = await build([
    { phrase: 'Abre la carpeta de DESCARGAS', lang: 'es', call: call('open', 'descargas') },
    { phrase: 'abre brand', lang: 'es', call: call('open', 'brand') },
    { phrase: 'Ábre brand', lang: 'es', call: call('open', 'brand') },
  ])
  assert.equal(result.lines.length, 1)
  assert.deepEqual(reasons(result), ['held-out phrase', 'duplicate'])
})

test('drops malformed examples with a reason', async () => {
  const result = await build([
    { phrase: 'borra brand', call: call('delete', 'brand') },
    { phrase: 'abre', call: { name: 'open', arguments: {} } },
    { call: call('open', 'brand') },
    'abre brand',
  ])
  assert.equal(result.lines.length, 0)
  assert.deepEqual(reasons(result), ['unknown verb "delete"', 'call has no target', 'no phrase', 'not an object'])
})

test('reads the answer out of a code fence and prose; rejects text with no list', async () => {
  const fenced = 'Here you go:\n```json\n' + JSON.stringify([{ phrase: 'abre brand', lang: 'es', call: call('open', 'brand') }]) + '\n```'
  assert.equal((await buildExamples(fenced, base)).lines.length, 1)
  await assert.rejects(buildExamples('sorry, I cannot', base), /no JSON list/)
})

test('splits 90/10 and counts kept, dropped, verbs and languages', async () => {
  const examples = Array.from({ length: 20 }, (_, i) => ({ phrase: `abre brand, número ${i}`, lang: i % 2 ? 'en' : 'es', call: call('open', 'brand') }))
  examples.push({ phrase: 'no abras brand', lang: 'es', call: null }, { phrase: 'abre zorgblat', lang: 'es', call: call('open', 'zorgblat') })
  const result = await build(examples)
  // All 20 name brand, so all stay; plus the negative.
  assert.equal(result.train.length + result.valid.length, 21)
  assert.equal(result.valid.length, 2)
  assert.deepEqual(result.summary, { kept: 21, dropped: 1, dropReasons: { 'target does not ground in the index': 1 }, verbs: { open: 20, pass: 1 }, languages: { es: 11, en: 10 }, invented: 0, negatives: 1, shareInvented: 0, shareNegative: 0.05 })
  // The validation lines are spread through the list: the 6th and the 16th kept example.
  assert.deepEqual(result.valid.map(l => l.messages[1].content), ['abre brand, número 5', 'abre brand, número 15'])
  assert.ok(!result.train.some(l => result.valid.includes(l)))
})

test('the target must be words copied from the phrase', async () => {
  const result = await build([
    { phrase: 'llévame al repo de marca', lang: 'es', call: call('open', 'brand') },
    { phrase: 'ejecuta Modo foco, por favor', lang: 'es', call: call('shortcut', 'modo foco') },
    { phrase: 'Open Brand.', lang: 'en', call: call('open', 'BRAND') },
    { phrase: 'abre zorgblat', lang: 'es', call: call('open', 'blorg'), invented: true },
  ])
  assert.deepEqual(result.lines.map(l => l.messages[1].content), ['ejecuta Modo foco, por favor', 'Open Brand.'])
  assert.deepEqual(reasons(result), ['target is not copied from the phrase', 'target is not copied from the phrase'])
})

test('rejects targets that are paths', async () => {
  const result = await build([
    { phrase: 'abre /code/brand', call: call('open', '/code/brand') },
    { phrase: 'abre ~/brand', call: call('open', '~/brand') },
    { phrase: 'abre code/brand', call: call('open', 'code/brand'), invented: true },
  ])
  assert.equal(result.lines.length, 0)
  assert.deepEqual(reasons(result), ['target looks like a path', 'target looks like a path', 'target looks like a path'])
})

test('drops a negative that reflex itself would act on', async () => {
  const result = await build([
    { phrase: 'abre brand', lang: 'es', call: null },
    { phrase: 'abre la carpeta de brand', lang: 'es', call: null },
    { phrase: 'abre brand y arregla el bug', lang: 'es', call: null },
    { phrase: 'no abras brand', lang: 'es', call: null },
    { phrase: 'abre el post de watchmen', lang: 'es', call: null },
  ])
  assert.deepEqual(result.lines.map(l => l.messages[1].content), ['abre brand y arregla el bug', 'no abras brand'])
  assert.deepEqual(reasons(result), ['reflex would act on this phrase', 'reflex would act on this phrase', 'reflex would ask "which one?" about this phrase'])
})

test('trims the phrase and the target, and counts a trimmed duplicate', async () => {
  const result = await build([
    { phrase: '  abre brand  ', lang: 'es', call: call('open', '  brand ') },
    { phrase: 'abre brand', lang: 'es', call: call('open', 'brand') },
  ])
  assert.equal(result.lines[0].messages[1].content, 'abre brand')
  assert.deepEqual(result.lines[0].messages[2].tool_calls[0].function.arguments, { target: 'brand' })
  assert.deepEqual(reasons(result), ['duplicate'])
})

test('the summary reports the share of invented examples and of negatives', async () => {
  const result = await build([
    { phrase: 'abre brand', lang: 'es', call: call('open', 'brand') },
    { phrase: 'abre zorgblat', lang: 'es', call: call('open', 'zorgblat'), invented: true },
    { phrase: 'no abras brand', lang: 'es', call: null },
    { phrase: 'explícame esto', lang: 'es', call: null },
  ])
  assert.equal(result.summary.invented, 1)
  assert.equal(result.summary.negatives, 2)
  assert.equal(result.summary.shareInvented, 0.25)
  assert.equal(result.summary.shareNegative, 0.5)
})

const bigIndex = {
  folders: Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`folder${i}`, `/code/folder${i}`])),
  apps: { 'app/odd': '/Applications/odd.app', figma: '/Applications/Figma.app' },
  shortcuts: ['Modo foco', 'a/b'],
  files: ['/Users/me/Documents/secret-plans.pdf', '/code/brand/cards/watchmen-post.png'],
}

test('the prompt sends names only: no path, no name with a slash', () => {
  const prompt = buildPrompt(bigIndex, { count: 45 })
  for (const line of prompt.split('\n').filter(l => /^(Folders|Apps|Shortcuts|Files):/.test(l))) assert.ok(!line.includes('/'), line)
  assert.ok(!prompt.includes('/Users') && !prompt.includes('/code') && !prompt.includes('Applications'))
  assert.ok(prompt.includes('secret-plans.pdf') && prompt.includes('watchmen-post.png'))
  assert.ok(!indexNames(bigIndex).apps.includes('app/odd'))
})

test('the prompt asks for words copied from the phrase and has no names-that-do-not-exist negatives', () => {
  const prompt = buildPrompt(bigIndex, { count: 45 })
  assert.match(prompt, /always words copied from the phrase/)
  assert.ok(!/invoice/i.test(prompt))
  assert.ok(!/do not exist/i.test(prompt))
})

test('each focus is stated in the prompt', () => {
  assert.match(buildPrompt(bigIndex, { count: 45, focus: { kind: 'verb', value: 'reveal' } }), /Focus of this batch: the "reveal" tool/)
  assert.match(buildPrompt(bigIndex, { count: 45, focus: { kind: 'language', value: 'en' } }), /Focus of this batch: English/)
  assert.match(buildPrompt(bigIndex, { count: 45, focus: { kind: 'negatives' } }), /Focus of this batch: negatives only/)
  assert.match(buildPrompt(bigIndex, { count: 45, focus: { kind: 'invented' } }), /Focus of this batch: invented names only/)
})

const tmp = () => mkdtempSync(join(tmpdir(), 'reflex-teach-'))
const replyFor = n => JSON.stringify(Array.from({ length: 3 }, (_, i) => ({ phrase: `abre brand ahora ${n} ${i}`, lang: 'es', call: call('open', 'brand') })))

test('teach batches the teacher, sums to the count and writes train and valid', async () => {
  const out = tmp(), prompts = []
  const result = await teach({ count: 100, out }, { ...base, index, teacher: async prompt => { prompts.push(prompt); return replyFor(prompts.length) } })
  assert.equal(prompts.length, 3)
  const asked = prompts.map(p => Number(p.match(/Write (\d+) examples/)[1]))
  assert.equal(asked.reduce((a, b) => a + b), 100)
  assert.ok(asked.every(n => n >= 33 && n <= 34))
  assert.equal(new Set(prompts.map(p => p.match(/Focus of this batch: [^\n]*/)[0])).size, 3)
  assert.equal(result.summary.kept, 9)
  const read = name => readFileSync(join(out, name), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  assert.equal(read('train.jsonl').length, 8)
  assert.equal(read('valid.jsonl').length, 1)
})

test('teach with a single kept example leaves valid.jsonl empty', async () => {
  const out = tmp()
  await teach({ count: 5, out }, { ...base, index, teacher: async () => JSON.stringify([{ phrase: 'abre brand', lang: 'es', call: call('open', 'brand') }]) })
  assert.equal(readFileSync(join(out, 'valid.jsonl'), 'utf8'), '')
  assert.equal(readFileSync(join(out, 'train.jsonl'), 'utf8').split('\n').filter(Boolean).length, 1)
})

test('a failed batch loses only itself: raw reply saved, complete items salvaged', async () => {
  const out = tmp()
  const replies = [
    replyFor(1),
    '[{"phrase":"abre figma","lang":"es","call":{"name":"open","arguments":{"target":"figma"}}},{"phrase":"abre sla',
    'sorry, I cannot help',
  ]
  const result = await teach({ count: 100, out }, { ...base, index, teacher: async () => replies.shift() })
  assert.equal(result.summary.kept, 4)
  assert.deepEqual(result.summary.batches, { ok: 1, salvaged: 1, failed: 1 })
  const raws = readdirSync(out).filter(name => name.startsWith('teacher-reply-'))
  assert.equal(raws.length, 2)
})

test('a teacher that throws loses only its batch', async () => {
  const out = tmp(); let calls = 0
  const result = await teach({ count: 100, out }, { ...base, index, teacher: async () => { if (++calls === 2) throw new Error('timeout'); return replyFor(calls) } })
  assert.equal(result.summary.kept, 6)
  assert.equal(result.summary.batches.failed, 1)
})

test('a target that only partly overlaps the phrase is rejected', async () => {
  const result = await build([{ phrase: 'abre brand', lang: 'es', call: call('open', 'brand informe') }])
  assert.equal(result.lines.length, 0)
  assert.deepEqual(reasons(result), ['target is not copied from the phrase'])
})

test('a ~/ target is dropped as a path', async () => {
  const result = await build([{ phrase: 'abre ~/x', call: call('open', '~/x') }])
  assert.deepEqual(reasons(result), ['target looks like a path'])
})

test('salvage keeps complete items whose text holds } and an escaped quote', () => {
  const cut = '[{"phrase":"abre brand } \\"ya\\"","lang":"es","call":{"name":"open","arguments":{"target":"brand"}}},{"phrase":"abre fig'
  const { items, complete } = parseTeacherOutput(cut)
  assert.equal(complete, false)
  assert.deepEqual(items.map(i => i.phrase), ['abre brand } "ya"'])
})

test('the negative check never asks a configured model', async () => {
  const real = globalThis.fetch
  let asked = 0
  globalThis.fetch = async () => { asked++; return { ok: true, json: async () => ({ choices: [{ message: { tool_calls: [{ function: { name: 'open', arguments: { target: 'brand' } } }] } }] }) } }
  try {
    const result = await build([{ phrase: '¿me abres brand?', lang: 'es', call: null }], { config: { aliases: {}, model: { url: 'http://x/v1', name: 'm' } } })
    assert.equal(asked, 0)
    assert.equal(result.lines.length, 1)
  } finally { globalThis.fetch = real }
})

test('the teacher runs without tools or MCP and gets the prompt on stdin, not argv', async () => {
  assert.deepEqual(CLAUDE_ARGS.slice(0, 3), ['-p', '--tools', ''])
  assert.ok(CLAUDE_ARGS.includes('--strict-mcp-config'))
  const dir = tmp(), bin = join(dir, 'claude')
  writeFileSync(bin, `#!/bin/sh\nprintf '%s\\n' "$@" > ${dir}/args\ncat > ${dir}/stdin\necho '[]'\n`)
  chmodSync(bin, 0o755)
  await runClaude('PROMPT-TEXT-123', { bin })
  assert.equal(readFileSync(join(dir, 'stdin'), 'utf8'), 'PROMPT-TEXT-123')
  assert.ok(!readFileSync(join(dir, 'args'), 'utf8').includes('PROMPT-TEXT-123'))
  assert.deepEqual(readFileSync(join(dir, 'args'), 'utf8').split('\n').slice(0, 3), CLAUDE_ARGS.slice(0, 3))
})

test('a run that keeps nothing leaves the existing training files alone', async () => {
  const out = tmp()
  writeFileSync(join(out, 'train.jsonl'), 'OLD-TRAIN\n')
  writeFileSync(join(out, 'valid.jsonl'), 'OLD-VALID\n')
  const result = await teach({ count: 100, out }, { ...base, index, teacher: async () => { throw new Error('timeout') } })
  assert.equal(result.summary.kept, 0)
  assert.equal(result.written, false)
  assert.equal(readFileSync(join(out, 'train.jsonl'), 'utf8'), 'OLD-TRAIN\n')
  assert.equal(readFileSync(join(out, 'valid.jsonl'), 'utf8'), 'OLD-VALID\n')
  assert.deepEqual(readdirSync(out).sort(), ['train.jsonl', 'valid.jsonl'])
})

test('a run that keeps something replaces the files and clears stale raw replies', async () => {
  const out = tmp()
  writeFileSync(join(out, 'train.jsonl'), 'OLD\n')
  writeFileSync(join(out, 'teacher-reply-9.txt'), 'stale')
  const result = await teach({ count: 5, out }, { ...base, index, teacher: async () => replyFor(1) })
  assert.equal(result.written, true)
  assert.ok(!existsSync(join(out, 'teacher-reply-9.txt')))
  assert.ok(!readFileSync(join(out, 'train.jsonl'), 'utf8').includes('OLD'))
  assert.ok(!readdirSync(out).some(name => name.endsWith('.tmp')))
})

test('the default count covers invented and negatives; one batch is a plain mix', () => {
  const kinds = batchPlan(index, { count: 300 }).map(b => b.focus.kind)
  assert.equal(kinds.length, 7)
  assert.ok(kinds.includes('negatives'))
  const [single] = batchPlan(index, { count: 40 })
  assert.deepEqual(single.focus, { kind: 'mixed' })
  assert.match(single.prompt, /Focus of this batch: a plain mix/)
  assert.equal(batchPlan(index, { count: 45 }).length, 1)
})

test('the prompt asks for negatives that mention real names without asking for an action', () => {
  const prompt = buildPrompt(bigIndex, { count: 45 })
  assert.match(prompt, /questions or remarks that mention real names from the lists/)
  assert.ok(prompt.includes('"what is brand"') && prompt.includes('"figma va lento"'))
})

test('paraphrase is a focus, twice in the rotation: the default count is about 30% paraphrases', () => {
  const kinds = batchPlan(index, { count: 300 }).map(b => b.focus.kind)
  assert.equal(kinds.filter(k => k === 'paraphrase').length, 2)
  assert.equal(FOCUSES.filter(f => f.kind === 'paraphrase').length, 2)
})

test('the paraphrase prompt lists every request form and the verb it maps to', () => {
  const prompt = buildPrompt(bigIndex, { count: 45, focus: { kind: 'paraphrase' } })
  assert.match(prompt, /Focus of this batch: paraphrases/)
  assert.match(prompt, /"quiero ver" → open/)
  assert.match(prompt, /"take me to" → open/)
  assert.match(prompt, /"enciende" → open/)
  assert.match(prompt, /"dónde está …" → reveal/)
  assert.match(prompt, /"copy … to the clipboard" → copy/)
  assert.match(prompt, /"run the shortcut" → shortcut/)
  assert.match(prompt, /ya, now, please, porfa, again, ahora, otra vez/)
})

test('every form the paraphrase prompt teaches is one the gate accepts and, for a place, the place rule maps', () => {
  assert.ok(REQUEST_FORMS.length >= 20)
  for (const { form, verb } of REQUEST_FORMS) {
    const phrase = normalise(form.replace('…', 'brand'))
    assert.ok(REQUEST.test(phrase) || PUT.test(phrase), `REQUEST does not match "${form}"`)
    if (/…$/.test(form) === false && form.includes('…')) assert.equal(placeVerb(phrase), verb, `placeVerb does not map "${form}"`)
  }
  for (const verb of ['reveal', 'copy']) assert.ok(REQUEST_FORMS.some(f => f.verb === verb && /… (en|in|al|to)/.test(f.form)))
})

test('the default plan has a focus for every verb, the paraphrases twice, and no standalone invented batch', () => {
  const focuses = batchPlan(index, { count: 300 }).map(b => b.focus)
  assert.equal(focuses.length, 7)
  for (const value of ['open', 'reveal', 'copy', 'shortcut']) assert.ok(focuses.some(f => f.kind === 'verb' && f.value === value), value)
  assert.equal(focuses.filter(f => f.kind === 'paraphrase').length, 2)
  assert.ok(!focuses.some(f => f.kind === 'invented'))
})

test('the paraphrase prompt wording that keeps the batch honest', () => {
  const prompt = buildPrompt(bigIndex, { count: 45, focus: { kind: 'paraphrase' } })
  assert.match(prompt, /At least 70% of the examples are positives/)
  assert.match(prompt, /the form's words are never part of it/)
  assert.match(prompt, /Spread the examples over all the forms/)
  assert.match(prompt, /About a third of the phrases end in a filler word \(ya, now, please, porfa, again, ahora, otra vez\)/)
  const lines = prompt.split('\n').filter(line => line.startsWith('- "') && line.includes('" → '))
  assert.equal(lines.length, REQUEST_FORMS.length)
  assert.match(prompt, /«quiero ver cómo funciona esto»/)
  assert.match(prompt, /«activa los tests»/)
  assert.match(prompt, /"activa" and "enciende" with a Shortcut name → shortcut/)
  assert.match(prompt, /"lanza" goes with apps/)
})

test('the held-out filter reads every .jsonl file in the phrases folder, not only heldout.jsonl', () => {
  const dir = mkdtempSync(join(tmpdir(), 'phrases-'))
  writeFileSync(join(dir, 'heldout.jsonl'), '{"phrase":"abre brand","expect":{"status":"pass"},"tags":[]}\n')
  writeFileSync(join(dir, 'model.jsonl'), '{"phrase":"llévame a brand","expect":{"status":"pass"},"tags":[]}\n\n{"phrase":"go to brand","expect":{"status":"pass"},"tags":[]}\n')
  writeFileSync(join(dir, 'fixture.json'), '{"phrase":"not a set"}')
  assert.deepEqual(examPhrases(dir).sort(), ['abre brand', 'go to brand', 'llévame a brand'])
})

test('examPhrases also reads sets in subfolders, like the foreign-index exam', () => {
  const dir = mkdtempSync(join(tmpdir(), 'phrases-'))
  mkdirSync(join(dir, 'foreign'))
  writeFileSync(join(dir, 'foreign', 'phrases.jsonl'), '{"phrase":"abre tangerine","expect":{"status":"pass"},"tags":[]}\n')
  assert.deepEqual(examPhrases(dir), ['abre tangerine'])
  assert.ok(examPhrases().includes(JSON.parse(readFileSync(new URL('./phrases/foreign/phrases.jsonl', import.meta.url), 'utf8').split('\n')[0]).phrase))
})

test('buildExamples drops a phrase from the other set by default', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'phrases-'))
  writeFileSync(join(dir, 'model.jsonl'), '{"phrase":"llévame a brand","expect":{"status":"pass"},"tags":[]}\n')
  const result = await buildExamples(JSON.stringify([{ phrase: 'LLEVAME a brand', lang: 'es', call: call('open', 'brand') }]), { index, config, zoxide: () => undefined, heldout: examPhrases(dir) })
  assert.deepEqual(reasons(result), ['held-out phrase'])
})

test('with no argument examPhrases reads the real test/phrases folder: both exams', () => {
  const read = name => readFileSync(new URL(`./phrases/${name}`, import.meta.url), 'utf8').trim().split('\n').map(line => JSON.parse(line).phrase)
  const got = new Set(examPhrases())
  assert.ok(got.has(read('heldout.jsonl')[0]))
  assert.ok(got.has(read('model.jsonl')[0]))
})
