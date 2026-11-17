// Edges of slice 2 that need their own world: forges, the exam commands end to end, and the real disk readers.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fakeDeps } from '../src/eval.mjs'
import { plan } from '../src/plan.mjs'
import { webUrl } from '../src/remote.mjs'
import { listing, remoteOf } from '../src/world.mjs'

const index = {
  folders: { brand: '/code/brand', 'alfa-site': '/code/alfa-site' },
  apps: {},
  shortcuts: [],
  files: ['/Users/me/Desktop/alfa-site', '/Users/me/Documents/alfa-site'],
}
const SHOTS = '/Users/me/Screenshots'
const world = { listings: { [SHOTS]: [{ name: 'a.png', mtimeMs: 5 }] }, screenshots: { dir: SHOTS }, remotes: { '/code/brand': 'git@github.com:owner/brand.git' } }
const got = async (phrase, { files, remote } = {}) => {
  const found = await plan(phrase, {
    index: { ...index, folders: files ? {} : index.folders, files: files ?? index.files }, config: { aliases: {}, model: {} }, env: {}, zoxide: () => undefined,
    ...fakeDeps({ ...world, remotes: { '/code/brand': remote ?? world.remotes['/code/brand'] } }),
  })
  return found.status === 'action' ? `${found.action.verb} ${found.action.target.type} ${found.action.target.value}` : found.status
}

test('web: a named forge is held to the origin: GitHub Enterprise is GitHub, a Bitbucket origin is not GitLab', async () => {
  assert.equal(await got('abre brand en GitHub', { remote: 'git@github.mycorp.com:team/brand.git' }), 'open url https://github.mycorp.com/team/brand')
  assert.equal(await got('abre brand en GitLab', { remote: 'git@gitlab.mycorp.com:team/brand.git' }), 'open url https://gitlab.mycorp.com/team/brand')
  assert.equal(await got('abre brand en GitLab', { remote: 'git@code.mycorp.com:team/brand.git' }), 'open url https://code.mycorp.com/team/brand')
  assert.equal(await got('abre brand en GitLab', { remote: 'git@bitbucket.org:team/brand.git' }), 'pass')
  assert.equal(await got('abre brand en GitLab', { remote: 'git@github.com:team/brand.git' }), 'pass')
  assert.equal(await got('abre brand en GitHub', { remote: 'git@code.mycorp.com:team/brand.git' }), 'pass')
  assert.equal(await got('abre brand en el navegador', { remote: 'git@bitbucket.org:team/brand.git' }), 'open url https://bitbucket.org/team/brand')
  assert.equal(await got('abre brand en el navegador', { remote: 'git@ssh.dev.azure.com:v3/org/proj/brand' }), 'pass')
  assert.equal(await got('abre brand en el navegador', { remote: '/srv/git/brand.git' }), 'pass')
})

test('web: several folders that fit the words are not turned into pages', async () => {
  // real folders, so both are folder candidates: without the web page in the phrase this is a question
  const root = mkdtempSync(join(tmpdir(), 'reflex-twins-'))
  const twins = ['a', 'b'].map(name => join(root, name, 'alfa-site'))
  for (const twin of twins) mkdirSync(twin, { recursive: true })
  assert.equal(await got('abre alfa-site', { files: twins }), 'choose')
  assert.equal(await got('abre alfa-site en GitHub', { files: twins }), 'pass')
})

test('webUrl: an http remote on a port cannot be upgraded', () => {
  assert.equal(webUrl('http://git.example.org:8080/group/repo.git').url, undefined)
  assert.equal(webUrl('http://git.example.org/group/repo.git').url, 'https://git.example.org/group/repo')
})

test('latest: a place that asks for another verb than the one typed is not guessed', async () => {
  assert.equal(await got('muestra la última captura al portapapeles'), 'pass')
  assert.equal(await got('copia la última captura en el finder'), 'pass')
  assert.equal(await got('abre la última captura al portapapeles'), `copy file ${SHOTS}/a.png`)
})

test('the exam commands run on the fake disk and their long reports are not cut off', () => {
  const cli = args => spawnSync(process.execPath, [new URL('../src/cli.mjs', import.meta.url).pathname, 'eval', '--json', ...args], { encoding: 'utf8', env: { ...process.env, REFLEX_CONFIG: '/nonexistent/none.toml' }, maxBuffer: 1 << 26 })
  const own = JSON.parse(cli([]).stdout)
  assert.equal(own.summary.total, own.results.length)
  assert.ok(own.summary.total > 380)
  assert.equal(own.summary.wrong, 0)
  for (const tag of ['latest', 'web', 'path', 'find']) assert.ok(own.results.some(r => r.tags.includes(tag) && r.outcome === 'right'), tag)
  const foreign = JSON.parse(cli(['--index', new URL('./phrases/foreign/index.json', import.meta.url).pathname, new URL('./phrases/foreign/phrases.jsonl', import.meta.url).pathname]).stdout)
  assert.equal(foreign.summary.wrong, 0)
  for (const tag of ['latest', 'web', 'path', 'find']) assert.ok(foreign.results.some(r => r.tags.includes(tag) && r.outcome === 'right'), tag)
  assert.ok(readFileSync(new URL('./phrases/heldout.jsonl', import.meta.url), 'utf8').length > 0)
})

test('the real disk readers: a folder\'s regular files, and the origin of a folder that is itself a checkout', () => {
  const dir = mkdtempSync(join(tmpdir(), 'reflex-world-'))
  writeFileSync(join(dir, 'a.txt'), 'x')
  mkdirSync(join(dir, 'sub'))
  const listed = listing(dir).sort((a, b) => a.name.localeCompare(b.name))
  assert.deepEqual(listed.map(f => [f.name, f.isDir]), [['a.txt', undefined], ['sub', true]])
  assert.ok(listed[0].mtimeMs > 0)
  assert.throws(() => listing(join(dir, 'missing')))
  const run = (...args) => execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' })
  assert.equal(remoteOf(dir), undefined)
  run('init', '-q')
  assert.equal(remoteOf(dir), undefined)
  run('remote', 'add', 'origin', 'git@github.com:owner/repo.git')
  assert.equal(remoteOf(dir), 'git@github.com:owner/repo.git')
  // a folder inside a checkout is not the checkout: no borrowed origin
  assert.equal(remoteOf(join(dir, 'sub')), undefined)
})
