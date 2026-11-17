// What exists on this Mac, gathered once and kept for ten minutes in ~/.cache/reflex/index.json:
// the folders reflex knows by name, the installed apps and the Shortcuts. Phrases are checked
// against this list, so a typo or an invented name never turns into an action.

import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { HANDLER_URLS } from './roles.mjs'

const HOME = homedir()
const CACHE = join(process.env.XDG_CACHE_HOME ?? join(HOME, '.cache'), 'reflex', 'index.json')
const MAX_AGE = 10 * 60 * 1000

const HOME_FOLDERS = {
  descargas: 'Downloads', downloads: 'Downloads',
  escritorio: 'Desktop', desktop: 'Desktop',
  documentos: 'Documents', documents: 'Documents',
  imagenes: 'Pictures', pictures: 'Pictures', fotos: 'Pictures',
  musica: 'Music', music: 'Music',
  peliculas: 'Movies', videos: 'Movies', movies: 'Movies',
  inicio: '', home: '', casa: '',
  aplicaciones: '/Applications', applications: '/Applications',
}

export function loadIndex({ refresh = false } = {}) {
  if (!refresh && existsSync(CACHE)) {
    try {
      const cached = JSON.parse(readFileSync(CACHE, 'utf8'))
      // Stale: answer from it now and rebuild it in the background, so no keystroke waits.
      if (needsRefresh(cached)) refreshInBackground()
      return cached
    } catch {}
  }
  const index = buildIndex()
  mkdirSync(join(CACHE, '..'), { recursive: true })
  writeFileSync(`${CACHE}.tmp`, JSON.stringify(index))
  renameSync(`${CACHE}.tmp`, CACHE)
  // An incomplete index keeps its lock, so a lookup that keeps failing is retried every two minutes, not on every phrase.
  if (index.defaultsComplete) rmSync(`${CACHE}.lock`, { force: true })
  return index
}

function refreshInBackground() {
  // One rebuild at a time: a lock younger than two minutes means one is already running.
  const lock = `${CACHE}.lock`
  try { if (Date.now() - statSync(lock).mtimeMs < 120000) return } catch {}
  writeFileSync(lock, '')
  const cli = join(import.meta.dirname, 'cli.mjs')
  spawn(process.execPath, [cli, 'index'], { detached: true, stdio: 'ignore' }).unref()
}

/** Someone else's index from a file (the shape loadIndex() returns). Throws a one-line error when it is not one. */
export function readIndexFile(file) {
  if (!file || file.startsWith('--')) throw new Error('--index needs a file')
  let text
  try { text = readFileSync(file, 'utf8') } catch (error) { throw new Error(error.code === 'ENOENT' ? `cannot read ${file}` : error.message.split('\n')[0]) }
  let index
  try { index = JSON.parse(text) } catch { throw new Error(`${file} is not JSON`) }
  const object = value => value && typeof value === 'object' && !Array.isArray(value)
  if (!object(index?.folders) || !object(index.apps) || !Array.isArray(index.shortcuts) || !Array.isArray(index.files)) throw new Error(`${file} is not an index (folders, apps, shortcuts, files)`)
  return index
}

