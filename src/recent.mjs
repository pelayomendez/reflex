// What the hooks keep about what Claude made or showed in this session, and how a tool call or a reply becomes an item.
// Node-free on purpose: the hooks module (hooks/register.tsx) can import only plugin files that import nothing from node:*.
// Resolving a phrase against the list, which reads the disk, is src/context.mjs. See docs/research/session-context.md.
//
// Two kinds of item, newest first in one list: a file `{ path, at }` (absolute, no control characters) and a web address
// `{ url, at }` (http or https, no credentials, no token in it). The cap is per kind, so a reply full of links never
// pushes the files out.

export const RECENT_CAP = 20
const ODD_CHARACTERS = /[\u0000-\u001f\u007f‪-‮⁦-⁩]/

/** A file entry reflex may keep and act on: an absolute path with no control characters, and a time. */
export const validEntry = entry => !!entry && typeof entry.path === 'string' && entry.path.startsWith('/') && !ODD_CHARACTERS.test(entry.path) && Number.isFinite(entry.at)

// An address that carries a secret is never kept: a query key that reads like a credential, a value that looks like a
// token (a JWT, a long opaque run), a webhook. Credentials in the authority are stripped, the fragment is dropped.
const SECRET_KEY = /(token|secret|passw|pwd|credential|cred|auth|session|sig|key|jwt|bearer|otp|code|access|private|signature|apikey)/i
const OPAQUE_VALUE = /^(eyJ[\w-]+\.|[A-Za-z0-9_\-+/=]{32,}$)/
const MAX_URL = 2000

