// Slice 4: the Trash (open, and empty behind a confirm), read-only queries (battery, VPN, disk), a few more
// reversible commands, and «aspecto». Template-only: the model catalogue never changes. Every shell call is injected:
// nothing here empties a Trash, sleeps a display, toggles the appearance or reads this Mac.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { toolsFor } from '../src/catalogue.mjs'
import { classify } from '../src/eval.mjs'
import { plan } from '../src/plan.mjs'
import { readTrashCount } from '../src/query.mjs'
import { commandsFor, describe, run } from '../src/run.mjs'
import { PANES } from '../src/system.mjs'

const index = {
  folders: { brand: '/code/brand', pantalla: '/code/pantalla' },
  apps: { slack: '/Applications/Slack.app' },
  shortcuts: ['Modo foco'],
  files: ['/code/brand/README.md'],
}
const config = { aliases: {}, model: {} }
const refuseReads = () => { throw new Error('this test must not read the Mac') }
const base = { index, config, zoxide: () => undefined, ancestors: () => ['/bin/zsh', '/usr/local/bin/node', '/Applications/Ghostty.app/Contents/MacOS/ghostty'], screenLockStatus: () => 'screenLock delay is immediate', readCommand: refuseReads }
const planOf = (phrase, extra = {}, over = {}) => plan(phrase, { ...base, ...over, ...extra })
const got = async (phrase, extra, over) => {
  const found = await planOf(phrase, extra, over)
  return found.status === 'action' || found.status === 'confirm' || found.status === 'answer' ? `${found.status} ${found.action.verb} ${found.action.target.value}` : found.status
}
const modelled = (answer, over = {}) => phrase => plan(phrase, { ...base, index: { ...index, folders: { ...index.folders, papelera: '/code/papelera' } }, config: { ...config, model: { url: 'http://x', name: 'm' } }, askModel: async () => answer, ...over })

// ---------------------------------------------------------------------------------------------------------------
// Empty Trash: a confirm, exact phrases only

const EMPTY = ['vacía la papelera', 'vaciar la papelera', 'empty trash', 'empty the trash']
const EMPTY_POLITE = ['Vacía la papelera, por favor', 'por favor, vacía la papelera', 'vacía la papelera porfa', 'please empty the trash', 'can you empty the trash', '¿puedes vaciar la papelera?', 'could you empty trash?', 'empty the trash, thanks', 'VACÍA LA PAPELERA', 'oye, vacía la papelera']
const NEAR = [
  'vacía la papelera de reciclaje de Windows', '¿vacío la papelera?', 'no vacíes la papelera', 'vacía la papelera y apaga',
  'empty the trash folder in brand', 'empty trash?', 'did you empty the trash', 'ya vacié la papelera', 'I emptied the trash', 'emptying the trash',
  'why does the trash not empty', 'cómo vacío la papelera', 'how do I empty the trash', 'vacía la papelera, luego abre figma', 'empty the trash and quit slack',
  "don't empty the trash", 'never empty the trash', 'vacía papelera', 'vacía la papelera de descargas', 'empty trash now', 'borra la papelera', 'vaciar papelera',
  'explícame cómo vaciar la papelera', '\\vacía la papelera', 'empty the recycle bin', 'vacía la papelera; apaga el mac', 'empty the trash & lock screen', 'vacía la papelera sin preguntar', 'empty trash please now',
]

test('empty trash: the exact phrases, polite forms included, ask first and run nothing', async () => {
  for (const phrase of [...EMPTY, ...EMPTY_POLITE]) {
    const found = await planOf(phrase)
    assert.equal(found.status, 'confirm', phrase)
    assert.equal(found.action.verb, 'empty-trash', phrase)
    assert.equal(found.step, 'template', phrase)
    assert.equal(found.count, undefined, `${phrase}: no count while previewing`)
  }
  assert.equal(describe((await planOf('empty trash')).action, 'future'), 'empty the Trash')
})

test('empty trash: near-misses, questions, negations, reports and compounds are Claude\'s, and nothing asks Finder', async () => {
  let asked = 0
  const countTrash = () => { asked++; return 5 }
  for (const phrase of NEAR) {
    assert.equal((await planOf(phrase, { countTrash })).status, 'pass', phrase)
    assert.equal((await modelled({ verb: 'open', target: 'papelera' })(phrase)).status, 'pass', `model: ${phrase}`)
  }
  assert.equal(asked, 0)
})

