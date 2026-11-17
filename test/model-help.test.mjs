import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { ground } from '../src/ground.mjs'
import { copiedFrom, placeVerb } from '../src/phrase.mjs'
import { REQUEST_FORMS, plan } from '../src/plan.mjs'

const index = {
  folders: { brand: '/code/brand', reflex: '/code/reflex', desktop: '/Users/me/Desktop', escritorio: '/Users/me/Desktop', documentos: '/Users/me/Documents', downloads: '/Users/me/Downloads', descargas: '/Users/me/Downloads' },
  apps: { figma: '/Applications/Figma.app', slack: '/Applications/Slack.app', 'visual studio code': '/Applications/Visual Studio Code.app', 'google chrome': '/Applications/Google Chrome.app', 'google drive': '/Applications/Google Drive.app' },
  shortcuts: ['Modo foco', 'Modo noche', 'Reunión de equipo'],
  files: ['/Users/me/Notes/tide-file-reader.md', '/code/brand/cards/watchmen-post.png', '/code/reflex/docs/design.md', '/Users/me/Desktop/captura-2026-11-05.png'],
}
const config = { aliases: {}, model: { url: 'http://x', name: 'm' } }
const env = { index, config, zoxide: () => undefined }

function stub(answer) {
  const asked = []
  return { asked, deps: { ...env, askModel: async phrase => { asked.push(phrase); return typeof answer === 'function' ? answer(phrase) : answer } } }
}

test('plan: accepts a model target only when every word of it is in the phrase', async () => {
  const ok = stub({ verb: 'open', target: 'brand' })
  assert.equal((await plan('llévame a brand', ok.deps)).step, 'model')
  const copied = stub({ verb: 'open', target: 'visual studio code' })
  assert.equal((await plan('pon visual studio code', copied.deps)).status, 'action')
  // completes a name the phrase only half says
  const completed = stub({ verb: 'open', target: 'visual studio code' })
  assert.equal((await plan('lanza visual studio', completed.deps)).status, 'pass')
  // translates
  const translated = stub({ verb: 'open', target: 'descargas' })
  assert.equal((await plan('take me to downloads', translated.deps)).status, 'pass')
})

test('plan: an address or path from the model has to appear verbatim in the phrase', async () => {
  const invented = stub({ verb: 'open', target: 'https://planar.do' })
  assert.equal((await plan('what does plan() do', invented.deps)).status, 'pass')
  const verbatim = stub({ verb: 'open', target: 'https://github.com/PelayoMendez' })
  const got = await plan('take me to https://github.com/PelayoMendez', verbatim.deps)
  assert.equal(got.status, 'action')
  assert.equal(got.action.target.value, 'https://github.com/PelayoMendez')
  const path = stub({ verb: 'open', target: '/code/brand' })
  assert.equal((await plan('bring up the thing', path.deps)).status, 'pass')
})

test('plan: asks the model about any phrase the templates leave, except negations, compounds and the backslash', async () => {
  for (const phrase of ['llévame a brand', 'pon brand en el finder', 'launch figma', 'bring up slack', 'take me to brand', 'turn on modo foco']) {
    const { asked, deps } = stub(undefined)
    await plan(phrase, deps)
    assert.deepEqual(asked, [phrase], phrase)
  }
  for (const phrase of ['no me lleves a brand', 'never launch figma', 'llévame a brand y arregla el bug', 'launch figma, then fix it', 'take me to brand & fix it', '\\llévame a brand']) {
    const { asked, deps } = stub({ verb: 'open', target: 'brand' })
    assert.equal((await plan(phrase, deps)).status, 'pass', phrase)
    assert.deepEqual(asked, [], phrase)
  }
})

test('plan: a template answer never reaches the model', async () => {
  const { asked, deps } = stub({ verb: 'open', target: 'figma' })
  assert.equal((await plan('abre brand', deps)).step, 'template')
  assert.deepEqual(asked, [])
})

test('ground: one misspelt folder, app or Shortcut name is taken, and says so', () => {
  const app = ground({ verb: 'open', target: 'fgima' }, env)
  assert.equal(app.target.value, '/Applications/Figma.app')
  assert.match(app.target.via, /typo/)
  assert.match(ground({ verb: 'open', target: 'descagas' }, env).target.via, /typo/)
  assert.equal(ground({ verb: 'open', target: 'descagas' }, env).target.value, '/Users/me/Downloads')
  assert.equal(ground({ verb: 'shortcut', target: 'modo fxxx' }, env).status, 'none')
  assert.equal(ground({ verb: 'shortcut', target: 'modo fooc' }, env).target.value, 'Modo foco')
})

test('ground: typo distance is 1 below 8 characters and 2 from 8; short names never match loosely', () => {
  assert.equal(ground({ verb: 'open', target: 'fiigma' }, env).target.value, '/Applications/Figma.app')
  assert.equal(ground({ verb: 'open', target: 'figmaaa' }, env).status, 'none')
  assert.equal(ground({ verb: 'open', target: 'descrgas' }, env).target.value, '/Users/me/Downloads')
  assert.equal(ground({ verb: 'open', target: 'documntos' }, env).target.value, '/Users/me/Documents')
  assert.equal(ground({ verb: 'open', target: 'documnts' }, env).target.value, '/Users/me/Documents')
  assert.equal(ground({ verb: 'open', target: 'dcmnts' }, env).status, 'none')
  assert.equal(ground({ verb: 'open', target: 'braa' }, env).status, 'none')
})

test('ground: a typo that fits two names is not taken', () => {
  const two = { ...env, index: { ...index, apps: { slack: '/A/Slack.app', slick: '/A/Slick.app' } } }
  assert.equal(ground({ verb: 'open', target: 'slock' }, two).status, 'none')
})

test('ground: a kind word at the end of the target is not part of the name', () => {
  assert.equal(ground({ verb: 'open', target: 'desktop folder' }, env).target.value, '/Users/me/Desktop')
  assert.equal(ground({ verb: 'open', target: 'brand repo' }, env).target.value, '/code/brand')
  assert.equal(ground({ verb: 'open', target: 'figma app' }, env).target.value, '/Applications/Figma.app')
  assert.equal(ground({ verb: 'open', target: 'descargas carpeta' }, env).target.value, '/Users/me/Downloads')
  assert.equal(ground({ verb: 'reveal', target: 'design file' }, env).target.value, '/code/reflex/docs/design.md')
  assert.equal(ground({ verb: 'copy', target: 'watchmen image' }, env).target.value, '/code/brand/cards/watchmen-post.png')
  assert.equal(ground({ verb: 'open', target: 'figma aplicacion' }, env).target.value, '/Applications/Figma.app')
  assert.equal(ground({ verb: 'open', target: 'app' }, env).status, 'none')
})

test('plan: kind words and typos work through the model and the templates alike', async () => {
  const model = stub({ verb: 'open', target: 'fgima' })
  const got = await plan('launch fgima', model.deps)
  assert.equal(got.step, 'model')
  assert.equal(got.action.target.value, '/Applications/Figma.app')
  assert.equal((await plan('open the desktop folder', stub(undefined).deps)).action.target.value, '/Users/me/Desktop')
})

