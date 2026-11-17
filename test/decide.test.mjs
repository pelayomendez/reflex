import assert from 'node:assert/strict'
import { test } from 'node:test'
import { plan } from '../src/plan.mjs'

const index = {
  folders: { brand: '/code/brand', reflex: '/code/reflex', orbitdesk: '/code/orbitdesk', descargas: '/Users/me/Downloads' },
  apps: { figma: '/Applications/Figma.app', slack: '/Applications/Slack.app', spotify: '/Applications/Spotify.app' },
  shortcuts: ['Modo foco', 'Modo noche'],
  files: ['/Users/me/Notes/tide-file-reader.md', '/code/reflex/docs/design.md'],
}
const config = { aliases: { correo: 'https://mail.google.com/' }, model: { url: 'http://x', name: 'm' } }
const ask = answer => ({ index, config, zoxide: () => undefined, askModel: async () => answer })
const got = async (phrase, answer) => {
  const found = await plan(phrase, ask(answer))
  return found.status === 'action' ? `${found.action.verb} ${found.action.target.value}` : found.status
}

test('plan: a request form in the phrase sets the verb, whatever verb the model chose', async () => {
  assert.equal(await got('ve a brand', { verb: 'reveal', target: 'brand' }), 'open /code/brand')
  assert.equal(await got('ve a orbitdesk porfa', { verb: 'reveal', target: 'orbitdesk' }), 'open /code/orbitdesk')
  assert.equal(await got('take me to brand', { verb: 'copy', target: 'brand' }), 'open /code/brand')
  assert.equal(await got('i want to see my correo', { verb: 'shortcut', target: 'correo' }), 'open https://mail.google.com/')
  assert.equal(await got('dónde está brand', { verb: 'open', target: 'brand' }), 'reveal /code/brand')
  assert.equal(await got('pásame el tide file reader', { verb: 'open', target: 'tide file reader' }), 'copy /Users/me/Notes/tide-file-reader.md')
  assert.equal(await got('please ve a brand', { verb: 'reveal', target: 'brand' }), 'open /code/brand')
  assert.equal(await got('ejecuta el atajo modo foco', { verb: 'open', target: 'modo foco' }), 'shortcut Modo foco')
})

test('plan: the place beats the form, and the model verb stands when the phrase states none', async () => {
  assert.equal(await got('llévame a brand en el finder', { verb: 'open', target: 'brand' }), 'reveal /code/brand')
  assert.equal(await got('put brand', { verb: 'reveal', target: 'brand' }), 'reveal /code/brand')
  assert.equal(await got('put brand', { verb: 'open', target: 'brand' }), 'open /code/brand')
})

test('plan: a Shortcut the phrase activates still runs, and a form does not turn it into an open', async () => {
  assert.equal(await got('lanza modo foco', { verb: 'open', target: 'modo foco' }), 'shortcut Modo foco')
  assert.equal(await got('activa el modo noche', { verb: 'shortcut', target: 'modo noche' }), 'shortcut Modo noche')
})

test('plan: remarks that hold a request word never act, whatever the target kind', async () => {
  const folder = { verb: 'open', target: 'reflex' }
  assert.equal(await got('lanza los tests de reflex', folder), 'pass')
  assert.equal(await got('inicia el deploy de orbitdesk a producción', { verb: 'open', target: 'orbitdesk' }), 'pass')
  assert.equal(await got('ponme al día con orbitdesk', { verb: 'open', target: 'orbitdesk' }), 'pass')
  assert.equal(await got('necesito brand para mañana', { verb: 'open', target: 'brand' }), 'pass')
  assert.equal(await got('necesito ayuda con slack', { verb: 'open', target: 'slack' }), 'pass')
  assert.equal(await got('i need spotify to stop crashing', { verb: 'open', target: 'spotify' }), 'pass')
  assert.equal(await got('necesito ayuda con el modo foco', { verb: 'open', target: 'modo foco' }), 'pass')
  assert.equal(await got('lanza los tests de modo foco', { verb: 'shortcut', target: 'modo foco' }), 'pass')
  assert.equal(await got('i need help with my correo', { verb: 'open', target: 'correo' }), 'pass')
})

test('plan: requests the allow-list knows still act on folders, apps, Shortcuts and aliases', async () => {
  assert.equal(await got('necesito brand', { verb: 'open', target: 'brand' }), 'open /code/brand')
  assert.equal(await got('i need figma', { verb: 'open', target: 'figma' }), 'open /Applications/Figma.app')
  assert.equal(await got('ve a la carpeta descargas', { verb: 'open', target: 'descargas' }), 'open /Users/me/Downloads')
  assert.equal(await got('llévame a la app figma', { verb: 'open', target: 'figma' }), 'open /Applications/Figma.app')
  assert.equal(await got('lanza el atajo modo foco', { verb: 'shortcut', target: 'modo foco' }), 'shortcut Modo foco')
  assert.equal(await got('take me to my correo please', { verb: 'open', target: 'correo' }), 'open https://mail.google.com/')
})