test('empty trash: the count is read only when asked for, never while previewing, and a bad count passes', async () => {
  let asked = 0
  const reading = value => () => { asked++; if (value instanceof Error) throw value; return value }
  // no reader: the preview's plan, nothing read
  assert.equal((await planOf('vacía la papelera')).count, undefined)
  assert.equal(asked, 0)
  const es = await planOf('vacía la papelera', { countTrash: reading(312) })
  assert.equal(es.status, 'confirm')
  assert.equal(es.count, 312)
  assert.equal(es.question, '¿Vaciar la Papelera: 312 elementos?')
  assert.deepEqual(es.labels, ['No', 'Sí, vaciar'])
  const en = await planOf('empty the trash', { countTrash: reading(7) })
  assert.equal(en.question, 'Empty the Trash: 7 items?')
  assert.deepEqual(en.labels, ['No', 'Yes, empty'])
  assert.equal((await planOf('vacía la papelera', { countTrash: reading(1) })).question, '¿Vaciar la Papelera: 1 elemento?')
  assert.equal((await planOf('empty trash', { countTrash: reading(1) })).question, 'Empty the Trash: 1 item?')
  // Cancel is first, always: a double Enter lands on "No"
  assert.equal(es.labels[0], 'No')
  assert.equal(en.labels[0], 'No')
  assert.equal(asked, 4)
  // empty, unreadable, nonsense: pass to Claude
  for (const value of [0, undefined, NaN, -3, 2.5, '12', null, new Error('boom')]) {
    const found = await planOf('vacía la papelera', { countTrash: reading(value) })
    assert.equal(found.status, 'pass', String(value))
    assert.match(found.reason, /empty|read/i, String(value))
  }
})

test('empty trash: a folder, app, Shortcut or alias named like the Trash is the ordinary rules\' reading; a file is not', async () => {
  let asked = 0
  const countTrash = () => { asked++; return 5 }
  const named = {
    folder: { ...index, folders: { ...index.folders, papelera: '/code/papelera' } },
    app: { ...index, apps: { ...index.apps, trash: '/Applications/Trash.app' } },
    shortcut: { ...index, shortcuts: ['Vaciar papelera', 'Papelera'] },
  }
  for (const [what, idx] of Object.entries(named)) {
    for (const phrase of ['vacía la papelera', 'empty the trash'])
      assert.equal((await planOf(phrase, { countTrash }, { index: idx })).status, 'pass', `${what}: ${phrase}`)
  }
  assert.equal((await planOf('vacía la papelera', { countTrash }, { config: { aliases: { papelera: 'https://x.test/' }, model: {} } })).status, 'pass')
  assert.equal(asked, 0)
  // reflex never empties a file: a file called papelera or trash (icons, notes) is no reason to pass
  for (const path of ['/code/notes/papelera.md', '/code/notes/Papelera', '/code/notes/trash.txt', '/code/icons/trash.svg']) {
    for (const phrase of ['vacía la papelera', 'empty the trash'])
      assert.equal((await planOf(phrase, { countTrash }, { index: { ...index, files: [...index.files, path] } })).status, 'confirm', `${path}: ${phrase}`)
  }
  assert.equal((await planOf('vacía la papelera')).status, 'confirm')
})

test('empty trash: the model never produces it and the catalogue stays as it was', async () => {
  assert.deepEqual(toolsFor().map(t => t.function.name), ['open', 'reveal', 'copy', 'shortcut'])
  for (const verb of ['empty-trash', 'empty', 'trash', 'delete', 'open-trash']) {
    const found = await modelled({ verb, target: 'papelera' })('quiero ver brand')
    assert.notEqual(found.action?.verb, verb, verb)
    assert.notEqual(found.status, 'confirm')
  }
})

test('empty trash: run refuses without a confirmed count, and never calls anything', () => {
  const action = { verb: 'empty-trash', target: { type: 'system', value: 'trash', label: 'the Trash', via: 'system actions' } }
  for (const confirmed of [undefined, 0, -1, 2.5, NaN, '5', null, true]) {
    let called = 0
    assert.throws(() => run({ ...action, confirmed }, () => { called++ }), /confirm/i, String(confirmed))
    assert.equal(called, 0)
  }
  assert.throws(() => commandsFor(action), /confirm/i)
})

test('empty trash: one fixed Finder script that re-reads the count and refuses when it grew', () => {
  const action = { verb: 'empty-trash', confirmed: 312, target: { type: 'system', value: 'trash', label: 'the Trash', via: 'system actions' } }
  const [command] = commandsFor(action)
  assert.equal(commandsFor(action).length, 1)
  assert.equal(command[0], 'osascript')
  assert.equal(command.at(-1), '312')
  const script = command.filter((part, at) => command[at - 1] === '-e').join('\n')
  assert.match(script, /tell application "Finder"/)
  assert.match(script, /count items of trash/)
  assert.match(script, /if n > seen then return "grew "/)
  assert.match(script, /empty trash/)
  assert.doesNotMatch(script, /do shell script|rm |System Events|delete/)
  const calls = []
  const result = run(action, (file, args, options) => { calls.push([file, ...args]); assert.ok(options.timeout >= 60000); return 'emptied 312\n' })
  assert.equal(result, 'emptied the Trash (312 items)')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].at(-1), '312')
  assert.equal(run({ ...action, confirmed: 1 }, () => 'emptied 1\n'), 'emptied the Trash (1 item)')
  assert.throws(() => run(action, () => 'grew 340\n'), /grew from 312 to 340.*not emptied/)
  assert.throws(() => run(action, () => 'something else\n'), /unexpected/i)
  assert.equal(run(action, () => 'empty\n'), 'the Trash is already empty')
})