test('plan: the place the phrase names overrides the model verb; the target still grounds strictly', async () => {
  const open = stub({ verb: 'open', target: 'brand' })
  assert.equal((await plan('pon brand en el finder', open.deps)).action.verb, 'reveal')
  assert.equal((await plan('put brand in finder', open.deps)).action.verb, 'reveal')
  const reveal = stub({ verb: 'reveal', target: 'brand' })
  assert.equal((await plan('pon brand en el finder', reveal.deps)).action.verb, 'reveal')
  // an invented target is still dropped, whatever the place
  assert.equal((await plan('put the reflex design doc in finder', stub({ verb: 'open', target: 'reflex design doc' }).deps)).action.target.value, '/code/reflex/docs/design.md')
  assert.equal((await plan('put the reflex design doc in finder', stub({ verb: 'open', target: 'reflex design doc' }).deps)).action.verb, 'reveal')
  assert.equal((await plan('put the reflex budget in finder', stub({ verb: 'open', target: 'reflex budget' }).deps)).status, 'pass')
  assert.equal((await plan('put the thing in finder', stub({ verb: 'open', target: 'nothing' }).deps)).status, 'pass')
  // the clipboard place turns the verb into copy
  assert.equal((await plan('pasame brand al portapapeles', stub({ verb: 'open', target: 'brand' }).deps)).action.verb, 'copy')
  assert.equal((await plan('pon brand en el portapapeles', stub({ verb: 'reveal', target: 'brand' }).deps)).action.verb, 'copy')
})

test('plan: leading articles and trailing "for me" fillers are stripped from a model target', async () => {
  assert.equal((await plan('would you open brand for me?', stub({ verb: 'open', target: 'brand for me' }).deps)).action.target.value, '/code/brand')
  assert.equal((await plan('ábreme figma para mí', stub({ verb: 'open', target: 'figma para mí' }).deps)).action.target.value, '/Applications/Figma.app')
  assert.equal((await plan('quiero ver brand anda', stub({ verb: 'open', target: 'brand anda' }).deps)).action.target.value, '/code/brand')
  assert.equal((await plan('ponme el figma', stub({ verb: 'open', target: 'the figma' }).deps)).action.target.value, '/Applications/Figma.app')
  assert.equal((await plan('ponme el figma', stub({ verb: 'open', target: 'el figma' }).deps)).action.target.value, '/Applications/Figma.app')
  assert.equal((await plan('ponme la carpeta brand', stub({ verb: 'open', target: 'la brand' }).deps)).action.target.value, '/code/brand')
  assert.equal((await plan('ponme figma', stub({ verb: 'open', target: '  figma ' }).deps)).action.target.value, '/Applications/Figma.app')
})

test('ground: an exact Shortcut name from the model, with an activation word, grounds as a Shortcut', async () => {
  const model = { ...env, source: 'model' }
  const as = (target, raw, extra = {}, verb = 'open', kind) => ground({ verb, target, raw, kind }, { ...model, ...extra })
  assert.equal(as('modo foco', 'activa el modo foco').target.type, 'shortcut')
  assert.equal(as('modo foco', 'activa el modo foco').target.value, 'Modo foco')
  // exact only: no typo, no prefix, no substring
  assert.equal(as('modo fooc', 'activa modo fooc').status, 'none')
  assert.equal(as('modo', 'activa modo').status, 'none')
  assert.equal(as('foco', 'activa foco').status, 'none')
  assert.equal(as('timer 5 min', 'pon timer 5 min', { index: { ...index, shortcuts: ['Timer 10 min'] } }).status, 'none')
  assert.equal(as('modo fooc', 'run modo fooc', {}, 'shortcut').status, 'none')
  // typed after a template verb the open verb keeps its own grounding
  assert.equal(ground({ verb: 'open', target: 'modo foco', raw: 'activa modo foco' }, env).status, 'none')
  // an activation word is needed, and no closing place
  for (const raw of ['quiero ver el modo foco', 'dame el modo noche', 'necesito modo foco', 'busca modo foco', 'show me modo foco', 'abre modo foco en el navegador']) assert.equal(as('modo foco', raw).status, 'none', raw)
  // whole activation word first, the name right after it, nothing after the name
  for (const raw of ['quiero ver como funciona el modo foco cuando lo pongo', 'show me the run history of modo foco', 'busca la pondera del modo foco', 'ensename el modo foco que activaste', 'let me see modo foco turn on', 'quiero ver run modo foco logs', 'activa modo foco in the browser']) assert.equal(as('modo foco', raw).status, 'none', raw)
  // the anchors: the activation word starts the phrase, at most two small words before the name, nothing but fillers after it
  for (const raw of ['te pido que pon modo foco', 'quiero ver: pon modo foco', 'pon modo foco si puedes', 'pon de el de modo foco']) assert.equal(as('modo foco', raw).status, 'none', raw)
  // each activation word, with or without the small words and closing fillers, and the model's stray spaces
  for (const raw of ['activa modo foco', 'actívame el modo foco', 'activar el atajo modo foco', 'trigger modo foco', 'turn on modo foco', 'enciende modo foco', 'enciéndeme el modo foco', 'pon modo foco', 'ponme el modo foco ya', 'ejecuta el modo foco', 'run modo foco', 'run the shortcut modo foco', 'lanza modo foco', 'oye, lanza modo foco por favor', 'turn on the modo foco for me?']) assert.equal(as('modo foco', raw).target?.type, 'shortcut', raw)
  assert.equal((await plan('run modo foco', stub({ verb: 'open', target: ' modo foco  ' }).deps)).action.target.type, 'shortcut')
  // a kind word is not a Shortcut request
  assert.equal(as('modo foco', 'activa el modo foco', {}, 'open', 'folder').status, 'none')
  // a place verb is not a request to run a Shortcut
  assert.equal(as('modo foco', 'activa modo foco', {}, 'reveal').status, 'none')
  assert.equal(as('modo foco', 'activa modo foco', {}, 'copy').status, 'none')
  // two Shortcuts with the same key drop
  assert.equal(as('modo foco', 'activa modo foco', { index: { ...index, shortcuts: ['Modo foco', 'modo Foco'] } }).status, 'none')
  // a name an app or folder also fits, exactly or by typo, stays with it
  assert.equal(as('figma', 'activa figma', { index: { ...index, shortcuts: ['Figma'] } }).status, 'ok')
  assert.equal(as('figma', 'activa figma', { index: { ...index, shortcuts: ['Figma'] } }).target.type, 'app')
  assert.equal(as('figms', 'activa figms', { index: { ...index, shortcuts: ['Figms'] } }).target.type === 'shortcut', false)
  assert.equal(as('brandd', 'activa brandd', { index: { ...index, shortcuts: ['Brandd'] } }).target?.type === 'shortcut', false)
  assert.equal(as('brand', 'activa brand', { index: { ...index, shortcuts: ['Brand'] } }).target.type, 'folder')
  for (const [phrase, target] of [['activa el modo foco', 'el modo foco'], ['ponme el modo noche', 'modo noche'], ['trigger modo foco', 'modo foco'], ['turn on modo noche', 'the modo noche']]) {
    const got = await plan(phrase, stub({ verb: 'open', target }).deps)
    assert.equal(got.action?.target.type, 'shortcut', phrase)
    assert.equal(got.action.verb, 'shortcut', phrase)
  }
  // without an activation word the whole plan passes
  for (const phrase of ['quiero ver el modo foco', 'dame el modo noche', 'necesito modo foco', 'busca modo foco', 'show me modo foco', 'abre modo foco en el navegador']) assert.equal((await plan(phrase, stub({ verb: 'open', target: 'modo foco' }).deps)).status, 'pass', phrase)
})

