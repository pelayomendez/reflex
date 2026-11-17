// Slice 2 of the smarter CLI layer, at the planner seam with a fake world: the file index, the folders'
// listings (with their mtimes), the screenshot location and each folder's origin remote. Nothing here
// touches the real disk or runs git.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { toolsFor } from '../src/catalogue.mjs'
import { classify, fakeDeps } from '../src/eval.mjs'
import { plan } from '../src/plan.mjs'
import { webUrl } from '../src/remote.mjs'
import { commandsFor, describe } from '../src/run.mjs'

const index = {
  folders: {
    brand: '/code/brand', reflex: '/code/reflex', 'orbit-kit': '/code/orbit-kit', notes: '/code/notes', 'old-site': '/code/old-site', local: '/code/local', mirror: '/code/mirror',
    descargas: '/Users/me/Downloads', downloads: '/Users/me/Downloads', escritorio: '/Users/me/Desktop', desktop: '/Users/me/Desktop', documentos: '/Users/me/Documents',
  },
  apps: {
    cursor: '/Applications/Cursor.app', figma: '/Applications/Figma.app', slack: '/Applications/Slack.app', terminal: '/System/Applications/Utilities/Terminal.app',
  },
  shortcuts: ['Modo foco'],
  files: [
    '/code/reflex/docs/roadmap.md', '/code/reflex/docs/design.md', '/code/reflex/README.md', '/code/brand/README.md', '/code/orbit-kit/README.md',
    '/code/brand/posts/2026-11-06-watchmen.md', '/code/brand/cards/watchmen-post.png', '/code/reflex/src/phrase.mjs',
    '/Users/me/Documents/factura-octubre.pdf', '/Users/me/Documents/contrato-alquiler.pdf', '/code/notes/todo.md',
  ],
}
const SHOTS = '/Users/me/Screenshots'
const world = {
  listings: {
    [SHOTS]: [
      { name: 'Screenshot 2026-11-05 at 10.00.00.png', mtimeMs: 1000 },
      { name: 'Screenshot 2026-11-07 at 09.30.00.png', mtimeMs: 3000 },
      { name: 'Screenshot 2026-11-06 at 18.00.00.png', mtimeMs: 2000 },
      { name: 'notes.txt', mtimeMs: 9000 },
      { name: '.hidden.png', mtimeMs: 9500 },
    ],
    '/Users/me/Downloads': [
      { name: 'informe.pdf', mtimeMs: 5000 },
      { name: 'foto.jpg', mtimeMs: 6000 },
      { name: 'otro.pdf', mtimeMs: 4000 },
      { name: 'partial.zip.crdownload', mtimeMs: 8000 },
      { name: '.DS_Store', mtimeMs: 8500 },
      { name: 'clip.mov', mtimeMs: 5500 },
      { name: 'ticket.pdf', mtimeMs: 7000 },
    ],
    '/Users/me/Desktop': [
      { name: 'wallpaper.png', mtimeMs: 9000 },
      { name: 'Captura de pantalla 2026-11-04 a las 12.00.00.png', mtimeMs: 2500 },
      { name: 'Screenshot 2026-11-03 at 08.00.00.png', mtimeMs: 2000 },
    ],
    '/Users/me/Documents': [{ name: 'plan.pdf', mtimeMs: 100 }, { name: 'plan-b.pdf', mtimeMs: 200 }],
  },
  screenshots: { dir: SHOTS },
  remotes: {
    '/code/brand': 'git@github.com:pelayomendez/brand.git',
    '/code/reflex': 'https://github.com/pelayomendez/reflex.git',
    '/code/orbit-kit': 'git@gitlab.example.com:platform/tools/orbit-kit.git',
    '/code/old-site': 'https://ci-user:s3cret@github.com/pelayomendez/old-site.git',
    '/code/local': '/srv/git/local.git',
    '/code/mirror': 'git@gitlab.com:pelayomendez/mirror.git',
  },
}
const base = { aliases: { linkedin: 'https://www.linkedin.com/feed/' }, model: {} }
const asked = []
const deps = (extra = {}, model) => ({ index, config: { ...base, ...extra.config }, env: {}, zoxide: () => undefined, ...fakeDeps({ ...world, ...extra.world }), askModel: async phrase => { asked.push(phrase); return model }, ...extra.deps })
const decide = (phrase, extra) => plan(phrase, deps(extra))
const got = async (phrase, extra) => {
  const found = await decide(phrase, extra)
  if (found.status === 'choose') return `choose ${found.verb} ${found.candidates.length}`
  if (found.status !== 'action') return found.status
  const { verb, target } = found.action
  return `${verb} ${target.type} ${target.value}`
}
const roadmap = '/code/reflex/docs/roadmap.md'

