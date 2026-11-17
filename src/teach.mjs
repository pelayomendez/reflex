// `reflex teach`: Claude is the teacher. It writes phrases and the call each one should make; reflex
// checks every example with its own grounding, drops what it cannot stand behind, and writes the
// training set in mlx-lm chat format. Only index names go to Claude, never paths or contents.

import { execFile } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { DEVELOPER_LINE, toolsFor } from './catalogue.mjs'
import { loadConfig } from './config.mjs'
import { ground } from './ground.mjs'
import { key, loadIndex, readIndexFile } from './index.mjs'
import { copiedFrom, normalise } from './phrase.mjs'
import { REQUEST_FORMS, plan } from './plan.mjs'

export const defaultOut = () => join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'reflex', 'train')

/** Evenly spaced picks, so a long list is represented across its length; `round` shifts which ones. */
function sample(list, max, round = 0) {
  if (list.length <= max) return list
  return Array.from({ length: max }, (_, i) => list[(Math.floor(i * list.length / max) + round * 7) % list.length])
}

/** Names only: folder, app and Shortcut names, and file basenames. No directory, no contents, nothing with a slash. */
export function indexNames(index, round = 0) {
  const clean = names => names.filter(name => !name.includes('/'))
  const files = [...new Set((index.files ?? []).map(path => basename(path)))].sort()
  return {
    folders: sample(clean(Object.keys(index.folders ?? {}).sort()), 30, round),
    apps: sample(clean(Object.keys(index.apps ?? {}).sort()), 30, round),
    shortcuts: sample(clean([...(index.shortcuts ?? [])].sort()), 20, round),
    files: sample(clean(files), 40, round),
  }
}

// One focus per batch, rotating, so no batch drifts into one kind of phrase and each sees different names.
export const FOCUSES = [
  { kind: 'negatives' }, { kind: 'paraphrase' },
  { kind: 'verb', value: 'open' }, { kind: 'verb', value: 'reveal' }, { kind: 'paraphrase' },
  { kind: 'verb', value: 'copy' }, { kind: 'verb', value: 'shortcut' },
  { kind: 'language', value: 'es' }, { kind: 'language', value: 'en' },
]
// One batch (count <= 45) has no rotation to spread a focus over, so it follows the plain mix.
const MIXED = { kind: 'mixed' }
const BATCH_SIZE = 45

function focusText({ kind, value }) {
  if (kind === 'mixed') return 'a plain mix. No special focus: follow the mix below.'
  if (kind === 'verb') return `the "${value}" tool. At least 70% of the examples call it; the rest follow the mix below.`
  if (kind === 'language') return `${value === 'es' ? 'Spanish' : 'English'}. Every phrase is in ${value === 'es' ? 'Spanish' : 'English'}; the rest follows the mix below.`
  if (kind === 'paraphrase') {
    const forms = REQUEST_FORMS.map(({ form, verb }) => `- "${form}" → ${verb}`).join('\n')
    return `paraphrases. At least 70% of the examples are positives phrased with one of these request forms, each mapping to the verb shown ("…" is where the name goes):
${forms}
Spread the examples over all the forms, not only "abre". The target is still only the name, copied from the phrase; the form's words are never part of it. About a third of the phrases end in a filler word (ya, now, please, porfa, again, ahora, otra vez) that is left out of the target ("llévame a brand ya" → target "brand"). Some negatives (call null) use these request words without asking for an action: «quiero ver cómo funciona esto», «necesito que me expliques el bug», «I want to see why it fails», «activa los tests». A request word alone never means act.
Hints: "activa" and "enciende" with a Shortcut name → shortcut ("activa modo foco"), with an app → open. "lanza" goes with apps ("lanza figma"), never with a Shortcut. The rest follows the mix below.`
  }
  if (kind === 'negatives') return 'negatives only. Every example has "call": null.'
  return 'invented names only. Every example is a positive call whose target is an invented generic name, with "invented": true.'
}

/** The batches for a count: about 45 examples each, each with its own focus and round. */
export function batchPlan(index, { count = 300 } = {}) {
  const batches = Math.max(1, Math.ceil(count / BATCH_SIZE))
  return Array.from({ length: batches }, (_, i) => {
    const size = Math.floor(count / batches) + (i < count % batches ? 1 : 0)
    const focus = batches === 1 ? MIXED : FOCUSES[i % FOCUSES.length]
    return { focus, count: size, prompt: buildPrompt(index, { count: size, focus, round: Math.floor(i / FOCUSES.length) + i }) }
  })
}

