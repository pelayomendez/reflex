import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parse } from '../src/phrase.mjs'
import { plan } from '../src/plan.mjs'
import { commandsFor, describe, run } from '../src/run.mjs'
import { toolsFor } from '../src/catalogue.mjs'

const index = {
  folders: { brand: '/code/brand', reflex: '/code/reflex', terminal: '/code/terminal', closet: '/code/closet', cerrajeria: '/code/cerrajeria', exit: '/code/exit' },
  apps: {
    figma: '/Applications/Figma.app', slack: '/Applications/Slack.app', spotify: '/Applications/Spotify.app', 'google chrome': '/Applications/Google Chrome.app',
    'terminal': '/System/Applications/Utilities/Terminal.app', warp: '/Applications/Warp.app', ghostty: '/Applications/Ghostty.app', 'visual studio code': '/Applications/Visual Studio Code.app',
  },
  shortcuts: ['Modo foco'],
  files: ['/code/reflex/docs/roadmap.md', '/code/brand/posts/watchmen.md', '/code/notes/closet.md'],
}
const config = { aliases: { slack2: 'https://example.com/' }, model: {} }
const templates = (phrase, ancestors = () => ['/sbin/launchd']) => plan(phrase, { index, config, zoxide: () => undefined, ancestors })
const got = async phrase => {
  const found = await templates(phrase)
  return found.status === 'action' ? `${found.action.verb} ${found.action.target.value}` : found.status
}

test('quit: an installed app named exactly is quit, in Spanish and English', async () => {
  for (const phrase of ['cierra Slack', 'cierra el Figma', 'sal de Spotify', 'quit Slack', 'close Figma', '¿me cierras Slack?', 'cierrame slack', 'cerrar Slack', 'por favor, cierra la app de Figma', 'can you close Slack', 'salir de Spotify', 'Cierra Slack, gracias', 'close google chrome'])
    assert.match(await got(phrase), /^quit \/Applications\//, phrase)
  assert.equal(await got('cierra el Figma'), 'quit /Applications/Figma.app')
  assert.equal(await got('sal de Spotify'), 'quit /Applications/Spotify.app')
  assert.equal(await got('close Google Chrome'), 'quit /Applications/Google Chrome.app')
})

test('quit: only apps. A folder, file, page, alias or unknown name goes to Claude', async () => {
  for (const phrase of ['cierra brand', 'cierra el roadmap', 'close the tab', 'cierra la carpeta brand', 'close the reflex folder', 'cierra slack2', 'cierra la pestaña', 'sal de casa', 'quit smoking', 'cierra la ventana de Slack', 'close Slack tabs', 'cierra', 'close', 'cierra la carpeta de slack', 'cierra la web de slack', 'close the terminal folder'])
    assert.equal(await got(phrase), 'pass', phrase)
})

test('quit: the app name has to match exactly, no prefix, substring or typo', async () => {
  for (const phrase of ['cierra Slac', 'cierra Slackk', 'close Figm', 'close chrome', 'cierra spotifi', 'quit google', 'cierra figmaa'])
    assert.equal(await got(phrase), 'pass', phrase)
})

test('quit: negations, reports, questions, talk and compound requests pass', async () => {
  for (const phrase of ['no cierres Slack', 'nunca cierres Figma', "don't close Slack", 'do not quit Slack', 'he cerrado Slack', 'ya cerré Slack', 'cerré Slack ayer', 'I closed Slack', 'closed Slack', '¿por qué se cierra Slack?', 'why does Slack close', 'how do I close Slack', 'por qué cierra Slack', 'Slack se cierra solo', 'explícame cómo cerrar Slack', 'cierra Slack y abre Figma', 'close Slack and open Figma', 'cierra Slack, abre Figma', 'quit Slack, then open Figma', 'cierra Slack y Figma', 'close Slack & Figma', 'cierra Slack todos los días', 'cierra slack ahora y arregla el bug', 'when I close Slack it crashes', 'cuando cierro Slack falla', 'closing Slack', 'cerrando Slack', 'quiero que cierres Slack', '\\cierra Slack'])
    assert.equal(await got(phrase), 'pass', phrase)
})

test('quit: the model path never produces a quit, and never opens an app for a close request', async () => {
  const withModel = answer => phrase => plan(phrase, { index, config: { ...config, model: { url: 'http://x', name: 'm' } }, zoxide: () => undefined, askModel: async () => answer })
  const quitting = withModel({ verb: 'quit', target: 'slack' })
  assert.equal((await quitting('necesito slack')).status, 'pass')
  assert.equal((await quitting('quiero ver slack')).status, 'pass')
  const opening = withModel({ verb: 'open', target: 'slack' })
  for (const phrase of ['necesito que cierres slack', 'I need you to close slack', 'puedes cerrar slack y pon figma', 'llévame a slack y ciérralo'])
    assert.equal((await opening(phrase)).status, 'pass', phrase)
  // the catalogue the model is trained on is untouched
  assert.deepEqual(toolsFor().map(t => t.function.name), ['open', 'reveal', 'copy', 'shortcut'])
})

test('quit: parse reads the verb and the target only', () => {
  assert.deepEqual(parse('sal de Spotify'), { verb: 'quit', target: 'spotify', kind: undefined, raw: 'sal de Spotify' })
  assert.equal(parse('¿me cierras Slack?').verb, 'quit')
  assert.equal(parse('no cierres Slack').reason, 'does not start with an action verb')
})

test('quit: the command asks the app to quit by name, as an argument, and never force-kills', async () => {
  const action = (await templates('cierra Slack')).action
  const [command] = commandsFor(action)
  assert.equal(commandsFor(action).length, 1)
  assert.equal(command[0], 'osascript')
  assert.equal(command.at(-1), '/Applications/Slack.app')
  const script = command.filter((part, at) => command[at - 1] === '-e').join('\n')
  assert.match(script, /\.quit\(\)/)
  assert.match(script, /not running/)
  assert.doesNotMatch(script, /Slack|kill|terminate|-9|doShellScript|do shell script/i)
  // the app travels as an argument even when its path holds quotes or spaces
  const odd = commandsFor({ verb: 'quit', target: { type: 'app', value: '/Applications/Bob "the" App.app', label: 'Bob "the" App' } })[0]
  assert.equal(odd.at(-1), '/Applications/Bob "the" App.app')
  assert.equal(odd.filter((part, at) => odd[at - 1] === '-e').join('\n').includes('Bob'), false)
  assert.equal(describe(action, 'future'), 'quit Slack')
})

test('quit: an app that is not running is reported and nothing is launched or quit', async () => {
  const { target } = (await templates('cierra Slack')).action
  const calls = []
  const exec = (file, args) => { calls.push([file, ...args]); return 'not running\n' }
  assert.equal(run({ verb: 'quit', target }, exec), 'Slack is not running, nothing to quit')
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'osascript')
  assert.equal(run({ verb: 'quit', target }, () => 'quit\n'), 'asked to quit Slack')
})

