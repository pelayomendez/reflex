// Slice 3: a closed table of harmless system actions (Settings panes, hide, lock, volume), tested at the planner
// with fake deps and, for the commands, with an injected exec: nothing here locks, mutes or hides anything.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toolsFor } from '../src/catalogue.mjs'
import { plan } from '../src/plan.mjs'
import { commandsFor, describe, run } from '../src/run.mjs'
import { PANES } from '../src/system.mjs'

const index = {
  folders: { sonido: '/code/sonido', volumen: '/code/volumen', brand: '/code/brand', pantalla: '/code/pantalla', 'ajustes de red': '/code/ajustes-de-red' },
  apps: { slack: '/Applications/Slack.app', spotify: '/Applications/Spotify.app', warp: '/Applications/Warp.app', terminal: '/System/Applications/Utilities/Terminal.app' },
  shortcuts: ['Modo foco'],
  files: ['/code/brand/README.md'],
}
const config = { aliases: {}, model: {} }
const ID = 'x-apple.systempreferences:'
const IMMEDIATE = () => '2026-11-07 10:58:34.545 sysadminctl[1:2] screenLock delay is immediate\n'
const templates = (phrase, ancestors = () => ['/sbin/launchd'], screenLockStatus = IMMEDIATE) => plan(phrase, { index, config, zoxide: () => undefined, ancestors, screenLockStatus })
const got = async phrase => {
  const found = await templates(phrase)
  return found.status === 'action' ? `${found.action.verb} ${found.action.target.value}` : found.status
}
const modelled = answer => phrase => plan(phrase, { index, config: { ...config, model: { url: 'http://x', name: 'm' } }, zoxide: () => undefined, ancestors: () => ['/sbin/launchd'], screenLockStatus: IMMEDIATE, askModel: async () => answer })

test('settings: a pane of the table opens by its own address, in Spanish and English', async () => {
  const cases = {
    'abre ajustes de sonido': 'com.apple.Sound-Settings.extension',
    'open Bluetooth settings': 'com.apple.BluetoothSettings',
    'abre la configuración de red': 'com.apple.Network-Settings.extension',
    'ajustes de pantalla': 'com.apple.Displays-Settings.extension',
    'privacy settings': 'com.apple.settings.PrivacySecurity.extension',
    'abre los ajustes de Bluetooth': 'com.apple.BluetoothSettings',
    'abre ajustes de wifi': 'com.apple.wifi-settings-extension',
    'open wi-fi settings': 'com.apple.wifi-settings-extension',
    'ajustes de batería': 'com.apple.Battery-Settings.extension',
    'abre los ajustes del teclado': 'com.apple.Keyboard-Settings.extension',
    'open the trackpad settings': 'com.apple.Trackpad-Settings.extension',
    'ajustes de notificaciones': 'com.apple.Notifications-Settings.extension',
    'abre ajustes de privacidad y seguridad': 'com.apple.settings.PrivacySecurity.extension',
    'open privacy & security settings': 'com.apple.settings.PrivacySecurity.extension',
    'open general settings': 'com.apple.systempreferences.GeneralSettings',
    'abre ajustes de actualización de software': 'com.apple.Software-Update-Settings.extension',
    'open software update settings': 'com.apple.Software-Update-Settings.extension',
    'abre ajustes de apariencia': 'com.apple.Appearance-Settings.extension',
    'open appearance settings': 'com.apple.Appearance-Settings.extension',
    'por favor, abre los ajustes de sonido': 'com.apple.Sound-Settings.extension',
    'can you open sound settings': 'com.apple.Sound-Settings.extension',
    '¿puedes abrir ajustes de sonido?': 'com.apple.Sound-Settings.extension',
  }
  for (const [phrase, id] of Object.entries(cases)) assert.equal(await got(phrase), `settings ${ID}${id}`, phrase)
  const found = await templates('abre ajustes de sonido')
  assert.equal(describe(found.action, 'future'), 'settings: Sound')
  assert.deepEqual(commandsFor(found.action), [['open', `${ID}com.apple.Sound-Settings.extension`]])
})