// -- 1. find a file --------------------------------------------------------------------------------------------

test('find: busca, encuentra, localiza, find and locate reveal the one file whose name is that', async () => {
  for (const phrase of ['busca el roadmap', 'busca roadmap', 'Busca el roadmap, por favor', 'encuentra el roadmap de reflex', 'localiza el roadmap', 'find the roadmap', 'locate roadmap.md', 'find roadmap.md', 'busca el fichero roadmap', 'oye busca el roadmap', '¿puedes buscar el roadmap?', 'por favor encuentra el roadmap'])
    assert.equal(await got(phrase), `reveal file ${roadmap}`, phrase)
  assert.equal(await got('encuentra la factura de octubre'), 'reveal file /Users/me/Documents/factura-octubre.pdf')
  assert.equal(await got('find design.md'), 'reveal file /code/reflex/docs/design.md')
  assert.equal(await got('find phrase'), 'reveal file /code/reflex/src/phrase.mjs')
  assert.equal(await got('busca el contrato de alquiler'), 'reveal file /Users/me/Documents/contrato-alquiler.pdf')
  assert.equal(await got('find the factura de octubre'), 'reveal file /Users/me/Documents/factura-octubre.pdf')
  assert.deepEqual(commandsFor((await decide('busca el roadmap')).action), [['open', '-R', roadmap]])
  assert.equal(describe((await decide('busca el roadmap')).action, 'future'), 'show in Finder roadmap.md')
})

test('find: several files with that name are Claude\'s (no list), a folder is revealed too, none is Claude', async () => {
  assert.equal(await got('busca el readme'), 'pass')
  assert.equal(await got('find the readme'), 'pass')
  assert.equal(await got('busca el fichero readme'), 'pass')
  assert.equal(await got('busca README.md'), 'pass')
  assert.equal(await got('busca el readme de brand'), 'reveal file /code/brand/README.md')
  assert.equal(await got('busca el roadmap en reflex'), `reveal file ${roadmap}`)
  assert.equal(await got('busca brand'), 'reveal folder /code/brand')
  for (const phrase of ['busca el presupuesto', 'find the invoice from march', 'busca roadmap.pdf'])
    assert.equal(await got(phrase), 'pass', phrase)
})

test('find: the same strict grounding as a model answer: the whole name, never a word somewhere in a path', async () => {
  for (const phrase of ['busca road', 'busca map', 'find phras', 'busca el post de watchmen', 'busca watchmen', 'busca el roadmap de brand', 'busca factura', 'busca figma', 'find slack', 'busca modo foco', 'busca linkedin', 'busca la app figma'])
    assert.equal(await got(phrase), 'pass', phrase)
})

test('find: only the whole phrase as a request; talk, negations, compounds, questions about something else go to Claude', async () => {
  const phrases = ['busca información sobre el roadmap', 'busca el bug en el login de slack', 'find the bug in the roadmap', 'no busques el roadmap', "don't find the roadmap", 'busca el roadmap y ábrelo', 'busca el roadmap, luego bórralo', 'find the roadmap and delete it',
    '\\busca el roadmap', 'busca el roadmap no funciona', 'busco el roadmap', 'ya busqué el roadmap', 'cuando busco el roadmap falla', 'why find the roadmap', 'busca', 'find', 'busca el', 'busca en el roadmap la palabra foco', 'encuentra la causa del roadmap', 'busca el roadmap en el finder', 'find roadmap.md in finder']
  for (const phrase of phrases) assert.equal(await got(phrase), 'pass', phrase)
  // "¿dónde está …?" keeps its way: the model's, with the same grounding (templates leave it alone)
  assert.equal(await got('¿dónde está el roadmap de reflex?'), 'pass')
})