test('plan: the Shortcut and place rules open no hole for reports, negations and talk', async () => {
  for (const phrase of ['I put brand in finder yesterday', 'modo foco no funciona', 'what is modo noche']) {
    const { asked, deps } = stub({ verb: 'open', target: phrase.includes('brand') ? 'brand' : 'modo foco' })
    assert.equal((await plan(phrase, deps)).status, 'pass', phrase)
    assert.deepEqual(asked, [], phrase)
  }
})

// ---- review round: precision first --------------------------------------------------------------

const strictEnv = { ...env, config: { aliases: { linkedin: 'https://www.linkedin.com/feed/', brand: '/code/brand' }, model: config.model }, zoxide: t => (t === 'zoxfolder' ? '/x/zoxfolder' : undefined) }
const asModel = (target, verb = 'open') => ({ ...strictEnv, askModel: async () => ({ verb, target }) })
const status = async (phrase, deps) => (await plan(phrase, deps)).status

// Deliberate recall loss, for every target kind (folder, app, Shortcut, alias, address and file): a word around the target that the allow-list does not know ("delante", "a funcionar", a leading "ya") drops the match, so these phrases end in a known place or nothing.
test('plan: a model target grounds strictly: exact names, aliases and typos only', async () => {
  // exact names and aliases
  assert.equal((await plan('ponme figma', asModel('figma'))).action.target.value, '/Applications/Figma.app')
  assert.equal((await plan('ponme brand', asModel('brand'))).action.target.value, '/code/brand')
  assert.equal((await plan('ponme linkedin', asModel('linkedin'))).action.target.value, 'https://www.linkedin.com/feed/')
  assert.equal((await plan('ponme modo foco', asModel('modo foco', 'shortcut'))).action.target.value, 'Modo foco')
  // not a prefix, not a substring, not zoxide, not the file search
  assert.equal(await status('ponme fig', asModel('fig')), 'pass')
  assert.equal(await status('ponme chrome', asModel('chrome')), 'pass')
  assert.equal(await status('ponme zoxfolder', asModel('zoxfolder')), 'pass')
  assert.equal((await plan('ponme design', asModel('design'))).action.target.value, '/code/reflex/docs/design.md')
  assert.equal(await status('ponme readme', { ...asModel('readme'), index: filesIndex }), 'pass')
  assert.equal(await status('ponme modo', asModel('modo', 'shortcut')), 'pass')
  // the same words typed after a template verb keep the loose grounding
  assert.equal((await plan('abre fig', strictEnv)).action.target.value, '/Applications/Figma.app')
  assert.equal((await plan('abre zoxfolder', strictEnv)).action.target.value, '/x/zoxfolder')
  assert.equal((await plan('abre design', strictEnv)).action.target.value, '/code/reflex/docs/design.md')
  // a typo is still taken from the model
  assert.equal((await plan('ponme fgima', asModel('fgima'))).action.target.value, '/Applications/Figma.app')
})

test('plan: a model may propose an address only if the phrase has it verbatim with a scheme or www', async () => {
  assert.equal((await plan('ponme design.md', asModel('design.md'))).action.target.value, '/code/reflex/docs/design.md')
  assert.equal(await status('ponme example.com', asModel('example.com')), 'pass')
  assert.equal((await plan('ponme www.Example.com/A', asModel('www.example.com/a'))).action.target.value, 'https://www.Example.com/A')
  assert.equal((await plan('ponme HTTPS://Example.com/A', asModel('https://example.com/a'))).action.target.value, 'HTTPS://Example.com/A')
  assert.equal((await plan('abre example.com', strictEnv)).action.target.value, 'https://example.com')
})

test('plan: questions and talk never reach the model, requests phrased as questions do', async () => {
  for (const phrase of ['what is brand', 'why is figma slow', 'how do I open brand', 'which app is figma', 'is brand open', 'are the downloads big', 'does reflex work', 'do you know brand', 'explain design.md', 'tell me about figma', 'describe brand', 'hey what is brand', 'can you tell me about figma', 'qué es brand', 'por qué va lento figma', 'cómo abro brand', 'cuál es la app', 'es brand una carpeta', 'explica figma', 'explícame brand', 'cuéntame sobre figma', 'dime qué es brand', 'describe figma']) {
    const { asked, deps } = stub({ verb: 'open', target: 'brand' })
    assert.equal((await plan(phrase, deps)).status, 'pass', phrase)
    assert.deepEqual(asked, [], phrase)
  }
  for (const phrase of ['¿me abres brand?', '¿puedes llevarme a brand?', 'can you bring up brand', 'could you bring brand up', 'whatever ábreme brand', 'issue: llévame a brand']) {
    const { asked, deps } = stub(undefined)
    await plan(phrase, deps)
    assert.deepEqual(asked, [phrase], phrase)
  }
})

test('ground: the typo floor applies to the typed key as well', () => {
  assert.equal(ground({ verb: 'open', target: 'bran' }, env).status, 'none')
  assert.equal(ground({ verb: 'open', target: 'brandd' }, env).target.value, '/code/brand')
})

test('ground: a short indexed name is never matched by typo', () => {
  const small = { ...env, index: { ...index, folders: { code: '/code' }, apps: {} } }
  assert.equal(ground({ verb: 'open', target: 'codes' }, small).status, 'none')
  assert.equal(ground({ verb: 'open', target: 'cods' }, small).status, 'none')
})

test('ground: a typo has to match exactly one folder or Shortcut', () => {
  const two = { ...env, index: { ...index, apps: {}, folders: { alpha1: '/a', alpha2: '/b' }, shortcuts: ['Modo foco', 'Modo fuco'] } }
  assert.equal(ground({ verb: 'open', target: 'alpha3' }, two).status, 'none')
  assert.equal(ground({ verb: 'shortcut', target: 'modo fico' }, two).status, 'none')
  const same = { ...env, index: { ...index, apps: {}, folders: { alpha1: '/a', alpha2: '/a' } } }
  assert.equal(ground({ verb: 'open', target: 'alpha3' }, same).target.value, '/a')
  assert.equal(ground({ verb: 'shortcut', target: 'modo fxco' }, env).status, 'ok')
})

test('ground: a typo that also fits another kind of name is left to Claude', () => {
  const both = { ...env, index: { ...index, apps: { figma: '/Applications/Figma.app' }, folders: { figmo: '/code/figmo' }, files: [] } }
  assert.equal(ground({ verb: 'open', target: 'figmx' }, both).status, 'none')
  assert.equal(ground({ verb: 'open', target: 'figmx', kind: 'app' }, both).status, 'none')
  // a folder typo is taken when the verb cannot open an app, or the kind says folder
  assert.equal(ground({ verb: 'reveal', target: 'figmx' }, both).target.value, '/code/figmo')
  assert.equal(ground({ verb: 'open', target: 'figmx', kind: 'folder' }, both).target.value, '/code/figmo')
  // an app typo is not taken when the kind says folder
  const appOnly = { ...env, index: { ...index, folders: {}, files: [] } }
  assert.equal(ground({ verb: 'open', target: 'fgima', kind: 'folder' }, appOnly).status, 'none')
  assert.equal(ground({ verb: 'open', target: 'fgima', kind: 'app' }, appOnly).target.value, '/Applications/Figma.app')
  assert.equal(ground({ verb: 'reveal', target: 'fgima' }, appOnly).status, 'none')
})