test('empty trash: a denied Automation grant is said once and clearly, never retried', () => {
  const action = { verb: 'empty-trash', confirmed: 4, target: { type: 'system', value: 'trash', label: 'the Trash', via: 'system actions' } }
  for (const stderr of ['execution error: Not authorized to send Apple events to Finder. (-1743)', 'x (-1743)']) {
    let calls = 0
    assert.throws(() => run(action, () => { calls++; throw Object.assign(new Error('Command failed'), { stderr }) }), /Finder.*Automation.*not emptied/s)
    assert.equal(calls, 1)
  }
  assert.throws(() => run(action, () => { throw Object.assign(new Error('Command failed'), { stderr: 'boom' }) }), /boom/)
})

test('empty trash: the count comes from one Finder read and anything else is unreadable', () => {
  const calls = []
  assert.equal(readTrashCount((file, args) => { calls.push([file, ...args]); return '312\n' }), 312)
  assert.deepEqual(calls, [['osascript', '-e', 'tell application "Finder" to count items of trash']])
  assert.equal(readTrashCount(() => '0\n'), 0)
  for (const out of ['', 'abc', '3.5', '-2', '1 2', undefined]) assert.equal(readTrashCount(() => out), undefined, String(out))
  assert.equal(readTrashCount(() => { throw new Error('denied') }), undefined)
})

// The real CLI, on a cache of its own with an empty index and no config: this Mac's files and models decide nothing.
const cache = mkdtempSync(join(tmpdir(), 'reflex-slice-'))
mkdirSync(join(cache, 'reflex'))
writeFileSync(join(cache, 'reflex', 'index.json'), JSON.stringify({ builtAt: Date.now(), folders: {}, apps: {}, shortcuts: [], defaults: { mail: null, browser: null }, defaultsComplete: true, files: [] }))
const cli = args => spawnSync(process.execPath, [new URL('../src/cli.mjs', import.meta.url).pathname, ...args], { encoding: 'utf8', timeout: 20000, env: { ...process.env, XDG_CACHE_HOME: cache, REFLEX_CONFIG: join(cache, 'none.toml') } })

test('empty trash: -n, --json and a plain CLI run never empty anything', () => {
  const json = cli(['--json', 'vacía la papelera'])
  assert.equal(json.status, 0)
  const parsed = JSON.parse(json.stdout)
  assert.equal(parsed.status, 'confirm')
  assert.equal(parsed.action.verb, 'empty-trash')
  const dry = cli(['-n', 'empty the trash'])
  assert.equal(dry.status, 0)
  assert.match(dry.stdout, /asks first|ask first|confirm/i)
  assert.doesNotMatch(dry.stdout, /osascript/)
  const plain = cli(['empty the trash'])
  assert.equal(plain.status, 5)
  assert.match(plain.stderr, /confirm/i)
  const badCount = cli(['--confirmed', 'abc', 'empty the trash'])
  assert.equal(badCount.status, 2)
  // a confirmed count with -n is still only a description
  const dryConfirmed = cli(['-n', '--confirmed', '3', 'empty the trash'])
  assert.equal(dryConfirmed.status, 0)
  assert.doesNotMatch(dryConfirmed.stdout, /grew|emptied/)
})

// ---------------------------------------------------------------------------------------------------------------
// Queries: one fixed read-only command each, an answer or a pass

const BATTERY = "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=1234567)\t89%; discharging; 4:59 remaining present: true\n"
const DISK = 'Filesystem      Size    Used   Avail Capacity iused ifree %iused  Mounted on\n/dev/disk3s5    995G    727G    210G    78%     16M  2.1G    1%   /System/Volumes/Data\n'
const VPN = (state = 'Disconnected', name = 'vpn.example.com', id = '7B1E5A92-3C4D-4F08-9A6E-52D1B8E0C417', mark = '*') => `${mark} (${state})   ${id} VPN (com.example.vpn) "${name}"                 [VPN:com.example.vpn]\n`
const VPN_HEAD = 'Available network connection services in the current set (*=enabled):\n'
const reader = output => { const calls = []; const read = argv => { calls.push(argv); if (output instanceof Error) throw output; return output }; read.calls = calls; return read }
const answerOf = async (phrase, output, over) => { const read = reader(output); const found = await planOf(phrase, { readCommand: read }, over); return { found, read } }