test('find: with a modifier the verb is not an open, so a wrong-kind combination passes', async () => {
  for (const phrase of ['busca el roadmap en Cursor', 'find the roadmap in the terminal', 'busca brand en GitHub', 'find reflex on github', 'busca el roadmap al portapapeles', 'busca el roadmap en la línea 4 en Cursor'])
    assert.equal(await got(phrase, { config: { editor: { app: 'Cursor' } } }), 'pass', phrase)
})

test('find: a model answer for "dónde está" still reveals, and the model is still asked for a find the templates miss', async () => {
  asked.length = 0
  const withModel = answer => ({ ...deps({}, answer), config: { ...base, model: { url: 'http://x', name: 'm' } } })
  const where = await plan('¿dónde está el roadmap de reflex?', withModel({ verb: 'reveal', target: 'roadmap de reflex' }))
  assert.deepEqual([where.step, where.action.verb, where.action.target.value], ['model', 'reveal', roadmap])
  await plan('busca el presupuesto', withModel(undefined))
  assert.deepEqual(asked, ['¿dónde está el roadmap de reflex?', 'busca el presupuesto'])
})

// -- 2. newest of a kind ---------------------------------------------------------------------------------------

test('latest: the newest screenshot in the screenshot location, for open, reveal and copy', async () => {
  const newest = `${SHOTS}/Screenshot 2026-11-07 at 09.30.00.png`
  assert.equal(await got('abre la última captura'), `open file ${newest}`)
  assert.equal(await got('open my latest screenshot'), `open file ${newest}`)
  for (const phrase of ['abre la ultima captura', 'abre mi última captura', 'abre la última captura de pantalla', 'abre la captura más reciente', 'open the last screenshot', 'open the most recent screenshot', 'ábreme la última captura, por favor', 'open my latest screenshot please', 'oye abre la última captura'])
    assert.equal(await got(phrase), `open file ${newest}`, phrase)
  assert.equal(await got('muestra la última captura'), `reveal file ${newest}`)
  assert.equal(await got('show my latest screenshot in finder'), `reveal file ${newest}`)
  assert.equal(await got('copia la última captura'), `copy file ${newest}`)
  assert.equal(await got('copia la última captura al portapapeles'), `copy file ${newest}`)
  assert.equal(await got('copy my last screenshot to the clipboard'), `copy file ${newest}`)
  // a place that names another verb makes that the verb, as for any other open
  assert.equal(await got('abre la última captura en el finder'), `reveal file ${newest}`)
  assert.deepEqual(commandsFor((await decide('muestra la última captura')).action), [['open', '-R', newest]])
  assert.equal(commandsFor((await decide('copia la última captura')).action)[0][0], 'osascript')
  assert.match(describe((await decide('abre la última captura')).action, 'future'), /^open Screenshot 2026-11-07 at 09\.30\.00\.png$/)
})

test('latest: without a screenshot location set, Desktop, and only files named like screenshots there', async () => {
  const noLocation = { world: { screenshots: {} } }
  assert.equal(await got('abre la última captura', noLocation), 'open file /Users/me/Desktop/Captura de pantalla 2026-11-04 a las 12.00.00.png')
  // a custom file-name prefix the person set is a screenshot name too
  const named = { world: { screenshots: { prefix: 'Pantallazo' }, listings: { ...world.listings, '/Users/me/Desktop': [{ name: 'Pantallazo 1.png', mtimeMs: 10 }, { name: 'wallpaper.png', mtimeMs: 99 }] } } }
  assert.equal(await got('abre la última captura', named), 'open file /Users/me/Desktop/Pantallazo 1.png')
  // nothing that looks like a screenshot on the Desktop: Claude, not the wallpaper
  const none = { world: { screenshots: {}, listings: { '/Users/me/Desktop': [{ name: 'wallpaper.png', mtimeMs: 9 }] } } }
  assert.equal(await got('abre la última captura', none), 'pass')
  // a location that is a folder of its own holds screenshots only: any image there counts
  const own = { world: { listings: { [SHOTS]: [{ name: 'a.png', mtimeMs: 1 }, { name: 'b.jpg', mtimeMs: 2 }] } } }
  assert.equal(await got('abre la última captura', own), `open file ${SHOTS}/b.jpg`)
})

