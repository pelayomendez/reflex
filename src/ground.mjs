// Ties the words of a target to something real: an alias, a URL, an app, a folder, a file or a
// Shortcut. Nothing that is not found here can become an action.

import { execFileSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, extname } from 'node:path'
import { processAncestry } from './ancestry.mjs'
import { expandHome } from './config.mjs'
import { key } from './index.mjs'
import { resolveRole, roleOf } from './roles.mjs'
import { FILLERS, REQUEST, REQUEST_FORMS, URLISH, normalise, placeVerb } from './phrase.mjs'

const IMAGE = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic', '.tiff'])
const STOP = new Set(['de', 'del', 'of', 'the', 'el', 'la', 'los', 'las', 'en', 'in', 'para', 'for', 'mi', 'my', 'un', 'una', 'a'])
const POSTFIX_KINDS = { folder: 'folder', repo: 'folder', carpeta: 'folder', directorio: 'folder', repositorio: 'folder', directory: 'folder', app: 'app', aplicacion: 'app', application: 'app', programa: 'app', file: 'file', fichero: 'file', archivo: 'file', document: 'file', documento: 'file', image: 'image', imagen: 'image', foto: 'image', picture: 'image' }
const POSTFIX = new RegExp(`^(.+\\S)\\s+(${Object.keys(POSTFIX_KINDS).join('|')})$`)
const MIN_TYPO = 5
// Kind words a model may leave inside a file target ("captura de 2026-11-05"): dropped before matching.
// What each kind word demands of the file (checked once exactly one file fits): images need an image
// extension, "md" a .md file, and the app and folder words reject a file altogether.
const IMAGE_KINDS = new Set(['image', 'images', 'imagen', 'imagenes', 'foto', 'fotos', 'picture', 'pictures', 'pic', 'pics', 'photo', 'photos', 'captura', 'capturas', 'screenshot', 'screenshots'])
const DOC_KINDS = new Set(['doc', 'docs', 'documento', 'documentos', 'document', 'documents', 'file', 'files', 'fichero', 'archivo', 'md'])
const NOT_A_FILE = new Set(['folder', 'carpeta', 'directorio', 'directory', 'repo', 'repositorio', 'app', 'aplicacion', 'application', 'programa', 'web', 'pagina', 'page', 'site', 'sitio', 'url', 'enlace', 'link', 'atajo', 'shortcut'])
const FILE_KINDS = new Set([...Object.keys(POSTFIX_KINDS), 'doc', 'docs', 'md', 'captura', 'screenshot', 'pic', 'photo'])
// The phrase as a Shortcut request: an activation word first, the name right after it (a few small words
// allowed between), and nothing after it but closing fillers. Whole words, so remarks that merely hold
// one ("show me the run history of modo foco") never run anything.
const ACTIVATION = 'activa|activame|activar|trigger|turn on|enciende|enciendeme|pon|ponme|ejecuta|run|lanza'
const CLOSING = 'ya|now|please|porfa|por favor|again|otra vez|ahora|for me|para mi|anda|gracias|thanks'
const asksFor = (raw, k) => new RegExp(`^(${ACTIVATION})\\s+((el|la|the|atajo|shortcut|de|del|me)\\s+){0,2}${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s+(${CLOSING}))*$`).test(normalise(raw).replace(FILLERS, ''))

/**
 * @returns {{ status: 'ok', target: Target } | { status: 'ambiguous', candidates: Target[] } | { status: 'none', reason: string }}
 * @typedef {{ type: 'folder'|'file'|'app'|'url'|'text'|'shortcut', value: string, label: string, via: string }} Target
 */
