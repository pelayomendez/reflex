// Read-only queries: one fixed command each, parsed into one short line. Nothing here writes anything, and an
// output that is not exactly what the parser knows is no answer: the phrase goes to Claude instead.
// The command runner is injected (`readCommand(argv)` returns stdout, throws on failure), so tests never read the Mac.

import { execFileSync } from 'node:child_process'
import { key } from './index.mjs'
import { resolveRole } from './roles.mjs'

export const readCommand = argv => String(execFileSync(argv[0], argv.slice(1), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }))

const no = reason => ({ reason })
const yes = text => ({ text })

// `pmset -g batt` → " -InternalBattery-0 (id=…)\t89%; discharging; 4:59 remaining present: true".
// Only the shapes read off a Mac are known; another shape (or two batteries) is not answered.
function battery(out) {
  const lines = out.split('\n').filter(line => line.includes('InternalBattery'))
  if (lines.length !== 1) return no('no single internal battery in the output')
  const found = /(\d{1,3})%; ([A-Za-z ]+?); (?:(\d{1,2}:\d{2}) remaining|(\(no estimate\))|(not charging))/.exec(lines[0])
  if (!found) return no('battery line not in a known shape')
  const [, percent, state, time, , notCharging] = found
  if (Number(percent) > 100) return no('battery above 100%')
  const head = `Battery: ${percent}%`
  if (state === 'discharging' && !notCharging) return yes(time ? `${head}, discharging, ${time} left` : `${head}, discharging`)
  if (state === 'charging' && !notCharging) return yes(time ? `${head}, charging, ${time} to full` : `${head}, charging`)
  if (state === 'charged' && time) return yes(`${head}, charged`)
  if (state === 'finishing charge' && time) return yes(`${head}, finishing charge`)
  if (state === 'AC attached' && notCharging) return yes(`${head}, plugged in, not charging`)
  return no('battery state not known')
}

// `df -H /System/Volumes/Data`: the Data volume, because `/` is the sealed system snapshot and misleads.
const DATA = '/System/Volumes/Data'
function disk(out) {
  const rows = out.split('\n').filter(line => line.trimEnd().endsWith(` ${DATA}`))
  if (rows.length !== 1) return no('no single Data volume row')
  const found = /^\S+\s+(\d+(?:\.\d+)?[BKMGTP])\s+\S+\s+(\d+(?:\.\d+)?[BKMGTP])\s+(\d{1,3})%\s/.exec(rows[0])
  if (!found || Number(found[3]) > 100) return no('disk row not in a known shape')
  return yes(`Disk: ${found[2]} free of ${found[1]} (${found[3]}% full)`)
}

// `scutil --nc list`: "* (Disconnected)   <uuid> VPN (<provider>) "<name>"   [VPN:<provider>]". One line holds the state,
// so one command answers. Which service is the VPN is the person's `[roles] vpn` (by its name or id) or the only one there is.
const SERVICE = /^\*?\s*\((\w+)\)\s+([0-9A-Fa-f-]{36})\s+\S+\s+(?:\([^)]*\)\s+)?"([^"]*)"/
const STATES = { Connected: 'connected', Disconnected: 'disconnected', Connecting: 'connecting', Disconnecting: 'disconnecting' }
// A service name is the network's, not reflex's: control and bidi characters never reach the prompt.
const clean = text => text.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '')
function vpn(out, { config = {}, index }) {
  const services = out.split('\n').map(line => SERVICE.exec(line)).filter(Boolean).map(([, state, id, name]) => ({ state, id, name: clean(name) }))
  if (!services.length) return no('no network services found')
  const wanted = config.roles?.vpn
  // «the vpn» may be an app (OpenVPN Connect, a vendor client) that is not this network service: then these services are not the person's VPN.
  if (!wanted && index?.apps && resolveRole('vpn', { index, config })) return no('the vpn role points to an app, not to a network service')
  const chosen = wanted ? services.filter(service => key(service.name) === key(wanted) || service.id.toLowerCase() === key(wanted)) : services
  if (chosen.length !== 1) return no(wanted ? `[roles] vpn "${wanted}" is not exactly one network service` : 'several network services and no [roles] vpn')
  const state = STATES[chosen[0].state]
  return state ? yes(`VPN "${chosen[0].name}": ${state}`) : no(`state "${chosen[0].state}" not known`)
}

export const QUERIES = {
  battery: { command: ['pmset', '-g', 'batt'], parse: battery },
  disk: { command: ['df', '-H', DATA], parse: disk },
  vpn: { command: ['scutil', '--nc', 'list'], parse: vpn },
}

/** @returns {{ text: string } | { reason: string }} the answer, or why there is none (the phrase is then Claude's) */
export function answerFor(id, { read = readCommand, config, index } = {}) {
  const query = Object.hasOwn(QUERIES, id) ? QUERIES[id] : undefined
  if (!query) return no(`unknown query ${id}`)
  let out
  try { out = read(query.command) } catch { return no(`could not run ${query.command[0]}`) }
  if (typeof out !== 'string') return no(`no output from ${query.command[0]}`)
  try { return query.parse(out, { config, index }) } catch { return no('output not understood') }
}

/** Finder's count of the Trash, or undefined when it cannot be read for certain. Reads only; needs Automation(Finder). */
export function readTrashCount(exec = execFileSync) {
  try {
    const out = String(exec('osascript', ['-e', 'tell application "Finder" to count items of trash'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 8000 })).trim()
    return /^\d+$/.test(out) ? Number(out) : undefined
  } catch { return undefined }
}