test('latest: downloads, and pdf, image or video of a stated place, by mtime and without partial downloads or hidden files', async () => {
  assert.equal(await got('muestra la última descarga'), 'reveal file /Users/me/Downloads/ticket.pdf')
  assert.equal(await got('open my latest download'), 'open file /Users/me/Downloads/ticket.pdf')
  assert.equal(await got('copia la última descarga'), 'copy file /Users/me/Downloads/ticket.pdf')
  assert.equal(await got('abre el último pdf de descargas'), 'open file /Users/me/Downloads/ticket.pdf')
  assert.equal(await got('abre el último pdf de la carpeta descargas'), 'open file /Users/me/Downloads/ticket.pdf')
  assert.equal(await got('open the latest pdf in downloads'), 'open file /Users/me/Downloads/ticket.pdf')
  assert.equal(await got('abre el último pdf del escritorio'), 'pass')
  assert.equal(await got('abre la última imagen de descargas'), 'open file /Users/me/Downloads/foto.jpg')
  assert.equal(await got('open my latest image from downloads'), 'open file /Users/me/Downloads/foto.jpg')
  assert.equal(await got('abre el último vídeo de descargas'), 'open file /Users/me/Downloads/clip.mov')
  assert.equal(await got('open the latest video in downloads'), 'open file /Users/me/Downloads/clip.mov')
  assert.equal(await got('muestra el último pdf de documentos'), 'reveal file /Users/me/Documents/plan-b.pdf')
  assert.equal(await got('copia el último pdf de descargas'), 'copy file /Users/me/Downloads/ticket.pdf')
  assert.equal(await got('copia el último pdf de descargas al portapapeles'), 'copy file /Users/me/Downloads/ticket.pdf')
})

test('latest: a kind with no place to look, a place that contradicts the kind, nothing there, a tie or an unknown kind is Claude', async () => {
  const phrases = ['abre el último pdf', 'open my latest image', 'abre la última imagen', 'abre el último vídeo', 'abre la última captura de descargas', 'abre la última descarga de documentos', 'open my latest screenshot in downloads',
    'abre la última cosa', 'abre la última reunión', 'abre el último archivo', 'open my last file', 'abre la penúltima captura', 'abre las últimas capturas', 'abre las últimas descargas', 'open my latest screenshots', 'abre el primer pdf de descargas', 'abre el último pdf de nada',
    'el último pdf de descargas', 'la última captura', 'último pdf', 'abre la última captura y bórrala', 'abre la última captura, luego la última descarga', 'no abras la última captura', 'abre la última captura no funciona', 'ya abrí la última captura', 'cuando abro la última captura falla',
    '\\abre la última captura', 'abre la última', 'open my latest', 'cierra la última captura', 'ejecuta la última captura', 'abre la última carpeta de descargas']
  for (const phrase of phrases) assert.equal(await got(phrase), 'pass', phrase)
  assert.equal(await got('abre la última captura', { world: { listings: { [SHOTS]: [] } } }), 'pass')
  assert.equal(await got('abre la última captura', { world: { listings: { [SHOTS]: [{ name: 'a.png', mtimeMs: 5 }, { name: 'b.png', mtimeMs: 5 }] } } }), 'pass')
  assert.equal(await got('abre la última captura', { deps: { listing: () => { throw new Error('EACCES') } } }), 'pass')
})

