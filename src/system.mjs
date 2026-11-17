// A few harmless things to ask of the Mac itself, as a closed table of data: a System Settings pane,
// locking the screen, the volume. They are fixed phrases (plus one integer for a volume level), matched
// whole, so negations, reports, questions, talk and compound requests simply do not match. No model ever
// sees them and none can produce them (src/catalogue.mjs has no such tool). Hiding an app is a verb of
// phrase.mjs and ground.mjs instead, because it names an installed app exactly like quit does.

import { spawnSync } from 'node:child_process'
import { key } from './index.mjs'
import { FILLERS, normalise } from './phrase.mjs'

const SETTINGS_APP = '/System/Applications/System Settings.app'
const URL_PREFIX = 'x-apple.systempreferences:'

import { ALL, ALL_LANGS, DETERMINERS, LEVEL_LEADS, LOCK, OF, OPENERS, PANES, SETTINGS_ROOT, SETTINGS_WORDS, TABLE, VOLUME, VOLUME_STEP } from './vocab.mjs'
export { PANES, TABLE, VOLUME_STEP }

const PHRASES = new Map(TABLE.flatMap(entry => [
  ...ALL_LANGS.flatMap(lang => entry[lang].map(phrase => [phrase, { entry, lang }])),
  ...(entry.asking ?? []).map(phrase => [phrase, { entry, lang: 'es', asking: true }]),
]))

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const any = words => `(?:${words.map(escape).join('|')})`
const optional = words => `(?:${any(words)} )?`
const PANE_PATTERNS = ALL.map(lang => ({
  lang,
  pattern: new RegExp(lang === 'es'
    ? `^${optional(OPENERS.es)}${optional(DETERMINERS.es)}${any(SETTINGS_WORDS.es)} ${any(OF)} (?:(?:el|la|los|las) )?(?<pane>.+)$`
    : `^${optional(OPENERS.en)}${optional(DETERMINERS.en)}(?<pane>.+) ${any(SETTINGS_WORDS.en)}(?: pane)?$`),
}))
const ROOT = new RegExp(`^${any(ALL.flatMap(lang => OPENERS[lang]))} (?:${any(ALL.flatMap(lang => DETERMINERS[lang]))} )?(?<name>${any(ALL.flatMap(lang => SETTINGS_ROOT[lang]))})$`)
const LOCKS = new Set(ALL.flatMap(lang => LOCK[lang].verbs.flatMap(verb => LOCK[lang].objects.map(object => `${verb} ${object}`))))
const VOLUMES = new Map(Object.entries(VOLUME).flatMap(([what, langs]) => ALL.flatMap(lang => langs[lang].map(phrase => [phrase, what]))))
const LEVEL = new RegExp(`^(?<lead>${any(LEVEL_LEADS)}) (?<n>\\d{1,3})(?<percent> ?%)?$`)
// "volume 5" alone is as likely a remark or a number as a request: a bare lead needs 10 or more, or a %.
const BARE_LEADS = new Set(['volume', 'volumen'])

// A question about doing it ("¿bloquea la pantalla?") asks about something; only the second person asks for it.
const POLITE = /^(?:(?:oye|hey|porfa|por favor|please)\s+)*(?:puedes|can you|could you|would you)\b/
const TRAILING = /(?:[\s,]+(?:por favor|porfa|please|gracias|thanks))+$/

// "Require password after screen saver begins or display is turned off" must be Immediately, or the lock
// would only sleep the display. sysadminctl prints to stderr, so both streams are read.
const LOCK_REASON = 'Require password is not set to Immediately; reflex would only sleep the display'
const IMMEDIATE_LOCK = /(?:^|\s)screenLock delay is immediate\s*$/
export function screenLockStatus() {
  const { stdout, stderr } = spawnSync('sysadminctl', ['-screenLock', 'status'], { encoding: 'utf8', timeout: 3000 })
  return `${stdout ?? ''}${stderr ?? ''}`
}
function lockIsImmediate(read) {
  try { return IMMEDIATE_LOCK.test(String(read() ?? '')) } catch { return false }
}

const target = (type, value, label, via = 'system actions') => ({ type, value, label, via })

/**
 * The phrase as one of the table's fixed requests, or nothing.
 * `tier` and `lang` come with the table's entries: 'confirm' and 'query' are never plain actions.
 * @returns {{ action: { verb: string, target: object }, tier?: string, lang?: string } | { reason: string } | undefined}
 */
export function systemAction(phrase, { index, config, screenLockStatus: readLock = screenLockStatus } = {}) {
  let said = normalise(phrase)
  for (let again = true; again;) { const cut = said.replace(FILLERS, '').replace(/^[¿¡]+/, ''); again = cut !== said; said = cut }
  said = said.replace(/^would you\s+/, '').replace(TRAILING, '').trim()
  if (!said) return undefined
  const found = match(said, { index, config })
  if (!found) return undefined
  if (found.reason) return found
  // A statement («estoy conectado a la vpn») answers only as the question it can be.
  if (found.asking && !/[¿?]/.test(phrase)) return undefined
  // A question is the expected form of a query ("¿qué batería tengo?"); for everything else it asks about doing it.
  if (found.tier !== 'query' && /[¿?]/.test(phrase) && !POLITE.test(normalise(phrase))) return { reason: 'a question about it, not a request' }
  if (found.action.verb === 'lock' && !lockIsImmediate(readLock)) return { reason: LOCK_REASON }
  return found
}

