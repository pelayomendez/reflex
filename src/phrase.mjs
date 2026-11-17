// Turns what the person typed into a verb and the words of its target, or nothing.
// Only a phrase that starts with a catalogue verb is considered at all, and the whole
// phrase has to be that one action: anything joined on ("and fix the bug") means no.

import { key } from './index.mjs'
import { FILLERS, QUIT_LEAD, REQUEST, REQUEST_FORMS, VERBS } from './vocab.mjs'
export { FILLERS, REQUEST, REQUEST_FORMS }

// "sal de Slack", "salir de Slack" and "¿me cierras Slack?" say quit with more than one word.
const TRAILERS = /[\s,]*(por favor|porfa|please|gracias|thanks)$/

// Words that name a kind of thing: they hint what to look for and are not part of its name.
const KINDS = [
  ['folder', /^(la |el |the |my |mi )?(carpeta|directorio|folder|directory|repo|repositorio)( de| del| of)?\s+/],
  ['app', /^(la |el |the |my |mi )?(app|aplicacion|application|programa)( de| del)?\s+/],
  ['url', /^(la |el |the |my |mi )?(web|pagina|page|site|sitio|url|enlace|link)( de| del| of)?\s+/],
  ['image', /^(la |el |the |my |mi )?(imagen|image|foto|picture|captura|screenshot)( de| del| of)?\s+/],
  ['file', /^(la |el |the |my |mi )?(fichero|archivo|file|documento|document)( de| del| of)?\s+/],
  ['shortcut', /^(el |the |mi |my )?(atajo|shortcut)( de| del)?\s+/],
]
const ARTICLE = /^(el |la |los |las |the |mi |mis |my )/
const PLACE_SUFFIX = {
  reveal: /\s+(en (el )?finder|in (the )?finder)$/,
  copy: /\s+(al portapapeles|en (el |mi )?portapapeles|(to|on|in) (the |my )?clipboard)$/,
  open: /\s+(en (el )?navegador|in (the )?browser)$/,
}
export const JOINED = /(\s(y|e|and|then|luego|despues|y luego)\s|[,;]|\s+&\s+)/

export function normalise(text) {
  return key(text).replace(/[¿?¡!.]+$/g, '').replace(/^[¿¡]+/, '').replace(/\s+/g, ' ').trim()
}

/** @returns {{verb: string, target: string, kind?: string, raw: string} | {reason: string}} */
export function parse(input) {
  if (input.trimStart().startsWith('\\')) return { reason: 'starts with \\: for Claude' }
  // Quoted text is kept as typed, for "copia «hola»".
  const quoted = input.match(/["“«']([^"”»']+)["”»']\s*[.!]?\s*$/)
  const said = normalise(input).replace(FILLERS, '')
  let text = said.replace(TRAILERS, '').replace(QUIT_LEAD, 'cierra ')
  const [first, ...rest] = text.split(' ')
  const verb = Object.keys(VERBS).find(name => VERBS[name].includes(first))
  if (!verb) return { reason: 'does not start with an action verb' }
  if (!rest.length) return { reason: 'no target' }
  // A question about quitting is a request only in the second person ("¿me cierras X?", "¿puedes cerrar X?"): "¿cierra X?" asks about X.
  if ((verb === 'quit' || verb === 'hide') && /[¿?]/.test(input) && !/^(me cierras|puedes|can you|could you|would you)\b/.test(normalise(input).replace(/^(oye|hey|porfa|por favor|please)\b[\s,]*/, ''))) return { reason: 'a question about quitting or hiding, not a request' }
  let target = rest.join(' ').replace(PLACE_SUFFIX[verb] ?? /$^/, '')
  // "show me X": the indirect object is not part of the name ("muéstrame" already carries it in the verb).
  if (verb === 'reveal') target = target.replace(/^me(\s+(?=\S)|$)/, '')
  if (verb === 'copy' && quoted) return { verb, target: quoted[1], kind: 'text', raw: input }
  if (JOINED.test(target)) return { reason: 'more than one thing asked: for Claude' }
  let kind
  for (const [name, pattern] of KINDS) if (pattern.test(target)) { kind = name; target = target.replace(pattern, ''); break }
  target = target.replace(ARTICLE, '').trim()
  if (!target) return { reason: 'no target' }
  return { verb, target, kind, raw: input }
}

export const verbWords = VERBS