test('latest: the newest file is read when the plan is made, not remembered', async () => {
  let reads = 0
  const counting = { deps: { listing: dir => { reads++; return world.listings[dir] ?? [] } } }
  await decide('abre brand', counting)
  await decide('busca el roadmap', counting)
  await decide('copia la ruta de brand', counting)
  assert.equal(reads, 0)
  await decide('abre la última captura', counting)
  assert.equal(reads, 1)
  assert.equal(await got('abre la última captura', { world: { listings: { [SHOTS]: [{ name: 'later.png', mtimeMs: 99999 }] } } }), `open file ${SHOTS}/later.png`)
})

test('latest: a file that is really named "última captura" is not taken for the selector', async () => {
  const named = { deps: { index: { ...index, files: [...index.files, '/Users/me/Desktop/ultima-captura.png'] } } }
  assert.equal(await got('abre la última captura', named), 'pass')
})

test('latest: modifiers still apply and a wrong kind passes', async () => {
  const cursor = { config: { editor: { app: 'Cursor' } } }
  for (const phrase of ['abre la última captura en Cursor', 'open my latest screenshot in the editor', 'abre la última descarga en la terminal', 'abre la última captura en GitHub', 'abre la última descarga en el navegador', 'abre el último pdf de descargas en Cursor'])
    assert.equal(await got(phrase, cursor), 'pass', phrase)
  assert.equal(await got('abre la última descarga en el editor', { config: cursor.config, world: { listings: { '/Users/me/Downloads': [{ name: 'notes.md', mtimeMs: 3 }] } } }), 'edit file /Users/me/Downloads/notes.md')
})

// -- 3. copy the path ------------------------------------------------------------------------------------------

test('path: copies the absolute path as text, for a file or a folder, in both languages', async () => {
  assert.equal(await got('copia la ruta de brand'), 'copy text /code/brand')
  assert.equal(await got('copy the path of reflex'), 'copy text /code/reflex')
  for (const phrase of ['copia la ruta del roadmap de reflex', 'copia la ruta de roadmap.md', 'copia la ruta completa del roadmap de reflex', 'copia la ruta absoluta de roadmap.md', 'copia el path del roadmap', 'copy the path of roadmap.md', 'copy the full path of roadmap.md', 'copy the absolute path to roadmap.md', 'copy path of the roadmap', 'oye, copia la ruta del roadmap, por favor', 'copiame la ruta del roadmap', 'puedes copiar la ruta del roadmap', 'copia la ruta del roadmap al portapapeles', 'copy the path of the roadmap to the clipboard', 'copia la ruta a roadmap.md', 'copia la ruta del fichero roadmap', 'copia la ruta de la carpeta brand'])
    if (phrase.includes('carpeta brand')) assert.equal(await got(phrase), 'copy text /code/brand', phrase)
    else assert.equal(await got(phrase), `copy text ${roadmap}`, phrase)
  const found = await decide('copia la ruta de brand')
  assert.deepEqual(commandsFor(found.action), [['pbcopy', { stdin: '/code/brand' }]])
  assert.equal(describe(found.action, 'future'), 'copy the path of brand (/code/brand)')
  assert.equal(describe(found.action), 'copied the path of brand (/code/brand)')
})

test('path: copying the file itself is a different thing and stays as it was', async () => {
  assert.equal(await got('copia el roadmap de reflex'), `copy file ${roadmap}`)
  assert.equal(await got('copia roadmap.md'), `copy file ${roadmap}`)
  assert.equal(await got('copy the roadmap'), `copy file ${roadmap}`)
  assert.equal(await got('copia "/code/brand"'), 'copy text /code/brand')
  // the path of a file named like an image does not prefer an image
  assert.equal(await got('copia la ruta de watchmen post'), 'copy text /code/brand/cards/watchmen-post.png')
})

test('path: several files with that name are Claude\'s, like a find', async () => {
  assert.equal(await got('copia la ruta del readme'), 'pass')
  assert.equal(await got('copia la ruta del readme de brand'), 'copy text /code/brand/README.md')
})

