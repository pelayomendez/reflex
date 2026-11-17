// Runs one action as a fixed argument list (never a shell) and says what it did.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { extname, join } from 'node:path'
import { VOLUME_STEP, PANES } from './system.mjs'

const CLIPBOARD_CLASS = { '.png': '«class PNGf»', '.jpg': 'JPEG picture', '.jpeg': 'JPEG picture', '.gif': '«class GIFf»', '.tiff': 'TIFF picture' }
const TEXT = new Set(['.md', '.txt', '.json', '.csv', '.yaml', '.yml', '.toml', '.html', '.js', '.mjs', '.ts', '.tsx', '.py', '.sh'])

// The running check comes first, by the app's own path, because telling a closed app to quit would launch it
// just to quit it (and a name could be taken for another app). It reads the running list, which needs no permission.
const QUIT_SCRIPT = `ObjC.import('AppKit')
function run(argv) {
  const path = argv[0]
  const up = ObjC.unwrap($.NSWorkspace.sharedWorkspace.runningApplications).some(app => app.bundleURL && ObjC.unwrap(app.bundleURL.path) === path)
  if (!up) return 'not running'
  Application(path).quit()
  return 'quit'
}`

// Hide is the same walk with the same running check, and asks the running app itself (NSRunningApplication.hide):
// no Apple Events, so no Automation permission, and a closed app is never launched.
const HIDE_SCRIPT = `ObjC.import('AppKit')
function run(argv) {
  const path = argv[0]
  const app = ObjC.unwrap($.NSWorkspace.sharedWorkspace.runningApplications).find(app => app.bundleURL && ObjC.unwrap(app.bundleURL.path) === path)
  if (!app) return 'not running'
  // ObjC methods without arguments are properties in JXA: reading it is the call.
  app.hide
  return 'hidden'
}`

// Hide others: every regular app but the frontmost and the hosts (their bundle paths come as arguments, read off the
// process ancestry by the plan), through the same graceful NSRunningApplication.hide. Nothing is launched or quit.
const HIDE_OTHERS_SCRIPT = `ObjC.import('AppKit')
function run(argv) {
  const workspace = $.NSWorkspace.sharedWorkspace
  const front = workspace.frontmostApplication
  const frontPid = front ? front.processIdentifier : -1
  let hidden = 0
  for (const app of ObjC.unwrap(workspace.runningApplications)) {
    if (app.activationPolicy !== $.NSApplicationActivationPolicyRegular) continue
    if (app.processIdentifier === frontPid) continue
    const path = app.bundleURL ? ObjC.unwrap(app.bundleURL.path) : ''
    if (argv.includes(path)) continue
    app.hide
    hidden++
  }
  return 'hidden ' + hidden
}`

// Appearance: three fixed statements, and the mode is read back in the same script, because a refused Automation grant
// can fail without an error ([S22] in docs/research/system-commands.md).
const APPEARANCE = { dark: 'true', light: 'false', toggle: 'not dark mode' }
const appearanceCommand = what => {
  if (!Object.hasOwn(APPEARANCE, what)) throw new Error(`not an appearance: ${what}`)
  return ['osascript', '-e', 'tell application "System Events"', '-e', 'tell appearance preferences', '-e', `set dark mode to ${APPEARANCE[what]}`, '-e', 'return dark mode', '-e', 'end tell', '-e', 'end tell']
}

// Empty Trash. Never without a confirmed count (the count the person said yes to): the script re-reads the Trash and
// refuses when it holds more than that. An empty Trash is not an error here, whatever Finder would raise.
const EMPTY_TRASH = ['on run argv', 'set seen to (item 1 of argv as integer)', 'tell application "Finder"', 'set n to count items of trash', 'if n > seen then return "grew " & n', 'if n is 0 then return "empty"', 'empty trash', 'end tell', 'return "emptied " & n', 'end run']
const isCount = value => Number.isInteger(value) && value > 0
const emptyTrashCommand = confirmed => {
  if (!isCount(confirmed)) throw new Error('refusing to empty the Trash without a confirmed count')
  return ['osascript', ...EMPTY_TRASH.flatMap(line => ['-e', line]), String(confirmed)]
}