test('ground: a Shortcut taken by typo says so', () => {
  const got = ground({ verb: 'shortcut', target: 'modo fcoo' }, env)
  assert.equal(got.target.via, 'Shortcuts (typo)')
  assert.equal(ground({ verb: 'shortcut', target: 'modo foco' }, env).target.via, 'Shortcuts')
  assert.equal(ground({ verb: 'open', target: 'descagas' }, env).target.via, 'known folders (typo)')
  assert.equal(ground({ verb: 'open', target: 'fgima' }, env).target.via, 'installed apps (typo)')
})

test('ground: a postfix kind word hints the kind, only at the end, and leaves the name clean', () => {
  // the hint: "file" means not the app
  assert.equal(ground({ verb: 'open', target: 'figma file' }, env).status, 'none')
  assert.equal(ground({ verb: 'open', target: 'slack folder' }, env).status, 'none')
  // an explicit kind wins over the postfix
  assert.equal(ground({ verb: 'open', target: 'figma folder', kind: 'app' }, env).target.value, '/Applications/Figma.app')
  // only at the end
  assert.equal(ground({ verb: 'open', target: 'tide file reader' }, { ...env, index: { ...index, apps: { 'tide file reader': '/Applications/TFR.app' } } }).target.value, '/Applications/TFR.app')
  // the name is what is left
  assert.equal(ground({ verb: 'open', target: 'Desktop Folder' }, env).target.label, 'Desktop')
  assert.equal(ground({ verb: 'open', target: 'Desktop Folder' }, env).target.via, 'known folders')
  // a lone kind word is a name
  assert.equal(ground({ verb: 'open', target: 'folder' }, env).status, 'none')
})

test('ground: an alias is found with a kind word after it', () => {
  const aliased = { ...env, config: { aliases: { linkedin: 'https://www.linkedin.com/feed/' }, model: {} } }
  assert.deepEqual(ground({ verb: 'open', target: 'linkedin app' }, aliased).target, { type: 'url', value: 'https://www.linkedin.com/feed/', label: 'linkedin', via: 'alias' })
  assert.equal(ground({ verb: 'open', target: 'linkedin' }, aliased).target.via, 'alias')
})

test('plan: the model is asked only when the phrase has a request word, so statements stay with Claude', async () => {
  for (const phrase of ['I use slack', 'I love figma', "I'm working on brand", 'thanks figma', 'me encanta figma', 'yo uso figma', 'estoy en brand', 'vengo de brand', 'ya cerré slack', 'my figma', 'the brand folder is a mess', 'otra vez figma', 'again slack', 'ahora brand', 'plan() does what']) {
    const { asked, deps } = stub({ verb: 'open', target: phrase.toLowerCase().includes('slack') ? 'slack' : 'brand' })
    assert.equal((await plan(phrase, deps)).status, 'pass', phrase)
    assert.deepEqual(asked, [], phrase)
  }
  for (const phrase of ['quiero ver brand', 've a brand', 'I want brand', 'necesito figma', 'dame brand', 'get me figma', 'saca brand', 'find slack', 'busca figma', 'activa modo foco', 'pásame figma', 'trigger modo foco', 'dónde está brand', 'enciende figma', 'start slack', 'go to brand', 'let me see brand', 'I want to see brand', 'quiero brand', 'give me figma']) {
    const { asked, deps } = stub(undefined)
    await plan(phrase, deps)
    assert.deepEqual(asked, [phrase], phrase)
  }
})

test('plan: a model target must be words of the phrase, not pieces of them, and never empty', async () => {
  const pieces = { ...env, index: { ...index, folders: { bran: '/code/bran', plan: '/code/plan' } } }
  const answer = target => ({ ...pieces, askModel: async () => ({ verb: 'open', target }) })
  const brand = await plan('ponme brand', answer('bran'))
  assert.equal(brand.status, 'pass')
  assert.match(brand.trace.at(-1).reason, /not copied/)
  assert.equal((await plan('ponme planning', answer('plan'))).status, 'pass')
  assert.equal((await plan('ponme bran', answer('bran'))).action.target.value, '/code/bran')
  for (const empty of ['', '  ']) {
    const got = await plan('ponme algo', answer(empty))
    assert.equal(got.status, 'pass')
    assert.match(got.trace.at(-1).reason, /not copied/)
  }
})

test('copiedFrom: paths and addresses have to appear verbatim, plain names word by word', () => {
  assert.equal(copiedFrom('go to /code/brand/x now', '/code/brand'), true)
  assert.equal(copiedFrom('go to /code', '/code/brand'), false)
  assert.equal(copiedFrom('ve a ~/Código', '~/codigo'), true)
  assert.equal(copiedFrom('open Example.com/A now', 'example.com/a'), true)
  assert.equal(copiedFrom('open example.org', 'example.com'), false)
  assert.equal(copiedFrom('open https://example.com/a', 'example.com/a'), true)
  assert.equal(copiedFrom('open the code and the brand', '/code/brand'), false)
  assert.equal(copiedFrom('llévame a Visual Studio Code', 'visual studio code'), true)
  assert.equal(copiedFrom('llévame a visual studio', 'visual studio code'), false)
  assert.equal(copiedFrom('al brandbook', 'brand'), false)
  assert.equal(copiedFrom('pon algo', ''), false)
})

test('plan: past tense, "pasar" as happening and "see" as a greeting are not requests, and skip the model', async () => {
  for (const phrase of ['ya abrí figma', 'I opened figma yesterday', 'abrí figma ayer', 'open figma I did it antes', 'ya lancé slack', 'I launched slack', 'ya copió brand', 'me pasó con figma', 'paso de slack', 'see you later brand', 'yesterday I want figma', 'antes quería abrir brand', 'ayer necesito brand']) {
    const { asked, deps } = stub({ verb: 'open', target: /slack/.test(phrase) ? 'slack' : /brand/.test(phrase) ? 'brand' : 'figma' })
    assert.equal((await plan(phrase, deps)).status, 'pass', phrase)
    assert.deepEqual(asked, [], phrase)
  }
  for (const phrase of ['pasa figma', 'pásame figma', 'pasas brand', 'abre ya figma', 'llévame a brand ya', 'let me see brand']) {
    const { asked, deps } = stub(undefined)
    await plan(phrase, deps)
    assert.deepEqual(asked, [phrase], phrase)
  }
})

test('plan: pins on quiero, the filler strip before TALK and the address arm of the copy rule', async () => {
  const bare = stub(undefined)
  await plan('quiero brand', bare.deps)
  assert.deepEqual(bare.asked, ['quiero brand'])
  for (const phrase of ['please what do I do to open brand', 'hey explícame cómo abrir brand']) {
    const { asked, deps } = stub({ verb: 'open', target: 'brand' })
    assert.equal((await plan(phrase, deps)).status, 'pass', phrase)
    assert.deepEqual(asked, [], phrase)
  }
  // a bare address is accepted where it is written verbatim, even inside a longer one
  const inside = stub({ verb: 'open', target: 'planar.do' })
  const passed = await plan('take me to planar.do/pricing', inside.deps)
  assert.ok(passed.trace.at(-1).parsed, 'the copy rule let it through to grounding')
  const elsewhere = stub({ verb: 'open', target: 'planar.do' })
  const got = await plan('take me to planar dot do', elsewhere.deps)
  assert.equal(got.status, 'pass')
  assert.match(got.trace.at(-1).reason, /not copied/)
})