export function buildPrompt(index, { count = BATCH_SIZE, focus = FOCUSES[0], round = 0 } = {}) {
  const names = indexNames(index, round)
  const verbs = toolsFor().map(({ function: fn }) => `- ${fn.name}: ${fn.description}`).join('\n')
  const list = items => items.length ? items.join(', ') : '(none)'
  return `You are writing training examples for a very small model that sits in front of Claude Code on one Mac. It reads a short phrase typed by the user and either calls one tool or does nothing (the phrase then goes to Claude).

The tools, each taking one argument, "target", the words naming what to act on:
${verbs}

Names that exist on this Mac (folders, apps, Shortcuts, file names):
Folders: ${list(names.folders)}
Apps: ${list(names.apps)}
Shortcuts: ${list(names.shortcuts)}
Files: ${list(names.files)}

Focus of this batch: ${focusText(focus)}

Write ${count} examples. Reply with ONLY a JSON list, no prose and no code fence. Each item:
{"phrase": "...", "lang": "es" | "en", "call": {"name": "open|reveal|copy|shortcut", "arguments": {"target": "..."}} | null, "invented": true | false}

Rules:
- The model can only copy words out of the phrase. So the target is always words copied from the phrase, exactly as typed, in the same spelling (accents and typos included). Never translate, complete, normalise or replace them with a name from the lists. If the phrase does not say the name, it is not a positive example.
- The target is never a path and never contains a slash. No articles in it ("la", "the").
- Unless the focus says otherwise: about half Spanish, half English; about 25% negatives; about 10% invented-name positives.
- Vary the phrasing a lot: polite, terse, questions ("¿me abres brand?"), imperatives, with and without accents, and some typos in the other words ("abrre brand"). Include paraphrases a rigid template would miss ("llévame a brand", "ponme brand en pantalla").
- A positive example names something from the lists, copied as the person would say it. Use many different names, and (unless the focus says otherwise) all four tools.
- Negatives have "call": null: negations ("no abras brand"), compound requests that do more than one thing ("abre brand y arregla el bug"), and requests that are not actions on this Mac (explain code, run tests, write something), and questions or remarks that mention real names from the lists without asking for anything to be done ("what is brand", "tell me about figma", "figma va lento", "my downloads are slow", "el README tiene una errata"). A negative must not be a plain request to open, show, copy or run one of the names in the lists.
- Invented-name positives use a generic name that is NOT in the lists ("abre zorgblat"), so the model learns to pull out the target words instead of memorising this Mac. Set "invented": true on those, and on any example whose target has a typo inside it. Every other positive example has "invented": false.
- Phrases must be unique. Output valid JSON only.`
}

// What keeps the teacher a plain text generator: no built-in tools, no MCP servers, no skills, no saved session.
// The prompt goes through stdin, so a flag that takes a list cannot swallow it.
// User-level settings, hooks and CLAUDE.md still load. That is deliberate: --bare would skip the
// keychain and break OAuth login. It is safe because the teacher has no tools and no MCP servers.
export const CLAUDE_ARGS = ['-p', '--tools', '', '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence']

/** The real teacher: `claude -p`, headless. Arguments go as argv, never through a shell. */
export function runClaude(prompt, { bin = 'claude', timeoutMs = 300000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(bin, CLAUDE_ARGS, { cwd: tmpdir(), timeout: timeoutMs, maxBuffer: 32 << 20 }, (error, stdout) => error ? reject(error) : resolve(stdout))
    child.stdin.on('error', () => {})
    child.stdin.end(prompt)
  })
}

/** The complete objects of a JSON list that may have been cut off or wrapped in prose. */
function salvage(text) {
  const items = []
  let depth = 0, from = -1, inString = false, escaped = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inString) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') inString = false; continue }
    if (c === '"') inString = depth > 0
    else if (c === '{') { if (depth++ === 0) from = i }
    else if (c === '}' && depth > 0 && --depth === 0) { try { items.push(JSON.parse(text.slice(from, i + 1))) } catch {} }
  }
  return items
}