test('settings: plain "abre ajustes" and "open settings" open the System Settings app, whatever its name in this language', async () => {
  for (const phrase of ['abre ajustes', 'open settings', 'abre configuración', 'open system settings', 'abre los ajustes del sistema', 'abre preferencias del sistema'])
    assert.equal(await got(phrase), 'open /System/Applications/System Settings.app', phrase)
  assert.equal(describe((await templates('open settings')).action, 'future'), 'open System Settings')
  // a bare word is not a request
  for (const phrase of ['settings', 'ajustes', 'configuración'])
    assert.equal(await got(phrase), 'pass', phrase)
})

test('settings: only panes of the table; an unknown pane or a lookalike goes to Claude', async () => {
  for (const phrase of ['abre ajustes de impresoras', 'open printer settings', 'abre ajustes de sonido y red', 'abre ajustes de sonido en el finder', 'open sound settings in cursor', 'abre ajustes de sonido y abre figma', 'ajustes de', 'open settings for sound', 'abre los ajustes de sonidoo', 'open the sound settings file', 'abre ajustes de x-apple.systempreferences:com.apple.Sound-Settings.extension', 'abre ajustes de com.apple.Sound-Settings.extension'])
    assert.equal(await got(phrase), 'pass', phrase)
})

test('settings: a folder or app really called like the phrase is the ordinary rules\' to open', async () => {
  assert.equal(await got('abre ajustes de red'), 'open /code/ajustes-de-red')
  assert.equal(await got('abre ajustes de sonido'), `settings ${ID}com.apple.Sound-Settings.extension`)
})

test('every pane id is a reverse-DNS name with no characters that could carry anything else', () => {
  assert.equal(PANES.length, 13)
  for (const pane of PANES) assert.match(pane.id, /^com\.apple\.[A-Za-z0-9.-]+$/, pane.label)
  assert.equal(new Set(PANES.map(pane => pane.id)).size, PANES.length)
})

