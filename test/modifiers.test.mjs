import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toolsFor } from '../src/catalogue.mjs'
import { classify } from '../src/eval.mjs'
import { resolveApp } from '../src/modifiers.mjs'
import { plan } from '../src/plan.mjs'
import { commandsFor, describe, run } from '../src/run.mjs'

const index = {
  folders: { brand: '/code/brand', reflex: '/code/reflex', descargas: '/Users/me/Downloads' },
  apps: {
    cursor: '/Applications/Cursor.app', 'visual studio code': '/Applications/Visual Studio Code.app', textedit: '/System/Applications/TextEdit.app',
    ghostty: '/Applications/Ghostty.app', terminal: '/System/Applications/Utilities/Terminal.app', figma: '/Applications/Figma.app', slack: '/Applications/Slack.app',
  },
  shortcuts: ['Modo foco'],
  files: [
    '/code/reflex/docs/roadmap.md', '/code/reflex/docs/design.md', '/code/reflex/README.md', '/code/reflex/src/phrase.mjs', '/code/brand/README.md',
    '/code/brand/posts/2026-11-06-watchmen.md', '/code/brand/cards/watchmen-post.png', '/code/brand/posts/2026-11-07-watchmen-notes.md', '/Users/me/Documents/Harbor Line 3.pdf',
    '/code/reflex/docs/spec.pdf', '/code/reflex/logo.png', '/code/reflex/informe.docx', '/code/reflex/Makefile', '/code/reflex/.zshrc', '/code/reflex/Dockerfile', '/code/reflex/src/app.tsx', '/code/reflex/config.toml',
  ],
}
const base = { aliases: { linkedin: 'https://www.linkedin.com/feed/' }, model: {} }
const asked = []
const deps = (config = {}, env = {}, model) => ({ index, config: { ...base, ...config }, env, zoxide: () => undefined, askModel: async phrase => { asked.push(phrase); return model } })
const decide = (phrase, config, env) => plan(phrase, deps(config, env))
const got = async (phrase, config, env) => {
  const found = await decide(phrase, config, env)
  if (found.status !== 'action') return found.status
  const { verb, target, with: w } = found.action
  return `${verb} ${target.value} in ${w.app} line ${w.line ?? '-'}`
}
const CURSOR = { editor: { app: 'Cursor' } }
const roadmap = '/code/reflex/docs/roadmap.md'

test('editor: files open in the editor named in the phrase, in Spanish and English', async () => {
  assert.equal(await got('open design.md in Cursor'), 'edit /code/reflex/docs/design.md in /Applications/Cursor.app line -')
  assert.equal(await got('open design.md in VS Code'), 'edit /code/reflex/docs/design.md in /Applications/Visual Studio Code.app line -')
  assert.equal(await got('abre el roadmap de reflex en Cursor'), `edit ${roadmap} in /Applications/Cursor.app line -`)
  assert.equal(await got('abre roadmap.md con vscode'), `edit ${roadmap} in /Applications/Visual Studio Code.app line -`)
  assert.equal(await got('abre phrase.mjs usando Visual Studio Code'), 'edit /code/reflex/src/phrase.mjs in /Applications/Visual Studio Code.app line -')
})

test('editor: "the editor", "edita", "para editar" and "to edit" use the configured editor', async () => {
  const phrases = ['abre el roadmap de reflex en el editor', 'open the roadmap in reflex in the editor', 'abre roadmap.md para editar', 'open roadmap.md to edit',
    'open roadmap.md in my editor', 'por favor, abre el roadmap de reflex en el editor, gracias', 'oye abre roadmap.md para editar', '¿puedes abrir roadmap.md para editar?', 'Abre el roadmap de reflex en el editor.']
  for (const phrase of phrases) assert.equal(await got(phrase, CURSOR), `edit ${roadmap} in /Applications/Cursor.app line -`, phrase)
  assert.equal(await got('abre el README de brand en el editor', CURSOR), 'edit /code/brand/README.md in /Applications/Cursor.app line -')
})

