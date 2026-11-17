// Session context: "abre ese doc", "open it" mean the file Claude just wrote, which reflex cannot know from the Mac
// alone. The hooks keep a short list of the files Claude wrote (newest first) and hand it to the CLI with each
// phrase (`--recent <json>`); this module records into that list and resolves a deictic phrase against it.
// Templates only: a model never sees a deictic phrase. See docs/research/session-context.md.

import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { extname, isAbsolute, join, resolve as resolvePath } from 'node:path'
import { key } from './index.mjs'
import { FILLERS, normalise } from './phrase.mjs'
import { webUrl } from './remote.mjs'
import { OPENABLE } from './selectors.mjs'
import { bashFacts, cleanUrl, validEntry, validUrlEntry } from './recent.mjs'
import { DEICTIC_DETERMINERS, GENERIC_NOUNS, VERBS } from './vocab.mjs'
import { remoteOf, siteFiles } from './world.mjs'
export { RECENT_CAP, callSucceeded, cleanUrl, parseRecent, record, recordUrl, urlsIn, writtenPath } from './recent.mjs'

/** Older than this, "that doc" is no longer plainly the one Claude just made. */
export const FRESH_MS = 30 * 60 * 1000
/** Two fitting files written this close together are one turn's work: which one is meant is not for reflex to guess. */
export const SAME_TURN_MS = 5 * 60 * 1000

const IMAGE = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp']
const DOC = ['md', 'txt', 'docx', 'pdf', 'rtf', 'html', 'doc', 'pages', 'odt']
// What each generic noun may mean on disk (the nouns are src/vocab.mjs's GENERIC_NOUNS). html and svg fit a kind and are
// then shown in Finder, never opened: OPENABLE decides below.
const EXTENSIONS = {
  doc: DOC, image: IMAGE,
  deck: ['pptx', 'ppt', 'key', 'odp', 'pdf'],
  sheet: ['xlsx', 'xls', 'csv', 'numbers', 'ods'],
  video: ['mp4', 'mov', 'm4v', 'mkv', 'avi', 'webm'],
  diagram: ['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif', 'pdf'],
  pdf: ['pdf'],
}
// A noun's kind may have a wider set than the old templates' (a picture is also heic and tiff) but never a different file.
const NOUN_EXTENSIONS = { ...EXTENSIONS, image: [...IMAGE, 'heic', 'tif', 'tiff'] }
// Anything `open` could run (a script, a .command, an app, an archive, html, svg) is shown in Finder at most, however the phrase worded it.
// The policy is selectors.mjs's OPENABLE alone: a page that can run script (html, svg) is shown in Finder, never opened.
const OPENS_SAFELY = OPENABLE
const extensionOf = path => extname(path).slice(1).toLowerCase()
/** Whether a file's kind fits what the phrase named: a doc, an image, or anything for "it" and "that file". */
export const fitsKind = (kind, path, table = EXTENSIONS) => kind === 'any' || !!table[kind]?.includes(extensionOf(path))

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