test('quit: never quits an app that hosts this session, found by walking up the parent chain', async () => {
  const hosted = ancestors => () => ancestors
  const chain = exe => ['/bin/zsh', '/usr/local/bin/node', exe]
  for (const [phrase, exe] of [
    ['cierra Terminal', '/System/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal'],
    ['quit Warp', '/Applications/Warp.app/Contents/MacOS/stable'],
    ['close Visual Studio Code', '/Applications/Visual Studio Code.app/Contents/MacOS/Electron'],
    ['sal de Ghostty', '/Applications/Ghostty.app/Contents/MacOS/ghostty'],
  ]) assert.equal((await templates(phrase, hosted(chain(exe)))).status, 'pass', phrase)
  // the same phrases quit when the session lives elsewhere, and a sibling app sharing a name prefix is not the host
  assert.equal((await templates('quit Warp', hosted(chain('/Applications/Ghostty.app/Contents/MacOS/ghostty')))).status, 'action')
  assert.equal((await templates('quit Warp', hosted(chain('/Applications/Warp.app.old/Contents/MacOS/stable')))).status, 'action')
  assert.equal((await templates('cierra Slack', hosted(chain('/System/Applications/Utilities/Terminal.app/Contents/MacOS/Terminal')))).status, 'action')
  // when the walk finds nothing (ps failed), the host cannot be ruled out: pass
  assert.equal((await templates('cierra Slack', hosted([]))).status, 'pass')
})

test('quit: a bare third-person question is not a request, a second-person one is', async () => {
  for (const phrase of ['¿cierra Slack?', '¿quit Slack?', 'close Slack?', '¿cierra el Figma?'])
    assert.equal(await got(phrase), 'pass', phrase)
  for (const phrase of ['¿me cierras Slack?', '¿puedes cerrar Slack?', 'can you close Slack?', 'could you quit Figma?'])
    assert.match(await got(phrase), /^quit \//, phrase)
})

test('plan: the close gate keeps the model for names that merely contain a closing word', async () => {
  const withModel = answer => phrase => plan(phrase, { index, config: { ...config, model: { url: 'http://x', name: 'm' } }, zoxide: () => undefined, askModel: async () => answer })
  const act = async (phrase, answer) => { const found = await withModel(answer)(phrase); return found.status === 'action' ? `${found.action.verb} ${found.action.target.value}` : found.status }
  assert.equal(await act('quiero ver closet', { verb: 'open', target: 'closet' }), 'open /code/closet')
  assert.equal(await act('llévame a cerrajeria', { verb: 'open', target: 'cerrajeria' }), 'open /code/cerrajeria')
  assert.equal(await act('ve a exit', { verb: 'open', target: 'exit' }), 'open /code/exit')
  assert.equal(await act('take me to the exit folder', { verb: 'open', target: 'exit' }), 'open /code/exit')
  assert.equal(await act('pásame closet', { verb: 'copy', target: 'closet' }), 'copy /code/closet')
  // still gated where the closing word is the verb, bare or after a request lead
  for (const phrase of ['necesito que cierres slack', 'quiero que cierres slack', 'i need you to close slack', 'puedes cerrar slack y pon figma', 'please close slack and open figma'])
    assert.equal(await act(phrase, { verb: 'open', target: 'slack' }), 'pass', phrase)
})