test('editor: a line, as "en la línea N", "at line N" or ":N", only where the editor can go to it', async () => {
  for (const phrase of ['abre roadmap.md en la línea 40 en Cursor', 'open roadmap.md in Cursor at line 40', 'open roadmap.md:40 in Cursor', 'abre roadmap.md:40 en el editor', 'abre roadmap.md en el editor en la linea 40', 'abre roadmap.md en Cursor linea 40', 'open roadmap.md in the editor on line 40', 'abre roadmap.md en la línea 40'])
    assert.equal(await got(phrase, CURSOR), `edit ${roadmap} in /Applications/Cursor.app line 40`, phrase)
  const action = (await decide('open roadmap.md:40 in Cursor')).action
  assert.deepEqual(commandsFor(action), [['open', 'cursor://file/code/reflex/docs/roadmap.md:40']])
  const code = (await decide('abre roadmap.md en la línea 7 en VS Code')).action
  assert.deepEqual(commandsFor(code), [['open', 'vscode://file/code/reflex/docs/roadmap.md:7']])
  // an editor with no way to a line, or the system default, cannot honour it: Claude gets the phrase
  assert.equal(await got('open roadmap.md in TextEdit at line 4'), 'pass')
  assert.equal(await got('open roadmap.md in the editor at line 4'), 'pass')
  assert.equal(await got('open roadmap.md at line 4 in the terminal'), 'pass')
  // a colon number is a line only next to a stated editor: an address with a port is still an address
  assert.equal((await decide('open roadmap.md:40')).action.target.type, 'url')
  assert.equal((await decide('open github.com:8080')).action.target.type, 'url')
})

test('editor: config app, config command, $VISUAL / $EDITOR when GUI-capable, else the system default text app', async () => {
  const cmd = async (phrase, config, env) => (await decide(phrase, config, env)).action.with
  assert.equal((await cmd('abre roadmap.md en el editor', { editor: { app: 'Visual Studio Code' } })).app, '/Applications/Visual Studio Code.app')
  assert.equal((await cmd('abre roadmap.md en el editor', { editor: { command: 'cursor' } })).app, '/Applications/Cursor.app')
  assert.equal((await cmd('abre roadmap.md en el editor', {}, { VISUAL: 'code -w' })).app, '/Applications/Visual Studio Code.app')
  assert.equal((await cmd('abre roadmap.md en el editor', {}, { VISUAL: 'vim', EDITOR: '/usr/local/bin/cursor' })).app, '/Applications/Cursor.app')
  // the phrase beats the config, the config beats the environment
  assert.equal((await cmd('abre roadmap.md en Cursor', { editor: { app: 'Visual Studio Code' } })).app, '/Applications/Cursor.app')
  assert.equal((await cmd('abre roadmap.md en el editor', CURSOR, { VISUAL: 'code' })).app, '/Applications/Cursor.app')
  // a terminal editor, an unknown one or a GUI one that is not installed: the system default
  for (const env of [{ EDITOR: 'vim' }, { EDITOR: 'nano -w' }, { VISUAL: 'zed' }, {}]) {
    const found = await decide('abre roadmap.md en el editor', {}, env)
    assert.equal(found.action.with.app, null)
    assert.deepEqual(commandsFor(found.action), [['open', '-t', roadmap]])
  }
  // a config the person wrote that cannot be honoured is not silently replaced
  assert.equal(await got('abre roadmap.md en el editor', { editor: { app: 'Zed' } }), 'pass')
  assert.equal(await got('abre roadmap.md en el editor', { editor: { command: 'vim' } }), 'pass')
  assert.deepEqual(commandsFor((await decide('abre roadmap.md en el editor', CURSOR)).action), [['open', '-a', '/Applications/Cursor.app', roadmap]])
})

test('editor: a folder opens in a GUI editor, never in the system default text app', async () => {
  assert.equal(await got('abre brand en el editor', CURSOR), 'edit /code/brand in /Applications/Cursor.app line -')
  assert.equal(await got('abre la carpeta de reflex en el editor', CURSOR), 'edit /code/reflex in /Applications/Cursor.app line -')
  assert.equal(await got('open reflex in VS Code'), 'edit /code/reflex in /Applications/Visual Studio Code.app line -')
  assert.equal(await got('abre brand en el editor'), 'pass')
})

test('editor: several files that fit ask which one, and the choice keeps the editor', async () => {
  const found = await decide('abre el post de watchmen en el editor', CURSOR)
  assert.equal(found.status, 'choose')
  assert.equal(found.verb, 'edit')
  assert.equal(found.candidates.length, 2)
  assert.equal(found.with.app, '/Applications/Cursor.app')
})