// The phrase as plain words: folded, fillers and clause punctuation gone ("open it, please" is "open it").
function wordsOf(phrase) {
  let said = normalise(phrase).replace(/[’‘]/g, "'")
  for (let again = true; again;) { const cut = said.replace(FILLERS, ''); again = cut !== said; said = cut }
  // Punctuation that ends a clause ("open it, please", "open it.") is not part of the words; one inside a name (that.pdf) stays.
  return said.replace(/[,;:.!?]+(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim().replace(POLITE_END, '')
}

// ---- A generic noun with an article: «the website», «el doc», «la web de reflex» ------------------------------------
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const alternatives = words => `(?:${[...new Set(words)].sort((a, b) => b.length - a.length).map(word => escape(word).replace(/ /g, '\\s+')).join('|')})`
const KIND_OF_NOUN = new Map(GENERIC_NOUNS.flatMap(({ kind, en, es }) => [...en, ...es].map(noun => [noun, kind])))
const NOUN = alternatives(KIND_OF_NOUN.keys())
const nounsOf = kinds => GENERIC_NOUNS.filter(entry => kinds.includes(entry.kind)).flatMap(({ en, es }) => [...en, ...es])
const WEB_NOUN = alternatives(nounsOf(['web']))
// Only an address can be «of» a project: «the website of reflex». Behind «the post of watchmen» or «el repo de brand» stands a
// name (the file watchmen, the folder brand), which the ordinary rules read as they always did.
const QUALIFIABLE = ['web', 'pr', 'link']
const NOUN_Q = alternatives(nounsOf(QUALIFIABLE))
const DET = alternatives([...DEICTIC_DETERMINERS.en, ...DEICTIC_DETERMINERS.es])
const OF = '(?:de|del|de la|de los|de las|of)'
const OPEN_VERBS = [...VERBS.open]
const REVEAL_VERBS = [...VERBS.reveal, 'show me']
const LEAD = new RegExp(`^(${alternatives([...OPEN_VERBS, ...REVEAL_VERBS])})\\s+(.+)$`)
// The words that end a name: whatever follows is another request, a place or a closing remark.
const NAME_STOP = new Set(['and', 'y', 'e', 'then', 'luego', 'despues', 'with', 'con', 'en', 'in', 'on', 'to', 'al', 'a', 'por', 'for', 'para', 'no', 'not', 'that', 'que', 'delete', 'borra', 'it', 'lo', 'la', 'el', 'the'])
const NAME = String.raw`([a-z0-9][a-z0-9._-]*(?:\s+[a-z0-9][a-z0-9._-]*){0,2})`
const validName = name => !!name && name.split(' ').every(word => !NAME_STOP.has(word) && !DET_WORDS.has(word)) && !KIND_OF_NOUN.has(name)
// What may follow the noun and still leave it the whole thing the person pointed at: the end, a qualifier, a place, a conjunction,
// a closing remark. A name after it ("the file roadmap") makes the noun a kind word in front of a name, which the ordinary rules read.
const AFTER = String.raw`(?=$|\s+(?:in|en|on|with|con|and|y|e|then|luego|despues|to|al|a|para|for|that|que|as|from|desde|at|por|ya|now|again|otra vez|ahora|gracias|thanks|please|porfa|por favor)\b)`
// «en la web» / «in the browser» name a place, not a thing: a determiner right after in, en or on is not pointing.
const PLACED = String.raw`(?:^|\s)(?<!\b(?:en|in|on)\s)`
const WITH_DET = new RegExp(`${PLACED}${DET}\\s+(${NOUN})${AFTER}|${PLACED}${DET}\\s+${NOUN_Q}\\s+${OF}\\s`)
const DET_WORDS = new Set([...DEICTIC_DETERMINERS.en, ...DEICTIC_DETERMINERS.es])
const TAKEN = [
  [new RegExp(`^(?:${DET}\\s+)?(${NOUN_Q})\\s+${OF}\\s+(?:(?:el|la|the)\\s+)?(?:(?:proyecto|project|repo|repositorio)\\s+)?${NAME}$`), (m) => ({ noun: m[1], name: m[2] }), true],
  [new RegExp(`^(?:${DET}\\s+)?${NAME}'s\\s+(${NOUN_Q})$`), (m) => ({ noun: m[2], name: m[1] }), true],
  [new RegExp(`^(?:${DET}\\s+)?${NAME}\\s+(${WEB_NOUN})$`), (m) => ({ noun: m[2], name: m[1] }), true],
  [new RegExp(`^${DET}\\s+(${NOUN})$`), (m) => ({ noun: m[1] }), false],
]
const nounKind = noun => KIND_OF_NOUN.get(noun.replace(/\s+/g, ' '))

/**
 * What a phrase that points at a generic thing means: `{ verb, kind, name? }` when it is exactly an open or show of «<det> <noun>»,
 * «<noun> of <name>», «<name>'s <noun>» or «<name> <web noun>»; `{}` when it holds such a pointer and says more (a place, a second
 * request); undefined when it does not point at a generic thing at all («open website», «open the website folder»).
 */
function pointingOf(said) {
  const lead = LEAD.exec(said)
  if (!lead) return undefined
  const [, verbWord, rest] = lead
  const verb = REVEAL_VERBS.includes(verbWord) ? 'reveal' : 'open'
  for (const [pattern, read] of TAKEN) {
    const match = pattern.exec(rest)
    if (!match) continue
    const found = read(match)
    // A name made of request leftovers ("the website of reflex and delete it") is no name.
    if (found.name !== undefined && !validName(found.name)) continue
    const kind = nounKind(found.noun)
    if (kind) return { verb, kind: kind === 'file' ? 'any' : kind, noun: true, ...(found.name && { name: found.name }) }
  }
  // Said with more than the template holds. A folder named outright ("the docs folder") is not pointing: AFTER does not allow a name there.
  return WITH_DET.test(rest) || new RegExp(`^(?:${NOUN_Q})\\s+${OF}\\s`).test(rest) ? {} : undefined
}

/**
 * Whether a phrase points at a generic thing anywhere in it («quiero ver la web», «take me to the docs», «open the reflex site»):
 * the model step and the name grounding never see such a phrase.
 */
export function namesGenericThing(phrase) {
  const said = wordsOf(phrase)
  if (!said) return false
  const rest = LEAD.exec(said)?.[2] ?? said
  if (pointingOf(said) !== undefined || WITH_DET.test(rest)) return true
  if (new RegExp(`(?:^|\\s)\\S+'s\\s+${NOUN_Q}$`).test(rest)) return true
  // «llévame a reflex site»: a name and then a web noun, with nothing small in front of the name.
  const front = new RegExp(`(?:^|\\s)(\\S+)\\s+${WEB_NOUN}$`).exec(rest)?.[1]
  return !!front && !NAME_STOP.has(front) && !DET_WORDS.has(front)
}

function deicticOf(phrase) {
  const said = wordsOf(phrase)
  if (HEAD.test(said)) {
    const template = TEMPLATES.find(([pattern]) => pattern.test(said))
    if (template) return { verb: template[1], kind: template[2] }
  }
  const pointing = pointingOf(said)
  if (pointing?.kind) return pointing
  return pointing || HEAD.test(said) ? {} : undefined
}

const defaultIsFile = path => { try { return statSync(path).isFile() } catch { return false } }

// ---- Web addresses ------------------------------------------------------------------------------------------------
// Where code lives, and what is not a page one reads: an address there is a repo, a PR, an API or a raw file, never "the website".
const CODE_HOST = /^(?:www\.)?(github\.com|gist\.github\.com|bitbucket\.org|codeberg\.org|gitlab\.[a-z.]+|[a-z0-9.-]*gitlab[a-z0-9.-]*\.[a-z]+)$/i
const NOT_A_PAGE_HOST = /^(api|raw|registry|cdn|objects|uploads|ghcr|static|assets|files|download|downloads|gist)\.|\.githubusercontent\.com$|^registry\.npmjs\.org$/i
const NOT_A_PAGE_PATH = /\.(json|js|mjs|css|map|xml|yaml|yml|zip|gz|tgz|tar|png|jpe?g|gif|svg|webp|ico|woff2?|txt|md|csv|pdf)$/i
const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\]|[a-z0-9-]+\.local)$/i
const REPO_SUBPAGES = new Set(['issues', 'pulls', 'pull', 'blob', 'tree', 'commit', 'commits', 'actions', 'releases', 'wiki', 'wikis', 'settings', 'compare', 'branches', 'tags', 'pipelines', 'merge_requests', 'pull-requests', '-'])