test('plan: phrases that report, time or condition an action are not requests, and skip the model', async () => {
  for (const phrase of ['ya abri figma', 'ya abrimos figma', 'ya abre figma', "I'm opening figma", 'estoy abriendo figma', 'estoy lanzando slack', 'I was launching slack', 'acabo de abrir figma', 'después abro brand', 'luego abro brand', 'then open brand', 'when I open figma it crashes', 'cuando abro figma falla', 'si pones brand', 'if you open slack', 'please ya abri figma']) {
    const { asked, deps } = stub({ verb: 'open', target: /slack/.test(phrase) ? 'slack' : /brand/.test(phrase) ? 'brand' : 'figma' })
    assert.equal((await plan(phrase, deps)).status, 'pass', phrase)
    assert.deepEqual(asked, [], phrase)
  }
})

test('plan: put is a request only as an imperative or with a place, never as something somebody did', async () => {
  for (const phrase of ['I put brand in the trash', 'we put brand in the trash', 'he put figma on my list']) {
    const { asked, deps } = stub({ verb: 'open', target: /figma/.test(phrase) ? 'figma' : 'brand' })
    assert.equal((await plan(phrase, deps)).status, 'pass', phrase)
    assert.deepEqual(asked, [], phrase)
  }
  for (const phrase of ['put brand', 'please put figma', 'put brand on the screen', 'put brand in finder', 'can you put figma in front']) {
    const { asked, deps } = stub(undefined)
    await plan(phrase, deps)
    assert.deepEqual(asked, [phrase], phrase)
  }
})

test('plan: trailing filler words are stripped from a model target before the copy rule', async () => {
  for (const [phrase, target, value] of [['llévame a brand ya', 'brand ya', '/code/brand'], ['abre figma ya', 'figma ya', '/Applications/Figma.app'], ['launch figma now please', 'figma now please', '/Applications/Figma.app'], ['llévame a brand otra vez', 'brand otra vez', '/code/brand']]) {
    const got = await plan(phrase, stub({ verb: 'open', target }).deps)
    assert.equal(got.status, 'action', phrase)
    assert.equal(got.action.target.value, value, phrase)
  }
  // only trailing words: a name that is made of them is not touched
  const lone = await plan('llévame a ya', stub({ verb: 'open', target: 'ya' }).deps)
  assert.equal(lone.status, 'pass')
})

test('plan: reported and progressive phrasings from the #25 review skip the model', async () => {
  for (const phrase of ['hace rato abrí figma', "I'm opening figma"]) {
    const s = stub({ verb: 'open', target: 'figma' })
    assert.equal((await plan(phrase, s.deps)).status, 'pass', phrase)
    assert.deepEqual(s.asked, [], phrase)
  }
})

test('plan: "put" with a place reaches the model unless a subject precedes it', async () => {
  for (const phrase of ['put it in finder', 'put it on the screen']) {
    const s = stub({ verb: 'open', target: 'it' })
    await plan(phrase, s.deps)
    assert.equal(s.asked.length, 1, `${phrase} should be asked`)
  }
  for (const phrase of ['I put it on the screen', 'I put it in finder']) {
    const s = stub({ verb: 'open', target: 'it' })
    await plan(phrase, s.deps)
    assert.deepEqual(s.asked, [], `${phrase} should skip the model`)
  }
})

test('plan: "put" mid-phrase keeps the subject lookbehind', async () => {
  const yes = stub({ verb: 'reveal', target: 'it' })
  await plan('ok put it in finder', yes.deps)
  assert.equal(yes.asked.length, 1)
  const no = stub({ verb: 'reveal', target: 'it' })
  await plan('ok I put it in finder', no.deps)
  assert.deepEqual(no.asked, [])
})

test('plan: every request form the teacher is shown reaches the model or a template, with and without a filler', async () => {
  for (const { form } of REQUEST_FORMS) {
    for (const tail of ['', ' ya', ' please', ' otra vez']) {
      const phrase = (form.includes('…') ? form.replace('…', 'brand') : `${form} brand`) + tail
      const s = stub(null)
      const got = await plan(phrase, s.deps)
      assert.ok(got.step === 'template' || s.asked.length === 1, `"${phrase}" never reaches a verb`)
    }
  }
})

const filesIndex = {
  ...index,
  folders: { ...index.folders, reflex: '/code/reflex', orbitdesk: '/code/orbitdesk' },
  files: ['/code/reflex/docs/design.md', '/code/reflex/docs/roadmap.md', '/code/reflex/README.md', '/code/orbitdesk/README.md', '/Users/me/Desktop/captura-2026-11-05.png', '/Users/me/Downloads/informe-trimestral.pdf', '/Users/me/Downloads/informe-trimestral-v2.pdf', '/Users/me/Notes/update_garden_configuration.md', '/Users/me/Notes/guest-list.md', '/Users/me/Notes/kiteMaker.md', '/Users/me/Notes/script-runner.sh'],
}
const filesEnv = { ...env, index: filesIndex, source: 'model' }
const grounded = (target, verb = 'open') => ground({ verb, target }, filesEnv)

test('ground: a model file is its name, optionally scoped by a known folder; the stem has to equal the words', () => {
  assert.equal(grounded('roadmap').target.value, '/code/reflex/docs/roadmap.md')
  assert.equal(grounded('roadmap de reflex').target.value, '/code/reflex/docs/roadmap.md')
  assert.equal(grounded('reflex design doc').target.value, '/code/reflex/docs/design.md')
  assert.equal(grounded('captura 2026-11-05', 'reveal').target.value, '/Users/me/Desktop/captura-2026-11-05.png')
  assert.equal(grounded('design', 'copy').target.value, '/code/reflex/docs/design.md')
  assert.equal(grounded('kite maker').target.value, '/Users/me/Notes/kiteMaker.md')
  assert.equal(grounded('guest list').target.value, '/Users/me/Notes/guest-list.md')
  // a folder narrows the match
  assert.equal(grounded('reflex readme').target.value, '/code/reflex/README.md')
  assert.equal(grounded('orbitdesk readme').target.value, '/code/orbitdesk/README.md')
  // the stem is equal, not merely containing: -v2 is a different name
  assert.equal(grounded('informe trimestral').target.value, '/Users/me/Downloads/informe-trimestral.pdf')
  // drops: several files, none, an unknown folder word, a word that is only part of a name or a path
  for (const target of ['readme', 'budget', 'main roadmap', 'script del terminal', 'worker models', 'garden', 'guest', 'kite', 'maker', 'orbitdesk docs', 'reflex budget', 'configuration']) assert.equal(grounded(target).status, 'none', target)
})