test('terminal: a new window in a folder, from the config or Terminal by default', async () => {
  const phrases = ['abre una terminal en brand', 'open a terminal in brand', 'terminal en brand', 'abre brand en la terminal', 'open brand in terminal', 'abre la carpeta brand en una terminal', 'open a new terminal in brand', 'oye, terminal en brand', 'abre una nueva terminal en brand', 'terminal in brand']
  for (const phrase of phrases) assert.equal(await got(phrase), 'terminal /code/brand in /System/Applications/Utilities/Terminal.app line -', phrase)
  const ghostty = { terminal: { app: 'Ghostty' } }
  assert.equal(await got('open a terminal in reflex', ghostty), 'terminal /code/reflex in /Applications/Ghostty.app line -')
  assert.equal(await got('terminal en descargas', ghostty), 'terminal /Users/me/Downloads in /Applications/Ghostty.app line -')
  assert.equal(await got('abre brand en Ghostty'), 'terminal /code/brand in /Applications/Ghostty.app line -')
  assert.deepEqual(commandsFor((await decide('terminal en brand', ghostty)).action), [['open', '-a', '/Applications/Ghostty.app', '/code/brand']])
  // a terminal that is not installed, named or configured: Claude gets the phrase
  assert.equal(await got('open brand in iTerm'), 'pass')
  assert.equal(await got('abre una terminal en brand', { terminal: { app: 'Kitty' } }), 'pass')
  assert.equal(await got('abre una terminal en brand', {}, {}), 'terminal /code/brand in /System/Applications/Utilities/Terminal.app line -')
})

test('a modifier on a target that does not fit passes: terminal on a file, editor on an app, an address or another verb', async () => {
  for (const phrase of ['abre una terminal en roadmap.md', 'open roadmap.md in the terminal', 'abre el roadmap de reflex en la terminal',
    'abre Figma en el editor', 'abre figma en el editor', 'open Slack in Cursor', 'abre Figma en la terminal', 'abre linkedin en el editor', 'open github.com in Cursor', 'abre github.com/pelayomendez en el editor',
    'copia roadmap.md en Cursor', 'muestra brand en la terminal', 'cierra Slack en el editor', 'ejecuta modo foco en la terminal', 'abre modo foco en el editor'])
    assert.equal(await got(phrase, CURSOR), 'pass', phrase)
})

test('a modifier names an installed app or the phrase goes to Claude', async () => {
  for (const phrase of ['open design.md in Zed', 'abre roadmap.md en Sublime Text', 'abre brand en kitty', 'abre brand con Slack', 'open design.md in Figma'])
    assert.equal(await got(phrase), 'pass', phrase)
})

test('the gates still apply: negations, reports, questions, talk, compounds and the backslash', async () => {
  const phrases = ['no abras una terminal en brand', "don't open design.md in Cursor", 'no edites el README de brand', 'nunca abras roadmap.md en el editor', 'do not open a terminal in brand',
    'abrí brand en Cursor', 'ya abrí una terminal en brand', 'I opened design.md in Cursor', 'ayer edité el roadmap de reflex', 'cuando abro design.md en Cursor falla',
    'why does design.md open in Cursor', 'what is design.md in Cursor', 'explícame brand en la terminal', '¿por qué terminal en brand?', 'cómo edito roadmap.md en el editor',
    'abre una terminal en brand y ejecuta npm test', 'open a terminal in brand and run the tests', 'abre una terminal y ejecuta npm test', 'edita el roadmap de reflex y arregla el bug',
    'abre brand en Cursor y abre reflex en la terminal', 'abre roadmap.md, luego edítalo', 'abre brand en Cursor y en la terminal', 'abre brand en Cursor en la terminal', 'abre roadmap.md en el editor en la terminal',
    'abre brand en Cursor en Ghostty', 'abre brand en Cursor en VS Code', '\\edita el roadmap de reflex', '\\abre una terminal en brand', 'terminal en brand no funciona', 'edita roadmap.md no funciona', 'abre roadmap.md en el editor no funciona',
    'edit', 'terminal en', 'edita el README', 'edit design.md', 'edita roadmap.md', 'puedes editar roadmap.md', 'edita el roadmap de reflex en Cursor', 'edit design.md in Cursor', '¿puedes editar roadmap.md?', 'abre roadmap.md en la línea 0', 'open roadmap.md in Cursor at line 9999999', 'abre roadmap.md en Cursor en la línea 0', 'abre una terminal en', 'abre en Cursor', 'edita en el editor']
  for (const phrase of phrases) assert.equal(await got(phrase, CURSOR), 'pass', phrase)
})