// Volume: fixed statements only. A level travels as an argument and is re-checked here as an integer 0-100,
// so nothing typed ever becomes part of a script.
const STEP = VOLUME_STEP
// Only "up" unmutes (asking for more sound means wanting to hear it); down and a level leave the mute state alone.
const nudge = sign => ['osascript', '-e', 'set v to (output volume of (get volume settings)) ' + sign + ' ' + STEP, '-e', 'if v > 100 then set v to 100', '-e', 'if v < 0 then set v to 0', '-e', 'set volume output volume v' + (sign === '+' ? ' without output muted' : '')]
function volumeCommand(what) {
  if (what === 'mute') return ['osascript', '-e', 'set volume with output muted']
  if (what === 'unmute') return ['osascript', '-e', 'set volume without output muted']
  if (what === 'up') return nudge('+')
  if (what === 'down') return nudge('-')
  if (!/^\d{1,3}$/.test(what) || Number(what) > 100) throw new Error(`not a volume: ${what}`)
  return ['osascript', '-e', 'on run argv', '-e', 'set volume output volume (item 1 of argv as integer)', '-e', 'end run', String(Number(what))]
}

/** @returns {string[][]} the commands, for --dry-run and for tests */
export function commandsFor({ verb, target, with: using, confirmed }) {
  const { type, value } = target
  if (verb === 'edit') {
    // At a line: the editor's own link (percent-encoded, one argument). Otherwise the app, or the system's text app.
    if (using.line) return [['open', `${using.scheme}://file${value.split('/').map(encodeURIComponent).join('/')}:${using.line}`]]
    return [using.app ? ['open', '-a', using.app, value] : ['open', '-t', value]]
  }
  if (verb === 'terminal') return [['open', '-a', using.app, value]]
  if (verb === 'open') return [type === 'app' ? ['open', '-a', value] : ['open', value]]
  if (verb === 'reveal') return [['open', '-R', value]]
  if (verb === 'shortcut') return [['shortcuts', 'run', value]]
  if (verb === 'copy') {
    if (type === 'text') return [['pbcopy', { stdin: value }]]
    const ext = extname(value).toLowerCase()
    if (CLIPBOARD_CLASS[ext]) return [['osascript', '-e', 'on run argv', '-e', `set the clipboard to (read (POSIX file (item 1 of argv)) as ${CLIPBOARD_CLASS[ext]})`, '-e', 'end run', value]]
    if (TEXT.has(ext)) return [['pbcopy', { file: value }]]
    // Anything else goes on the clipboard as the file itself, to paste in Finder or a mail.
    return [['osascript', '-e', 'on run argv', '-e', 'set the clipboard to (POSIX file (item 1 of argv))', '-e', 'end run', value]]
  }
  if (verb === 'quit') {
    // Cmd-Q, not a kill: the app keeps its own save prompts. The app's path is an argument, never part of the script.
    return [['osascript', '-l', 'JavaScript', '-e', QUIT_SCRIPT, value]]
  }
  if (verb === 'hide') return [['osascript', '-l', 'JavaScript', '-e', HIDE_SCRIPT, value]]
  // A pane the table knows, as its own address: nothing typed goes into the URL.
  if (verb === 'settings') {
    if (!PANES.some(pane => value === `x-apple.systempreferences:${pane.id}`)) throw new Error(`not a settings pane: ${value}`)
    return [['open', value]]
  }
  // Locks through the display: with "require password" set to immediately (System Settings > Lock Screen) the Mac asks for it on wake.
  if (verb === 'lock') return [['pmset', 'displaysleepnow']]
  if (verb === 'volume') return [volumeCommand(value)]
  if (verb === 'open-trash') return [['open', join(homedir(), '.Trash')]]
  if (verb === 'sleep-displays') return [['pmset', 'displaysleepnow']]
  if (verb === 'screensaver') return [['open', '-a', '/System/Library/CoreServices/ScreenSaverEngine.app']]
  if (verb === 'screenshot-toolbar') return [['open', '-a', '/System/Applications/Utilities/Screenshot.app']]
  if (verb === 'mission-control') return [['open', '-a', '/System/Applications/Mission Control.app']]
  if (verb === 'appearance') return [appearanceCommand(value)]
  if (verb === 'hide-others') return [['osascript', '-l', 'JavaScript', '-e', HIDE_OTHERS_SCRIPT, ...(target.hosts ?? [])]]
  if (verb === 'empty-trash') return [emptyTrashCommand(confirmed)]
  throw new Error(`unknown verb ${verb}`)
}

const DENIED = /-1743|not authori[sz]ed/i
const denied = (error, app, consequence) => new Error(`macOS has not allowed this terminal to control ${app} (System Settings > Privacy & Security > Automation); ${consequence}. reflex does not retry`)
// A command whose answer matters: its stdout, with a refused Automation grant said clearly instead of as a raw error.
function ask(command, exec, { app, consequence, timeout = 15000 }) {
  try {
    return String(exec(command[0], command.slice(1), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout })).trim()
  } catch (error) {
    const said = `${error.stderr ?? ''} ${error.message ?? ''}`
    if (DENIED.test(said)) throw denied(error, app, consequence)
    throw new Error(String(error.stderr ?? '').trim().split('\n')[0] || error.message)
  }
}

