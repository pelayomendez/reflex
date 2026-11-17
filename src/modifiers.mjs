// Modifiers: the closed, bilingual table of words that say where or with what an action happens
// ("en Cursor", "en la terminal", "para editar", "en la línea 40", "en GitHub", "la ruta de"). A rule strips them
// from the phrase before the templates and the model see it, so the model's catalogue (src/catalogue.mjs)
// stays as it was trained. Each role turns an ordinary request into an action of its own: `edit` (a file or folder
// in an editor), `terminal` (a folder in a terminal window), `web` (a repo's page on its host) and `path` (the
// absolute path of a file or folder, copied as text).
//
// The table is data. Adding a word, an editor or a terminal is an entry here, not a new rule.

import { basename } from 'node:path'
import { key } from './index.mjs'
import { TERMINAL_NOUNS } from './vocab.mjs'

// Words are written without accents and in lower case: phrases are matched folded the same way.
export const MODIFIERS = {
  editor: {
    verb: 'edit',
    // "<preposition> <determiner>* <noun>": en el editor, in my editor, con el editor
    prepositions: ['en', 'con', 'in', 'with'],
    determiners: ['el', 'mi', 'un', 'the', 'my', 'an', 'a'],
    nouns: ['editor'],
    // whole closing clauses
    clauses: ['para editar', 'para editarlo', 'para editarla', 'to edit', 'to edit it'],
    // "<preposition> <app>": en Cursor, in VS Code. Name as said → name as installed (the key of the app index).
    appPrepositions: ['en', 'con', 'usando', 'in', 'with', 'using'],
    apps: {
      cursor: 'cursor', 'vs code': 'visual studio code', vscode: 'visual studio code', 'visual studio code': 'visual studio code',
      zed: 'zed', sublime: 'sublime text', 'sublime text': 'sublime text', textmate: 'textmate', bbedit: 'bbedit', nova: 'nova', windsurf: 'windsurf', textedit: 'textedit',
    },
  },
  terminal: {
    verb: 'terminal',
    prepositions: ['en', 'in'],
    determiners: ['la', 'el', 'una', 'mi', 'otra', 'nueva', 'un', 'the', 'a', 'my', 'another', 'new'],
    nouns: TERMINAL_NOUNS,
    clauses: [],
    appPrepositions: ['en', 'con', 'usando', 'in', 'with', 'using'],
    // Only terminals known to open a window in the folder given to `open -a <app> <folder>`: Terminal and Ghostty were checked by hand
    // (a shell with that cwd appeared), iTerm is documented to. Any other (Warp, Kitty, Alacritty, WezTerm, Hyper…) may open
    // its default directory instead, which would be a wrong action, so it goes to Claude.
    apps: { ghostty: 'ghostty', iterm: 'iterm', iterm2: 'iterm', 'iterm 2': 'iterm' },
    // "abre una terminal en X" and "terminal en X": the terminal is the verb's object and X the place.
    placePrepositions: ['en', 'in', 'at', 'on', 'dentro de', 'inside'],
  },
  web: {
    verb: 'web',
    prepositions: ['en', 'in', 'on'],
    determiners: ['el', 'la', 'mi', 'the', 'my'],
    nouns: ['navegador', 'web', 'browser'],
    clauses: [],
    appPrepositions: ['en', 'in', 'on'],
    // The host as said. Naming one asks for that forge: a repo whose origin lives elsewhere is not opened there (see `forges`).
    apps: { github: 'github', gitlab: 'gitlab' },
    // How a named host is held to the origin's host. GitLab may be self-hosted at any name, so it only rules out the other forges.
    forges: { github: /(^|\.)github\./i, gitlab: /^(?!.*(^|\.)(github|bitbucket)\.)/i },
  },
  path: {
    verb: 'path',
    // "copia la ruta de X", "copy the full path of X": the path is the object and X the thing. Rewritten to a find
    // ("busca X"), which grounds X as strictly as a find does; the clipboard place is part of the form.
    verbs: ['copia', 'copiame', 'copias', 'copiar', 'copy'],
    determiners: ['el', 'la', 'mi', 'the', 'my'],
    nouns: ['ruta', 'path'],
    qualifiers: ['completa', 'absoluta', 'full', 'absolute'],
    prepositions: ['de', 'del', 'a', 'al', 'of', 'to', 'for'],
    clipboard: ['al portapapeles', 'en el portapapeles', 'en mi portapapeles', 'to the clipboard', 'to my clipboard', 'on the clipboard', 'in the clipboard'],
  },
}