test('the model sees the phrase without its modifier and never the rewritten forms', async () => {
  asked.length = 0
  const withModel = (answer, config = CURSOR) => ({ ...deps(config, {}, answer), config: { ...base, ...config, model: { url: 'http://x', name: 'm' } } })
  const opened = await plan('¿me abres el roadmap de reflex en el editor?', withModel({ verb: 'open', target: 'roadmap de reflex' }))
  assert.equal(opened.step, 'model')
  assert.deepEqual([opened.action.verb, opened.action.target.value, opened.action.with.app], ['edit', roadmap, '/Applications/Cursor.app'])
  assert.deepEqual(asked, ['¿me abres el roadmap de reflex?'])
  const terminal = await plan('¿me abres una terminal en brand?', withModel({ verb: 'open', target: 'brand' }))
  assert.deepEqual([terminal.action.verb, terminal.action.target.value], ['terminal', '/code/brand'])
  assert.deepEqual(asked.at(-1), '¿me abres brand?')
  // an app the model names does not fit an editor or a terminal
  assert.equal((await plan('¿me abres slack en el editor?', withModel({ verb: 'open', target: 'slack' }))).status, 'pass')
  assert.equal((await plan('¿me abres roadmap.md en la terminal?', withModel({ verb: 'open', target: 'roadmap.md' }))).status, 'pass')
  // a model verb other than open takes no modifier
  assert.equal((await plan('¿me muestras el roadmap de reflex en la terminal?', withModel({ verb: 'reveal', target: 'roadmap de reflex' }))).status, 'pass')
  // the form the templates rewrite ("terminal en …") never reaches the model
  asked.length = 0
  for (const phrase of ['terminal en brand ya'])
    await plan(phrase, withModel({ verb: 'open', target: 'brand' }))
  assert.deepEqual(asked, [])
  // the model's catalogue is untouched
  assert.deepEqual(toolsFor().map(t => t.function.name), ['open', 'reveal', 'copy', 'shortcut'])
})

test('without a modifier nothing changes: a dotted name is still an address, an app still an app', async () => {
  assert.equal((await decide('open design.md')).action.target.type, 'url')
  assert.equal((await decide('abre Figma')).action.verb, 'open')
  assert.equal((await decide('abre brand')).action.with, undefined)
  assert.equal((await decide('abre la terminal')).action.target.type, 'app')
})

test('the command and the words for each', async () => {
  const edit = (await decide('abre roadmap.md en el editor', CURSOR)).action
  assert.equal(describe(edit, 'future'), 'edit roadmap.md in Cursor')
  assert.equal(describe(edit), 'opened roadmap.md in Cursor')
  assert.equal(describe((await decide('open roadmap.md:40 in Cursor')).action, 'future'), 'edit roadmap.md:40 in Cursor')
  const term = (await decide('terminal en brand', { terminal: { app: 'Ghostty' } })).action
  assert.equal(describe(term, 'future'), 'terminal in brand (Ghostty)')
  assert.equal(describe(term), 'opened a terminal in brand (Ghostty)')
  assert.equal(describe((await decide('abre roadmap.md en el editor')).action, 'future'), 'edit roadmap.md in the default text editor')
  // a path with spaces and symbols stays one argument, and a line link is percent-encoded
  const odd = { verb: 'edit', target: { type: 'file', value: '/a b/c#d?.md', label: 'c#d?.md' }, with: { role: 'editor', app: '/Applications/Cursor.app', label: 'Cursor', line: 3, scheme: 'cursor' } }
  assert.deepEqual(commandsFor(odd), [['open', 'cursor://file/a%20b/c%23d%3F.md:3']])
  const calls = []
  assert.equal(run(term, (file, args) => calls.push([file, ...args])), 'opened a terminal in brand (Ghostty)')
  assert.deepEqual(calls, [['open', '-a', '/Applications/Ghostty.app', '/code/brand']])
})

test('eval: an expectation may pin the app and the line, and a different one is wrong', async () => {
  const found = await decide('open roadmap.md:40 in Cursor')
  const expect = (extra = {}) => ({ status: 'action', verb: 'edit', value: roadmap, ...extra })
  assert.equal(classify(expect(), found), 'right')
  assert.equal(classify(expect({ app: '/Applications/Cursor.app', line: 40 }), found), 'right')
  assert.equal(classify(expect({ app: '/Applications/Visual Studio Code.app' }), found), 'wrong')
  assert.equal(classify(expect({ line: 41 }), found), 'wrong')
  assert.equal(classify({ ...expect(), verb: 'open' }, found), 'wrong')
})

test('editor: only text-like files, and folders when the editor is an app', async () => {
  for (const phrase of ['abre spec.pdf en el editor', 'open logo.png in Cursor', 'abre informe.docx en Cursor'])
    assert.equal(await got(phrase, CURSOR), 'pass', phrase)
  for (const [phrase, file] of [['abre Makefile en el editor', '/code/reflex/Makefile'], ['abre .zshrc en el editor', '/code/reflex/.zshrc'], ['open Dockerfile in Cursor', '/code/reflex/Dockerfile'], ['abre app.tsx en el editor', '/code/reflex/src/app.tsx'], ['abre config.toml en el editor', '/code/reflex/config.toml']])
    assert.equal(await got(phrase, CURSOR), `edit ${file} in /Applications/Cursor.app line -`, phrase)
  // without a modifier the same files open as ever
  assert.equal((await decide('abre spec.pdf')).action.verb, 'open')
})