test('queries: battery in Spanish and English, questions included, answers from one pmset read', async () => {
  const phrases = ['batería', '¿qué batería tengo?', 'cuánta batería queda', '¿cuánta batería me queda?', 'nivel de batería', 'battery', 'battery level', 'how much battery', "how much battery is left?", 'how much battery do I have', 'what is my battery', 'por favor, ¿qué batería tengo?', 'battery status']
  for (const phrase of phrases) {
    const { found, read } = await answerOf(phrase, BATTERY)
    assert.equal(found.status, 'answer', phrase)
    assert.equal(found.answer, 'Battery: 89%, discharging, 4:59 left', phrase)
    assert.equal(found.action.verb, 'query', phrase)
    assert.equal(found.action.target.value, 'battery', phrase)
    assert.deepEqual(read.calls, [['pmset', '-g', 'batt']], phrase)
  }
})

test('queries: battery states, and anything it cannot read for certain passes', async () => {
  const line = body => `Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t${body} present: true\n`
  const cases = [
    [line('100%; charged; 0:00 remaining'), 'Battery: 100%, charged'],
    [line('53%; charging; 1:20 remaining'), 'Battery: 53%, charging, 1:20 to full'],
    [line('89%; discharging; (no estimate)'), 'Battery: 89%, discharging'],
    [line('99%; finishing charge; 0:05 remaining'), 'Battery: 99%, finishing charge'],
    [line('80%; AC attached; not charging'), 'Battery: 80%, plugged in, not charging'],
  ]
  for (const [out, text] of cases) assert.equal((await answerOf('battery', out)).found.answer, text, out)
  const bad = ["Now drawing from 'AC Power'\n", '', 'pmset: command not found', line('101%; discharging; 1:00 remaining'), line('abc%; charged; 0:00 remaining'),
    line('50%; exploding; 1:00 remaining'), BATTERY + ' -InternalBattery-1 (id=2)\t50%; charging; 1:00 remaining present: true\n', undefined, null, 42]
  for (const out of bad) {
    const { found } = await answerOf('battery', out)
    assert.equal(found.status, 'pass', String(out))
  }
  assert.equal((await answerOf('battery', new Error('boom'))).found.status, 'pass')
})

test('queries: disk space reads the Data volume, not the sealed system snapshot', async () => {
  for (const phrase of ['espacio en disco', 'cuánto disco queda', '¿cuánto espacio libre queda?', 'espacio libre', 'disk space', 'free space', 'how much disk space is left', 'how much free space do I have', 'how much space is left']) {
    const { found, read } = await answerOf(phrase, DISK)
    assert.equal(found.status, 'answer', phrase)
    assert.equal(found.answer, 'Disk: 210G free of 995G (78% full)', phrase)
    assert.deepEqual(read.calls, [['df', '-H', '/System/Volumes/Data']], phrase)
  }
  const bad = ['', 'df: error', 'Filesystem Size Used Avail Capacity Mounted on\n', DISK.replace('/System/Volumes/Data', '/'), DISK.replace('210G', 'lots'), DISK.replace('78%', '178%'), DISK + DISK.split('\n')[1] + '\n']
  for (const out of bad) assert.equal((await answerOf('disk space', out)).found.status, 'pass', out)
})

test('queries: VPN status from the one service, or the one the [roles] table names, else a pass', async () => {
  const one = VPN_HEAD + VPN('Disconnected')
  for (const phrase of ['estado de la vpn', '¿está conectada la vpn?', '¿estoy conectado a la vpn?', 'vpn status', 'is the vpn connected', 'is the vpn on?', 'am I on the vpn', 'am I connected to the vpn']) {
    const { found, read } = await answerOf(phrase, one)
    assert.equal(found.status, 'answer', phrase)
    assert.equal(found.answer, 'VPN "vpn.example.com": disconnected', phrase)
    assert.deepEqual(read.calls, [['scutil', '--nc', 'list']], phrase)
  }
  assert.equal((await answerOf('vpn status', VPN_HEAD + VPN('Connected', 'Work'))).found.answer, 'VPN "Work": connected')
  assert.equal((await answerOf('vpn status', VPN_HEAD + VPN('Connecting', 'Work'))).found.answer, 'VPN "Work": connecting')
  const two = VPN_HEAD + VPN('Connected', 'Work', 'AAAAAAAA-0000-0000-0000-000000000001') + VPN('Disconnected', 'Home', 'AAAAAAAA-0000-0000-0000-000000000002')
  assert.equal((await answerOf('vpn status', two)).found.status, 'pass')
  const role = name => ({ config: { ...config, roles: { vpn: name } } })
  assert.equal((await answerOf('vpn status', two, role('Home'))).found.answer, 'VPN "Home": disconnected')
  assert.equal((await answerOf('vpn status', two, role('home'))).found.answer, 'VPN "Home": disconnected')
  assert.equal((await answerOf('vpn status', two, role('Elsewhere'))).found.status, 'pass')
  assert.equal((await answerOf('vpn status', one, role('Elsewhere'))).found.status, 'pass')
  for (const out of [VPN_HEAD, '', 'scutil: error', VPN_HEAD + VPN('Invalid'), VPN_HEAD + VPN('Weird'), VPN_HEAD + 'garbage line\n']) assert.equal((await answerOf('vpn status', out)).found.status, 'pass', out)
})