// "at line 40", "en la linea 40": a line of the file, for the editor role only. A bare "line 3" / "linea 4" is a line only right
// after a stated editor ("en Cursor linea 40"): "abre harbor line 3" names a file.
export const LINE_WORDS = ['en la linea', 'en linea', 'at line', 'on line']
export const BARE_LINE_WORDS = ['linea', 'line']
export const MAX_LINE = 100000
export const TERMINAL_APPS = new Set(['terminal', 'iterm', 'ghostty'])

// What an editor is asked to open: text. Extensions, and extensionless names (Makefile, Dockerfile, dotfiles like .zshrc).
export const TEXT_EXTENSIONS = new Set('md markdown txt json jsonc yaml yml toml js mjs cjs ts tsx jsx mts cts py go rs sh bash zsh css scss html htm xml csv tsv ini env cfg conf svg rb java kt swift c h cpp hpp lua sql graphql vue svelte log'.split(' '))
export const TEXT_NAMES = new Set(['makefile', 'dockerfile', 'gemfile', 'rakefile', 'procfile', 'license', 'readme', 'changelog'])
export function isTextFile(path) {
  const name = basename(path).toLowerCase()
  const dot = name.lastIndexOf('.')
  if (dot > 0) return TEXT_EXTENSIONS.has(name.slice(dot + 1))
  return dot === 0 || TEXT_NAMES.has(name)
}

// The editors that can be sent to a line, by the URL scheme their app registers: `open cursor://file/<path>:<line>`.
export const LINE_SCHEMES = { cursor: 'cursor', 'visual studio code': 'vscode' }

// GUI editors by the command a person puts in $VISUAL/$EDITOR or `[editor] command`. Terminal editors (vim, nano, emacs)
// are not here: reflex opens a window, so they fall through to the system default text app.
export const GUI_COMMANDS = { code: 'visual studio code', cursor: 'cursor', zed: 'zed', subl: 'sublime text', mate: 'textmate', bbedit: 'bbedit', nova: 'nova', windsurf: 'windsurf' }

const TAIL = '(?:[\\s,]*(?:por favor|porfa|please|gracias|thanks))?[\\s?!.]*$'
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const any = words => `(?:${[...words].sort((a, b) => b.length - a.length).map(escape).join('|')})`
const spaced = words => any(words).replace(/\\ /g, '\\s+')

/** Accents and capitals folded away character by character, so an offset in the folded text is one in the typed text. */
const fold = text => [...text].map(char => char.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()).join('')

