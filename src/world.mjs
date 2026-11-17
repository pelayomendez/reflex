// What the planner reads off this Mac at the moment a phrase is planned, behind small functions so tests and the
// exams can swap in a fake: a folder's files with their mtimes, the folder macOS saves screenshots to, and a
// repo's origin remote. None of it is called unless the phrase is of the kind that needs it, and none of it
// touches the network.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expandHome } from './config.mjs'

/** @returns {{ name: string, mtimeMs: number, isDir?: true }[]} the files and folders directly in `dir`; throws when it cannot be read */
export function listing(dir) {
  const files = []
  for (const name of readdirSync(dir)) {
    try {
      const stat = statSync(join(dir, name))
      if (stat.isFile()) files.push({ name, mtimeMs: stat.mtimeMs })
      else if (stat.isDirectory()) files.push({ name, mtimeMs: stat.mtimeMs, isDir: true })
    } catch {}
  }
  return files
}

const defaults = key => {
  try { return execFileSync('defaults', ['read', 'com.apple.screencapture', key], { encoding: 'utf8', timeout: 1000, stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return '' }
}

/** @returns {{ dir?: string, prefix?: string }} the screenshot folder when one is set and exists, and the file-name prefix when one is set */
export function screenshotLocation() {
  const location = defaults('location')
  const dir = location && expandHome(location)
  const prefix = defaults('name')
  return { ...(dir && existsSync(dir) && statSync(dir).isDirectory() && { dir }), ...(prefix && { prefix }) }
}

/** @returns {string | undefined} the `origin` remote of a folder that is itself a git checkout, as git reports it (no network) */
export function remoteOf(dir) {
  if (!existsSync(join(dir, '.git'))) return undefined
  try {
    return execFileSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).trim() || undefined
  } catch { return undefined }
}

/** @returns {{ docsIndex: boolean, cname?: string }} whether a repo folder holds a site to publish: docs/index.html, and the domain a CNAME file names */
export function siteFiles(dir) {
  const read = file => { try { return readFileSync(join(dir, file), 'utf8').split('\n')[0].trim().slice(0, 253) } catch { return undefined } }
  const cname = read('CNAME') || read('docs/CNAME')
  return { docsIndex: existsSync(join(dir, 'docs', 'index.html')), ...(cname && { cname }) }
}
