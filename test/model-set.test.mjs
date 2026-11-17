// The model-only exam (test/phrases/model.jsonl) is worth something only if the model is the one answering:
// every case has to get past the gate and be left unanswered by the templates.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { plan, REQUEST_FORMS } from '../src/plan.mjs'

const here = new URL('./phrases/', import.meta.url)
const fixture = JSON.parse(readFileSync(new URL('fixture.json', here), 'utf8'))
const cases = readFileSync(new URL('model.jsonl', here), 'utf8').trim().split('\n').map(line => JSON.parse(line))
const names = new Set(Object.keys(fixture.index.folders).concat(Object.keys(fixture.index.apps)))

test('the set has at least 120 phrases, about 75% positives and 25% negatives', () => {
  assert.ok(cases.length >= 120, `only ${cases.length}`)
  const negatives = cases.filter(c => c.expect.status === 'pass').length
  const share = negatives / cases.length
  assert.ok(share >= 0.2 && share <= 0.3, `negatives are ${(share * 100).toFixed(0)}%`)
  assert.ok(cases.every(c => ['action', 'pass'].includes(c.expect.status)))
  assert.equal(new Set(cases.map(c => c.phrase.toLowerCase())).size, cases.length, 'duplicate phrases')
})

test('every case reaches the model step: the gate lets it through and the templates answer none', async () => {
  const asked = []
  const deps = {
    index: fixture.index, zoxide: () => undefined,
    config: { ...fixture.config, model: { url: 'http://stub', name: 'stub' } },
    askModel: async phrase => { asked.push(phrase); return null },
  }
  const missed = []
  for (const { phrase } of cases) {
    const before = asked.length
    const got = await plan(phrase, deps)
    if (asked.length === before) missed.push(phrase)
    assert.equal(got.status, 'pass', phrase)
  }
  assert.deepEqual(missed, [])
})

test('the positives spread over every verb and both languages, and the negatives over both too', () => {
  const positives = cases.filter(c => c.expect.status === 'action')
  for (const verb of new Set(REQUEST_FORMS.map(f => f.verb))) assert.ok(positives.filter(c => c.expect.verb === verb).length >= 10, verb)
  for (const lang of ['es', 'en']) {
    assert.ok(positives.filter(c => c.tags.includes(lang)).length >= 30, `${lang} positives`)
    assert.ok(cases.filter(c => c.expect.status === 'pass' && c.tags.includes(lang)).length >= 10, `${lang} negatives`)
  }
})

test('every expected target is something in the fixture', () => {
  const real = new Set([...Object.values(fixture.index.folders), ...Object.values(fixture.index.apps), ...fixture.index.files,
    ...fixture.index.shortcuts, ...Object.values(fixture.config.aliases)])
  for (const { phrase, expect } of cases.filter(c => c.expect.status === 'action' && !c.tags.includes('text'))) assert.ok(real.has(expect.value), `${phrase} -> ${expect.value}`)
  assert.ok(names.size > 0)
})

test('no phrase is in both exams', () => {
  const held = new Set(readFileSync(new URL('heldout.jsonl', here), 'utf8').trim().split('\n').map(line => JSON.parse(line).phrase.toLowerCase()))
  assert.deepEqual(cases.map(c => c.phrase).filter(phrase => held.has(phrase.toLowerCase())), [])
})

test('at least 20 negatives name a real fixture folder, app or alias inside a non-request', () => {
  const real = [...Object.keys(fixture.index.folders), ...Object.keys(fixture.index.apps), ...Object.keys(fixture.config.aliases)]
  const naming = cases.filter(c => c.expect.status === 'pass' && real.some(name => new RegExp(`\\b${name}\\b`, 'i').test(c.phrase)))
  assert.ok(naming.length >= 20, `only ${naming.length}`)
})

test('the quoted-text copies are tagged, since no grounding reaches them', () => {
  const texts = cases.filter(c => c.expect.verb === 'copy' && c.tags.includes('text'))
  assert.equal(texts.length, 6)
  assert.ok(texts.every(c => c.tags.includes('quoted')))
})

test('no positive names two files at once: a file phrase never expects what a rival path also matches', () => {
  const files = fixture.index.files
  const dup = cases.filter(c => c.tags.some(t => t === 'file' || t === 'image') && /watchmen|informe|quarterly/i.test(c.phrase))
  for (const { phrase, expect } of dup) {
    assert.ok(/\bv2\b/i.test(phrase) || /\b(md|png)\b|2026-11-06-watchmen/i.test(phrase), phrase)
    assert.ok(files.includes(expect.value))
  }
})

// An oracle answers every contiguous run of words with each verb. If no answer of the oracle yields the
// expected action, no model could either, so the case measures the grounding and not the model.
const verbs = ['open', 'reveal', 'copy', 'shortcut']
const runsOf = phrase => {
  const words = phrase.split(/\s+/).map(w => w.replace(/^[¿¡"'«“(]+|[?!.,;:"'»”)]+$/g, '')).filter(Boolean)
  const runs = []
  for (let from = 0; from < words.length; from++) for (let to = from + 1; to <= words.length; to++) runs.push(words.slice(from, to).join(' '))
  return runs
}

test('every positive but the quoted copies is reachable by an oracle model', async () => {
  const deps = answer => ({ index: fixture.index, zoxide: () => undefined, config: { ...fixture.config, model: { url: 'http://stub', name: 'stub' } }, askModel: async () => answer })
  const unreachable = []
  for (const { phrase, expect, tags } of cases.filter(c => c.expect.status === 'action' && !c.tags.includes('quoted'))) {
    let reached = false
    for (const target of runsOf(phrase)) {
      for (const verb of verbs) {
        const got = await plan(phrase, deps({ verb, target }))
        if (got.status === 'action' && got.action.verb === expect.verb && got.action.target.value === expect.value) { reached = true; break }
      }
      if (reached) break
    }
    if (!reached) unreachable.push(phrase)
  }
  assert.deepEqual(unreachable, [])
})