/** What an address is, from its text alone: its host, whether it is a code host or local, and the kinds it can answer to. */
export function addressOf(url) {
  let parsed
  try { parsed = new URL(url) } catch { return undefined }
  const host = parsed.hostname.toLowerCase()
  const segments = parsed.pathname.split('/').filter(Boolean)
  const code = CODE_HOST.test(host)
  const local = LOCAL_HOST.test(host)
  const kinds = new Set(['link'])
  if (code && (/^\/[^/]+\/[^/]+(?:\/-)?\/pull\/\d+/.test(parsed.pathname) || /\/(-\/)?merge_requests\/\d+/.test(parsed.pathname) || /\/pull-requests\/\d+/.test(parsed.pathname))) kinds.add('pr')
  if (code && segments.length >= 2 && !segments.slice(1).some(part => REPO_SUBPAGES.has(part)) && (segments.length === 2 || !/^(github\.com|bitbucket\.org|codeberg\.org)$/.test(host.replace(/^www\./, '')))) kinds.add('repo')
  if (!code && !NOT_A_PAGE_HOST.test(host) && !NOT_A_PAGE_PATH.test(parsed.pathname)) kinds.add('web')
  return { host, path: parsed.pathname, code, local, kinds }
}

const squash = text => key(text).replace(/[\s._-]+/g, '')
// "the website of reflex": an address that holds the project's name, in its host or path.
const mentions = (url, name) => { const address = addressOf(url); return !!address && squash(`${address.host}${address.path}`).includes(squash(name)) }

/**
 * The GitHub Pages address of a folder, from what is on this Mac and no network: its origin remote says owner and repo, and
 * it publishes a site only if it holds docs/index.html or a CNAME (a custom domain wins). Undefined for anything else.
 * @returns {{ url: string } | { reason: string }}
 */