// A thing of the person's called exactly like what a phrase is about: a file (with or without its extension), folder,
// app, Shortcut or alias. An app of macOS itself is the thing a phrase means, so it does not count.
function named(name, { index = {}, config = {} }) {
  const ownApp = path => typeof path === 'string' && path.startsWith('/System/')
  if (Object.entries(index.apps ?? {}).some(([app, path]) => app === name && !ownApp(path))) return true
  if (Object.hasOwn(index.folders ?? {}, name) || (config.aliases && Object.hasOwn(config.aliases, name))) return true
  if ((index.shortcuts ?? []).some(shortcut => key(shortcut) === name)) return true
  return false
}

function match(said, { index = {}, config = {} }) {
  if (LOCKS.has(said)) return { action: { verb: 'lock', target: target('system', 'screen', 'screen') } }
  const what = VOLUMES.get(said)
  if (what) return { action: { verb: 'volume', target: target('volume', what, { mute: 'mute', unmute: 'unmute', up: 'volume up', down: 'volume down' }[what]) } }
  const level = LEVEL.exec(said)
  if (level) {
    const n = Number(level.groups.n)
    if (BARE_LEADS.has(level.groups.lead) && n < 10 && !level.groups.percent) return { reason: 'a bare number below 10 after "volume" is not clearly a volume' }
    return n <= 100 ? { action: { verb: 'volume', target: target('volume', String(n), `volume ${n}%`) } } : { reason: 'a volume goes from 0 to 100' }
  }
  const taken = name => [index.apps, index.folders, config.aliases].some(names => names && Object.hasOwn(names, name)) || (index.shortcuts ?? []).some(shortcut => key(shortcut) === name)
  const entry = PHRASES.get(said)
  if (entry) {
    const { entry: row, lang, asking } = entry
    if (row.names?.some(name => named(name, { index, config }))) return undefined
    return { action: { verb: row.verb, target: target(row.tier === 'query' ? 'query' : 'system', row.value, row.label) }, tier: row.tier, lang, asking }
  }
  const root = ROOT.exec(said)
  if (root) {
    const { name } = root.groups
    // A folder, app or alias really called "ajustes" is the other reading of the phrase: the ordinary rules take it.
    if (taken(name)) return undefined
    return { action: { verb: 'open', target: target('app', SETTINGS_APP, 'System Settings') } }
  }
  for (const { lang, pattern } of PANE_PATTERNS) {
    const pane = PANES.find(candidate => candidate[lang].includes(pattern.exec(said)?.groups.pane))
    if (!pane) continue
    if (taken(said.replace(new RegExp(`^${optional(OPENERS[lang])}`), ''))) return undefined
    return { action: { verb: 'settings', target: target('settings', `${URL_PREFIX}${pane.id}`, pane.label) } }
  }
  return undefined
}

// Words that mean one of these actions without being a phrase of the table ("pon el volumen a tope",
// "activa el sonido", "necesito ocultar slack"): the model never sees them, because the closest thing it
// could answer is an open of something called "volumen" or "sonido".
// Whole words only: a word inside a hyphenated or dotted name (package-lock.json) is part of a name.
const word = pattern => new RegExp(`(?<![\\w-])(?:${pattern})(?![\\w-]|\\.\\w)`)
// A phrase that names a kind of thing ("la carpeta volume", "the lock screen folder") is about a file or a
// folder, whatever words its name holds, so the model keeps it. Unless the verb itself is one of these actions.
const KIND = word('carpeta|directorio|folder|directory|archivo|fichero|file|documento|document|repo|repositorio')
const SYSTEM_VERBS = word('silenc\\w*|bloque\\w*|ocult\\w*|escond\\w*|mute|unmute|hide|hiding')
// The Trash words belong here too: a near-miss of Empty Trash ("vacía la papelera de descargas", "empty the trash
// folder in brand") could only be answered by the model with an open of something, never with what was asked.
const SYSTEM_NOUNS = word('volumen|volume|lock|papelera|trash|vaci\\w*|empty')
const TOGGLE = word('pon\\w*|activ\\w*|desactiv\\w*|enciend\\w*|apag\\w*|turn|switch|toggle|alterna\\w*|cambia\\w*|duerm\\w*|sleep|start|inici\\w*')
const TOGGLED = word('sonido|sound|audio|bluetooth|wifi|wi-fi|modo oscuro|modo claro|dark mode|light mode|salvapantallas|screensaver|screen saver|pantalla|pantallas|display|displays|aspecto')
const PANE_WORDS = word(PANES.flatMap(pane => [...pane.es, ...pane.en]).map(escape).join('|'))
const SETTINGS_WORD = word(ALL.flatMap(lang => SETTINGS_WORDS[lang]).join('|'))
export const mentionsSystem = said => {
  if (SYSTEM_VERBS.test(said)) return true
  if (KIND.test(said)) return false
  return SYSTEM_NOUNS.test(said) || (TOGGLE.test(said) && TOGGLED.test(said)) || (SETTINGS_WORD.test(said) && PANE_WORDS.test(said))
}