test('hide: an installed app named exactly is hidden, in Spanish and English', async () => {
  for (const phrase of ['oculta Slack', 'esconde Spotify', 'hide Slack', 'ocultar Slack', 'esconder Spotify', 'por favor, oculta la app de Slack', 'can you hide Slack', '¿puedes ocultar Slack?', 'oculta Slack, gracias', 'Hide spotify'])
    assert.match(await got(phrase), /^hide \/Applications\//, phrase)
  assert.equal(await got('esconde Spotify'), 'hide /Applications/Spotify.app')
  const found = await templates('oculta Slack')
  assert.equal(describe(found.action, 'future'), 'hide Slack')
  assert.equal(describe(found.action), 'hid Slack')
})

test('hide: only exact apps. Folders, names that merely fit, typos, "others" and windows go to Claude', async () => {
  for (const phrase of ['oculta brand', 'oculta Slac', 'hide Slackk', 'hide Spot', 'hide the sidebar', 'oculta la ventana de Slack', 'oculta la carpeta brand', 'hide', 'oculta', 'esconde la carpeta de slack'])
    assert.equal(await got(phrase), 'pass', phrase)
})

test('hide: never the app that hosts this session', async () => {
  const hosted = exe => () => ['/bin/zsh', '/usr/local/bin/node', exe]
  assert.equal((await templates('hide Warp', hosted('/Applications/Warp.app/Contents/MacOS/stable'))).status, 'pass')
  assert.equal((await templates('oculta Terminal', hosted('/System/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal'))).status, 'pass')
  assert.equal((await templates('hide Warp', hosted('/Applications/Ghostty.app/Contents/MacOS/ghostty'))).status, 'action')
  assert.equal((await templates('hide Slack', () => [])).status, 'pass')
})

test('hide: the command checks the app is running by path, hides it gracefully, takes the path as an argument and never launches it', async () => {
  const action = (await templates('oculta Slack')).action
  const [command] = commandsFor(action)
  assert.equal(commandsFor(action).length, 1)
  assert.deepEqual(command.slice(0, 3), ['osascript', '-l', 'JavaScript'])
  assert.equal(command.at(-1), '/Applications/Slack.app')
  const script = command.filter((part, at) => command[at - 1] === '-e').join('\n')
  assert.match(script, /not running/)
  assert.match(script, /app\.hide\b/)
  assert.doesNotMatch(script, /Slack|launch|activate|kill|terminate|quit|doShellScript|do shell script/i)
  const calls = []
  assert.equal(run(action, (file, args) => { calls.push([file, ...args]); return 'not running\n' }), 'Slack is not running, nothing to hide')
  assert.equal(calls.length, 1)
  assert.equal(run(action, () => 'hidden\n'), 'hid Slack')
})

test('hide: negations, reports, questions, talk and compound requests pass', async () => {
  for (const phrase of ['no ocultes Slack', "don't hide Slack", 'ya oculté Slack', 'he ocultado Slack', 'I hid Slack', 'hid Slack', 'hidden Slack', 'por qué se oculta Slack', 'why does Slack hide', 'how do I hide Slack', '¿oculta Slack?', 'hide Slack?', 'oculta Slack y abre Figma', 'hide Slack and open Figma', 'oculta Slack, abre Figma', 'hiding Slack', 'ocultando Slack', 'cuando oculto Slack falla', 'quiero que ocultes Slack', 'explícame cómo ocultar Slack', '\\oculta Slack'])
    assert.equal(await got(phrase), 'pass', phrase)
  assert.match(await got('¿puedes ocultar Slack?'), /^hide /)
})

test('hide: the model never hides, and a phrase that asks to hide never reaches it', async () => {
  const opening = modelled({ verb: 'open', target: 'slack' })
  for (const phrase of ['necesito ocultar slack', 'quiero que escondas slack', 'I need you to hide slack', 'puedes esconder slack y pon figma', 'llévame a slack y escóndelo'])
    assert.equal((await opening(phrase)).status, 'pass', phrase)
  assert.equal((await modelled({ verb: 'hide', target: 'slack' })('necesito slack')).action.verb, 'open')
})

test('lock: fixed phrases lock the screen, and nothing else does', async () => {
  for (const phrase of ['bloquea la pantalla', 'bloquea el mac', 'lock screen', 'lock the mac', 'bloquear la pantalla', 'bloquea el Mac, por favor', 'lock the screen', 'lock my mac', 'bloquea mi mac', 'please lock the screen', '¿puedes bloquear la pantalla?', 'can you lock the mac?'])
    assert.equal(await got(phrase), 'lock screen', phrase)
  assert.equal(describe((await templates('lock screen')).action, 'future'), 'lock screen')
  for (const phrase of ['bloquea', 'lock', 'bloquea la puerta', 'lock the door', 'lock file', 'lock the repo', 'bloquea el mac y abre figma', 'lock the screen and open figma', 'no bloquees la pantalla', "don't lock the screen", 'ya bloqueé la pantalla', 'I locked the screen', 'locked the mac', 'why does the screen lock', 'por qué se bloquea la pantalla', '¿bloquea la pantalla?', 'locking the screen', 'cuando bloqueo la pantalla falla', 'lock screen, then sleep'])
    assert.equal(await got(phrase), 'pass', phrase)
})

test('lock: the command is the display sleep, as a fixed argument list, and the dependency is documented where it lives', async () => {
  const action = (await templates('bloquea la pantalla')).action
  assert.deepEqual(commandsFor(action), [['pmset', 'displaysleepnow']])
  const calls = []
  assert.equal(run(action, (file, args) => { calls.push([file, ...args]) }), 'locked the screen')
  assert.deepEqual(calls, [['pmset', 'displaysleepnow']])
})

test('volume: fixed phrases and one integer, in Spanish and English', async () => {
  const fixed = {
    silencia: 'mute', 'silencia el sonido': 'mute', mute: 'mute', 'silenciar el volumen': 'mute', 'mute the sound': 'mute',
    unmute: 'unmute', 'quita el silencio': 'unmute', 'unmute the sound': 'unmute',
    'sube el volumen': 'up', 'subir el volumen': 'up', 'volume up': 'up', 'turn up the volume': 'up',
    'baja el volumen': 'down', 'bajar el volumen': 'down', 'volume down': 'down', 'turn the volume down': 'down',
    'volumen al 30': '30', 'volumen a 30': '30', 'volumen 30': '30', 'volume 30': '30', 'pon el volumen al 30': '30', 'pon el volumen a 30': '30',
    'set volume to 30': '30', 'set the volume to 30': '30', 'volume 30%': '30', 'volumen al 30 %': '30', 'volumen al 0': '0', 'volume 100': '100', 'volumen al 007': '7',
    'sube el volumen al 50': '50', 'baja el volumen a 20': '20', 'por favor, silencia': 'mute', '¿puedes bajar el volumen?': 'down', 'can you mute?': 'mute',
  }
  for (const [phrase, what] of Object.entries(fixed)) assert.equal(await got(phrase), `volume ${what}`, phrase)
  assert.equal(describe((await templates('volume 30')).action, 'future'), 'volume 30%')
  assert.equal(describe((await templates('mute')).action, 'future'), 'mute')
})

test('volume: anything that is not a whole phrase of the table, and a level out of range or not an integer, goes to Claude', async () => {
  for (const phrase of ['volumen al 101', 'volume 150', 'volumen al 1000', 'volume 30.5', 'volumen al -5', 'volume 3e1', 'volume 0x1f', 'volume thirty', 'volumen al treinta', 'volume', 'volumen', 'volume 30 and 40', 'volume 30; rm -rf', 'volume 30 apple', 'pon el volumen a tope', 'sube el volumen a tope', 'sube el volumen y abre figma', 'mute slack', 'silencia a Slack', 'silencia slack y spotify', 'mute the mic', 'volume 3 0'])
    assert.equal(await got(phrase), 'pass', phrase)
})

test('volume: negations, reports, questions, talk and compound requests pass', async () => {
  for (const phrase of ['no silencies el sonido', "don't mute", 'do not turn the volume down', 'nunca bajes el volumen', 'ya silencié el sonido', 'I muted the sound', 'muted the sound', 'he subido el volumen', 'subí el volumen', 'why does the volume go down', 'por qué baja el volumen', 'cómo silencio el sonido', 'how do I mute', '¿silencia el sonido?', 'mute?', 'explícame cómo subir el volumen', 'silencia y abre figma', 'mute, then open figma', 'sube el volumen, baja el brillo', 'muting the sound', 'cuando silencio el sonido falla', 'quiero que silencies el sonido', 'when I mute it crashes'])
    assert.equal(await got(phrase), 'pass', phrase)
})

test('volume: commands are fixed statements, the level travels as an argument and is re-checked', async () => {
  const act = what => ({ verb: 'volume', target: { type: 'volume', value: what, label: what } })
  assert.deepEqual(commandsFor(act('mute')), [['osascript', '-e', 'set volume with output muted']])
  assert.deepEqual(commandsFor(act('unmute')), [['osascript', '-e', 'set volume without output muted']])
  const level = commandsFor(act('30'))[0]
  assert.equal(level.at(-1), '30')
  // only "up" may unmute: down and a level keep the mute state as it is
  for (const what of ['down', '30']) assert.doesNotMatch(commandsFor(act(what))[0].join(' '), /output muted/, what)
  assert.match(commandsFor(act('up'))[0].join(' '), /without output muted/)
  assert.equal(level.filter(part => part.includes('30')).length, 1)
  assert.equal(commandsFor(act('007'))[0].at(-1), '7')
  for (const what of ['up', 'down']) {
    const script = commandsFor(act(what))[0].join('\n')
    assert.match(script, /get volume settings/)
    assert.doesNotMatch(script, /do shell script|doShellScript|run script|system attribute/)
  }
  for (const bad of ['101', '-1', '3.5', '', 'abc', '30; say hi', '1e2', '30 ', ' 30', 'up; do shell script "id"', '٣٠'])
    assert.throws(() => commandsFor(act(bad)), /not a volume/, JSON.stringify(bad))
  const calls = []
  run(act('30'), (file, args) => { calls.push([file, ...args]) })
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'osascript')
})

