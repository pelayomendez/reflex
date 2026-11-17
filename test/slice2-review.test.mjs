// Review round for slice 2: what `open` may take of the newest download (an allowlist), folders among the newest,
// a find that never answers a code search, a find by file name with its extension, and refused remotes.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fakeDeps } from '../src/eval.mjs'
import { plan } from '../src/plan.mjs'
import { webUrl } from '../src/remote.mjs'

const index = {
  folders: { brand: '/code/brand', reflex: '/code/reflex', descargas: '/Users/me/Downloads', downloads: '/Users/me/Downloads', escritorio: '/Users/me/Desktop' },
  apps: {},
  shortcuts: [],
  files: [
    '/code/reflex/package.json', '/code/reflex/config.toml', '/code/reflex/src/index.mjs', '/code/reflex/src/main.mjs', '/code/reflex/src/utils.mjs', '/code/reflex/docs/roadmap.md', '/code/reflex/README.md', '/code/brand/README.md',
    '/code/brand/cards/watchmen-post.png', '/code/brand/posts/2026-11-06-watchmen.md', '/Users/me/Documents/factura-octubre.pdf', '/code/brand/config.toml',
  ],
}
const DL = '/Users/me/Downloads'
const newestDownload = (name, extra = {}) => ({ world: { listings: { [DL]: [{ name: 'older.pdf', mtimeMs: 1 }, { name, mtimeMs: 9, ...extra }] } } })
const got = async (phrase, { world = {} } = {}) => {
  const found = await plan(phrase, { index, config: { aliases: {}, model: {} }, env: {}, zoxide: () => undefined, ...fakeDeps(world) })
  return found.status === 'action' ? `${found.action.verb} ${found.action.target.type} ${found.action.target.value}` : found.status
}

test('open takes only documents and media from the newest download; reveal and copy take anything', async () => {
  const opens = ['a.pdf', 'a.PDF', 'a.txt', 'a.md', 'a.rtf', 'a.csv', 'a.docx', 'a.xlsx', 'a.pptx', 'a.pages', 'a.numbers', 'a.key', 'a.png', 'a.jpg', 'a.jpeg', 'a.gif', 'a.webp', 'a.heic', 'a.tiff', 'a.mp3', 'a.m4a', 'a.wav', 'a.mp4', 'a.mov', 'a.mkv', 'a.webm', 'two.dots.pdf']
  for (const name of opens) assert.equal(await got('abre la última descarga', newestDownload(name)), `open file ${DL}/${name}`, name)
  const refuses = ['a.html', 'a.htm', 'a.svg', 'a.webarchive', 'a.zip', 'a.tar.gz', 'a.tgz', 'a.7z', 'a.rar', 'a.dmg', 'a.iso', 'a.mobileconfig', 'a.docm', 'a.xlsm', 'a.pptm', 'a.doc', 'a.xls', 'a.ppt', 'a.js', 'a.sh', 'a.command', 'a.py', 'a.pkg', 'a.exe', 'a.jar', 'a.app', 'a.scpt', 'a.webloc', 'a.terminal', 'a.xml', 'a.json', 'a.plist', 'a.pdf ', 'a.pdf.', 'noextension', 'a.pdf.app', 'a.pdf‮gpj.exe', 'a‮pdf', 'a.pdf\u0000.sh', 'a.pdf\n.sh']
  for (const name of refuses) {
    assert.equal(await got('abre la última descarga', newestDownload(name)), 'pass', JSON.stringify(name))
    if (!name.startsWith('.')) {
      assert.equal(await got('muestra la última descarga', newestDownload(name)), `reveal file ${DL}/${name}`, `reveal ${JSON.stringify(name)}`)
      assert.equal(await got('copia la última descarga', newestDownload(name)), `copy file ${DL}/${name}`, `copy ${JSON.stringify(name)}`)
    }
  }
  // the same holds for the kinds picked by extension and for a screenshot
  assert.equal(await got('abre el último pdf de descargas', { world: { listings: { [DL]: [{ name: 'x.pdf', mtimeMs: 1 }, { name: 'y.pdf ', mtimeMs: 9 }] } } }), `open file ${DL}/x.pdf`)
})