export function pagesOf(dir, { remote = remoteOf, files = siteFiles } = {}) {
  const origin = remote(dir)
  if (!origin) return { reason: 'not a git repo with an origin remote' }
  const web = webUrl(origin)
  if (!web.url) return { reason: web.reason }
  if (web.host !== 'github.com') return { reason: `its origin is on ${web.host}, not on GitHub` }
  const [owner, repo] = new URL(web.url).pathname.split('/').filter(Boolean)
  const site = files(dir) ?? {}
  const domain = typeof site.cname === 'string' ? site.cname.trim().toLowerCase() : ''
  const custom = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain)
  if (!site.docsIndex && !custom) return { reason: 'it has no docs/index.html and no CNAME: no site to point to' }
  const base = custom ? `https://${domain}/`
    : repo.toLowerCase() === `${owner.toLowerCase()}.github.io` ? `https://${owner.toLowerCase()}.github.io/` : `https://${owner.toLowerCase()}.github.io/${repo}/`
  const url = cleanUrl(base)
  return url ? { url } : { reason: 'its address is not one reflex keeps' }
}

// ---- What a Bash call made ----------------------------------------------------------------------------------------
/**
 * What a finished Bash command made or showed: the files an `open` was given and the output files it wrote (an absolute or
 * cwd-relative path that is a file whose mtime lies within the call, from `since` to now), and every address it opened or
 * mentioned. `{ path }` and `{ url }` items without a time: the hook stamps them. Reads the disk (stat) and nothing else.
 * @param {string} command
 * @param {{ cwd?: string, since: number, now?: number, stat?: (path: string) => { isFile: () => boolean, mtimeMs: number } | undefined, home?: string }} context
 */
export function touchedBy(command, { cwd, since, now = Date.now(), stat = defaultStat, home = homedir() } = {}) {
  const facts = bashFacts(command)
  const absolute = word => {
    const expanded = word === '~' ? home : word.startsWith('~/') ? join(home, word.slice(2)) : word
    return isAbsolute(expanded) ? resolvePath(expanded) : cwd && isAbsolute(cwd) ? resolvePath(cwd, expanded) : undefined
  }
  const fileOf = word => { const path = absolute(word); const info = path && stat(path); return info?.isFile() && validEntry({ path, at: 0 }) ? { path, mtimeMs: info.mtimeMs } : undefined }
  const items = []
  const add = item => { if (!items.some(other => other.path === item.path && other.url === item.url)) items.push(item) }
  for (const word of facts.opened.paths) { const file = fileOf(word); if (file) add({ path: file.path }) }
  for (const url of facts.opened.urls) add({ url })
  // A made file's mtime lies inside the call; a slack of 20 ms covers a clock read a moment apart from the filesystem's.
  for (const word of facts.named) { const file = fileOf(word); if (file && file.mtimeMs >= since - 20 && file.mtimeMs <= now + 20) add({ path: file.path }) }
  for (const url of facts.urls) add({ url })
  return items.slice(0, 40)
}
const defaultStat = path => { try { return statSync(path) } catch { return undefined } }

// ---- Resolving a phrase -------------------------------------------------------------------------------------------
const FILE_KIND_LABEL = { any: 'file', doc: 'document', deck: 'presentation', sheet: 'spreadsheet', image: 'image', video: 'video', diagram: 'diagram', pdf: 'PDF' }
const URL_KIND_LABEL = { web: 'web page', pr: 'pull request', repo: 'repo', link: 'link' }

/**
 * A deictic phrase against what Claude made or showed. Undefined when the phrase is not deictic. Otherwise an action, or a
 * pass with the reason: no list, nothing of that kind, the newest is gone or older than 30 minutes, two fit as well,
 * the phrase names more than the template says.
 * @param {string} phrase
 * @param {({ path: string, at: number } | { url: string, at: number })[]} recent newest first
 * @param {{ now?: number, isFile?: (path: string) => boolean, aliases?: Record<string, string>, index?: { folders: Record<string, string> }, remoteOf?: (dir: string) => string | undefined, siteFiles?: (dir: string) => { docsIndex?: boolean, cname?: string } | undefined }} [deps]
 */