test('queries: a vpn role that points to an app is not the network service: pass rather than report on the wrong VPN', async () => {
  const one = VPN_HEAD + VPN('Disconnected')
  const withApp = apps => ({ index: { ...index, apps } })
  // the person's role names an app (OpenVPN Connect), the service is another VPN
  assert.equal((await answerOf('vpn status', one, { config: { ...config, roles: { vpn: 'OpenVPN Connect' } }, ...withApp({ 'openvpn connect': '/Applications/OpenVPN Connect.app' }) })).found.status, 'pass')
  assert.equal((await answerOf('vpn status', one, { config: { ...config, roles: { vpn: '/Applications/OpenVPN Connect.app' } } })).found.status, 'pass')
  // no role set, but the only installed app holding "vpn" is what the role resolves to
  const resolved = await answerOf('vpn status', one, withApp({ 'openvpn connect': '/Applications/OpenVPN Connect.app' }))
  assert.equal(resolved.found.status, 'pass')
  assert.match(resolved.found.reason, /app/)
  // a role that names the service itself still answers, whatever apps exist
  assert.equal((await answerOf('vpn status', one, { config: { ...config, roles: { vpn: 'vpn.example.com' } }, ...withApp({ 'openvpn connect': '/Applications/OpenVPN Connect.app' }) })).found.answer, 'VPN "vpn.example.com": disconnected')
})

test('queries: control characters in a service name never reach the prompt', async () => {
  const named = name => VPN_HEAD + VPN('Connected', name)
  assert.equal((await answerOf('vpn status', named('Wo\x1b[31mrk\x07\x00'))).found.answer, 'VPN "Wo[31mrk": connected')
  assert.equal((await answerOf('vpn status', named('Home\u009b\u202e'))).found.answer, 'VPN "Home": connected')
  for (const found of [(await answerOf('vpn status', named('A\nB'))).found]) assert.doesNotMatch(found.answer ?? '', /[\u0000-\u001f\u007f-\u009f]/)
})

test('queries: only the table\'s own phrasings, never a statement, a negation, a compound or a similar sentence', async () => {
  const near = ['batería baja', 'my battery is low', 'battery saver', 'battery and disk space', 'batería y disco', 'cuánta batería queda y apaga el mac', 'no quiero saber la batería', "don't tell me the battery", 'why is the battery draining', 'por qué se gasta la batería', 'how much battery does slack use', 'cuánto espacio ocupa node_modules', 'how much space does brand take', 'disk space in brand', 'disk', 'vpn', 'vpn status of the office', 'estoy conectado a la vpn', 'estoy en la vpn', '¿estoy en la vpn?', 'is the vpn connected to brand', 'conecta la vpn', 'connect the vpn', 'desconecta la vpn', 'batería; disco', 'what battery do you recommend', 'estoy en la vpn de la oficina']
  for (const phrase of near) {
    const read = reader(BATTERY)
    assert.equal((await planOf(phrase, { readCommand: read })).status, 'pass', phrase)
    assert.equal(read.calls.length, 0, `${phrase}: nothing is read for a phrase that is not a query`)
  }
  assert.equal((await planOf('\\battery', { readCommand: reader(BATTERY) })).status, 'pass')
})

test('queries: the model never answers one, a query word never reaches it, and the existing battery pane still opens', async () => {
  const opening = modelled({ verb: 'open', target: 'brand' }, { readCommand: reader(BATTERY) })
  for (const phrase of ['quiero ver cuánta batería queda en brand', 'necesito el estado de la vpn'])
    assert.equal((await opening(phrase)).status, 'pass', phrase)
  assert.equal(await got('abre ajustes de batería'), 'action settings x-apple.systempreferences:com.apple.Battery-Settings.extension')
})

// ---------------------------------------------------------------------------------------------------------------
// Reversible commands

