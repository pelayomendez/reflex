import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { test } from 'node:test'
import { key, readIndexFile } from '../src/index.mjs'

// The invented indexes the public model is taught from. Nothing in them may be a name from the exams
// or from each other: a name shared with an exam would make the exam score meaningless.
const dir = new URL('./phrases/synthetic/', import.meta.url)
const files = readdirSync(dir).filter(name => /^index-.*\.json$/.test(name)).sort()
const HOME_ALIASES = new Set(['descargas', 'downloads', 'escritorio', 'desktop', 'documentos', 'documents', 'imagenes', 'pictures', 'fotos', 'musica', 'music', 'peliculas', 'videos', 'movies', 'inicio', 'home', 'casa', 'aplicaciones', 'applications'])
const namesOf = index => [
  ...Object.keys(index.folders).filter(name => !HOME_ALIASES.has(name)),
  ...Object.keys(index.apps), ...index.shortcuts.map(key), ...index.files.map(path => key(basename(path))),
]

test('three synthetic indexes exist, in the shape loadIndex() returns, with fake /Users paths', () => {
  assert.deepEqual(files, ['index-a.json', 'index-b.json', 'index-c.json'])
  for (const name of files) {
    const index = readIndexFile(new URL(name, dir).pathname)
    assert.ok(Object.keys(index.folders).length >= 40, name)
    assert.ok(Object.keys(index.apps).length >= 20, name)
    assert.equal(index.shortcuts.length, 3, name)
    assert.ok(index.files.length >= 55, name)
    for (const path of [...Object.values(index.folders), ...index.files, ...Object.values(index.apps)]) assert.match(path, /^\/(Users\/[a-z.]+|Applications)(\/|$)/, `${name}: ${path}`)
  }
})

test('no synthetic name appears in another index, the foreign index or any exam phrase', () => {
  const read = name => readIndexFile(new URL(name, dir).pathname)
  const foreign = new Set(namesOf(readIndexFile(new URL('../test/phrases/foreign/index.json', import.meta.url).pathname)))
  const exams = []
  for (const folder of ['', 'foreign/']) for (const name of readdirSync(new URL(`./phrases/${folder}`, import.meta.url)).filter(n => n.endsWith('.jsonl')))
    exams.push(key(readFileSync(new URL(`./phrases/${folder}${name}`, import.meta.url), 'utf8')))
  const examText = exams.join('\n')
  const seen = new Map()
  for (const file of files) for (const name of new Set(namesOf(read(file)))) {
    assert.ok(!foreign.has(name), `${file}: ${name} is in the foreign index`)
    assert.ok(!(name.length >= 4 && examText.includes(name)), `${file}: ${name} is in an exam`)
    assert.ok(!seen.has(name), `${file}: ${name} is also in ${seen.get(name)}`)
    seen.set(name, file)
  }
})