test('ground: a folder whose name equals the words still matches, and a directory result is typed folder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'reflex-'))
  mkdirSync(join(dir, 'roadmap'))
  const withDir = { ...filesEnv, index: { ...filesIndex, files: [join(dir, 'roadmap')] } }
  const got = ground({ verb: 'open', target: 'roadmap' }, withDir)
  assert.equal(got.target.type, 'folder')
  assert.equal(got.target.value, join(dir, 'roadmap'))
  assert.equal(ground({ verb: 'open', target: 'reflex' }, filesEnv).target.value, '/code/reflex')
  assert.equal(ground({ verb: 'reveal', target: 'roadmap', kind: 'app' }, filesEnv).status, 'none')
})

test('ground: a model file needs a real word, drops kind words, and never takes the shortcut verb', () => {
  assert.equal(ground({ verb: 'open', target: 'roadmap file' }, filesEnv).target.value, '/code/reflex/docs/roadmap.md')
  assert.equal(ground({ verb: 'open', target: 'screenshot of 2026-11-05' }, filesEnv).target.value, '/Users/me/Desktop/captura-2026-11-05.png')
  // only short or stop words: "md" and "de" would fit nearly anything
  assert.equal(ground({ verb: 'open', target: 'md' }, filesEnv).status, 'none')
  assert.equal(ground({ verb: 'open', target: 'the file' }, filesEnv).status, 'none')
  assert.equal(ground({ verb: 'open', target: 'of 11' }, filesEnv).status, 'none')
  assert.equal(ground({ verb: 'shortcut', target: 'roadmap' }, filesEnv).status, 'none')
  // typed targets keep the broad search
  assert.equal(ground({ verb: 'open', target: 'readme' }, { ...filesEnv, source: 'template' }).status, 'ambiguous')
})

test('plan: the model names a file; one match acts, several or a remark do not', async () => {
  const roadmap = stub({ verb: 'open', target: 'roadmap' })
  const got = await plan('quiero ver el roadmap de reflex', { ...roadmap.deps, index: filesIndex })
  assert.equal(got.step, 'model')
  assert.equal(got.action.target.value, '/code/reflex/docs/roadmap.md')
  const copy = stub({ verb: 'copy', target: 'captura de 2026-11-05' })
  const copied = await plan('me pasas la captura de 2026-11-05 al portapapeles', { ...copy.deps, index: filesIndex })
  assert.equal(copied.action.verb, 'copy')
  assert.equal(copied.action.target.value, '/Users/me/Desktop/captura-2026-11-05.png')
  const readme = stub({ verb: 'open', target: 'readme' })
  assert.equal((await plan('necesito arreglar el README', { ...readme.deps, index: filesIndex })).status, 'pass')
  assert.equal((await plan('quiero ver el readme', { ...readme.deps, index: filesIndex })).status, 'pass')
  const remark = stub({ verb: 'open', target: 'roadmap' })
  for (const phrase of ['el roadmap está desactualizado', 'quiero ver por qué falla el roadmap', "what's in design.md"]) {
    const asked = await plan(phrase, { ...remark.deps, index: filesIndex })
    assert.notEqual(asked.status, 'action', phrase)
  }
})

test('plan: an embedded question or a request for another action skips the model; open, see and copy still reach it', async () => {
  for (const phrase of ['quiero ver por qué falla el roadmap', 'necesito arreglar el README', 'I need to fix the roadmap', 'i want to know why the roadmap fails', 'quiero saber cómo funciona el roadmap', 'necesito entender el roadmap', 'I want to understand the roadmap']) {
    const { asked, deps } = stub({ verb: 'open', target: 'roadmap' })
    assert.equal((await plan(phrase, { ...deps, index: filesIndex })).status, 'pass', phrase)
    assert.deepEqual(asked, [], phrase)
  }
  for (const phrase of ['quiero ver el roadmap', 'necesito abrir el roadmap', 'I want to see the roadmap', 'i need to open the roadmap', 'quiero copiar el roadmap', 'i want the roadmap file', 'i want the roadmap file on my clipboard']) {
    const { asked, deps } = stub({ verb: 'open', target: 'roadmap' })
    assert.equal((await plan(phrase, { ...deps, index: filesIndex })).status, 'action', phrase)
    assert.equal(asked.length, 1, phrase)
  }
})

// One phrase per alternative: each opens on "quiero ver", an allowed verb, so only the interrogative can skip the model.
const INTERROGATIVES = {
  'por que': 'quiero ver por que falla el roadmap', porque: 'quiero ver porque falla el roadmap', why: 'i want to see why the roadmap fails',
  como: 'quiero ver como va el roadmap', how: 'i want to see how the roadmap fails', 'que pasa': 'quiero ver que pasa con el roadmap',
  'si funciona': 'quiero ver si funciona el roadmap', whether: 'i want to see whether the roadmap works',
  who: 'I need to see who wrote the roadmap', quien: 'quiero ver quién tocó el roadmap', what: 'i want to see what the roadmap does',
  when: 'i want to see when the roadmap changed', cuando: 'quiero ver cuando cambió el roadmap', where: 'i want to see where the roadmap is',
  donde: 'quiero ver donde esta el roadmap', which: 'i want to see which roadmap is old', cual: 'quiero ver cual roadmap es viejo',
  whose: 'i want to see whose roadmap this is', cuanto: 'quiero ver cuanto pesa el roadmap', cuantos: 'quiero ver cuantos roadmap hay',
  cuantas: 'quiero ver cuantas lineas tiene el roadmap', 'para que': 'necesito ver para que sirve el roadmap',
  'qué (accented)': 'quiero ver qué hace el roadmap',
}

test('plan: every interrogative skips the model, wherever it falls after the request word', async () => {
  for (const [name, phrase] of Object.entries(INTERROGATIVES)) {
    const { asked, deps } = stub({ verb: 'open', target: 'roadmap' })
    assert.equal((await plan(phrase, { ...deps, index: filesIndex })).status, 'pass', name)
    assert.deepEqual(asked, [], name)
  }
  // "que" as a conjunction, an unaccented "que pasa" aside, is no question; "dónde está" opening the phrase is the reveal form
  for (const phrase of ['quiero que abras el roadmap', 'dónde está el roadmap', 'donde esta el roadmap']) {
    const { asked, deps } = stub({ verb: 'reveal', target: 'roadmap' })
    assert.equal((await plan(phrase, { ...deps, index: filesIndex })).status, 'action', phrase)
    assert.equal(asked.length, 1, phrase)
  }
})

test('plan: each request word that is followed by another action skips the model, and each kept verb still reaches it', async () => {
  const skip = ['quiero arreglar el roadmap', 'necesito arreglar el roadmap', 'i want to fix the roadmap', 'i need to fix the roadmap', "i'd like to fix the roadmap", 'id like to fix the roadmap', 'quiero entender el roadmap', 'necesito leer el roadmap', 'quiero borrar el roadmap', 'i want to have the roadmap', 'i want to get the roadmap', 'i want to take the roadmap']
  for (const phrase of skip) {
    const { asked, deps } = stub({ verb: 'open', target: 'roadmap' })
    assert.equal((await plan(phrase, { ...deps, index: filesIndex })).status, 'pass', phrase)
    assert.deepEqual(asked, [], phrase)
  }
  const keep = ['quiero ver', 'quiero abrir', 'quiero copiar', 'quiero mostrar', 'quiero ensenar', 'quiero revelar', 'quiero lanzar', 'quiero encontrar', 'quiero buscar', 'quiero pasar', 'i want to open', 'i want to see', 'i want to view', 'i want to copy', 'i want to show', 'i want to reveal', 'i want to launch', 'i want to find', 'i want to bring', 'i want to go', 'i want to look']
  for (const start of keep) {
    const { asked, deps } = stub({ verb: 'open', target: 'roadmap' })
    await plan(`${start} el roadmap`, { ...deps, index: filesIndex })
    assert.equal(asked.length, 1, start)
  }
})