const REVERSIBLE = {
  'open-trash trash': ['abre la papelera', 'muestra la papelera', 'abre papelera', 'abre la papelera, por favor', 'open trash', 'open the trash', 'show the trash', 'show trash', 'can you open the trash'],
  'appearance dark': ['activa el modo oscuro', 'pon el modo oscuro', 'pon modo oscuro', 'activar el modo oscuro', 'turn on dark mode', 'enable dark mode', 'switch to dark mode', 'set dark mode', 'por favor, activa el modo oscuro', 'cambia a modo oscuro', 'cambia al modo oscuro'],
  'appearance light': ['activa el modo claro', 'pon el modo claro', 'pon modo claro', 'activar el modo claro', 'turn on light mode', 'enable light mode', 'switch to light mode', 'set light mode', 'desactiva el modo oscuro', 'quita el modo oscuro', 'turn off dark mode', 'disable dark mode', 'cambia a modo claro'],
  'appearance toggle': ['alterna el modo oscuro', 'alterna el modo claro', 'alterna el aspecto', 'cambia el aspecto', 'toggle dark mode', 'toggle light mode', 'toggle appearance', 'toggle the appearance'],
  'sleep-displays displays': ['pon las pantallas en reposo', 'pon la pantalla en reposo', 'apaga la pantalla', 'apaga las pantallas', 'duerme la pantalla', 'sleep displays', 'sleep the displays', 'sleep the display', 'turn off the display', 'turn off the displays', 'turn off the screen'],
  'screensaver screensaver': ['pon el salvapantallas', 'activa el salvapantallas', 'enciende el salvapantallas', 'start the screen saver', 'start screen saver', 'show the screen saver', 'turn on the screen saver'],
  'hide-others others': ['oculta las demás', 'oculta las demás apps', 'oculta las demás aplicaciones', 'oculta el resto', 'esconde las demás', 'hide other apps', 'hide all other apps', 'hide the other apps', 'please hide other apps'],
  'screenshot-toolbar screenshot': ['haz una captura', 'haz una captura de pantalla', 'toma una captura', 'captura la pantalla', 'graba la pantalla', 'haz un pantallazo', 'take a screenshot', 'record the screen', 'record my screen', 'take a screen shot'],
  'mission-control missioncontrol': ['abre mission control', 'abre el mission control', 'muestra mission control', 'open mission control', 'show mission control'],
}

test('reversible: every phrase of the table, in both languages, plans its one action', async () => {
  for (const [what, phrases] of Object.entries(REVERSIBLE)) {
    const [verb, value] = what.split(' ')
    for (const phrase of phrases) assert.equal(await got(phrase), `action ${verb} ${value}`, phrase)
  }
})

test('reversible: not a whole phrase of the table, or not a request, passes', async () => {
  const near = [
    'no apagues la pantalla', "don't turn off the display", 'apaga la pantalla y bloquea el mac', 'sleep displays and lock', 'turn off the display in 5 minutes', 'apaga la pantalla en 5 minutos', 'sleep', 'duerme', 'apaga', 'pantalla',
    'no actives el modo oscuro', "don't switch to dark mode", 'dark mode is nice', 'ya activé el modo oscuro', 'I turned on dark mode', 'activa el modo oscuro y abre figma', 'turn on dark mode and open figma', 'modo oscuro en brand', 'set dark mode in the editor', '¿activo el modo oscuro?', 'is dark mode on', 'toggle dark mode?', 'activa el modo oscuro de la web', 'modo oscuro automático', 'set dark mode to auto', 'turn off light mode',
    'salvapantallas de brand', 'start the screen saver in 5 minutes', 'ya puse el salvapantallas', 'no pongas el salvapantallas', 'screen saver settings',
    'oculta las demás ventanas', 'hide others windows', 'oculta las demás y abre figma', 'no ocultes las demás', 'hide others slack', 'hide other',
    'haz una captura de brand', 'take a screenshot of brand', 'screenshot of the page', 'captura de pantalla de la web', 'graba la pantalla y súbela', 'no hagas una captura', "don't take a screenshot", 'record', 'graba',
    'mission control is broken', 'abre mission', 'open mission', 'mission control y abre figma', 'no abras mission control', 'open mission control settings',
    // a bare noun is no request: «dark mode» may be the answer to one of Claude's questions
    'modo oscuro', 'dark mode', 'modo claro', 'light mode', 'salvapantallas', 'screen saver', 'screensaver', 'mission control', 'hide others', 'hide all others', 'hide the others', 'screenshot', 'screen shot', 'captura de pantalla', 'pantallazo', 'screen recording', 'Dark Mode', 'MODO OSCURO',
    'abre la papelera de reciclaje', 'open the trash folder in brand', 'open trash and empty it', 'no abras la papelera', 'abre la papelera y vacíala',
  ]
  for (const phrase of near) assert.equal(await got(phrase), 'pass', phrase)
})

test('reversible: a question about one is not a request, only the second person is', async () => {
  for (const phrase of ['¿abre la papelera?', 'open the trash?', '¿modo oscuro?', 'dark mode?', 'salvapantallas?', '¿apaga la pantalla?'])
    assert.equal(await got(phrase), 'pass', phrase)
  for (const phrase of ['¿puedes abrir la papelera?', 'can you turn on dark mode?', '¿puedes poner el salvapantallas?'])
    assert.match(await got(phrase), /^action /, phrase)
})