test('settings: only the table\'s own addresses ever reach `open`', () => {
  const act = value => ({ verb: 'settings', target: { type: 'settings', value, label: 'x' } })
  assert.throws(() => commandsFor(act('x-apple.systempreferences:com.apple.Sound-Settings.extension?anchor=x')), /not a settings pane/)
  assert.throws(() => commandsFor(act('https://example.com/')), /not a settings pane/)
  assert.throws(() => commandsFor(act('/etc/passwd')), /not a settings pane/)
  assert.equal(commandsFor(act(`${ID}com.apple.BluetoothSettings`))[0][1], `${ID}com.apple.BluetoothSettings`)
})

test('collisions: the system words never turn into an open of something called "sonido" or "volumen"', async () => {
  // a folder named after the word still opens with the ordinary verb: the system phrases need their own words
  assert.equal(await got('abre sonido'), 'open /code/sonido')
  assert.equal(await got('abre volumen'), 'open /code/volumen')
  assert.equal(await got('abre pantalla'), 'open /code/pantalla')
  assert.equal(await got('open sonido'), 'open /code/sonido')
  // and the toggles ("pon", "activa") that a model would take for an open are Claude's, not its
  const opening = modelled({ verb: 'open', target: 'sonido' })
  for (const phrase of ['activa el sonido', 'pon el sonido', 'enciende el sonido', 'turn on the sound', 'desactiva el sonido', 'apaga el sonido', 'pon sonido', 'quiero activar el sonido', 'necesito el volumen', 'pon el volumen a tope'])
    assert.equal((await opening(phrase)).status, 'pass', phrase)
  const volume = modelled({ verb: 'open', target: 'volumen' })
  for (const phrase of ['pon el volumen al máximo', 'necesito volumen', 'quiero ver el volumen', 'llévame a volumen', 'turn the volume to max'])
    assert.equal((await volume(phrase)).status, 'pass', phrase)
  // the fixed phrases are the table's, never the model's, whatever it would answer
  assert.equal(await got('pon el volumen al 30'), 'volume 30')
  assert.equal((await modelled({ verb: 'open', target: 'volumen' })('pon el volumen al 30')).action.verb, 'volume')
  // a model is still asked about names that merely sit near these words
  assert.equal((await modelled({ verb: 'open', target: 'brand' })('quiero ver brand')).status, 'action')
  assert.equal((await modelled({ verb: 'open', target: 'sonido' })('quiero ver sonido')).action.target.value, '/code/sonido')
  // a Shortcut named like a toggle keeps working
  assert.equal((await templates('ejecuta modo foco')).status, 'action')
})