const END = `(?=${TAIL})`
const compile = ([role, { prepositions, determiners, nouns, clauses, appPrepositions, apps }]) => ({
  role,
  generic: new RegExp(`[\\s,]+(?:${any(prepositions)}\\s+(?:${any(determiners)}\\s+)*${any(nouns)}${clauses.length ? `|${spaced(clauses)}` : ''})${END}`),
  named: new RegExp(`[\\s,]+${any(appPrepositions)}\\s+(${spaced(Object.keys(apps))})${END}`),
})
// A role with a closing form of its own (a `nouns` list and the rest): the others are leading forms, below.
const TRAILING = Object.entries(MODIFIERS).filter(([, entry]) => entry.appPrepositions).map(compile)
const LINE = new RegExp(`[\\s,]+${spaced(LINE_WORDS)}\\s+(\\d{1,6})${END}`)
const BARE_LINE = new RegExp(`[\\s,]+${spaced(BARE_LINE_WORDS)}\\s+(\\d{1,6})${END}`)
const COLON_LINE = new RegExp(`(?<=[^\\s:]):(\\d{1,6})${END}`)
const TERMINAL_OBJECT = new RegExp(`^((?:\\S+\\s+){0,3})(abre|abreme|abres|abrir|abrime|open)\\s+(?:${any(MODIFIERS.terminal.determiners)}\\s+)*${any(MODIFIERS.terminal.nouns)}\\s+${spaced(MODIFIERS.terminal.placePrepositions)}\\s+(?=\\S)`)
const PATH_OBJECT = new RegExp(`^((?:\\S+\\s+){0,3})${any(MODIFIERS.path.verbs)}\\s+(?:${any(MODIFIERS.path.determiners)}\\s+)?(?:${any(MODIFIERS.path.qualifiers)}\\s+)?${any(MODIFIERS.path.nouns)}\\s+(?:${any(MODIFIERS.path.qualifiers)}\\s+)?${any(MODIFIERS.path.prepositions)}\\s+(?=\\S)`)
const PATH_CLIPBOARD = new RegExp(`[\\s,]+${spaced(MODIFIERS.path.clipboard)}${END}`)
const TERMINAL_LEAD = new RegExp(`^([¿¡\\s]*(?:(?:oye|hey|porfa|por favor|please)[\\s,]*)*)${any(MODIFIERS.terminal.nouns)}\\s+(en|in)\\s+(?=\\S)`)

/**
 * Reads the modifiers off a typed phrase.
 * @returns {undefined | { phrase: string, role?: 'editor'|'terminal'|'web'|'path', app?: string, line?: number, rewritten: boolean, conflict?: string }}
 *   nothing when the phrase holds no modifier; otherwise the phrase without them, the role, the app named (the key it has in the
 *   app index), the line, and whether the verb was rewritten ("terminal en X" → "abre X": such a phrase is for the templates alone).
 *   `conflict` says why the phrase asks for two things at once.
 */
export function extractModifier(typed) {
  const folded = fold(typed)
  // A character that folds to a different number of characters would shift every offset: no rule then.
  if (folded.length !== typed.length) return undefined
  let phrase = typed, text = folded
  const found = { roles: new Set(), apps: new Set() }
  let line, colon, rewritten = false
  const cut = match => {
    phrase = phrase.slice(0, match.index) + phrase.slice(match.index + match[0].length)
    text = text.slice(0, match.index) + text.slice(match.index + match[0].length)
  }

  // The leading forms first, then the closing clauses, in whatever order they come.
  let match
  if ((match = PATH_OBJECT.exec(text))) {
    // "copia la ruta de X" becomes "busca X": the find grounds X strictly and the path is made of what it found.
    const verb = 'busca '
    phrase = phrase.slice(0, match[1].length) + verb + phrase.slice(match[0].length)
    text = text.slice(0, match[1].length) + verb + text.slice(match[0].length)
    found.roles.add('path'); rewritten = true
    if ((match = PATH_CLIPBOARD.exec(text))) cut(match)
  } else if ((match = TERMINAL_OBJECT.exec(text))) {
    const lead = match[1].length + match[2].length + 1
    phrase = phrase.slice(0, lead) + phrase.slice(match[0].length)
    text = text.slice(0, lead) + text.slice(match[0].length)
    found.roles.add('terminal')
  } else if ((match = TERMINAL_LEAD.exec(text))) {
    const verb = match[2] === 'in' ? 'open ' : 'abre '
    phrase = phrase.slice(0, match[1].length) + verb + phrase.slice(match[0].length)
    text = text.slice(0, match[1].length) + verb + text.slice(match[0].length)
    found.roles.add('terminal'); rewritten = true
  }
  for (let again = true; again;) {
    again = false
    if ((match = LINE.exec(text))) { if (line !== undefined) return conflicting(phrase, 'two lines'); line = Number(match[1]); cut(match); again = true; continue }
    if ((match = BARE_LINE.exec(text)) && (TRAILING[0].generic.test(text.slice(0, match.index)) || TRAILING[0].named.test(text.slice(0, match.index)))) { if (line !== undefined) return conflicting(phrase, 'two lines'); line = Number(match[1]); cut(match); again = true; continue }
    if ((match = COLON_LINE.exec(text))) { if (colon !== undefined) return conflicting(phrase, 'two lines'); colon = Number(match[1]); cut(match); again = true; continue }
    for (const { role, generic, named } of TRAILING) {
      if ((match = generic.exec(text))) { found.roles.add(role); cut(match); again = true; break }
      if ((match = named.exec(text))) { found.roles.add(role); found.apps.add(`${role}:${MODIFIERS[role].apps[match[1].replace(/\s+/g, ' ')]}`); cut(match); again = true; break }
    }
  }
  // A line says the editor, whatever else is said; a ":40" only counts beside an editor that was said, so an address with a port is left alone.
  if (line !== undefined) found.roles.add('editor')
  if (colon !== undefined && !found.roles.has('editor')) return found.roles.size ? conflicting(phrase, 'a line number needs an editor') : undefined
  if (colon !== undefined) line = line ?? colon
  if (line !== undefined && !(line >= 1 && line <= MAX_LINE)) return conflicting(phrase, 'not a line number')
  if (!found.roles.size) return undefined
  if (found.roles.size > 1) return conflicting(phrase, 'asks for more than one place or action')
  const [role] = found.roles
  if (found.apps.size > 1) return conflicting(phrase, 'names two apps')
  if (role === 'terminal' && line !== undefined) return conflicting(phrase, 'a line number needs an editor')
  const [app] = [...found.apps]
  return { phrase: phrase.replace(/\s{2,}/g, ' '), role, app: app?.slice(role.length + 1), line, rewritten }
}