test('reversible: something named like the object takes the phrase to the ordinary rules', async () => {
  const withName = (kind, name, path) => ({ ...index, [kind]: kind === 'folders' ? { ...index.folders, [name]: path } : kind === 'apps' ? { ...index.apps, [name]: path } : kind === 'files' ? [...index.files, path] : [...index.shortcuts, name] })
  assert.equal(await got('abre la papelera', undefined, { index: withName('folders', 'papelera', '/code/papelera') }), 'action open /code/papelera')
  assert.equal(await got('abre mission control', undefined, { index: withName('apps', 'mission control', '/Applications/Mission Control.app') }), 'action open /Applications/Mission Control.app')
  assert.equal(await got('abre la papelera', undefined, { index: withName('files', '', '/code/papelera.txt') }), 'action open-trash trash')
  assert.equal(await got('vacía la papelera', undefined, { index: withName('files', '', '/code/papelera.txt') }), 'confirm empty-trash trash')
  assert.equal(await got('abre mission control', undefined, { index: withName('apps', 'mission control', '/System/Applications/Mission Control.app') }), 'action mission-control missioncontrol')
  assert.equal(await got('salvapantallas', undefined, { index: withName('apps', 'salvapantallas', '/Applications/Salvapantallas.app') }), 'pass')
  assert.equal(await got('screenshot', undefined, { index: withName('shortcuts', 'Screenshot', '') }), 'pass')
  // an unrelated folder called "pantalla" does not stop the phrases that merely contain the word
  assert.equal(await got('apaga la pantalla'), 'action sleep-displays displays')
})

test('reversible: fixed argument lists, nothing typed ever reaches a command', async () => {
  const commands = async phrase => commandsFor((await planOf(phrase)).action)
  assert.deepEqual(await commands('abre la papelera'), [['open', `${homedir()}/.Trash`]])
  assert.deepEqual(await commands('sleep displays'), [['pmset', 'displaysleepnow']])
  assert.deepEqual(await commands('pon el salvapantallas'), [['open', '-a', '/System/Library/CoreServices/ScreenSaverEngine.app']])
  assert.deepEqual(await commands('take a screenshot'), [['open', '-a', '/System/Applications/Utilities/Screenshot.app']])
  assert.deepEqual(await commands('abre mission control'), [['open', '-a', '/System/Applications/Mission Control.app']])
  const futures = { 'abre la papelera': 'open the Trash', 'sleep displays': 'sleep the displays', 'pon el salvapantallas': 'start the screen saver', 'take a screenshot': 'open the Screenshot toolbar', 'open mission control': 'open Mission Control', 'hide other apps': 'hide other apps', 'activa el modo oscuro': 'switch to dark mode', 'pon el modo claro': 'switch to light mode', 'toggle dark mode': 'toggle dark/light mode' }
  for (const [phrase, text] of Object.entries(futures)) assert.equal(describe((await planOf(phrase)).action, 'future'), text, phrase)
  const calls = []
  assert.equal(run((await planOf('abre mission control')).action, (file, args) => { calls.push([file, ...args]) }), 'opened Mission Control')
  assert.deepEqual(calls, [['open', '-a', '/System/Applications/Mission Control.app']])
  assert.throws(() => commandsFor({ verb: 'appearance', target: { type: 'system', value: 'dark; do shell script "id"', label: 'x' } }), /not an appearance/)
})

test('appearance: fixed System Events statements, the result read back, a refusal said clearly and never retried', async () => {
  const script = async phrase => { const [command] = commandsFor((await planOf(phrase)).action); return command.filter((part, at) => command[at - 1] === '-e').join('\n') }
  assert.match(await script('activa el modo oscuro'), /set dark mode to true/)
  assert.match(await script('activa el modo claro'), /set dark mode to false/)
  assert.match(await script('toggle appearance'), /set dark mode to not dark mode/)
  for (const phrase of ['activa el modo oscuro', 'activa el modo claro', 'toggle appearance']) {
    const text = await script(phrase)
    assert.match(text, /tell application "System Events"/)
    assert.match(text, /return dark mode/)
    assert.doesNotMatch(text, /do shell script|run script/)
  }
  const dark = (await planOf('activa el modo oscuro')).action, light = (await planOf('activa el modo claro')).action, toggle = (await planOf('toggle dark mode')).action
  assert.equal(run(dark, () => 'true\n'), 'switched to dark mode')
  assert.equal(run(light, () => 'false\n'), 'switched to light mode')
  assert.equal(run(toggle, () => 'true\n'), 'switched to dark mode')
  assert.equal(run(toggle, () => 'false\n'), 'switched to light mode')
  // a grant that fails silently shows as the wrong state read back
  assert.throws(() => run(dark, () => 'false\n'), /did not change.*System Events.*Automation/s)
  assert.throws(() => run(light, () => 'true\n'), /did not change/)
  assert.throws(() => run(toggle, () => 'maybe\n'), /unexpected/i)
  let calls = 0
  assert.throws(() => run(dark, () => { calls++; throw Object.assign(new Error('x'), { stderr: 'Not authorized to send Apple events to System Events. (-1743)' }) }), /System Events.*Automation/s)
  assert.equal(calls, 1)
})