test('the model catalogue is untouched: no tool for a system action, and the model path never produces one', async () => {
  assert.deepEqual(toolsFor().map(t => t.function.name), ['open', 'reveal', 'copy', 'shortcut'])
  for (const verb of ['lock', 'volume', 'settings', 'hide', 'mute']) {
    for (const phrase of ['quiero ver slack', 'necesito brand', 'llévame a brand'])
      assert.notEqual((await modelled({ verb, target: 'brand' })(phrase)).action?.verb, verb, `${verb} ${phrase}`)
  }
})

test('volume: for sube/baja only "a/al N" is a level; "en N" and a bare number are not', async () => {
  for (const phrase of ['sube el volumen en 20', 'baja el volumen en 20', 'sube el volumen 10', 'baja el volumen 20', 'subir el volumen en 5', 'bajar el volumen 30', 'sube volumen 10'])
    assert.equal(await got(phrase), 'pass', phrase)
  for (const [phrase, what] of [['sube el volumen al 50', '50'], ['baja el volumen a 20', '20'], ['pon el volumen en 20', '20'], ['pon el volumen 20', '20']])
    assert.equal(await got(phrase), `volume ${what}`, phrase)
})

test('volume: a bare "volume N" below 10, with no verb, preposition or %, is not a request', async () => {
  for (const phrase of ['volume 5', 'volumen 0', 'volume 9', 'volumen 007'])
    assert.equal(await got(phrase), 'pass', phrase)
  for (const [phrase, what] of [['volume 10', '10'], ['volumen 30', '30'], ['volume 5%', '5'], ['volumen al 5', '5'], ['set volume to 5', '5'], ['pon el volumen a 5', '5'], ['volume 0%', '0']])
    assert.equal(await got(phrase), `volume ${what}`, phrase)
})