/** @returns {{ items: unknown[], complete: boolean }} complete is false when items had to be salvaged. */
export function parseTeacherOutput(output) {
  if (Array.isArray(output)) return { items: output, complete: true }
  const text = String(output)
  const start = text.indexOf('['), end = text.lastIndexOf(']')
  if (start >= 0 && end > start) {
    try { return { items: JSON.parse(text.slice(start, end + 1)), complete: true } } catch {}
  }
  const items = salvage(text)
  if (!items.length) throw new Error('no JSON list in the teacher output')
  return { items, complete: false }
}

const parseList = output => parseTeacherOutput(output).items

// Every set under test/phrases/ is an exam: a phrase in any of them is never taught.
export function examPhrases(dir = fileURLToPath(new URL('../test/phrases/', import.meta.url))) {
  // Sets in subfolders count too (foreign/phrases.jsonl, the exam on someone else's index).
  return readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    if (entry.isDirectory()) return examPhrases(join(dir, entry.name))
    if (!entry.name.endsWith('.jsonl')) return []
    return readFileSync(join(dir, entry.name), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line).phrase)
  })
}

/**
 * Validates the teacher's examples and turns the survivors into mlx-lm chat lines.
 * @returns {{ lines: object[], train: object[], valid: object[], dropped: {phrase?: string, reason: string}[], summary: object }}
 */
export async function buildExamples(teacherOutput, deps = {}) {
  const index = deps.index ?? loadIndex()
  const config = deps.config ?? loadConfig()
  const zoxide = deps.zoxide ?? (() => undefined)
  const held = new Set((deps.heldout ?? examPhrases()).map(normalise))
  const verbs = toolsFor().map(tool => tool.function.name)
  const seen = new Set()
  const kept = [], dropped = []
  const drop = (item, reason) => dropped.push({ phrase: typeof item?.phrase === 'string' ? item.phrase : undefined, reason })

  for (const item of parseList(teacherOutput)) {
    if (!item || typeof item !== 'object') { drop(item, 'not an object'); continue }
    if (typeof item.phrase !== 'string' || !item.phrase.trim()) { drop(item, 'no phrase'); continue }
    const phrase = item.phrase.trim(), id = normalise(phrase)
    if (held.has(id)) { drop(item, 'held-out phrase'); continue }
    if (seen.has(id)) { drop(item, 'duplicate'); continue }
    const call = item.call
    if (call != null) {
      if (!verbs.includes(call?.name)) { drop(item, `unknown verb "${call?.name}"`); continue }
      const target = call.arguments?.target
      if (typeof target !== 'string' || !target.trim()) { drop(item, 'call has no target'); continue }
      if (/[/\\]|^~/.test(target.trim())) { drop(item, 'target looks like a path'); continue }
      // The model can only pull words out of the phrase, so the target has to be made of them.
      if (!copiedFrom(phrase, key(target))) { drop(item, 'target is not copied from the phrase'); continue }
      if (item.invented !== true) {
        const found = ground({ verb: call.name, target: key(target), raw: phrase }, { index, config, zoxide })
        if (found.status === 'none') { drop(item, 'target does not ground in the index'); continue }
      }
    } else {
      // A negative has to be one: if reflex would act on it (or ask about it), it is not a pass.
      const got = await plan(phrase, { index, config: { ...config, model: {} }, zoxide })
      if (got.status === 'action') { drop(item, 'reflex would act on this phrase'); continue }
      if (got.status === 'choose') { drop(item, 'reflex would ask "which one?" about this phrase'); continue }
    }
    seen.add(id)
    kept.push({ call, phrase, invented: call != null && item.invented === true, lang: item.lang === 'es' || item.lang === 'en' ? item.lang : 'unknown' })
  }

  const tools = toolsFor()
  const lines = kept.map(({ call, phrase }) => ({
    messages: [
      { role: 'developer', content: DEVELOPER_LINE },
      { role: 'user', content: phrase },
      call
        ? { role: 'assistant', tool_calls: [{ type: 'function', function: { name: call.name, arguments: { target: call.arguments.target.trim() } } }] }
        : { role: 'assistant', content: '-' },
    ],
    tools,
  }))

  // 90/10, the validation lines spread evenly through the list so both sets see every kind.
  const validCount = lines.length > 1 ? Math.max(1, Math.round(lines.length / 10)) : 0
  const validAt = new Set(Array.from({ length: validCount }, (_, j) => Math.floor((j + 0.5) * lines.length / validCount)))
  const train = lines.filter((_, i) => !validAt.has(i)), valid = lines.filter((_, i) => validAt.has(i))

  const share = n => kept.length ? Math.round(n / kept.length * 100) / 100 : 0
  const count = (items, by) => items.reduce((acc, item) => { const k = by(item); acc[k] = (acc[k] ?? 0) + 1; return acc }, {})
  return {
    lines, train, valid, dropped,
    summary: {
      kept: lines.length, dropped: dropped.length,
      dropReasons: count(dropped, d => d.reason),
      verbs: count(kept, k => k.call?.name ?? 'pass'),
      languages: count(kept, k => k.lang),
      invented: kept.filter(k => k.invented).length,
      negatives: kept.filter(k => !k.call).length,
      shareInvented: share(kept.filter(k => k.invented).length),
      shareNegative: share(kept.filter(k => !k.call).length),
    },
  }
}