test('path: an app, an address, a Shortcut, nothing or another verb is Claude', async () => {
  const phrases = ['copia la ruta de figma', 'copia la ruta de linkedin', 'copia la ruta de modo foco', 'copia la ruta de nada', 'copia la ruta', 'copy the path', 'copia la ruta de', 'copy the path of', 'muestra la ruta de brand', 'abre la ruta de brand', 'show the path of reflex',
    'no copies la ruta de brand', "don't copy the path of reflex", 'copia la ruta de brand y ábrela', 'copy the path of brand and open it', 'copia la ruta de brand, luego ábrela', 'ya copié la ruta de brand', '\\copia la ruta de brand', 'cómo copio la ruta de brand', 'why copy the path of brand',
    'copia la ruta de brand en Cursor', 'copy the path of brand in the terminal', 'copia la ruta de brand en GitHub', 'copia la ruta de brand en el finder', 'copia la ruta de la última captura roja']
  for (const phrase of phrases) assert.equal(await got(phrase), 'pass', phrase)
})

test('path: a file whose name says the same words keeps the phrase for Claude (ambiguous between the two readings)', async () => {
  assert.equal(await got('copia la ruta de notes'), 'copy text /code/notes')
  const named = { deps: { index: { ...index, files: [...index.files, '/code/notes/ruta-de-notes.md'] } } }
  assert.equal(await got('copia la ruta de notes', named), 'pass')
  assert.equal(await got('copia la ruta de brand', named), 'copy text /code/brand')
})

test('path: composes with the newest-of-a-kind selector', async () => {
  assert.equal(await got('copia la ruta de la última captura'), `copy text ${SHOTS}/Screenshot 2026-11-07 at 09.30.00.png`)
  assert.equal(await got('copy the path of my latest download'), 'copy text /Users/me/Downloads/ticket.pdf')
  // a find of the newest one reveals it
  assert.equal(await got('busca la última descarga'), 'reveal file /Users/me/Downloads/ticket.pdf')
  assert.equal(await got('find my latest screenshot'), `reveal file ${SHOTS}/Screenshot 2026-11-07 at 09.30.00.png`)
  assert.equal(await got('busca la última descarga en el finder'), 'pass')
})

// -- 4. repo on the web ----------------------------------------------------------------------------------------

test('web: opens the repo\'s origin as an https address, in Spanish and English, on a named host or "the browser"', async () => {
  assert.equal(await got('abre brand en GitHub'), 'open url https://github.com/pelayomendez/brand')
  assert.equal(await got('open reflex on github'), 'open url https://github.com/pelayomendez/reflex')
  for (const phrase of ['abre el repo de brand en el navegador', 'abre brand en el navegador', 'abre brand en la web', 'abre brand en mi navegador', 'open brand in the browser', 'open brand on the web', 'open the brand repo on github', 'abre el repositorio de brand en GitHub', 'abre la carpeta brand en github', 'Abre brand en GitHub, por favor', '¿puedes abrir brand en GitHub?', 'oye abre brand en github', 'ábreme brand en GitHub'])
    assert.equal(await got(phrase), 'open url https://github.com/pelayomendez/brand', phrase)
  assert.deepEqual(commandsFor((await decide('abre brand en GitHub')).action), [['open', 'https://github.com/pelayomendez/brand']])
  assert.equal(describe((await decide('abre brand en GitHub')).action, 'future'), 'open github.com/pelayomendez/brand')
})

test('web: any host and nested groups; ssh ports and credentials never reach the address', async () => {
  assert.equal(await got('abre orbit-kit en GitLab'), 'open url https://gitlab.example.com/platform/tools/orbit-kit')
  assert.equal(await got('abre orbit-kit en el navegador'), 'open url https://gitlab.example.com/platform/tools/orbit-kit')
  assert.equal(await got('open mirror on gitlab'), 'open url https://gitlab.com/pelayomendez/mirror')
  const found = await decide('abre old-site en GitHub')
  assert.equal(found.action.target.value, 'https://github.com/pelayomendez/old-site')
  assert.ok(!JSON.stringify(found).includes('s3cret'))
})