export function ground({ verb, target, kind, raw = '' }, { index, config, zoxide = queryZoxide, source = 'template', ancestors = processAncestry, asPath = false, exact = false }) {
  if (kind === 'text') return ok('text', target, `"${target}"`, 'quoted text')
  // A model's answer is only trusted where it names something exactly: it can say anything, and with
  // the gate open it sees ordinary conversation. Prefix and substring tiers, zoxide, the file search
  // and bare dotted names are for what the person typed after a verb.
  // `exact` asks for the model's strictness on what a person typed (a find: "busca el roadmap").
  const strict = source === 'model' || exact
  let k = key(target)
  // Quit and hide: an installed app named exactly, nothing else. No alias, folder, file, prefix or typo, and never from a model.
  if (verb === 'quit' || verb === 'hide') {
    if (strict) return none(`a model never ${verb === 'quit' ? 'quits' : 'hides'} an app`)
    const postfix = k.match(POSTFIX)
    const name = postfix && POSTFIX_KINDS[postfix[2]] === 'app' ? postfix[1] : k
    if ((kind && kind !== 'app') || (postfix && POSTFIX_KINDS[postfix[2]] !== 'app' && !(k in index.apps))) return none(`"${target}" is not an app`)
    if (!Object.hasOwn(index.apps, name)) return none(`no installed app called "${target}"`)
    // The app this session runs in (the terminal, the editor) is never quit (or hidden) from inside it.
    const app = index.apps[name]
    const chain = ancestors()
    if (!chain.length) return none('could not tell which app hosts this session')
    if (chain.some(exe => exe.startsWith(`${app}/Contents/`))) return none(`"${basename(app, '.app')}" hosts this session`)
    return ok('app', app, basename(app, '.app'), 'installed apps')
  }
  // Whatever the model named, the words around it have to be the request's own: "lanza los tests de reflex"
  // and "necesito ayuda con slack" name real things and ask for something else.
  if (strict && raw && !aroundTarget(raw, k.split(/\s+/), index.folders)) return none(`"${target}" is not the whole of what was asked`)
  // "desktop folder": a kind word at the end hints what to look for and is not part of the name.
  const postfix = k.match(POSTFIX)
  const aliased = config.aliases?.[k] ?? (postfix && config.aliases?.[postfix[1]])
  if (postfix) { k = postfix[1]; target = target.slice(0, k.length); kind ??= POSTFIX_KINDS[postfix[2]] }
  if (aliased) {
    if (/^https?:\/\//.test(aliased)) return ok('url', aliased, target, 'alias')
    const path = expandHome(aliased)
    if (existsSync(path)) return ok(isDir(path) ? 'folder' : 'file', path, target, 'alias')
  }

  const appEntries = Object.entries(index.apps), folderEntries = Object.entries(index.folders)

  // A model answer that names a Shortcut exactly is a Shortcut even when it chose "open" ("activa el modo
  // foco"). Shortcuts have side effects, so: exact names only, the phrase has to hold an activation word
  // and no closing place, and a name an app or folder also fits (exactly or by typo) is left alone.
  if (strict && !kind && verb === 'open' && asksFor(raw, k) && !placeVerb(raw)) {
    const exact = index.shortcuts.filter(name => key(name) === k)
    if (exact.length === 1 && !typos(k, appEntries).length && !typos(k, folderEntries).length && !(k in index.apps) && !(k in index.folders)) return ok('shortcut', exact[0], exact[0], 'Shortcuts')
  }

  if (verb === 'shortcut' || kind === 'shortcut') {
    const found = strict ? index.shortcuts.filter(name => key(name) === k) : pick(index.shortcuts, name => key(name), k)
    if (found.length === 1) return ok('shortcut', found[0], found[0], 'Shortcuts')
    if (found.length > 1) return ambiguous(found.map(name => target_('shortcut', name, name, 'Shortcuts')))
    const typo = !strict && typoOf(k, index.shortcuts.map(name => [key(name), name]))
    if (typo) return ok('shortcut', typo, typo, 'Shortcuts (typo)')
    return none(`no Shortcut called "${target}"`)
  }

  // A modifier ("en Cursor", "en la terminal") wants a path: "design.md" is a file there, not an address.
  if (verb === 'open' && !asPath && (!kind || kind === 'url') && URLISH.test(target)) {
    // The address as typed: paths and queries can be case-sensitive.
    const typed = raw.split(/\s+/).find(word => key(word) === target)
    if (!strict || (typed && /^(https?:\/\/|www\.)/i.test(typed))) {
      const address = typed ?? target
      return ok('url', /^https?:/i.test(address) ? address : `https://${address}`, address, 'address')
    }
  }

  if (kind === 'url') return none(`"${target}" is not an address (set an alias for it)`)

  // "the vpn", "el correo": a role word names the app that does that job. Behind an alias and an exact folder or file
  // of that name, ahead of every partial match. An exact app name is the app, unless the person's own [roles] entry
  // says otherwise (their choice is final; a default handler is only inferred). A kind word ("the vpn pdf", "carpeta
  // calendario"), a find and a path wanted by a modifier leave the role out. Once a word is a role it never falls
  // through to the partial matcher or a list of files: no app to point to (not installed, several, no handler answer)
  // is a pass. On a model's answer it stands only for exactly a role word, which `k` is here: the whole target.
  const role = (verb === 'open' || verb === 'reveal') && !kind && !exact && !asPath ? roleOf(k) : undefined
  const named = Object.hasOwn(index.folders, k) || (index.files ?? []).some(path => key(basename(path)) === k) || (Object.hasOwn(index.apps, k) && !config.roles?.[role])
  // The person's entry yields to an exact folder, which the ordinary rules would let the exact app of that name beat.
  if (role && config.roles?.[role] && Object.hasOwn(index.folders, k)) return ok('folder', index.folders[k], target, 'known folders')
  if (role && !named) {
    // "in Finder" asks for the Finder, not for an app.
    const app = ['', 'open'].includes(placeVerb(raw) ?? '') ? resolveRole(role, { index, config }) : undefined
    return app ? ok('app', app, basename(app, '.app'), `role: ${role}`) : none(`"${target}" is a role reflex cannot point to one app for`)
  }

  if (verb === 'open' && (!kind || kind === 'app')) {
    const apps = strict ? Object.keys(index.apps).filter(name => name === k) : pick(Object.keys(index.apps), name => name, k)
    if (apps.length === 1) return ok('app', index.apps[apps[0]], basename(index.apps[apps[0]], '.app'), 'installed apps')
    const typo = !apps.length && typoOf(k, appEntries, folderEntries)
    if (typo) return ok('app', typo, basename(typo, '.app'), 'installed apps (typo)')
    if (kind === 'app') return apps.length ? ambiguous(apps.map(name => target_('app', index.apps[name], basename(index.apps[name], '.app'), 'installed apps'))) : none(`no app called "${target}"`)
  }

  // "show me the calendar": a typed show/reveal naming an installed app exactly brings the app up (the plan turns the verb
  // into an open), unless a folder or file is named exactly the same (then, as before, that one is revealed or asked about)
  // or the phrase says "in Finder" (which keeps the reveal).
  if (verb === 'reveal' && !strict && (!kind || kind === 'app') && Object.hasOwn(index.apps, k) && placeVerb(raw) !== 'reveal'
    && !Object.hasOwn(index.folders, k) && !(index.files ?? []).some(path => key(basename(path)) === k)) {
    return ok('app', index.apps[k], basename(index.apps[k], '.app'), 'installed apps')
  }

  if (!kind || kind === 'folder') {
    if (index.folders[k]) return ok('folder', index.folders[k], target, 'known folders')
    const z = strict ? undefined : zoxide(target)
    if (z && key(basename(z)).includes(k)) return ok('folder', z, basename(z), 'zoxide')
    // A folder typo yields to an app that fits as well, when the verb could have opened either.
    const typo = typoOf(k, folderEntries, ...(verb === 'open' && !kind ? [appEntries] : []))
    if (typo) return ok('folder', typo, basename(typo), 'known folders (typo)')
    if (kind === 'folder') return none(`no folder called "${target}"`)
  }

  if (strict) return groundModelFile(k, verb, kind, target, index, raw, { via: source === 'model' ? 'file list (model)' : 'file list (exact name)' })

  const words = k.split(/[\s/_-]+/).filter(word => word && !STOP.has(word))
  if (!words.length) return none('nothing to look for')
  let files = searchFiles(index.files ?? [], words)
  if (kind === 'image' || (verb === 'copy' && !kind)) {
    const images = files.filter(path => IMAGE.has(extname(path).toLowerCase()))
    if (kind === 'image' || images.length) files = images
  }
  if (files.length === 1) return ok(isDir(files[0]) ? 'folder' : 'file', files[0], basename(files[0]), 'file list')
  if (files.length > 1) return ambiguous(files.slice(0, 9).map(path => target_(isDir(path) ? 'folder' : 'file', path, short(path), 'file list')))
  return none(`nothing found for "${target}"`)
}

/**
 * A file a model names. The target is the file's name, optionally scoped by a known folder: its words
 * split into an optional key of `index.folders` ("reflex", "brand") and the file words; the basename stem,
 * split on `-_. ` and camelCase, has to equal the file words (accents and case aside), or equal them plus
 * one kind token ("design-doc"); a named folder has to hold the file; and exactly one file fits. Two or
 * more drop: "which one?" must not come from a model guess. A word that merely occurs somewhere in a
 * path never counts. Only for open, reveal and copy.
 */
function groundModelFile(k, verb, kind, target, { files = [], folders = {} }, raw = '', { via = 'file list (model)' } = {}) {
  const nothing = none(`"${target}" is not a name reflex knows`)
  // Reachable: "reveal the roadmap app" reaches here with kind app, and an app is no file.
  if (!['open', 'reveal', 'copy'].includes(verb) || (kind && kind !== 'file' && kind !== 'image')) return nothing
  const said = k.split(/[\s/_.-]+/).filter(word => word && !STOP.has(word))
  const words = said.filter(word => !FILE_KINDS.has(word))
  const around = raw ? aroundTarget(raw, k.split(/\s+/), folders) : { kinds: [] }
  if (!around) return nothing
  const kinds = [...said.filter(word => FILE_KINDS.has(word)), ...around.kinds]
  if (kinds.some(word => NOT_A_FILE.has(word))) return nothing
  if (!words.some(word => word.length >= 3)) return nothing
  const scopes = [undefined]
  for (const [name, dir] of Object.entries(folders)) {
    const parts = name.split(' ')
    for (let i = 0; i + parts.length <= words.length; i++) {
      if (parts.every((part, j) => words[i + j] === part) && words.length > parts.length) scopes.push({ dir, words: [...words.slice(0, i), ...words.slice(i + parts.length)] })
    }
  }
  // A folder named beside the target ("el tessera syntax", "syntax de tessera") narrows the files like one inside it.
  const candidates = files.filter(path => (around.scopes ?? []).every(dir => path.startsWith(dir.replace(/\/$/, '') + '/')))
  const found = new Set()
  for (const scope of scopes) {
    const wanted = scope?.words ?? words
    for (const path of candidates) {
      if (scope && !path.startsWith(scope.dir.replace(/\/$/, '') + '/')) continue
      const stem = stemTokens(path)
      const without = stem.findIndex(token => FILE_KINDS.has(token))
      if (same(stem, wanted) || same(fullTokens(path), wanted) || (without >= 0 && same(stem.filter((_, i) => i !== without), wanted))) found.add(path)
    }
  }
  const wantsImage = kind === 'image' || kinds.some(word => IMAGE_KINDS.has(word))
  const fits = path => !(wantsImage && !IMAGE.has(extname(path).toLowerCase())) && !(kinds.includes('md') && extname(path).toLowerCase() !== '.md')
  if (found.size !== 1) return nothing
  const [path] = found
  if (!fits(path)) return nothing
  return ok(isDir(path) ? 'folder' : 'file', path, basename(path), via)
}

// The words around a model's target have to be known, because the model drops what it does not copy
// ("el repo syntax" becomes "syntax", "las fotos syntax" too) and a deny-list of kind words keeps leaking.
const DETERMINERS = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'the', 'my', 'mi', 'mis', 'ese', 'este', 'that', 'this'])
const PREPOSITIONS = new Set(['de', 'del', 'a', 'al', 'of', 'to', 'en'])
const FORM_ENDS = new Set(REQUEST_FORMS.map(({ form }) => key(form.split('…')[0].trim().split(' ').at(-1))))
const FILLER_WORDS = /\b(ya|now|please|porfa|por favor|again|otra vez|ahora|for me|para mi|anda|gracias|thanks)\b/g