export function resolveDeictic(phrase, recent, { now = Date.now(), isFile = defaultIsFile, index, aliases = {}, remoteOf: remote, siteFiles: files } = {}) {
  const said = deicticOf(phrase)
  if (!said) return undefined
  const refuse = reason => ({ phrase, status: 'pass', reason, trace: [{ step: 'template', reason }] })
  if (!said.verb) return refuse('a phrase about "that"/"it"/"the website" that also says something else: for Claude')
  const list = Array.isArray(recent) ? recent : []
  const urlKind = ['web', 'pr', 'repo', 'link'].includes(said.kind)
  const named = said.name ? ` of ${said.name}` : ''
  const label = urlKind ? `the ${URL_KIND_LABEL[said.kind]}${named} Claude showed` : `the ${FILE_KIND_LABEL[said.kind] ?? 'file'}${named} Claude wrote`
  const parsed = { verb: said.verb, target: `(${label})`, kind: said.kind, raw: phrase }
  const act = (target, via) => ({ phrase, status: 'action', step: 'template', action: { verb: said.verb, target: { ...target, via } }, trace: [{ step: 'template', parsed, found: { status: 'ok', target: { ...target, via } } }] })

  if (urlKind) {
    if (said.verb !== 'open') return refuse('a web address is opened, not shown in Finder')
    const entries = list.filter(validUrlEntry)
    let fitting = entries.filter(entry => addressOf(entry.url)?.kinds.has(said.kind))
    if (said.name) fitting = fitting.filter(entry => mentions(entry.url, said.name))
    // A page on this Mac's own port is the page only when there is no other: a dev server is rarely "the website".
    const rank = entry => (addressOf(entry.url)?.local ? 1 : 0)
    const best = Math.min(...fitting.map(rank))
    fitting = fitting.filter(entry => rank(entry) === best).sort((a, b) => b.at - a.at)
    const [top, next] = fitting
    const usable = entry => entry && now - entry.at >= 0 && now - entry.at <= FRESH_MS
    if (usable(top) && !(usable(next) && top.at - next.at <= SAME_TURN_MS)) {
      const target = { type: 'url', value: top.url, label: top.url.replace(/^https?:\/\//, '') }
      return act(target, 'an address from this Claude session')
    }
    if (usable(top)) return refuse(`Claude showed more than one ${URL_KIND_LABEL[said.kind]}${named}, close together: which one is meant is not for reflex to guess`)
    // «the website of reflex»: with no address from the session, the project's own GitHub Pages address, read off its repo.
    if (said.kind === 'web' && said.name) {
      // The person's own alias for the name is their word for where it lives ("la web de linkedin").
      const alias = aliases[key(said.name)]
      if (typeof alias === 'string' && /^https?:\/\//i.test(alias)) return act({ type: 'url', value: alias, label: alias.replace(/^https?:\/\//, '') }, 'alias')
      const dir = index?.folders?.[key(said.name)]
      if (dir) {
        const pages = pagesOf(dir, { ...(remote && { remote }), ...(files && { files }) })
        if (pages.url) return act({ type: 'url', value: pages.url, label: pages.url.replace(/^https?:\/\//, '') }, `the GitHub Pages address of ${said.name} (its origin remote)`)
        return refuse(`no address of ${said.name}'s website in this session, and ${pages.reason}`)
      }
    }
    if (!entries.length) return refuse(`no web addresses from this Claude session: "${said.noun ? 'the ' + URL_KIND_LABEL[said.kind] : 'it'}" names nothing reflex knows`)
    return refuse(top ? `the ${URL_KIND_LABEL[said.kind]}${named} Claude showed is older than 30 minutes: not plainly the one meant` : `none of the addresses from this session is a ${URL_KIND_LABEL[said.kind]}${named}`)
  }

  const table = said.noun ? NOUN_EXTENSIONS : EXTENSIONS
  const entries = list.filter(validEntry)
  if (!entries.length) return refuse(said.noun ? `no files Claude wrote in this session: "the ${FILE_KIND_LABEL[said.kind] ?? 'file'}" names nothing reflex knows` : 'no files Claude wrote in this session: "it" names nothing reflex knows')
  const fitting = entries.filter(entry => fitsKind(said.kind, entry.path, table) && (!said.name || squash(entry.path).includes(squash(said.name)))).sort((a, b) => b.at - a.at)
  if (!fitting.length) return refuse(`none of the files Claude wrote is of the kind asked (${FILE_KIND_LABEL[said.kind] ?? said.kind}${named})`)
  const [top, next] = fitting
  const age = now - top.at
  if (age < 0 || age > FRESH_MS) return refuse('the file Claude wrote is older than 30 minutes: not plainly the one meant')
  if (!isFile(top.path)) return refuse('the file Claude wrote is no longer there')
  if (next && now - next.at >= 0 && now - next.at <= FRESH_MS && top.at - next.at <= SAME_TURN_MS && isFile(next.path))
    return refuse('Claude wrote more than one file that fits, close together: which one is meant is not for reflex to guess')
  if (said.verb === 'open' && !OPENS_SAFELY.has(extensionOf(top.path))) return refuse(`opening a .${extensionOf(top.path)} file could run it (say "show it in Finder")`)
  return act({ type: 'file', value: top.path, label: top.path.split('/').pop() }, 'the file Claude wrote in this session')
}