test('hide others: every regular app but the frontmost and the host, as a graceful hide, never a launch', async () => {
  const host = '/Applications/Ghostty.app'
  const found = await planOf('hide other apps', {}, { ancestors: () => ['/bin/zsh', '/usr/local/bin/node', `${host}/Contents/MacOS/ghostty`] })
  assert.equal(found.status, 'action')
  const [command] = commandsFor(found.action)
  assert.deepEqual(command.slice(0, 3), ['osascript', '-l', 'JavaScript'])
  assert.equal(command.at(-1), host)
  const text = command.filter((part, at) => command[at - 1] === '-e').join('\n')
  assert.match(text, /frontmostApplication/)
  assert.match(text, /activationPolicy/)
  assert.match(text, /app\.hide\b/)
  assert.doesNotMatch(text, /launch|activate|kill|terminate|quit\b|doShellScript|do shell script/i)
  assert.equal(run(found.action, () => 'hidden 7\n'), 'hid 7 other apps')
  assert.equal(run(found.action, () => 'hidden 1\n'), 'hid 1 other app')
  assert.equal(run(found.action, () => 'hidden 0\n'), 'no other apps to hide')
  // no ancestry at all, or one with no app in it (tmux, ssh, launchd): reflex cannot tell which app hosts the session, so it hides nothing
  assert.equal((await planOf('hide other apps', {}, { ancestors: () => [] })).status, 'pass')
  for (const chain of [['/sbin/launchd'], ['/bin/zsh', '/usr/bin/tmux', '/sbin/launchd'], ['/usr/bin/ssh', '/usr/sbin/sshd']]) {
    const found = await planOf('hide other apps', {}, { ancestors: () => chain })
    assert.equal(found.status, 'pass', chain.join(' < '))
    assert.match(found.reason, /host/)
  }
})

test('lock and sleep displays stay apart: only the lock asks how the Mac locks', async () => {
  let asked = 0
  const counting = () => { asked++; return 'screenLock delay is 5 seconds' }
  assert.equal((await planOf('sleep displays', { screenLockStatus: counting })).status, 'action')
  assert.equal(asked, 0)
  assert.equal((await planOf('lock screen', { screenLockStatus: counting })).status, 'pass')
  assert.equal(asked, 1)
})

// ---------------------------------------------------------------------------------------------------------------
// «Aspecto»

test('settings: «aspecto» is the Spanish name of the Appearance pane', async () => {
  const ID = 'x-apple.systempreferences:com.apple.Appearance-Settings.extension'
  for (const phrase of ['abre ajustes de aspecto', 'abre los ajustes de aspecto', 'ajustes de aspecto', 'abre la configuración del aspecto', 'abre ajustes de apariencia'])
    assert.equal(await got(phrase), `action settings ${ID}`, phrase)
  assert.equal(await got('open appearance settings'), `action settings ${ID}`)
  assert.equal(PANES.length, 13)
  assert.deepEqual(PANES.find(pane => pane.label === 'Appearance').es, ['apariencia', 'aspecto'])
})

// ---------------------------------------------------------------------------------------------------------------
// The exams' grammar

test('eval: confirm and answer are statuses of their own, and a pass expected where one acts is wrong', () => {
  const confirm = { status: 'confirm', action: { verb: 'empty-trash', target: { value: 'trash' } } }
  const answer = { status: 'answer', action: { verb: 'query', target: { value: 'battery' } } }
  assert.equal(classify({ status: 'confirm', verb: 'empty-trash', value: 'trash' }, confirm), 'right')
  assert.equal(classify({ status: 'confirm', verb: 'empty-trash', value: 'trash' }, { status: 'pass' }), 'missed')
  assert.equal(classify({ status: 'pass' }, confirm), 'wrong')
  assert.equal(classify({ status: 'pass' }, answer), 'wrong')
  assert.equal(classify({ status: 'answer', verb: 'query', value: 'battery' }, answer), 'right')
  assert.equal(classify({ status: 'answer', verb: 'query', value: 'disk' }, answer), 'wrong')
  assert.equal(classify({ status: 'action', verb: 'open', value: '/x' }, confirm), 'wrong')
  assert.equal(classify({ status: 'confirm', verb: 'empty-trash', value: 'trash' }, { status: 'action', action: { verb: 'open', target: { value: 'trash' } } }), 'wrong')
})