const conflicting = (phrase, conflict) => ({ phrase, conflict, rewritten: false })

/**
 * The app a modifier runs in, from the phrase, the config or the environment.
 * @returns {{ app: string | null, label: string, scheme?: string, via: string } | { reason: string }}
 *   `app` is null for the system's default text app (`open -t`).
 */
export function resolveApp({ role, app, line }, { index, config = {}, env = process.env }) {
  const installed = name => {
    const at = key(String(name)).replace(/\.app$/, '')
    const path = Object.hasOwn(index.apps, at) ? index.apps[at] : undefined
    return path && { key: at, app: path, label: basename(path, '.app') }
  }
  const aLine = found => {
    if (line === undefined) return found
    const scheme = LINE_SCHEMES[found.key]
    return scheme ? { ...found, scheme } : { reason: `${found.label} cannot be opened at a line` }
  }
  const finish = (found, via) => ('reason' in found ? found : { app: found.app, label: found.label, scheme: found.scheme, via })
  if (role === 'terminal') {
    const wanted = app ?? (config.terminal?.app || 'terminal')
    const found = installed(wanted)
    if (found && !TERMINAL_APPS.has(found.key)) return { reason: `${found.label} does not open a terminal in a given folder reliably (only Terminal, iTerm and Ghostty are used)` }
    return found ? { app: found.app, label: found.label, via: app ? 'phrase' : config.terminal?.app ? 'config' : 'default' } : { reason: `${wanted} is not an installed app` }
  }
  if (app) {
    const found = installed(app)
    return found ? finish(aLine(found), 'phrase') : { reason: `${app} is not an installed app` }
  }
  if (config.editor?.app) {
    const found = installed(config.editor.app)
    return found ? finish(aLine(found), 'config') : { reason: `the configured editor ${config.editor.app} is not an installed app` }
  }
  if (config.editor?.command) {
    const wanted = GUI_COMMANDS[basename(String(config.editor.command).trim().split(/\s+/)[0])]
    const found = wanted && installed(wanted)
    return found ? finish(aLine(found), 'config') : { reason: `the configured editor command ${config.editor.command} is not a GUI editor reflex knows (set [editor] app)` }
  }
  for (const variable of [env.VISUAL, env.EDITOR]) {
    const wanted = GUI_COMMANDS[basename(String(variable ?? '').trim().split(/\s+/)[0])]
    const found = wanted && installed(wanted)
    if (found) return finish(aLine(found), 'environment')
  }
  if (line !== undefined) return { reason: 'the system default text app cannot be opened at a line' }
  return { app: null, label: 'the default text editor', via: 'system default' }
}
