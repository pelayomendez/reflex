// What Claude showed besides writing: images it looked at, the files and folders its reply named, and «the folder» / «them».
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pathsIn, viewedPath, record, recordItem, validEntry, fileEntry, dirEntry } from '../src/recent.mjs'
import { mentionedIn, resolveDeictic } from '../src/context.mjs'

const NOW = 1_800_000_000_000
const fakeStat = tree => path => tree[path] === 'dir' ? { isFile: () => false, isDirectory: () => true } : tree[path] === 'file' ? { isFile: () => true, isDirectory: () => false } : undefined

test('pathsIn: absolute and ~/ paths in a reply, once each, never part of a web address', () => {
  assert.deepEqual(pathsIn('All nine are in `/w/art/candidates/`, see ~/Docs/x.pdf. Or https://a.dev/w/x and a/b.'), ['/w/art/candidates/', '~/Docs/x.pdf'])
  assert.deepEqual(pathsIn('twice /w/a.png and /w/a.png'), ['/w/a.png'])
  assert.deepEqual(pathsIn(undefined), [])
})

test('viewedPath: an image, a PDF or a document read is kept; code is not', () => {
  assert.equal(viewedPath({ file_path: '/w/a.PNG' }), '/w/a.PNG')
  assert.equal(viewedPath({ file_path: '/w/brief.pdf' }), '/w/brief.pdf')
  assert.equal(viewedPath({ file_path: '/w/app.ts' }), undefined)
  assert.equal(viewedPath({ file_path: '/w/png' }), undefined)
})

test('a folder entry is valid, but never a file for «it»', () => {
  const list = record([], '/w/art', NOW, undefined, { dir: true })
  assert.deepEqual(list, [{ path: '/w/art', at: NOW, dir: true }])
  assert.ok(validEntry(list[0]) && dirEntry(list[0]) && !fileEntry(list[0]))
  assert.equal(validEntry({ path: '/w', at: 1, dir: 'yes' }), false)
  assert.deepEqual(recordItem([], { path: '/w/art', dir: true }, NOW), list)
})

test('mentionedIn: documents, images and folders below home; never code, home itself or what is not there', () => {
  const stat = fakeStat({ '/h/art/candidates': 'dir', '/h/art/candidates/a.png': 'file', '/h/src/app.ts': 'file', '/h': 'dir', '/etc': 'dir' })
  assert.deepEqual(mentionedIn(['/h/art/candidates/', '~/art/candidates/a.png', '/h/src/app.ts', '/h', '/etc', '/h/gone.pdf'], { stat, home: '/h' }),
    [{ path: '/h/art/candidates', dir: true }, { path: '/h/art/candidates/a.png' }])
})

test('«the folder», «them»: the folder Claude named, or the one holding what it showed', () => {
  const dir = { path: '/tmp', at: NOW - 60_000, dir: true }
  const two = [{ path: '/tmp/a.png', at: NOW - 90_000 }, { path: '/tmp/b.png', at: NOW - 90_000 }]
  for (const phrase of ['open the folder', 'abre la carpeta', 'open them', 'ábrelos'])
    assert.equal(resolveDeictic(phrase, [dir, ...two], { now: NOW }).action.target.value, '/tmp', phrase)
  assert.equal(resolveDeictic('open them', two, { now: NOW }).action.target.value, '/tmp')
  // «it» with two images shown together is not for reflex to guess
  assert.equal(resolveDeictic('open it', [dir, ...two], { now: NOW, isFile: () => true }).status, 'pass')
  // two folders named close together: pass
  assert.equal(resolveDeictic('open the folder', [dir, { path: '/var', at: NOW - 30_000, dir: true }], { now: NOW }).status, 'pass')
  // nothing fresh: pass
  assert.equal(resolveDeictic('open the folder', [{ ...dir, at: NOW - 3_600_000 }], { now: NOW }).status, 'pass')
  assert.equal(resolveDeictic('open the folder', [], { now: NOW }).status, 'pass')
  // more words than the template: Claude's
  assert.equal(resolveDeictic('open them with preview', [dir], { now: NOW }).status, 'pass')
  // a folder named outright is not pointing
  assert.equal(resolveDeictic('open the folder brand', [dir], { now: NOW }), undefined)
})

test('review: an app or package folder never opens; the newer of folder and file wins; «it» refuses beside a newer folder', () => {
  const stat = path => path.endsWith('.app') || path.endsWith('/x') ? { isFile: () => false, isDirectory: () => true } : undefined
  assert.deepEqual(mentionedIn(['/h/Applications/Foo.app', '/tmp/a/b/Foo.app', '/h/Library/Keychains', '/h/.ssh/x'], { stat, home: '/h' }), [])
  assert.equal(resolveDeictic('open the folder', [{ path: '/tmp/x/Foo.app/icon.png', at: NOW - 1000 }], { now: NOW, isDir: () => true }).status, 'pass')
  // a folder named 25 min ago, a file written now in another folder: the file's folder
  const got = resolveDeictic('open the folder', [{ path: '/w/b/doc.md', at: NOW - 1000 }, { path: '/w/a', at: NOW - 25 * 60_000, dir: true }], { now: NOW, isDir: () => true })
  assert.equal(got.action.target.value, '/w/b')
  // a folder named now, a png read 10 minutes ago: «it» is not for reflex to guess
  assert.equal(resolveDeictic('open it', [{ path: '/w/a', at: NOW - 1000, dir: true }, { path: '/w/p.png', at: NOW - 600_000 }], { now: NOW, isFile: () => true }).status, 'pass')
  // «my folder» is Claude's
  assert.equal(resolveDeictic('open my folder', [{ path: '/w/a', at: NOW - 1000, dir: true }], { now: NOW, isDir: () => true }).status, 'pass')
})