test('the newest download may be a folder: reveal and copy take it, open takes a plain one but never an app or a bundle', async () => {
  const folder = (name, mtimeMs = 9) => ({ world: { listings: { [DL]: [{ name: 'older.pdf', mtimeMs: 1 }, { name, mtimeMs, isDir: true }] } } })
  assert.equal(await got('muestra la última descarga', folder('extraido')), `reveal folder ${DL}/extraido`)
  assert.equal(await got('copia la última descarga', folder('extraido')), `copy folder ${DL}/extraido`)
  assert.equal(await got('abre la última descarga', folder('extraido')), `open folder ${DL}/extraido`)
  assert.equal(await got('abre la última descarga', folder('release v1.2')), `open folder ${DL}/release v1.2`)
  for (const name of ['Tool.app', 'Tool.APP', 'x.pkg', 'x.bundle', 'x.workflow', 'x.prefpane', 'x.saver', 'x.framework', 'x.xcodeproj', 'proj.v2', 'x.pdf', 'x.', 'x.command']) {
    assert.equal(await got('abre la última descarga', folder(name)), 'pass', name)
    assert.equal(await got('muestra la última descarga', folder(name)), `reveal folder ${DL}/${name}`, `reveal ${name}`)
  }
  // a folder is never the newest pdf, image, video or screenshot
  assert.equal(await got('abre el último pdf de descargas', folder('dir.pdf')), `open file ${DL}/older.pdf`)
  assert.equal(await got('abre la última captura', { world: { screenshots: { dir: '/s' }, listings: { '/s': [{ name: 'a.png', mtimeMs: 1 }, { name: 'dir.png', mtimeMs: 9, isDir: true }] } } }), 'open file /s/a.png')
  // a folder that is the newest but hidden, or partial, is skipped like a file
  assert.equal(await got('muestra la última descarga', folder('.git')), `reveal file ${DL}/older.pdf`)
  assert.equal(await got('muestra la última descarga', folder('x.download')), `reveal file ${DL}/older.pdf`)
})

test('find never answers a code search: only a single match, and a bare generic word needs a kind, an extension or a folder', async () => {
  for (const phrase of ['busca tests', 'busca los tests', 'find the config', 'find config', 'find index', 'busca index', 'busca main', 'find the main', 'busca utils', 'locate utils', 'encuentra el index', 'busca config'])
    assert.equal(await got(phrase), 'pass', phrase)
  // a kind word, an extension or a known folder say it is a file
  assert.equal(await got('busca el archivo index'), 'reveal file /code/reflex/src/index.mjs')
  assert.equal(await got('find the file main'), 'reveal file /code/reflex/src/main.mjs')
  assert.equal(await got('find index.mjs'), 'reveal file /code/reflex/src/index.mjs')
  assert.equal(await got('busca el config de reflex'), 'reveal file /code/reflex/config.toml')
  assert.equal(await got('find the utils of reflex'), 'reveal file /code/reflex/src/utils.mjs')
  // a name that says more than a word may act on one match
  assert.equal(await got('busca watchmen-post'), 'reveal file /code/brand/cards/watchmen-post.png')
  assert.equal(await got('encuentra la factura de octubre'), 'reveal file /Users/me/Documents/factura-octubre.pdf')
  assert.equal(await got('busca el roadmap'), 'reveal file /code/reflex/docs/roadmap.md')
  // never a list
  assert.equal(await got('busca config.toml'), 'pass')
  assert.equal(await got('busca el archivo config'), 'pass')
  assert.equal(await got('copia la ruta de utils'), 'pass')
  assert.equal(await got('copia la ruta del archivo utils'), 'copy text /code/reflex/src/utils.mjs')
})

test('find by a name with its extension: the exact file name, when only one file has it', async () => {
  assert.equal(await got('busca watchmen-post.png'), 'reveal file /code/brand/cards/watchmen-post.png')
  assert.equal(await got('busca package.json'), 'reveal file /code/reflex/package.json')
  assert.equal(await got('find the package.json'), 'reveal file /code/reflex/package.json')
  assert.equal(await got('encuentra Package.JSON'), 'reveal file /code/reflex/package.json')
  assert.equal(await got('busca README.md'), 'pass')
  assert.equal(await got('busca config.toml'), 'pass')
  assert.equal(await got('busca watchmen-post.jpg'), 'pass')
  assert.equal(await got('busca package.jsonx'), 'pass')
  assert.equal(await got('busca ackage.json'), 'pass')
  assert.equal(await got('busca el package.json de reflex'), 'reveal file /code/reflex/package.json')
  assert.equal(await got('busca package.json de brand'), 'pass')
  assert.equal(await got('copia la ruta de package.json'), 'copy text /code/reflex/package.json')
})

test('webUrl: only web schemes, and no dot segments in an scp remote', () => {
  for (const remote of ['file://host.com/a/b', 'ftp://host.com/a/b', 'ftps://host.com/a/b', 'git+ssh://host.com/a/b', 'data://host.com/a/b', 'git@host.com:a/../b', 'git@host.com:a/./b', 'git@host.com:../b', 'git@host.com:./b/c', 'git@host.com:a/..'])
    assert.equal(webUrl(remote).url, undefined, remote)
  assert.equal(webUrl('git@host.com:a/b..c').url, 'https://host.com/a/b..c')
})

test('the model cannot bring back a find the rules refused: a generic word, or several matches', async () => {
  for (const [phrase, target] of [['busca tests', 'tests'], ['find the config', 'config'], ['busca utils', 'utils'], ['busca config.toml', 'config.toml']]) {
    const found = await plan(phrase, { index, config: { aliases: {}, model: { url: 'http://x', name: 'm' } }, env: {}, zoxide: () => undefined, ...fakeDeps({}), askModel: async () => ({ verb: 'reveal', target }) })
    assert.equal(found.status, 'pass', phrase)
  }
})