/** Asks the teacher batch by batch, validates, writes train.jsonl and valid.jsonl, returns what happened. */
// With indexFile the names, the grounding and the validation all come from that file, and none of this
// Mac's config (aliases are private names) is consulted.
export async function teach({ count = 300, out = defaultOut(), indexFile } = {}, deps = {}) {
  const index = deps.index ?? (indexFile === undefined ? loadIndex() : readIndexFile(indexFile))
  if (indexFile !== undefined) deps = { ...deps, config: deps.config ?? { aliases: {}, model: {} } }
  const teacher = deps.teacher ?? runClaude
  mkdirSync(out, { recursive: true })
  for (const name of readdirSync(out)) if (/^teacher-reply-.*\.txt$/.test(name)) rmSync(join(out, name))
  const items = [], batches = { ok: 0, salvaged: 0, failed: 0 }
  for (const [at, batch] of batchPlan(index, { count }).entries()) {
    let output
    try { output = await teacher(batch.prompt) } catch (error) { batches.failed++; console.error(`batch ${at + 1}: ${error.message}`); continue }
    try {
      const parsed = parseTeacherOutput(output)
      if (parsed.complete) batches.ok++
      else { batches.salvaged++; writeFileSync(join(out, `teacher-reply-${at + 1}.txt`), String(output)) }
      items.push(...parsed.items)
    } catch {
      batches.failed++
      writeFileSync(join(out, `teacher-reply-${at + 1}.txt`), String(output))
    }
  }
  const result = await buildExamples(items, { ...deps, index })
  result.summary.batches = batches
  // Nothing kept means nothing replaces the last good set. Otherwise write aside and rename.
  if (!result.summary.kept) return { ...result, out, written: false }
  const write = (name, list) => {
    writeFileSync(join(out, `${name}.tmp`), list.map(line => JSON.stringify(line)).join('\n') + (list.length ? '\n' : ''))
    renameSync(join(out, `${name}.tmp`), join(out, name))
  }
  write('train.jsonl', result.train)
  write('valid.jsonl', result.valid)
  return { ...result, out, written: true }
}

export function printSummary({ summary, dropped, train, valid, out }) {
  const row = counts => Object.entries(counts).map(([name, n]) => `${name} ${n}`).join(', ') || 'none'
  console.log(`kept ${summary.kept} (train ${train.length}, valid ${valid.length}), dropped ${summary.dropped}  →  ${out}`)
  for (const [reason, n] of Object.entries(summary.dropReasons)) console.log(`  dropped ${n}: ${reason}`)
  console.log(`verbs      ${row(summary.verbs)}`)
  console.log(`languages  ${row(summary.languages)}`)
  console.log(`invented ${Math.round(summary.shareInvented * 100)}%, negatives ${Math.round(summary.shareNegative * 100)}%`)
  const { ok, salvaged, failed } = summary.batches ?? {}
  if (summary.batches) console.log(`batches    ${ok} ok, ${salvaged} salvaged, ${failed} failed${salvaged + failed ? ' (raw replies are in the out dir)' : ''}`)
}
