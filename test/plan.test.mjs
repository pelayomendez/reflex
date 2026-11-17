import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parse } from '../src/phrase.mjs'
import { plan } from '../src/plan.mjs'
import { commandsFor } from '../src/run.mjs'

const index = {
  folders: { brand: '/code/brand', descargas: '/home/Downloads' },
  apps: { figma: '/Applications/Figma.app', 'google chrome': '/Applications/Google Chrome.app' },
  shortcuts: ['Modo foco', 'Modo noche'],
  files: ['/code/brand/posts/2026-11-06-watchmen.md', '/code/brand/cards/watchmen-post.png', '/code/brand/cards/cache-nudge-post.png', '/code/reflex/docs/design.md'],
}
const config = { aliases: { linkedin: 'https://www.linkedin.com/feed/' }, model: {} }
const deps = { index, config, zoxide: () => undefined }
const decide = phrase => plan(phrase, deps)

test('opens a known folder, app, alias or address', async () => {
  assert.equal((await decide('abre brand')).action.target.value, '/code/brand')
  assert.equal((await decide('Ábreme la carpeta de descargas, por favor')).action.target.value, '/home/Downloads')
  assert.deepEqual(commandsFor((await decide('abre Figma')).action), [['open', '-a', '/Applications/Figma.app']])
  assert.equal((await decide('abre linkedin')).action.target.value, 'https://www.linkedin.com/feed/')
  assert.equal((await decide('open github.com/PelayoMendez')).action.target.value, 'https://github.com/PelayoMendez')
})

test('finds files by the words of their path, and asks when several match', async () => {
  assert.equal((await decide('abre el design de reflex')).action.target.value, '/code/reflex/docs/design.md')
  const several = await decide('muéstrame el post de watchmen en el finder')
  assert.equal(several.status, 'choose')
  assert.equal(several.candidates.length, 2)
  assert.equal((await decide('copia la imagen de cache-nudge post')).action.target.value, '/code/brand/cards/cache-nudge-post.png')
})

test('runs Shortcuts only by a name that exists', async () => {
  assert.equal((await decide('ejecuta modo foco')).action.target.value, 'Modo foco')
  assert.equal((await decide('ejecuta los tests')).status, 'pass')
})

test('never takes a request that is not wholly an action', async () => {
  for (const phrase of ['abre el fichero README y arregla el bug', 'explícame este código', 'abre brand, luego revisa el README', '\\abre brand', 'abre la puerta del garaje', 'ábreme la web de watchmen'])
    assert.equal((await decide(phrase)).status, 'pass', phrase)
})

test('copies quoted text as text', async () => {
  const { action } = await decide('copia "hola mundo"')
  assert.deepEqual(commandsFor(action), [['pbcopy', { stdin: 'hola mundo' }]])
})

test('asks the model about phrases the templates leave, and still grounds its answer', async () => {
  const asked = []
  const model = async phrase => { asked.push(phrase); return { verb: 'open', target: 'brand' } }
  const withModel = { ...deps, config: { ...config, model: { url: 'http://x', name: 'm' } }, askModel: model }
  assert.equal((await plan('¿me abres brand?', withModel)).step, 'model')
  assert.equal((await plan('ponme una hora', withModel)).status, 'pass')
  assert.equal((await plan('no abras brand todavía', withModel)).status, 'pass')
  assert.deepEqual(asked, ['¿me abres brand?', 'ponme una hora'])
  const invented = { ...withModel, askModel: async () => ({ verb: 'open', target: 'nowhere' }) }
  assert.equal((await plan('¿me abres nowhere?', invented)).status, 'pass')
})

test('parse keeps the kind word out of the name', () => {
  assert.deepEqual(parse('abre la app de Figma'), { verb: 'open', target: 'figma', kind: 'app', raw: 'abre la app de Figma' })
})