export function run(action, exec = execFileSync) {
  if (action.verb === 'empty-trash') {
    const [command] = commandsFor(action)
    const said = ask(command, exec, { app: 'Finder', consequence: 'the Trash was not emptied', timeout: 110000 })
    const [what, n] = said.split(' ')
    if (what === 'empty') return 'the Trash is already empty'
    if (what === 'grew') throw new Error(`the Trash grew from ${action.confirmed} to ${n} items since you confirmed: not emptied`)
    if (what === 'emptied' && /^\d+$/.test(n)) return `emptied the Trash (${n} ${n === '1' ? 'item' : 'items'})`
    throw new Error(`unexpected answer from Finder: "${said}"`)
  }
  if (action.verb === 'appearance') {
    const [command] = commandsFor(action)
    const said = ask(command, exec, { app: 'System Events', consequence: 'the appearance was not changed' })
    if (said !== 'true' && said !== 'false') throw new Error(`unexpected answer from System Events: "${said}"`)
    const now = said === 'true' ? 'dark' : 'light'
    if (action.target.value !== 'toggle' && action.target.value !== now) throw new Error(`the appearance did not change (still ${now} mode): check that this terminal may control System Events (Automation)`)
    return `switched to ${now} mode`
  }
  if (action.verb === 'hide-others') {
    const [command] = commandsFor(action)
    const said = ask(command, exec, { app: 'System Events', consequence: 'nothing was hidden' })
    const n = /^hidden (\d+)$/.exec(said)?.[1]
    if (n === undefined) throw new Error(`unexpected answer from the hide script: "${said}"`)
    return n === '0' ? 'no other apps to hide' : `hid ${n} other ${n === '1' ? 'app' : 'apps'}`
  }
  if (action.verb === 'quit' || action.verb === 'hide') {
    const [command] = commandsFor(action)
    const said = String(exec(command[0], command.slice(1), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 })).trim()
    return said === 'not running' ? `${action.target.label} is not running, nothing to ${action.verb}` : describe(action)
  }
  for (const command of commandsFor(action)) {
    const last = command.at(-1)
    const input = typeof last === 'object' ? (last.stdin ?? readFileSync(last.file, 'utf8')) : undefined
    const argv = typeof last === 'object' ? command.slice(0, -1) : command
    exec(argv[0], argv.slice(1), { input, stdio: ['pipe', 'ignore', 'pipe'], timeout: 15000 })
  }
  return describe(action)
}

const PAST_SYSTEM = { 'open-trash': 'opened the Trash', 'sleep-displays': 'put the displays to sleep', screensaver: 'started the screen saver', 'screenshot-toolbar': 'opened the Screenshot toolbar', 'mission-control': 'opened Mission Control', 'empty-trash': 'emptied the Trash' }
const FUTURE_SYSTEM = { 'open-trash': 'open the Trash', 'sleep-displays': 'sleep the displays', screensaver: 'start the screen saver', 'screenshot-toolbar': 'open the Screenshot toolbar', 'mission-control': 'open Mission Control', 'hide-others': 'hide other apps', 'empty-trash': 'empty the Trash' }
const PAST = { open: 'opened', reveal: 'showed in Finder', copy: 'copied', shortcut: 'ran Shortcut', quit: 'asked to quit', hide: 'hid', settings: 'opened settings:' }
const FUTURE = { open: 'open', reveal: 'show in Finder', copy: 'copy', shortcut: 'run Shortcut', quit: 'quit', hide: 'hide', settings: 'settings:' }
export function describe({ verb, target, with: using }, tense = 'past') {
  if (verb === 'edit') return `${tense === 'past' ? 'opened' : 'edit'} ${target.label}${using.line ? `:${using.line}` : ''} in ${using.label}`
  if (verb === 'terminal') return `${tense === 'past' ? 'opened a terminal in' : 'terminal in'} ${target.label} (${using.label})`
  if (verb === 'lock') return tense === 'past' ? 'locked the screen' : 'lock screen'
  if (verb === 'volume') return target.label
  if (verb === 'appearance') return target.value === 'toggle' ? `${tense === 'past' ? 'toggled' : 'toggle'} dark/light mode` : `${tense === 'past' ? 'switched' : 'switch'} to ${target.value} mode`
  if (verb === 'hide-others') return tense === 'past' ? 'hid other apps' : FUTURE_SYSTEM[verb]
  if (verb in FUTURE_SYSTEM) return (tense === 'past' ? PAST_SYSTEM : FUTURE_SYSTEM)[verb]
  return `${(tense === 'past' ? PAST : FUTURE)[verb]} ${target.label}`
}
