// Session context: "abre ese doc", "open it" mean the file Claude just wrote, which reflex cannot know from the Mac
// alone. The hooks keep a short list of the files Claude wrote (newest first) and hand it to the CLI with each
// phrase (`--recent <json>`); this module records into that list and resolves a deictic phrase against it.
// Templates only: a model never sees a deictic phrase. See docs/research/session-context.md.

import { statSync } from 'node:fs'
import { extname } from 'node:path'
import { FILLERS, normalise } from './phrase.mjs'
import { OPENABLE } from './selectors.mjs'
import { validEntry } from './recent.mjs'
export { RECENT_CAP, callSucceeded, parseRecent, record, writtenPath } from './recent.mjs'

/** Older than this, "that doc" is no longer plainly the one Claude just made. */
export const FRESH_MS = 30 * 60 * 1000
/** Two fitting files written this close together are one turn's work: which one is meant is not for reflex to guess. */
export const SAME_TURN_MS = 5 * 60 * 1000

const IMAGE = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp']
const DOC = ['md', 'txt', 'docx', 'pdf', 'rtf', 'html']
const EXTENSIONS = { doc: DOC, image: IMAGE }
// Anything `open` could run (a script, a .command, an app, an archive, html, svg) is shown in Finder at most, however the phrase worded it.
// The policy is selectors.mjs's OPENABLE alone: a page that can run script (html, svg) is shown in Finder, never opened.
const OPENS_SAFELY = OPENABLE
const extensionOf = path => extname(path).slice(1).toLowerCase()
/** Whether a file's kind fits what the phrase named: a doc, an image, or anything for "it" and "that file". */
export const fitsKind = (kind, path) => kind === 'any' || EXTENSIONS[kind].includes(extensionOf(path))

// The deictic phrases, whole and nothing else: [pattern, verb, kind]. Folded text (no accents, lower case).
const TEMPLATES = [
  [/^(abrelo|abrela)$/, 'open', 'any'],
  [/^abre (ese|esa) (doc|documento)$/, 'open', 'doc'],
  [/^abre ese archivo$/, 'open', 'any'],
  [/^abre esa imagen$/, 'open', 'image'],
  [/^abre el (doc|documento) que (has|ha) (hecho|creado|escrito)$/, 'open', 'doc'],
  [/^abre el archivo que (has|ha) (hecho|creado|escrito)$/, 'open', 'any'],
  [/^abre lo ultimo$/, 'open', 'any'],
  [/^(muestramelo|muestramela)( en (el )?finder)?$/, 'reveal', 'any'],
  [/^open (it|this|that|that file)$/, 'open', 'any'],
  [/^abre (eso|esto)$/, 'open', 'any'],
  [/^(muestrame|muestra) (eso|esto)$/, 'reveal', 'any'],
  [/^reveal (it|this|that)$/, 'reveal', 'any'],
  [/^open that (doc|document)$/, 'open', 'doc'],
  [/^open that image$/, 'open', 'image'],
  [/^open the (doc|document) you (made|wrote|created)$/, 'open', 'doc'],
  [/^open the file you (made|wrote|created)$/, 'open', 'any'],
  [/^show (me )?(it|this|that)( in (the )?finder)?$/, 'reveal', 'any'],
]
// How a deictic phrase begins. Opening this way and not being one of the templates above means it names something else too
// ("abre ese doc de brand", "open it with Preview"): never reflex's to guess.
const HEAD = /^(abrelo|abrela|abre (ese|esa|eso|esto|lo ultimo)|abre el (doc|documento|archivo) que|muestramelo|muestramela|(muestrame|muestra) (eso|esto)|reveal (it|this|that)|open (it|this|that|the (doc|document|file) you)|show (me )?(it|this|that))(?=\s|$)/
const POLITE_END = /\s+(por favor|porfa|please|gracias|thanks)$/

function deicticOf(phrase) {
  let said = normalise(phrase)
  for (let again = true; again;) { const cut = said.replace(FILLERS, ''); again = cut !== said; said = cut }
  // Punctuation that ends a clause ("open it, please", "open it.") is not part of the words; one inside a name (that.pdf) stays.
  said = said.replace(/[,;:.!?]+(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim().replace(POLITE_END, '')
  if (!HEAD.test(said)) return undefined
  const template = TEMPLATES.find(([pattern]) => pattern.test(said))
  return template ? { verb: template[1], kind: template[2] } : {}
}

const defaultIsFile = path => { try { return statSync(path).isFile() } catch { return false } }

/**
 * A deictic phrase against the files Claude wrote. Undefined when the phrase is not deictic. Otherwise an action, or a
 * pass with the reason: no list, nothing of that kind, the newest is gone or older than 30 minutes, two fit as well,
 * the phrase names more than the template says.
 * @param {string} phrase
 * @param {{ path: string, at: number }[]} recent newest first
 * @param {{ now?: number, isFile?: (path: string) => boolean }} [deps]
 */
export function resolveDeictic(phrase, recent, { now = Date.now(), isFile = defaultIsFile } = {}) {
  const said = deicticOf(phrase)
  if (!said) return undefined
  const refuse = reason => ({ phrase, status: 'pass', reason, trace: [{ step: 'template', reason }] })
  if (!said.verb) return refuse('a phrase about "that"/"it" that also says something else: for Claude')
  const parsed = { verb: said.verb, target: '(the file Claude wrote)', kind: said.kind, raw: phrase }
  const entries = (Array.isArray(recent) ? recent : []).filter(validEntry)
  if (!entries.length) return refuse('no files Claude wrote in this session: "it" names nothing reflex knows')
  const fitting = entries.filter(entry => fitsKind(said.kind, entry.path)).sort((a, b) => b.at - a.at)
  if (!fitting.length) return refuse(`none of the files Claude wrote is of the kind asked (${said.kind})`)
  const [top, next] = fitting
  const age = now - top.at
  if (age < 0 || age > FRESH_MS) return refuse('the file Claude wrote is older than 30 minutes: not plainly the one meant')
  if (!isFile(top.path)) return refuse('the file Claude wrote is no longer there')
  if (next && now - next.at >= 0 && now - next.at <= FRESH_MS && top.at - next.at <= SAME_TURN_MS && isFile(next.path))
    return refuse('Claude wrote more than one file that fits, close together: which one is meant is not for reflex to guess')
  if (said.verb === 'open' && !OPENS_SAFELY.has(extensionOf(top.path))) return refuse(`opening a .${extensionOf(top.path)} file could run it (say "show it in Finder")`)
  const label = top.path.split('/').pop()
  const target = { type: 'file', value: top.path, label, via: 'the file Claude wrote in this session' }
  return { phrase, status: 'action', step: 'template', action: { verb: said.verb, target }, trace: [{ step: 'template', parsed, found: { status: 'ok', target } }] }
}
