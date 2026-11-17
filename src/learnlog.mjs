// The local log of what use teaches: ~/.local/share/reflex/log.jsonl, one JSON object per line.
// It never leaves this Mac. `[learn] log = "off"` in the config turns it off.
// Writing is fail-silent: a logging error must never reach the prompt or a tool call.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { loadConfig } from './config.mjs'
import { actionFromBash } from './oracle.mjs'

export const KINDS = ['accepted', 'override', 'oracle']

export const logPath = () => join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'reflex', 'log.jsonl')

export const logEnabled = config => String(config?.learn?.log ?? 'on').trim().toLowerCase() !== 'off'

/** Appends one entry. Returns true when a line was written; never throws. */
export function appendEntry(entry, { path = logPath(), config } = {}) {
  try {
    if (!logEnabled(config ?? loadConfig())) return false
    if (!KINDS.includes(entry?.kind) || typeof entry.phrase !== 'string' || !entry.phrase.trim()) return false
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    appendFileSync(path, JSON.stringify({ t: new Date().toISOString(), ...entry }) + '\n', { mode: 0o600 })
    return true
  } catch { return false }
}

/** Every well-formed entry; blank, malformed and unknown-kind lines are skipped. */
export function readLog(path = logPath()) {
  if (!existsSync(path)) return []
  const entries = []
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      const entry = JSON.parse(line)
      if (entry && typeof entry === 'object' && KINDS.includes(entry.kind) && typeof entry.phrase === 'string') entries.push(entry)
    } catch {}
  }
  return entries
}

/** What the hooks send (`reflex learn --record <json>`): an oracle arrives as the Bash command and is mapped here. Never throws. */
export function recordEntry(payload, options = {}) {
  try {
    if (payload?.kind === 'oracle') {
      const action = actionFromBash(payload.command, { home: homedir() })
      if (!action) return false
      const { command, ...rest } = payload
      return appendEntry({ ...rest, verb: action.verb, target: action.target }, options)
    }
    return appendEntry(payload, options)
  } catch { return false }
}