test('editor: a bare "line 3" is part of a name, not a line number', async () => {
  for (const phrase of ['abre harbor line 3', 'open harbor line 3']) {
    const found = await decide(phrase, CURSOR)
    assert.deepEqual([found.action?.verb, found.action?.target.value], ['open', '/Users/me/Documents/Harbor Line 3.pdf'], phrase)
  }
  assert.equal((await decide('abre harbor linea 3', CURSOR)).status, 'pass') // as at base: no such file
  assert.equal((await decide('abre harbor line 3 en Cursor', CURSOR)).status, 'pass')
  assert.equal(await got('abre roadmap.md en Cursor line 40', CURSOR), `edit ${roadmap} in /Applications/Cursor.app line 40`)
})

test('terminal: only Terminal, iTerm and Ghostty, which open in the folder given with open -a', async () => {
  const withIterm = { ...index, apps: { ...index.apps, iterm: '/Applications/iTerm.app', warp: '/Applications/Warp.app', kitty: '/Applications/kitty.app' } }
  const on = (phrase, config = {}) => plan(phrase, { index: withIterm, config: { ...base, ...config }, env: {}, zoxide: () => undefined })
  assert.equal((await on('open brand in iTerm')).action.with.app, '/Applications/iTerm.app')
  assert.equal((await on('abre una terminal en brand', { terminal: { app: 'iTerm' } })).action.with.app, '/Applications/iTerm.app')
  for (const phrase of ['abre brand en Warp', 'open brand in kitty']) assert.equal((await on(phrase)).status, 'pass', phrase)
  assert.equal((await on('abre una terminal en brand', { terminal: { app: 'Warp' } })).status, 'pass')
  for (const phrase of ['abre una terminal en brand', 'abre brand en el terminal', 'terminal en brand', 'open brand in the terminal'])
    assert.equal((await on(phrase)).action.verb, 'terminal', phrase)
})

test('resolveApp: the phrase, the config, $VISUAL and $EDITOR, then the system default', () => {
  const at = (mod, config, env) => resolveApp(mod, { index, config, env })
  const editor = { role: 'editor' }
  assert.equal(at(editor, {}, { VISUAL: 'cursor', EDITOR: 'vim' }).app, '/Applications/Cursor.app')
  assert.equal(at(editor, {}, { VISUAL: 'cursor', EDITOR: 'vim' }).via, 'environment')
  assert.equal(at(editor, {}, { VISUAL: 'vim', EDITOR: 'code' }).app, '/Applications/Visual Studio Code.app')
  assert.equal(at(editor, { editor: { app: 'Visual Studio Code' } }, { VISUAL: 'cursor' }).app, '/Applications/Visual Studio Code.app')
  assert.equal(at({ ...editor, app: 'cursor' }, { editor: { app: 'Visual Studio Code' } }, {}).app, '/Applications/Cursor.app')
  assert.deepEqual(at(editor, {}, { EDITOR: 'vim' }), { app: null, label: 'the default text editor', via: 'system default' })
  assert.match(at(editor, { editor: { app: 'Zed' } }, {}).reason, /not an installed app/)
  assert.match(at({ ...editor, line: 3 }, {}, { EDITOR: 'vim' }).reason, /cannot be opened at a line/)
  assert.equal(at({ ...editor, line: 3 }, {}, { VISUAL: 'cursor' }).scheme, 'cursor')
  const terminal = { role: 'terminal' }
  assert.equal(at(terminal, {}, {}).app, '/System/Applications/Utilities/Terminal.app')
  assert.equal(at(terminal, { terminal: { app: 'Ghostty' } }, {}).app, '/Applications/Ghostty.app')
  assert.match(at(terminal, { terminal: { app: 'Slack' } }, {}).reason, /does not open a terminal/)
})

test('eval: an environment editor is what an unconfigured editor phrase pins', async () => {
  const found = await plan('abre roadmap.md en el editor', deps({}, { VISUAL: 'cursor' }))
  assert.equal(classify({ status: 'action', verb: 'edit', value: roadmap, app: '/Applications/Cursor.app' }, found), 'right')
  assert.equal(classify({ status: 'action', verb: 'edit', value: roadmap, app: null }, found), 'wrong')
  const bare = await plan('abre roadmap.md en el editor', deps({}, {}))
  assert.equal(classify({ status: 'action', verb: 'edit', value: roadmap, app: null }, bare), 'right')
})