test('web: a folder without an origin, a named host that is not the origin\'s, or a file, an app or a Shortcut is Claude', async () => {
  const phrases = ['abre notes en GitHub', 'abre descargas en GitHub', 'abre local en el navegador', 'abre brand en GitLab', 'open mirror on github', 'abre reflex en GitLab', 'abre orbit-kit en GitHub', 'abre roadmap.md en GitHub', 'abre figma en el navegador', 'abre figma en GitHub', 'abre modo foco en el navegador', 'abre cursor en la web', 'abre nada en GitHub',
    'abre brand en GitHub y borra la rama', 'abre brand en GitHub, luego en Cursor', 'no abras brand en github', "don't open brand on github", 'abrí brand en GitHub', 'cuando abro brand en GitHub falla', '\\abre brand en GitHub', 'abre brand en GitHub no funciona', 'por qué abre brand en GitHub', 'abre en GitHub', 'abre en el navegador',
    'muestra brand en GitHub', 'copia brand en GitHub', 'muestra brand en la web', 'copy brand on the web', 'cierra brand en GitHub', 'abre brand en GitHub en Cursor', 'abre brand en GitHub en la terminal', 'abre brand en la terminal en GitHub']
  for (const phrase of phrases) assert.equal(await got(phrase, { config: { editor: { app: 'Cursor' } } }), 'pass', phrase)
  assert.equal(await got('abre brand en GitHub', { world: { remotes: { '/code/brand': undefined } } }), 'pass')
})

test('web: the places that open an address still do, and a plain open is untouched', async () => {
  assert.equal(await got('abre linkedin en el navegador'), 'open url https://www.linkedin.com/feed/')
  assert.equal(await got('open github.com/pelayomendez in the browser'), 'open url https://github.com/pelayomendez')
  assert.equal(await got('abre brand'), 'open folder /code/brand')
  assert.equal(await got('abre Figma'), 'open app /Applications/Figma.app')
  assert.equal(await got('abre linkedin en GitHub'), 'pass')
})

test('web: the model sees the phrase without the place and its answer is held to the same rules', async () => {
  asked.length = 0
  const withModel = answer => ({ ...deps({}, answer), config: { ...base, model: { url: 'http://x', name: 'm' } } })
  const opened = await plan('¿me abres brand en github?', withModel({ verb: 'open', target: 'brand' }))
  assert.equal(opened.step, 'model')
  assert.equal(opened.action.target.value, 'https://github.com/pelayomendez/brand')
  assert.deepEqual(asked, ['¿me abres brand?'])
  assert.equal((await plan('¿me muestras brand en github?', withModel({ verb: 'reveal', target: 'brand' }))).status, 'pass')
  assert.equal((await plan('¿me abres notes en github?', withModel({ verb: 'open', target: 'notes' }))).status, 'pass')
})

test('web: without a git remote reader that exists, nothing is asked of git for other phrases', async () => {
  let asks = 0
  const counting = { deps: { remoteOf: () => { asks++; return undefined } } }
  for (const phrase of ['abre brand', 'busca el roadmap', 'copia la ruta de brand', 'abre la última captura', 'abre roadmap.md en Cursor']) await decide(phrase, counting)
  assert.equal(asks, 0)
  await decide('abre brand en GitHub', counting)
  assert.equal(asks, 1)
})