const FORM_STARTS = new Set(REQUEST_FORMS.map(({ form }) => key(form.split('…')[0].trim())))
const WANTS = new Set(['quiero', 'necesito', 'want', 'need'])
// The whole lead has to be the speaker's own words, nothing before them: "they want to see X" or "Ana me abre X" is about someone else.
const LEAD = "(quiero|necesito)( que)?|((i|we) )?(want|need) to|(i'd|i d|id) like to|can you|could you|would you|puedes|me|please|porfa|por favor"
const SPEAKER_LEADS = new RegExp(`^(${LEAD})(\\s+(${LEAD}))*$`)
/** Whether the request word at the end of `before` + `word` is the speaker's own. */
function speakers(before, word) {
  let lead = before.join(' ')
  for (let again = true; again;) { const cut = lead.replace(FILLERS, ''); again = cut !== lead; lead = cut }
  return !lead || FORM_STARTS.has(`${lead} ${word}`) || SPEAKER_LEADS.test(lead) || (WANTS.has(word) && /^(i|we)$/.test(lead))
}

/**
 * The kind words next to the target, or undefined when a word there is not known. Before it (past
 * articles) only the end of a request form, a preposition, a document or image kind, a known folder or
 * nothing; after it only the end, fillers, a closing place, a document or image kind, and "de <known
 * folder>" (returned as `folder`, which has to hold the file).
 */