test('plan: a closing place still names the verb when a polite word follows it', async () => {
  assert.equal(await got('put brand in finder please', { verb: 'open', target: 'brand' }), 'reveal /code/brand')
  assert.equal(await got('pon brand en el finder porfa', { verb: 'open', target: 'brand' }), 'reveal /code/brand')
})

test('plan: a verb the phrase states after the form wins over the form', async () => {
  const file = target => ({ verb: 'open', target })
  for (const [phrase, verb] of [
    ['necesito copiar tide file reader', 'copy'], ['quiero copiar tide file reader', 'copy'], ['i want to copy tide file reader', 'copy'],
    ['necesito que copies tide file reader', 'copy'], ['necesito revelar tide file reader', 'reveal'], ['i need to reveal tide file reader', 'reveal'],
    ['necesito mostrar tide file reader', 'reveal'], ['i want to show tide file reader', 'reveal'], ['quiero ensenar tide file reader', 'reveal'],
  ]) assert.equal(await got(phrase, file('tide file reader')), `${verb} /Users/me/Notes/tide-file-reader.md`, phrase)
  assert.equal(await got('necesito ejecutar modo foco', { verb: 'open', target: 'modo foco' }), 'shortcut Modo foco')
  assert.equal(await got('i need to run modo foco', { verb: 'open', target: 'modo foco' }), 'shortcut Modo foco')
  // a verb reflex does not do is for Claude, whatever the form says
  for (const phrase of ['necesito buscar brand', 'quiero encontrar brand', 'i need to find brand', 'i want to bring brand']) assert.equal(await got(phrase, { verb: 'open', target: 'brand' }), 'pass', phrase)
  // no verb stated after the lead: the form decides
  assert.equal(await got('necesito brand', { verb: 'copy', target: 'brand' }), 'open /code/brand')
})

test('plan: the Shortcut kind word runs a Shortcut only under an open or shortcut form', async () => {
  const shortcut = { verb: 'shortcut', target: 'modo foco' }
  assert.equal(await got('dónde está el atajo modo foco', shortcut), 'pass')
  assert.equal(await got('pásame el atajo modo foco', shortcut), 'pass')
  assert.equal(await got('take me to the shortcut modo foco', shortcut), 'shortcut Modo foco')
  assert.equal(await got('necesito el atajo modo foco', shortcut), 'shortcut Modo foco')
  // the model has to say shortcut too
  assert.equal(await got('take me to the shortcut modo foco', { verb: 'open', target: 'modo foco' }), 'pass')
})

test('plan: "turn on" is a request, other "on" phrases are not', async () => {
  assert.equal(await got('turn on modo foco', { verb: 'open', target: 'modo foco' }), 'shortcut Modo foco')
  assert.equal(await got('go on slack', { verb: 'open', target: 'slack' }), 'pass')
  assert.equal(await got('get on slack', { verb: 'open', target: 'slack' }), 'pass')
})

test('plan: kind words before and after a target are accepted for every kind', async () => {
  for (const kind of ['web', 'pagina', 'page', 'site', 'sitio', 'url', 'enlace', 'link']) assert.equal(await got(`take me to the ${kind} correo`, { verb: 'open', target: 'correo' }), 'open https://mail.google.com/', kind)
  for (const kind of ['carpeta', 'folder', 'directorio', 'directory', 'repo', 'repositorio']) assert.equal(await got(`take me to brand ${kind}`, { verb: 'open', target: 'brand' }), 'open /code/brand', kind)
  for (const kind of ['app', 'aplicacion', 'application', 'programa']) assert.equal(await got(`take me to figma ${kind}`, { verb: 'open', target: 'figma' }), 'open /Applications/Figma.app', kind)
  assert.equal(await got('take me to brand banana', { verb: 'open', target: 'brand' }), 'pass')
})

test('plan: stacked fillers before a form do not hide it, and "me llevas a" is a form', async () => {
  assert.equal(await got('oye porfa llévame a brand', { verb: 'reveal', target: 'brand' }), 'open /code/brand')
  assert.equal(await got('hey please can you take me to brand', { verb: 'reveal', target: 'brand' }), 'open /code/brand')
  assert.equal(await got('¿me llevas a descargas?', { verb: 'reveal', target: 'descargas' }), 'open /Users/me/Downloads')
})

test('plan: a stated verb and a place that disagree ask for two things, so the phrase passes', async () => {
  assert.equal(await got('necesito copiar brand en el finder', { verb: 'copy', target: 'brand' }), 'pass')
  assert.equal(await got('necesito revelar brand en el finder', { verb: 'open', target: 'brand' }), 'reveal /code/brand')
})