export function buildIndex() {
  const folders = {}
  for (const [word, place] of Object.entries(HOME_FOLDERS)) folders[word] = place.startsWith('/') ? place : join(HOME, place)
  // Every git checkout up to two levels under ~/Development (or $REFLEX_CODE), by its folder name.
  const code = process.env.REFLEX_CODE ?? join(HOME, 'Development')
  for (const dir of listDirs(code)) {
    if (isRepo(dir)) folders[key(basename(dir))] ??= dir
    else for (const inner of listDirs(dir)) if (isRepo(inner)) folders[key(basename(inner))] ??= inner
  }
  const apps = {}
  for (const root of ['/Applications', '/System/Applications', '/System/Applications/Utilities', join(HOME, 'Applications')])
    for (const name of safeList(root)) if (name.endsWith('.app')) apps[key(name.slice(0, -4))] ??= join(root, name)
  // Files: what git knows in each repo (tracked and untracked, ignored left out), and the home
  // folders a few levels deep. Spotlight is too slow to ask on every keystroke.
  const files = []
  // Only the repos worked on in the last 60 days, most recent first: that is where the files
  // someone names are, and it keeps the list small enough to read on every keystroke.
  const recent = [...new Set(Object.values(folders).filter(isRepo))]
    .map(repo => [repo, lastTouched(repo)]).filter(([, at]) => Date.now() - at < 60 * 864e5)
    .sort((a, b) => b[1] - a[1]).map(([repo]) => repo)
  for (const repo of recent) {
    if (files.length > 50000) break
    try {
      const listed = execFileSync('git', ['-C', repo, 'ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8', timeout: 5000, maxBuffer: 64 << 20 })
      for (const line of listed.split('\n')) if (line) files.push(join(repo, line))
    } catch {}
  }
  for (const place of ['Desktop', 'Documents', 'Downloads']) walk(join(HOME, place), 2, files)
  let shortcuts = []
  try { shortcuts = execFileSync('shortcuts', ['list'], { encoding: 'utf8', timeout: 3000 }).split('\n').filter(Boolean) } catch {}
  const { defaults, complete } = defaultHandlers()
  return { builtAt: Date.now(), folders, apps, shortcuts, defaults, defaultsComplete: complete, files: files.slice(0, 60000) }
}

/** The path of the app macOS opens for a URL, '' when it has none. Throws when the lookup fails or times out. */
function askHandler(url) {
  const script = `ObjC.import('AppKit'); var a = $.NSWorkspace.sharedWorkspace.URLForApplicationToOpenURL($.NSURL.URLWithString('${url}')); a ? ObjC.unwrap(a.path) : ''`
  return execFileSync('osascript', ['-l', 'JavaScript', '-e', script], { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

/**
 * The app macOS opens for the URLs some roles stand for (mailto: is mail, https: the browser), by role: a path, or
 * null when the lookup answered that there is none. A lookup that failed leaves the role out of `defaults` and makes
 * the result incomplete, so the index is rebuilt soon (see needsRefresh) and the role passes meanwhile.
 */
export function defaultHandlers(ask = askHandler) {
  const defaults = {}
  let complete = true
  for (const [role, url] of Object.entries(HANDLER_URLS)) {
    try {
      const path = ask(url)
      defaults[role] = path.endsWith('.app') ? path : null
    } catch { complete = false }
  }
  return { defaults, complete }
}

/** Whether a cached index should be rebuilt in the background: stale, from before `defaults`, or a handler lookup failed. */
export const needsRefresh = (cached, now = Date.now()) => now - cached.builtAt >= MAX_AGE || !cached.defaults || cached.defaultsComplete === false

export const key = text => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

function listDirs(dir) {
  return safeList(dir).filter(name => !name.startsWith('.')).map(name => join(dir, name)).filter(path => {
    try { return statSync(path).isDirectory() } catch { return false }
  })
}
function walk(dir, depth, out) {
  for (const name of safeList(dir)) {
    if (name.startsWith('.') || name === 'node_modules') continue
    const path = join(dir, name)
    let isDir = false
    try { isDir = statSync(path).isDirectory() } catch { continue }
    if (isDir) { if (name.endsWith('.app')) continue; out.push(path); if (depth > 1) walk(path, depth - 1, out) }
    else out.push(path)
  }
}
function safeList(dir) { try { return readdirSync(dir) } catch { return [] } }
function lastTouched(repo) {
  let at = 0
  for (const name of ['index', 'HEAD', 'FETCH_HEAD']) try { at = Math.max(at, statSync(join(repo, '.git', name)).mtimeMs) } catch {}
  return at
}
function isRepo(dir) { return existsSync(join(dir, '.git')) }