test('volume: a level does not touch the mute state, and the preview says what it does', async () => {
  assert.equal(describe((await templates('volumen al 30')).action, 'future'), 'volume 30%')
})

test('lock: acts only when "Require password" is immediate; an error or anything else passes, and only the lock phrase asks', async () => {
  const lock = status => templates('bloquea la pantalla', undefined, status)
  assert.equal((await lock(IMMEDIATE)).status, 'action')
  const reason = 'Require password is not set to Immediately; reflex would only sleep the display'
  for (const out of ['screenLock delay is 5 seconds', 'screenLock delay is 60 seconds\n', 'screenLock is off', 'screenLock delay is never', '', 'sysadminctl: command not found', 'screenLock delay is immediately not', 'xscreenLock delay is immediate']) {
    const found = await lock(() => out)
    assert.equal(found.status, 'pass', out)
    assert.equal(found.reason, reason, out)
  }
  assert.equal((await lock(() => { throw new Error('boom') })).reason, reason)
  assert.equal((await lock(() => undefined)).reason, reason)
  let asked = 0
  const counting = () => { asked++; return IMMEDIATE() }
  for (const phrase of ['volumen al 30', 'oculta Slack', 'abre ajustes de sonido', 'abre brand', 'mute']) await templates(phrase, undefined, counting)
  assert.equal(asked, 0)
  await templates('lock screen', undefined, counting)
  assert.equal(asked, 1)
})

test('gate: a phrase that names a kind (folder, file) is about a file or folder and still reaches the model', async () => {
  const folder = (name, path) => ({ ...index, folders: { ...index.folders, [name]: path }, files: [...index.files, `${path}/x.md`] })
  const asking = (idx, answer) => phrase => plan(phrase, { index: idx, config: { ...config, model: { url: 'http://x', name: 'm' } }, zoxide: () => undefined, ancestors: () => ['/sbin/launchd'], screenLockStatus: IMMEDIATE, askModel: async () => answer })
  const act = async (idx, phrase, target) => { const found = await asking(idx, { verb: 'open', target })(phrase); return found.status === 'action' ? `${found.action.verb} ${found.action.target.value}` : found.status }
  assert.equal(await act(folder('volume', '/code/volume'), 'me abres la carpeta volume', 'volume'), 'open /code/volume')
  assert.equal(await act(folder('lock', '/code/lock'), 'me abres el archivo lock', 'lock'), 'open /code/lock')
  assert.equal(await act(folder('volumen', '/code/volumen'), 'can you open the file volumen', 'volumen'), 'open /code/volumen')
  assert.equal(await act(folder('ajustes de red', '/code/ajustes-de-red'), 'me abres la carpeta de ajustes de red', 'ajustes de red'), 'open /code/ajustes-de-red')
  assert.equal(await act(folder('lock screen', '/code/lock-screen'), 'could you open the lock screen folder', 'lock screen'), 'open /code/lock-screen')
  // without a kind word the gate still holds
  assert.equal(await act(folder('volume', '/code/volume'), 'me abres volume', 'volume'), 'pass')
  // a verb that is itself a system action is never rescued by a kind word
  assert.equal(await act(folder('brand', '/code/brand'), 'necesito ocultar la carpeta brand', 'brand'), 'pass')
  assert.equal(await act(folder('brand', '/code/brand'), 'necesito silenciar el archivo brand', 'brand'), 'pass')
})

test('gate: words inside a hyphenated or dotted name are names, not system words', async () => {
  const idx = { ...index, files: [...index.files, '/code/brand/package-lock.json'] }
  const found = await plan('me abres package-lock.json', { index: idx, config: { ...config, model: { url: 'http://x', name: 'm' } }, zoxide: () => undefined, askModel: async () => ({ verb: 'open', target: 'package-lock.json' }) })
  assert.equal(found.status, 'action')
  assert.equal(found.action.target.value, '/code/brand/package-lock.json')
})