function aroundTarget(raw, words, folders) {
  // A colon splits words except in an address ("https://…").
  const tokens = normalise(raw).split(/[\s,;¿?¡!"'()]+|:(?!\/\/)/).filter(Boolean)
  const first = tokens.indexOf(words[0]), last = tokens.lastIndexOf(words.at(-1))
  if (first < 0 || last < first) return undefined
  const kinds = []
  // A preposition only passes the word before it on: "llévame a X" is a request, "el vídeo del X" is not.
  // A request word has to be the speaker's: it starts the phrase (after fillers) or follows "quiero",
  // "I want to", "can you", "me", "please"…, so "can Ana open the syntax" is somebody else's request.
  const scopes = []
  let before = first
  do {
    before--
    while (before >= 0 && DETERMINERS.has(tokens[before])) before--
    // "turn on <Shortcut>": the request word is "turn", and "on" is the end of the form.
    if (tokens[before] === 'on' && tokens[before - 1] === 'turn') before--
    const prev = tokens[before]
    if (prev === undefined) break
    if (PREPOSITIONS.has(prev)) continue
    if (prev in folders) scopes.push(folders[prev])
    else if (prev !== 'me' && !DOC_KINDS.has(prev) && !IMAGE_KINDS.has(prev) && !NOT_A_FILE.has(prev) && !(REQUEST.test(prev) || FORM_ENDS.has(prev) ? speakers(tokens.slice(0, before), prev) : false)) return undefined
    if (DOC_KINDS.has(prev) || IMAGE_KINDS.has(prev) || NOT_A_FILE.has(prev)) kinds.push(prev)
    break
  } while (before >= 0)
  let rest = tokens.slice(last + 1)
  while (rest.length) {
    const next = rest[0]
    if (DOC_KINDS.has(next) || IMAGE_KINDS.has(next) || NOT_A_FILE.has(next)) { kinds.push(next); rest = rest.slice(1); continue }
    if (['de', 'del', 'of'].includes(next)) {
      const name = Object.keys(folders).find(candidate => rest.slice(1, 1 + candidate.split(' ').length).join(' ') === candidate)
      if (!name) return undefined
      scopes.push(folders[name]); rest = rest.slice(1 + name.split(' ').length); continue
    }
    break
  }
  const tail = rest.join(' ').replace(FILLER_WORDS, ' ').replace(/\s+/g, ' ').trim()
  if (tail && !placeVerb(`x ${tail}`)) return undefined
  return { kinds, scopes }
}

/** The whole basename, extension included, in the same tokens: "watchmen-post.png" is [watchmen, post, png]. */
const fullTokens = path => key(basename(path).replace(/([a-z0-9])([A-Z])/g, '$1 $2')).split(/[\s\-_.]+/).filter(Boolean)
const same = (a, b) => a.length === b.length && a.every((token, i) => token === b[i])
/** The basename without its extension, in lower-case tokens split on `-_. ` and camelCase. */
function stemTokens(path) {
  const name = basename(path)
  const stem = isDir(path) ? name : basename(name, extname(name))
  return key(stem.replace(/([a-z0-9])([A-Z])/g, '$1 $2')).split(/[\s\-_.]+/).filter(Boolean)
}

/**
 * Values of the names one typo away from the key (an edit, or two letters swapped): 1 below 8
 * characters, 2 from 8, and only between a typed key and a name of 5 or more characters. Distinct values, so two names for the same
 * folder count once.
 */
function typos(k, entries) {
  if (k.length < MIN_TYPO) return []
  const found = entries.filter(([name]) => name.length >= MIN_TYPO && distance(k, name) <= (name.length >= 8 ? 2 : 1))
  return [...new Set(found.map(([, value]) => value))]
}

/** The one value a typo of `k` can mean, or nothing: none, several, or one that a rival kind of name also fits. */
function typoOf(k, entries, ...rivals) {
  const found = typos(k, entries)
  return found.length === 1 && rivals.every(rival => !typos(k, rival).length) ? found[0] : undefined
}

/** Edit distance counting a swap of two neighbours as one edit. */
export function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
  }
  return d[a.length][b.length]
}