const WORDS = text => text.split(/[\s,;:¿?¡!"'()]+/).map(word => word.replace(/^[.]+|[.]+$/g, '')).filter(Boolean)
export const URLISH = /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/\S*)?$/i

/**
 * The copy rule, shared by training (`reflex teach`) and inference (plan): a small model only copies
 * words out of the phrase, so a target is accepted only if every word of it is in the phrase. A path
 * or an address has to appear in it verbatim.
 */
export function copiedFrom(phrase, target) {
  const wanted = key(target)
  if (!wanted) return false
  const said = normalise(phrase)
  if (/[/\\]|^~/.test(wanted) || URLISH.test(wanted)) return said.includes(wanted)
  const have = new Set(WORDS(said))
  return WORDS(wanted).every(word => have.has(word))
}

/** A closing place ("en el finder", "al portapapeles") split off the end of the words, with the verb it asks for. */
export function splitPlace(text) {
  const said = text.replace(TRAILERS, '')
  for (const verb of ['reveal', 'copy']) {
    const match = PLACE_SUFFIX[verb].exec(said)
    if (match) return { text: said.slice(0, match.index), place: verb }
  }
  return { text: said }
}

/** The verb a closing place ("en el finder", "al portapapeles", "en el navegador") asks for, if any. */
export function placeVerb(phrase) {
  const said = normalise(phrase).replace(TRAILERS, '')
  return Object.keys(PLACE_SUFFIX).find(verb => PLACE_SUFFIX[verb].test(said))
}

// A statement ("I use slack", "ahora brand", "my figma") has no fixed opener to list, so the other way
// round: the model is asked only when the phrase holds a word that asks for something. An allow-list,
// deliberately narrow: a typo'd verb ("opne") may miss and goes to Claude. TALK, the copy rule and
// strict grounding stay as further guards.


// The forms that lead a phrase: whatever stands before the "…" (a form with something after it is a place,
// which placeVerb reads), longest first so "quiero ver" is not taken for a shorter form.
const LEADING_FORMS = REQUEST_FORMS
  .filter(({ form }) => !form.split('…')[1]?.trim())
  .map(({ form, verb }) => ({ lead: key(form.split('…')[0].trim()), verb }))
  .sort((a, b) => b.lead.length - a.lead.length)

/** The verb a request form that opens the phrase ("ve a", "llévame a", "pásame", "dónde está") asks for, if any. */
export function formVerb(phrase) {
  let said = normalise(phrase)
  for (let again = true; again;) { const cut = said.replace(FILLERS, ''); again = cut !== said; said = cut }
  return LEADING_FORMS.find(({ lead }) => said.startsWith(`${lead} `))?.verb
}

// A verb the speaker states after the request lead ("necesito copiar X", "i want to reveal X") is the
// verb, whatever form the lead opens. A request verb reflex does not do ("necesito buscar X") is for Claude.
const STATED = {
  open: 'abrir abre abres abra open lanzar lanza lances lance launch',
  reveal: 'revelar revela reveles revele reveal mostrar muestra muestres muestre ensenar ensena ensenes ensene show',
  copy: 'copiar copia copies copie copy',
  shortcut: 'ejecutar ejecuta ejecutes ejecute run',
}
const STATED_BY_WORD = new Map(Object.entries(STATED).flatMap(([verb, words]) => words.split(' ').map(word => [word, verb])))
const NOT_DONE = new Set('buscar busca busques encontrar encuentra encuentres find bring pasar pasa pases go look view'.split(' '))
const REQUEST_LEAD = /^(quiero|necesito|want|need|i want|i need|we want|we need|i'd like|id like|i d like|like|puedes|can you|could you|would you|me|que|to|please|porfa|por favor)\b\s*/
const LEAD_OPENERS = /^(quiero|necesito|want|need|i want|i need|we want|we need|i'd like|id like|i d like)\b/

/** @returns {string | 'pass' | undefined} the verb stated after a "quiero"/"necesito"/"I want to" lead, 'pass' for one reflex does not do. */
export function statedVerb(phrase) {
  let said = normalise(phrase)
  for (let again = true; again;) { const cut = said.replace(FILLERS, ''); again = cut !== said; said = cut }
  if (!LEAD_OPENERS.test(said)) return undefined
  while (REQUEST_LEAD.test(said)) said = said.replace(REQUEST_LEAD, '')
  const [word] = said.split(' ')
  if (STATED_BY_WORD.has(word)) return STATED_BY_WORD.get(word)
  return NOT_DONE.has(word) ? 'pass' : undefined
}