test('webUrl: origin remotes in every common shape become https addresses, and what is not a web address is refused', () => {
  const ok = (remote, url) => assert.deepEqual(webUrl(remote), { url, host: new URL(url).host }, remote)
  ok('git@github.com:owner/repo.git', 'https://github.com/owner/repo')
  ok('git@github.com:owner/repo', 'https://github.com/owner/repo')
  ok('https://github.com/owner/repo.git', 'https://github.com/owner/repo')
  ok('https://github.com/owner/repo.git/', 'https://github.com/owner/repo')
  ok('https://github.com/owner/repo/', 'https://github.com/owner/repo')
  ok('http://github.com/owner/repo.git', 'https://github.com/owner/repo')
  ok('ssh://git@github.com/owner/repo.git', 'https://github.com/owner/repo')
  ok('ssh://git@gitlab.example.org:2222/group/sub/repo.git', 'https://gitlab.example.org/group/sub/repo')
  ok('git://github.com/owner/repo.git', 'https://github.com/owner/repo')
  ok('https://user:token@gitlab.example.org/group/repo.git', 'https://gitlab.example.org/group/repo')
  ok('https://oauth2:glpat-abc@gitlab.example.org:8443/group/repo.git', 'https://gitlab.example.org:8443/group/repo')
  ok('git@gitlab.example.com:platform/tools/orbit-kit.git', 'https://gitlab.example.com/platform/tools/orbit-kit')
  ok('git@git.internal:team/app.git', 'https://git.internal/team/app')
  ok('  git@github.com:Owner/Repo.With.Dots.git\n', 'https://github.com/Owner/Repo.With.Dots')
  ok('ssh://git@github.com/owner/repo.git.git', 'https://github.com/owner/repo.git')
  ok('git@bitbucket.org:team/repo.git', 'https://bitbucket.org/team/repo')
  for (const remote of ['', '   ', '/srv/git/repo.git', '../repo', 'repo.git', 'file:///srv/git/repo.git', 'git@host:repo.git', 'https://github.com', 'https://github.com/', 'https://github.com/owner', 'git@github.com:', 'ssh.dev.azure.com:v3/org/proj/repo',
    'git@ssh.dev.azure.com:v3/org/proj/repo', 'https://github.com/owner/repo name', 'https://github.com/owner/../repo', 'https://github.com/./repo', 'git@github.com:owner/repo;rm -rf', 'https://github.com/owner/repo?x=1', 'https://github.com/owner/repo#frag', 'ftp://host/owner/repo', 'javascript:alert(1)', 'https://-bad-.com/a/b', 'https://exa mple.com/a/b', 'git@localhost:owner/repo.git', 'https://user@/owner/repo', 'C:\\repos\\app', '~/repos/app', undefined, null, 42])
    assert.equal(webUrl(remote).url, undefined, String(remote))
  assert.equal(typeof webUrl('/srv/git/repo.git').reason, 'string')
})

// -- the exams and the model's catalogue -----------------------------------------------------------------------

test('eval: an expectation may pin the type of the target, which tells a path from the file itself', async () => {
  const path = await decide('copia la ruta de brand')
  const file = await decide('copia roadmap.md')
  assert.equal(classify({ status: 'action', verb: 'copy', value: '/code/brand', type: 'text' }, path), 'right')
  assert.equal(classify({ status: 'action', verb: 'copy', value: '/code/brand', type: 'folder' }, path), 'wrong')
  assert.equal(classify({ status: 'action', verb: 'copy', value: roadmap, type: 'file' }, file), 'right')
  assert.equal(classify({ status: 'action', verb: 'copy', value: roadmap, type: 'text' }, file), 'wrong')
  assert.equal(classify({ status: 'action', verb: 'copy', value: roadmap }, file), 'right')
})

test('eval: the fake world answers for a plan and the real disk is never read', async () => {
  const bare = fakeDeps(undefined)
  assert.deepEqual(bare.listing('/Users/me/Downloads'), [])
  assert.equal(bare.remoteOf('/code/brand'), undefined)
  assert.deepEqual(bare.screenshotLocation(), {})
  const fake = fakeDeps(world)
  assert.equal(fake.listing('/Users/me/Documents').length, 2)
  assert.equal(fake.remoteOf('/code/brand'), 'git@github.com:pelayomendez/brand.git')
  assert.deepEqual(fake.screenshotLocation(), { dir: SHOTS })
})

test('the model\'s catalogue is exactly as it was trained', () => {
  assert.deepEqual(toolsFor().map(t => t.function.name), ['open', 'reveal', 'copy', 'shortcut'])
})