const kindIndex = {
  ...index,
  folders: { ...index.folders, reflex: '/code/reflex' },
  files: ['/Users/me/Notes/syntax.md', '/code/orbit/orbit-kit.css', '/Users/me/Pictures/sunset.png', '/Users/me/Pictures/beach.jpg', '/Users/me/Notes/readme-draft.pdf', '/Users/me/Notes/napTower.md', '/Users/me/Notes/roadmap-documentation.md', '/Users/me/Notes/io.md', '/Users/me/Notes/foo.txt', '/Users/me/Notes/roadmap.md', '/Users/me/Notes/roadmap.pdf', '/Users/me/Notes/report.pdf', '/Users/me/Notes/report-doc.pdf'],
}
const kindGround = (target, verb = 'open') => ground({ verb, target }, { ...env, index: kindIndex, source: 'model' })

test('ground: a kind word has to fit the file it names', () => {
  // images need an image extension
  for (const word of ['image', 'picture', 'pic', 'photo', 'foto', 'imagen', 'captura', 'screenshot']) {
    assert.equal(kindGround(`syntax ${word}`).status, 'none', word)
    assert.equal(kindGround(`orbit-kit ${word}`).status, 'none', word)
    assert.equal(kindGround(`sunset ${word}`).target.value, '/Users/me/Pictures/sunset.png', word)
  }
  assert.equal(kindGround('beach photo').target.value, '/Users/me/Pictures/beach.jpg')
  assert.equal(ground({ verb: 'open', target: 'syntax', kind: 'image' }, { ...env, index: kindIndex, source: 'model' }).status, 'none')
  // folders, repos and apps are not files
  for (const word of ['folder', 'carpeta', 'directorio', 'directory', 'repo', 'repositorio', 'app', 'aplicacion', 'application', 'programa']) assert.equal(kindGround(`${word} syntax`).status, 'none', word)
  // document words fit a file; md has to be a .md file
  for (const word of ['doc', 'docs', 'document', 'documento', 'file', 'fichero', 'archivo']) assert.equal(kindGround(`syntax ${word}`).target.value, '/Users/me/Notes/syntax.md', word)
  assert.equal(kindGround('syntax md').target.value, '/Users/me/Notes/syntax.md')
  assert.equal(kindGround('readme draft md').status, 'none')
})

test('plan: a kind word that does not fit the file stops the action', async () => {
  for (const phrase of ['I want to see the syntax picture', 'quiero ver el repo syntax', 'quiero ver el programa syntax', 'quiero ver el orbit-kit image']) {
    const target = phrase.split(/\s+/).slice(phrase.startsWith('I') ? 5 : 3).join(' ').replace(/^(el|the) /, '')
    const got = await plan(phrase, { ...env, index: kindIndex, askModel: async () => ({ verb: 'open', target }) })
    assert.equal(got.status, 'pass', phrase)
  }
})

test('ground: a model file keeps the word rules: length, order, exact kind token, directory names', () => {
  // at least one word of 3 characters
  assert.equal(kindGround('io').status, 'none')
  assert.equal(kindGround('foo').target.value, '/Users/me/Notes/foo.txt')
  // tokens in order
  assert.equal(kindGround('nap tower').target.value, '/Users/me/Notes/napTower.md')
  assert.equal(kindGround('tower nap').status, 'none')
  // a kind token is only dropped when it is one exactly
  assert.equal(kindGround('roadmap documentation').target.value, '/Users/me/Notes/roadmap-documentation.md')
  assert.equal(kindGround('report').status, 'none')
  // report-doc.pdf is the report plus its kind token, and report.pdf is the report itself: two files
  assert.equal(kindGround('report doc').status, 'none')
  assert.equal(kindGround('roadmap docum').status, 'none')
  // a directory keeps its whole name and is typed folder
  const dir = mkdtempSync(join(tmpdir(), 'reflex-'))
  mkdirSync(join(dir, 'backup'))
  mkdirSync(join(dir, 'notes.archive'))
  const withDirs = { ...env, index: { ...kindIndex, files: [join(dir, 'backup'), join(dir, 'notes.archive')] }, source: 'model' }
  assert.equal(ground({ verb: 'open', target: 'backup' }, withDirs).target.type, 'folder')
  assert.equal(ground({ verb: 'open', target: 'notes archive' }, withDirs).target.value, join(dir, 'notes.archive'))
  assert.equal(ground({ verb: 'open', target: 'notes' }, withDirs).status, 'none')
})

test('plan: the i\'d like and id like triggers, and the -ir infinitive, skip the model; the same phrase with a kept verb reaches it', async () => {
  // "show" is the request word that opens the gate, so only the other-action trigger can skip the model
  for (const phrase of ["i'd like to fix the roadmap show", 'id like to fix the roadmap show', 'quiero escribir el roadmap']) {
    const { asked, deps } = stub({ verb: 'open', target: 'roadmap' })
    assert.equal((await plan(phrase, { ...deps, index: filesIndex })).status, 'pass', phrase)
    assert.deepEqual(asked, [], phrase)
  }
  for (const phrase of ["i'd like to open the roadmap show", 'id like to open the roadmap show']) {
    const { asked, deps } = stub({ verb: 'open', target: 'roadmap' })
    await plan(phrase, { ...deps, index: filesIndex })
    assert.equal(asked.length, 1, phrase)
  }
})

test('plan: "ver que", "saber que", "see that" and "see if" are remarks, whatever opens the phrase', async () => {
  for (const phrase of ['quiero ver que dice el roadmap', 'pon saber que dice el roadmap', 'i want to see that the roadmap works', 'i want to see if the roadmap works']) {
    const { asked, deps } = stub({ verb: 'open', target: 'roadmap' })
    assert.equal((await plan(phrase, { ...deps, index: filesIndex })).status, 'pass', phrase)
    assert.deepEqual(asked, [], phrase)
  }
})

test('ground: a kind word the phrase puts next to the target counts even when the model dropped it', () => {
  const as = (target, raw) => ground({ verb: 'open', target, raw }, { ...env, index: kindIndex, source: 'model' })
  assert.equal(as('syntax', 'quiero ver el repo syntax').status, 'none')
  assert.equal(as('syntax', 'quiero ver el programa syntax').status, 'none')
  assert.equal(as('syntax', 'I want to see the syntax picture').status, 'none')
  assert.equal(as('orbit-kit', 'quiero ver el orbit-kit image').status, 'none')
  assert.equal(as('syntax', 'quiero ver el syntax file').target.value, '/Users/me/Notes/syntax.md')
  assert.equal(as('sunset', 'quiero ver la foto sunset').target.value, '/Users/me/Pictures/sunset.png')
  assert.equal(as('syntax', 'quiero ver el syntax').target.value, '/Users/me/Notes/syntax.md')
  // only a known word next to the target is allowed: an unknown noun before or after drops the file
  for (const raw of ['quiero ver el syntax del repo', 'quiero ver las fotos syntax', 'quiero ver el proyecto syntax', 'quiero ver la web syntax', 'quiero ver el sitio syntax', 'quiero ver el syntax project', 'quiero ver el video syntax']) assert.equal(as('syntax', raw).status, 'none', raw)
  assert.equal(as('toilet', 'quiero ver el vídeo del toilet').status, 'none')
})