/** Names equal to the key win; otherwise the ones that start with it; otherwise the ones that contain it. */
function pick(names, toKey, k) {
  for (const test of [n => toKey(n) === k, n => toKey(n).startsWith(k), n => toKey(n).includes(k)]) {
    const found = names.filter(test)
    if (found.length) return found
  }
  return []
}

/** Files whose path holds every word, the name holding at least one; shortest paths first. */
export function searchFiles(files, words) {
  return files.filter(path => {
    const k = key(path)
    return words.every(word => k.includes(word)) && words.some(word => key(basename(path)).includes(word))
  }).sort((a, b) => a.length - b.length)
}

function queryZoxide(target) {
  try { return execFileSync('zoxide', ['query', '--', ...target.split(' ')], { encoding: 'utf8', timeout: 1000, stdio: ['ignore', 'pipe', 'ignore'] }).trim() || undefined } catch { return undefined }
}

const target_ = (type, value, label, via) => ({ type, value, label, via })
const ok = (...args) => ({ status: 'ok', target: target_(...args) })
const ambiguous = candidates => ({ status: 'ambiguous', candidates })
const none = reason => ({ status: 'none', reason })
const isDir = path => { try { return statSync(path).isDirectory() } catch { return false } }
const short = path => path.replace(homedir(), '~')
