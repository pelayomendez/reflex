// `reflex learn`: read the local log (src/learnlog.mjs), summarise it, and export candidate training
// examples. It does not train. Examples go through the same validation as `reflex teach`
// (buildExamples): grounding in the index, the copy rule, held-out and exam exclusion, and
// negatives that reflex would not act on anyway are dropped.

import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname } from 'node:path'
import { key } from './index.mjs'
import { copiedFrom, normalise } from './phrase.mjs'
import { buildExamples } from './teach.mjs'

/** Words an oracle or old entry's target could be said with: the name, and the name without its extension. */
function nameCandidates(target) {
  if (!target?.value) return []
  if (target.type === 'url') {
    try { return [new URL(target.value).hostname.replace(/^www\./, '').split('.')[0]] } catch { return [] }
  }
  const name = basename(target.value).replace(/\.app$/i, '')
  const bare = name.slice(0, name.length - extname(name).length)
  return [name, bare, name.replace(/[-_]+/g, ' '), bare.replace(/[-_]+/g, ' ')].filter(Boolean)
}

/** The target words for a positive: what the plan recorded, else a name of the target that the phrase says. */
export function targetWords(entry) {
  if (typeof entry.words === 'string' && entry.words.trim()) return entry.words.trim()
  const candidates = nameCandidates(entry.target)
  const said = candidates.find(word => copiedFrom(entry.phrase, key(word)))
  if (!said) return candidates[0] ?? ''
  // As typed: the phrase's own spelling of it, not the app's or the file's.
  const at = entry.phrase.toLowerCase().indexOf(said.toLowerCase())
  return at >= 0 ? entry.phrase.slice(at, at + said.length) : said
}

/** Log entries as the teacher-format items buildExamples validates. A phrase logged both ways is dropped. */
export function toItems(entries) {
  const sides = new Map()
  for (const entry of entries) {
    const id = normalise(entry.phrase)
    const side = sides.get(id) ?? new Set()
    side.add(entry.kind === 'override' ? 'negative' : 'positive')
    sides.set(id, side)
  }
  const items = [], conflicting = []
  for (const entry of entries) {
    if (sides.get(normalise(entry.phrase)).size > 1) { conflicting.push({ phrase: entry.phrase, reason: 'logged both as wanted and as not wanted' }); continue }
    if (entry.kind === 'override') {
      items.push({ phrase: entry.phrase, lang: 'unknown', call: null, invented: false })
    } else {
      items.push({ phrase: entry.phrase, lang: 'unknown', call: { name: entry.verb, arguments: { target: targetWords(entry) } }, invented: false })
    }
  }
  return { items, conflicting }
}

export function summarise(entries) {
  const kinds = { accepted: 0, override: 0, oracle: 0 }
  for (const entry of entries) kinds[entry.kind]++
  const groups = new Map()
  for (const entry of entries.filter(e => e.kind === 'oracle')) {
    const id = normalise(entry.phrase)
    const group = groups.get(id) ?? { phrase: entry.phrase, count: 0, actions: new Map() }
    const action = `${entry.verb} ${entry.target?.value ?? ''}`.trim()
    group.count++
    group.actions.set(action, (group.actions.get(action) ?? 0) + 1)
    groups.set(id, group)
  }
  // A template acts on these whatever a model learns, so they cannot train it: a list for a human.
  const misfired = entries.filter(e => e.kind === 'override' && e.step === 'template')
    .map(e => ({ phrase: e.phrase, action: `${e.verb} ${e.target?.value ?? ''}`.trim() }))
  const passed = [...groups.values()]
    .map(({ phrase, count, actions }) => ({ phrase, count, action: [...actions.entries()].sort((a, b) => b[1] - a[1])[0][0] }))
    .sort((a, b) => b.count - a.count || a.phrase.localeCompare(b.phrase))
  return { total: entries.length, kinds, passed, misfired }
}

export function printLearnSummary({ total, kinds, passed, misfired = [] }, limit = 10) {
  console.log(`${total} logged: accepted ${kinds.accepted}, override ${kinds.override}, oracle ${kinds.oracle}`)
  if (misfired.length) {
    console.log(`templates that misfired (you overrode them; no training use):`)
    for (const { phrase, action } of misfired.slice(0, limit)) console.log(`       "${phrase}"  →  ${action}`)
  }
  if (!passed.length) return
  console.log(`passed to Claude, which then ran something reflex could have run (top ${Math.min(limit, passed.length)} of ${passed.length}):`)
  for (const { phrase, count, action } of passed.slice(0, limit)) console.log(`  ${String(count).padStart(3)}×  "${phrase}"  →  ${action}`)
}

/** Validates the log's entries and writes the survivors to `file` in teach's chat format. */
export async function exportExamples(entries, file, deps = {}) {
  const { items, conflicting } = toItems(entries)
  // An override only teaches the model when no template acts on the phrase: buildExamples drops the rest.
  const result = await buildExamples(items, deps)
  const source = new Map(entries.map(e => [normalise(e.phrase), e.kind]))
  // Where each example came from, so a later train can weight them: accepted over oracle.
  result.lines.forEach(line => { line.source = source.get(normalise(line.messages[1].content)) })
  result.dropped.push(...conflicting)
  result.summary.dropped = result.dropped.length
  for (const { reason } of conflicting) result.summary.dropReasons[reason] = (result.summary.dropReasons[reason] ?? 0) + 1
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, result.lines.map(line => JSON.stringify(line)).join('\n') + (result.lines.length ? '\n' : ''))
  return { ...result, file }
}