test('ground: the words around a model file must be known: before, a request form, preposition, document kind or nothing; after, the end, a filler, a place, a document kind or de <known folder>', () => {
  const idx = { ...filesIndex, files: [...filesIndex.files, '/Users/me/Notes/syntax.md', '/other/syntax.md'] }
  const as = (target, raw, verb = 'open') => ground({ verb, target, raw }, { ...env, index: idx, source: 'model' })
  const value = (target, raw, verb) => as(target, raw, verb).target?.value
  // before the target
  assert.equal(value('roadmap', 'roadmap'), '/code/reflex/docs/roadmap.md') // nothing before
  assert.equal(value('roadmap', 'quiero ver el roadmap'), '/code/reflex/docs/roadmap.md') // end of a request form, article skipped
  assert.equal(value('roadmap', 'llevame a la roadmap'), '/code/reflex/docs/roadmap.md') // preposition, then determiner
  assert.equal(value('roadmap', 'show me the roadmap'), '/code/reflex/docs/roadmap.md') // "me"
  assert.equal(value('roadmap', 'quiero ver el archivo roadmap'), '/code/reflex/docs/roadmap.md') // document kind
  assert.equal(value('design', 'quiero ver the reflex design'), '/code/reflex/docs/design.md') // known folder
  for (const [word, raw] of [['repo', 'quiero ver el repo roadmap'], ['proyecto', 'quiero ver el proyecto roadmap'], ['fotos', 'quiero ver las fotos roadmap'], ['video', 'quiero ver el vídeo roadmap'], ['web', 'quiero ver la web roadmap'], ['sitio', 'quiero ver el sitio roadmap'], ['app', 'quiero ver la app roadmap'], ['unknown', 'quiero ver el widget roadmap'], ['video del', 'quiero ver el video del roadmap'], ['video de', 'quiero ver el video de roadmap']]) assert.equal(as('roadmap', raw).status, 'none', word)
  // after the target
  assert.equal(value('roadmap', 'quiero ver el roadmap ya'), '/code/reflex/docs/roadmap.md') // filler
  assert.equal(value('roadmap', 'pon el roadmap en el finder', 'reveal'), '/code/reflex/docs/roadmap.md') // place
  assert.equal(value('roadmap', 'pasame el roadmap al portapapeles', 'copy'), '/code/reflex/docs/roadmap.md')
  assert.equal(value('roadmap', 'quiero ver el roadmap file'), '/code/reflex/docs/roadmap.md') // document kind
  assert.equal(value('roadmap', 'quiero ver el roadmap de reflex'), '/code/reflex/docs/roadmap.md') // de <known folder>
  assert.equal(value('syntax', 'quiero ver el syntax de reflex'), undefined) // reflex holds no syntax file: the folder has to hold it
  for (const [word, raw] of [['repo', 'quiero ver el roadmap repo'], ['project', 'quiero ver el roadmap project'], ['del repo', 'quiero ver el roadmap del repo'], ['de unknown', 'quiero ver el roadmap de widget'], ['delante', 'ponme el roadmap delante']]) assert.equal(as('roadmap', raw).status, 'none', word)
  // an image word needs an image file, plurals included
  assert.equal(ground({ verb: 'open', target: 'sunset', raw: 'quiero ver las fotos sunset' }, { ...env, index: kindIndex, source: 'model' }).target.value, '/Users/me/Pictures/sunset.png')
  assert.equal(ground({ verb: 'open', target: 'syntax', raw: 'quiero ver las fotos syntax' }, { ...env, index: kindIndex, source: 'model' }).status, 'none')
  assert.equal(value('captura 2026-11-05', 'me pasas la captura de 2026-11-05 al portapapeles', 'copy'), '/Users/me/Desktop/captura-2026-11-05.png')
})

test('ground: a known folder before the target scopes the file; so does de <folder>; a target missing from the phrase drops', () => {
  const idx = { ...filesIndex, folders: { ...filesIndex.folders, tessera: '/code/tessera' }, files: [...filesIndex.files, '/code/other/forge.md', '/code/other/syntax.md', '/code/tessera/syntax.md'] }
  const as = (target, raw) => ground({ verb: 'open', target, raw }, { ...env, index: idx, source: 'model' })
  assert.equal(as('forge', 'quiero ver tessera forge').status, 'none') // forge is not under tessera
  assert.equal(as('syntax', 'quiero ver el tessera syntax').target.value, '/code/tessera/syntax.md') // two syntax files, the folder picks one
  assert.equal(as('forge', 'quiero ver el tessera forge').status, 'none')
  assert.equal(as('design', 'quiero ver reflex design').target.value, '/code/reflex/docs/design.md')
  assert.equal(as('reflex design doc', 'put the reflex design doc in finder').target.value, '/code/reflex/docs/design.md')
  assert.equal(as('syntax', 'quiero ver el syntax de reflex').status, 'none') // de <folder> is enforced
  assert.equal(as('syntax', 'quiero ver el syntax de tessera').target.value, '/code/tessera/syntax.md')
  assert.equal(as('roadmap', 'quiero ver el design').status, 'none') // the target is not in the phrase
  assert.equal(as('roadmap', '').target.value, '/code/reflex/docs/roadmap.md') // no phrase, no context to check
})

test('ground: a request word before the target counts only when it is the speaker\'s own', () => {
  const as = raw => ground({ verb: 'open', target: 'roadmap', raw }, { ...env, index: filesIndex, source: 'model' }).target?.value
  const yes = '/code/reflex/docs/roadmap.md'
  for (const raw of ['open the roadmap', 'oye abre el roadmap', 'please open the roadmap', 'quiero abrir el roadmap', 'necesito abrir el roadmap', 'I want to open the roadmap', "I'd like to open the roadmap", "id like to open the roadmap", 'can you open the roadmap', 'could you open the roadmap', 'puedes abrir el roadmap', 'me abres el roadmap', 'porfa abre el roadmap', 'quiero que abras el roadmap', 'i want the roadmap', 'dónde está el roadmap', 'bring up the roadmap', 'let me see the roadmap']) assert.equal(as(raw), yes, raw)
  for (const raw of ['can Ana open the syntax roadmap', 'Ana wants to open the roadmap', 'quiero ver abre roadmap', 'tell Ana to open the roadmap', 'ella abre el roadmap', 'i open the roadmap', 'they want to see the roadmap', 'the team want to see the roadmap', 'you need to open the roadmap', 'Ana me abre el roadmap']) assert.equal(as(raw), undefined, raw)
})

test('placeVerb: the clipboard forms all mean copy', () => {
  for (const phrase of ['copy the roadmap file on my clipboard', 'put it to my clipboard', 'put it in the clipboard', 'ponlo en mi portapapeles', 'ponlo en el portapapeles', 'pasamelo al portapapeles', 'copy it to the clipboard']) assert.equal(placeVerb(phrase), 'copy', phrase)
  for (const phrase of ['put it on my desk', 'clipboard history', 'on the clipboardx']) assert.equal(placeVerb(phrase), undefined, phrase)
})