/** The address as reflex keeps it, or undefined when it is not one to keep. Idempotent: a kept address cleans to itself. */
export function cleanUrl(text) {
  if (typeof text !== 'string') return undefined
  const typed = text.trim()
  if (!/^https?:\/\//i.test(typed) || typed.length > MAX_URL || ODD_CHARACTERS.test(typed) || /[\s$`{}\\*<>"|^]/.test(typed)) return undefined
  let url
  try { url = new URL(typed) } catch { return undefined }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined
  const host = url.hostname
  if (!host || !(host.includes('.') || host === 'localhost' || host.startsWith('['))) return undefined
  if (host === 'hooks.slack.com' || /\/webhooks?\//i.test(url.pathname)) return undefined
  for (const [name, value] of url.searchParams) if (SECRET_KEY.test(name) || OPAQUE_VALUE.test(value)) return undefined
  url.username = ''
  url.password = ''
  url.hash = ''
  return url.toString()
}

/** A web address entry: kept only if it is an address reflex would keep, written exactly as it would keep it. */
export const validUrlEntry = entry => !!entry && typeof entry.url === 'string' && cleanUrl(entry.url) === entry.url && Number.isFinite(entry.at)
export const validItem = entry => validEntry(entry) || validUrlEntry(entry)

/** The web addresses in a text (a reply, a command), as kept: each once, in order of appearance. */
export function urlsIn(text) {
  if (typeof text !== 'string') return []
  const found = []
  for (const [raw] of text.matchAll(/https?:\/\/[^\s<>"'`)\]}]+/gi)) {
    const url = cleanUrl(raw.replace(/[.,;:!?*_]+$/, ''))
    if (url && !found.includes(url)) found.push(url)
  }
  return found
}

function put(list, item, same, cap) {
  const kept = [item, ...list.filter(entry => !same(entry))]
  const seen = { path: 0, url: 0 }
  return kept.filter(entry => seen['url' in entry ? 'url' : 'path']++ < cap)
}

/**
 * The list after Claude wrote `path` at `at`: newest first, the path once, at most `cap` files. Only an absolute path with
 * no control characters is kept (a relative one names nothing reflex could open later).
 */
export function record(list, path, at, cap = RECENT_CAP) {
  const before = Array.isArray(list) ? list : []
  if (!validEntry({ path, at })) return before
  return put(before, { path, at }, entry => entry.path === path, cap)
}

/** The list after an address showed up at `at`: as `record`, for addresses (cleaned first; an unsafe one changes nothing). */
export function recordUrl(list, url, at, cap = RECENT_CAP) {
  const before = Array.isArray(list) ? list : []
  const clean = cleanUrl(url)
  if (!clean || !Number.isFinite(at)) return before
  return put(before, { url: clean, at }, entry => entry.url === clean, cap)
}

/** The list after one item the CLI reported (`{ path }` or `{ url }`) at `at`; anything else changes nothing. */
export const recordItem = (list, item, at, cap = RECENT_CAP) => typeof item?.url === 'string' ? recordUrl(list, item.url, at, cap) : typeof item?.path === 'string' ? record(list, item.path, at, cap) : (Array.isArray(list) ? list : [])

/** The path a Write, Edit or NotebookEdit call is about, from the event's flat arguments. */
export const writtenPath = event => [event?.file_path, event?.notebook_path].find(value => typeof value === 'string')

/** Whether a finished tool call went through. Anything that says it failed is not a file Claude made. */
export const callSucceeded = result => !(result && typeof result === 'object' && (result.isError || result.is_error || result.error || typeof result.deny === 'string' || result.result?.interrupted === true))

/** A list as the CLI is handed it: what is neither `{ path, at }` nor `{ url, at }` is dropped; not JSON or not a list is an empty list. */
export function parseRecent(text) {
  let parsed
  try { parsed = JSON.parse(text) } catch { return [] }
  return Array.isArray(parsed) ? parsed.filter(validItem) : []
}

// ---- What a Bash command says about what it made --------------------------------------------------------------

// A shell line as tokens: words (quotes group them; nothing is expanded or run), the separators that end a command
// (; && || | & newline) and the redirects. `>` and `1>` name an output file; `2>`, `&>`, `<` and `>&n` do not.
function tokenize(command) {
  const tokens = []
  let word = '', started = false, quote = ''
  const flush = () => { if (started) tokens.push({ word }); word = ''; started = false }
  for (let at = 0; at < command.length; at++) {
    const char = command[at]
    if (quote) {
      if (char === quote) quote = ''
      else if (char === '\\' && quote === '"' && at + 1 < command.length) word += command[++at]
      else word += char
      continue
    }
    if (char === '"' || char === "'") { quote = char; started = true; continue }
    if (char === '\\' && at + 1 < command.length) { word += command[++at]; started = true; continue }
    if (char === '&' && command[at + 1] === '>') {
      flush(); at++
      while (command[at + 1] === '>') at++
      tokens.push({ redirect: 'skip' }); continue
    }
    if (char === '\n' || char === ';' || char === '|' || char === '&') { flush(); tokens.push({ end: true }); continue }
    if (char === '>' || char === '<') {
      const fd = started && /^\d$/.test(word) ? word : ''
      if (fd) { word = ''; started = false } else flush()
      while (char === '>' && command[at + 1] === '>') at++
      const dup = char === '>' && command[at + 1] === '&'
      if (dup) at++
      tokens.push({ redirect: char === '>' && !dup && (fd === '' || fd === '1') ? 'output' : 'skip' }); continue
    }
    if (/\s/.test(char)) { flush(); continue }
    word += char; started = true
  }
  flush()
  return tokens
}

const OPEN_WITH_ARGUMENT = new Set(['-a', '-b'])
const NOT_A_PATH = /[$`*?\[\]{}<>~]|^-/
const aPath = word => word.length > 0 && word.length < 1024 && !ODD_CHARACTERS.test(word) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(word)

/**
 * What a command line names, with no disk read: `urls` (every http(s) address in it, as kept), `opened` (what an `open`
 * was given: `paths` and `urls`) and `named` (every other word that could be a file: an argument, an `-o=file` value, the
 * target of `>`). Whether a named path exists and was made by the call is for the CLI to read off the disk.
 * @returns {{ urls: string[], opened: { paths: string[], urls: string[] }, named: string[] }}
 */
export function bashFacts(command) {
  const facts = { urls: urlsIn(command), opened: { paths: [], urls: [] }, named: [] }
  if (typeof command !== 'string' || command.length > 20_000) return facts
  const commands = []
  let words = []
  const finish = () => { if (words.length) commands.push(words); words = [] }
  let next
  for (const token of tokenize(command)) {
    if (token.end) { finish(); next = undefined; continue }
    if (token.redirect) { next = token.redirect; continue }
    if (next === 'output') { if (aPath(token.word) && !NOT_A_PATH.test(token.word.replace(/^~\//, ''))) facts.named.push(token.word); next = undefined; continue }
    if (next === 'skip') { next = undefined; continue }
    words.push(token.word)
  }
  finish()
  for (const line of commands) {
    const start = line.findIndex(word => !/^[A-Za-z_]\w*=/.test(word))
    if (start < 0) continue
    const [head, ...args] = line.slice(start)
    if (head.split('/').at(-1) === 'open') {
      for (let at = 0; at < args.length; at++) {
        const arg = args[at]
        if (arg === '--args') break
        if (OPEN_WITH_ARGUMENT.has(arg)) { at++; continue }
        if (arg.startsWith('-')) continue
        const url = cleanUrl(arg)
        if (url) facts.opened.urls.push(url)
        else if (aPath(arg) && !NOT_A_PATH.test(arg.replace(/^~\//, ''))) facts.opened.paths.push(arg)
      }
      continue
    }
    for (const arg of args) {
      const word = /^--?[A-Za-z][\w-]*=/.test(arg) ? arg.replace(/^--?[A-Za-z][\w-]*=/, '') : arg
      if (aPath(word) && !NOT_A_PATH.test(word.replace(/^~\//, ''))) facts.named.push(word)
    }
  }
  const once = list => [...new Set(list)].slice(0, 40)
  return { urls: facts.urls, opened: { paths: once(facts.opened.paths), urls: once(facts.opened.urls) }, named: once(facts.named) }
}
