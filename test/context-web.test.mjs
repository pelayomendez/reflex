// Session context, second slice: web addresses as recent items, what a Bash call made or showed, and a generic noun with an
// article («the website», «el doc») as a deictic phrase. Expected values are literals written from the design, never recomputed.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'
import { RECENT_CAP, cleanUrl, namesGenericThing, pagesOf, parseRecent, record, recordUrl, resolveDeictic, touchedBy, urlsIn } from '../src/context.mjs'
import { addressOf } from '../src/context.mjs'
import { bashFacts, recordItem } from '../src/recent.mjs'
import { plan } from '../src/plan.mjs'

const NOW = 1_800_000_000_000
const ago = seconds => NOW - seconds * 1000
const W = 'https://ada-demo.github.io/orbit-notes/'
const resolve = (phrase, recent, extra = {}) => resolveDeictic(phrase, recent, { now: NOW, isFile: () => true, ...extra })
const outcome = ({ status, action, reason }) => status === 'action' ? { status, verb: action.verb, type: action.target.type, value: action.target.value } : { status, reason }

test('an address is kept without credentials or fragment, and never with a token in it', () => {
  const kept = [
    ['https://ada-demo.github.io/orbit-notes/', 'https://ada-demo.github.io/orbit-notes/'],
    ['  http://localhost:3000/app  ', 'http://localhost:3000/app'],
    ['https://user:hunter2@example.org/page#section', 'https://example.org/page'],
    ['https://example.org/search?q=cats&page=2', 'https://example.org/search?q=cats&page=2'],
  ]
  for (const [typed, clean] of kept) assert.equal(cleanUrl(typed), clean, typed)
  for (const typed of [
    'https://example.org/a?token=abc', 'https://example.org/a?api_key=abc', 'https://example.org/a?X-Amz-Signature=abc', 'https://example.org/a?access_token=1',
    'https://example.org/a?session=1', 'https://example.org/a?password=1', 'https://example.org/a?auth=1', 'https://example.org/a?t=eyJhbGciOi.payload.sig',
    `https://example.org/a?x=${'a1B2'.repeat(10)}`, 'https://hooks.slack.com/services/T0/B0/xyz', 'https://example.org/api/webhooks/1',
    'ftp://example.org/a', 'javascript:alert(1)', 'file:///etc/passwd', 'example.org/a', 'https://nodot/a', 'https://example.org/$HOME', 'https://example.org/a b', 'https://exa‮mple.org/', '', undefined, 42,
  ]) assert.equal(cleanUrl(typed), undefined, String(typed))
  // a kept address cleans to itself
  for (const [, clean] of kept) assert.equal(cleanUrl(clean), clean)
})

test('the addresses in a reply: each once, trailing punctuation off, unsafe ones left out', () => {
  const reply = 'Published at https://ada-demo.github.io/orbit-notes/. PR: (https://github.com/ada-demo/orbit-notes/pull/42), again https://ada-demo.github.io/orbit-notes/ ' +
    'and [docs](https://ada-demo.github.io/orbit-notes/docs/) but not https://example.org/x?token=abc nor http://localhost:3000/.'
  assert.deepEqual(urlsIn(reply), [W, 'https://github.com/ada-demo/orbit-notes/pull/42', 'https://ada-demo.github.io/orbit-notes/docs/', 'http://localhost:3000/'])
  assert.deepEqual(urlsIn('nothing here'), [])
  assert.deepEqual(urlsIn(undefined), [])
})

test('recording an address: newest first, once, capped per kind, files never pushed out by links', () => {
  let list = []
  list = recordUrl(list, W, 1)
  list = record(list, '/w/a.md', 2)
  list = recordUrl(list, 'https://example.org/x#frag', 3)
  assert.deepEqual(list, [{ url: 'https://example.org/x', at: 3 }, { path: '/w/a.md', at: 2 }, { url: W, at: 1 }])
  list = recordUrl(list, W, 4)
  assert.deepEqual(list.map(entry => entry.url ?? entry.path), [W, 'https://example.org/x', '/w/a.md'])
  for (let n = 0; n < 30; n++) list = recordUrl(list, `https://example.org/p${n}`, 10 + n)
  assert.equal(list.filter(entry => entry.url).length, RECENT_CAP)
  assert.deepEqual(list.filter(entry => entry.path), [{ path: '/w/a.md', at: 2 }])
  assert.equal(list[0].url, 'https://example.org/p29')
  // unsafe: the list is untouched
  assert.equal(recordUrl(list, 'https://example.org/a?token=1', 99), list)
  assert.equal(recordUrl(list, 'ftp://example.org/a', 99), list)
  assert.equal(recordUrl(list, W, NaN), list)
  // an item as the CLI reports it
  assert.deepEqual(recordItem([], { url: W }, 5), [{ url: W, at: 5 }])
  assert.deepEqual(recordItem([], { path: '/w/a.md' }, 5), [{ path: '/w/a.md', at: 5 }])
  assert.deepEqual(recordItem([], { nope: 1 }, 5), [])
})

test('parseRecent keeps files and clean addresses and drops everything else', () => {
  const text = JSON.stringify([
    { path: '/w/a.md', at: 1 }, { url: W, at: 2 }, { url: 'https://user:pw@example.org/', at: 3 }, { url: 'https://example.org/?token=1', at: 4 },
    { url: 'ftp://example.org/', at: 5 }, { url: W }, { path: 'rel.md', at: 6 }, { url: 7, at: 8 },
  ])
  assert.deepEqual(parseRecent(text), [{ path: '/w/a.md', at: 1 }, { url: W, at: 2 }])
})

test('what a command line names: open arguments, output files, redirects, addresses; nothing expanded', () => {
  const facts = bashFacts('cd /w && textutil -convert docx in.html -output ~/out/Brief.docx 2>/dev/null; echo hi > notes.txt && open -a Safari https://ada-demo.github.io/orbit-notes/?a=1 /tmp/a.pdf')
  assert.deepEqual(facts.opened, { paths: ['/tmp/a.pdf'], urls: ['https://ada-demo.github.io/orbit-notes/?a=1'] })
  assert.deepEqual(facts.urls, ['https://ada-demo.github.io/orbit-notes/?a=1'])
  for (const word of ['in.html', '~/out/Brief.docx', 'notes.txt']) assert.ok(facts.named.includes(word), word)
  assert.ok(!facts.named.includes('/dev/null'), 'the target of 2> is a log, not a result')
  assert.ok(!facts.named.includes('-output'))
  // quotes group; --opt=value gives its value; $VAR, globs and subshells are not paths reflex can know
  const quoted = bashFacts('pandoc "my notes.md" --output="Final Draft.docx" -o $OUT *.md `pwd`/x.md')
  assert.ok(quoted.named.includes('my notes.md') && quoted.named.includes('Final Draft.docx'))
  assert.ok(!quoted.named.some(word => /[$*`]/.test(word)))
  // 2>&1 is not a file; &> is a log
  const dup = bashFacts('make 2>&1 | tee build.log; run &> all.log')
  assert.ok(!dup.named.includes('1') && !dup.named.includes('all.log'))
  assert.deepEqual(bashFacts('ls').named, [])
  assert.deepEqual(bashFacts(undefined), { urls: [], opened: { paths: [], urls: [] }, named: [] })
})

test('a finished Bash call made a file only if it exists and was touched during the call', () => {
  const files = new Map([
    ['/w/Brief.docx', { mtimeMs: NOW - 500 }], // made during the call (since = NOW - 2000)
    ['/w/in.html', { mtimeMs: NOW - 90_000 }], // an input: old
    ['/w/shown.pdf', { mtimeMs: NOW - 90_000 }], // old, but an `open` was given it
    ['/home/me/out.md', { mtimeMs: NOW - 100 }],
  ])
  const stat = path => files.has(path) ? { isFile: () => !path.endsWith('/dir'), mtimeMs: files.get(path).mtimeMs } : path === '/w/dir' ? { isFile: () => false, mtimeMs: NOW } : undefined
  const touched = command => touchedBy(command, { cwd: '/w', since: NOW - 2000, now: NOW, stat, home: '/home/me' })
  assert.deepEqual(touched('textutil -convert docx in.html -output Brief.docx'), [{ path: '/w/Brief.docx' }])
  assert.deepEqual(touched('pandoc in.html -o ~/out.md'), [{ path: '/home/me/out.md' }])
  assert.deepEqual(touched('echo x > /w/Brief.docx'), [{ path: '/w/Brief.docx' }])
  assert.deepEqual(touched('open shown.pdf'), [{ path: '/w/shown.pdf' }])
  assert.deepEqual(touched('open -a Safari https://ada-demo.github.io/orbit-notes/'), [{ url: W }])
  assert.deepEqual(touched('curl -s https://ada-demo.github.io/orbit-notes/ -o gone.html'), [{ url: W }])
  // a directory, a missing file, an old one, no cwd for a relative path: nothing
  assert.deepEqual(touched('ls dir missing.txt in.html'), [])
  assert.deepEqual(touchedBy('make Brief.docx', { since: NOW - 2000, now: NOW, stat, home: '/home/me' }), [])
  // after the call's end by more than the slack: not this call's
  assert.deepEqual(touchedBy('x Brief.docx', { cwd: '/w', since: NOW - 9000, now: NOW - 5000, stat, home: '/home/me' }), [])
})

test('which address answers to which noun: a code host is a repo or a PR, never the website', () => {
  const kinds = url => [...addressOf(url).kinds].sort()
  assert.deepEqual(kinds(W), ['link', 'web'])
  assert.deepEqual(kinds('https://orbit-notes.example.org/'), ['link', 'web'])
  assert.deepEqual(kinds('https://orbit-notes.vercel.app/'), ['link', 'web'])
  assert.deepEqual(kinds('http://localhost:3000/'), ['link', 'web'])
  assert.deepEqual(kinds('https://github.com/ada-demo/orbit-notes'), ['link', 'repo'])
  assert.deepEqual(kinds('https://github.com/ada-demo/orbit-notes/pull/42'), ['link', 'pr'])
  assert.deepEqual(kinds('https://github.com/ada-demo/orbit-notes/issues/7'), ['link'])
  assert.deepEqual(kinds('https://gitlab.example.com/platform/tools/orbit-kit'), ['link', 'repo'])
  assert.deepEqual(kinds('https://gitlab.example.com/platform/orbit-kit/-/merge_requests/9'), ['link', 'pr'])
  assert.deepEqual(kinds('https://api.example.org/v1/things'), ['link'])
  assert.deepEqual(kinds('https://raw.githubusercontent.com/ada-demo/orbit-notes/main/a.md'), ['link'])
  assert.deepEqual(kinds('https://registry.npmjs.org/left-pad'), ['link'])
  assert.deepEqual(kinds('https://example.org/data.json'), ['link'])
})

test('the website of a project: its GitHub Pages address, from the repo on this Mac, and only if it has a site', () => {
  const remote = { '/c/orbit-notes': 'git@github.com:Ada-Demo/orbit-notes.git', '/c/ada-demo.github.io': 'https://github.com/ada-demo/ada-demo.github.io.git', '/c/internal': 'git@gitlab.example.com:platform/internal.git', '/c/bare': 'git@github.com:ada-demo/bare.git' }
  const sites = { '/c/orbit-notes': { docsIndex: true }, '/c/ada-demo.github.io': { docsIndex: false, cname: 'ada.example.org\n' }, '/c/internal': { docsIndex: true }, '/c/bare': { docsIndex: false } }
  const pages = dir => pagesOf(dir, { remote: d => remote[d], files: d => sites[d] })
  assert.deepEqual(pages('/c/orbit-notes'), { url: 'https://ada-demo.github.io/orbit-notes/' })
  assert.deepEqual(pages('/c/ada-demo.github.io'), { url: 'https://ada.example.org/' })
  assert.ok(pages('/c/internal').reason, 'not on GitHub')
  assert.ok(pages('/c/bare').reason, 'no site')
  assert.ok(pages('/c/unknown').reason, 'no remote')
  assert.ok(pagesOf('/c/orbit-notes', { remote: () => 'git@github.com:Ada-Demo/orbit-notes.git', files: () => ({ docsIndex: false, cname: 'not a host' }) }).reason, 'a CNAME that is not a host name is no site')
})

const url = (value, seconds) => ({ url: value, at: ago(seconds) })
const file = (path, seconds) => ({ path, at: ago(seconds) })

test('«the website» is the newest web page of the session, from a reply or a command, and nothing else', () => {
  for (const phrase of ['open the website', 'abre la web', 'open this page', 'abre el sitio web', 'open the landing', 'open the web page', 'abre esa web'])
    assert.deepEqual(outcome(resolve(phrase, [url(W, 100)])), { status: 'action', verb: 'open', type: 'url', value: W }, phrase)
  // a code host is not a page; localhost only when nothing else
  assert.equal(resolve('open the website', [url('https://github.com/ada-demo/orbit-notes', 10), url(W, 200)]).action.target.value, W)
  assert.equal(resolve('open the website', [url('http://localhost:3000/', 10), url(W, 900)]).action.target.value, W)
  assert.equal(resolve('open the website', [url('http://localhost:3000/', 10)]).action.target.value, 'http://localhost:3000/')
  assert.equal(resolve('open the website', [url('https://github.com/ada-demo/orbit-notes', 10)]).status, 'pass')
  // two pages close together: which one is not for reflex to guess; far apart or one stale: the newest, if fresh
  assert.equal(resolve('open the website', [url(W, 60), url('https://orbit-notes.example.org/', 120)]).status, 'pass')
  assert.equal(resolve('open the website', [url(W, 60), url('https://orbit-notes.example.org/', 900)]).action.target.value, W)
  assert.equal(resolve('open the website', [url(W, 31 * 60)]).status, 'pass')
  assert.equal(resolve('open the website', []).status, 'pass')
  assert.equal(resolve('open the website', [file('/w/Brief.docx', 10)]).status, 'pass')
  assert.equal(resolve('open the website', [{ url: 'https://example.org/?token=1', at: ago(10) }]).status, 'pass')
  // an address is opened, not shown in Finder; and «it» never means an address
  assert.equal(resolve('show the website', [url(W, 10)]).status, 'pass')
  assert.equal(resolve('open it', [url(W, 10)]).status, 'pass')
  assert.equal(resolve('abre lo último', [url(W, 10)]).status, 'pass')
})

test('«the website of <project>»: an address that names it, else the project\'s Pages address, else Claude', () => {
  const index = { folders: { 'orbit-notes': '/c/orbit-notes', reflex: '/c/reflex' } }
  const extra = { index, remoteOf: dir => ({ '/c/orbit-notes': 'git@github.com:ada-demo/orbit-notes.git', '/c/reflex': 'git@github.com:ada-demo/reflex.git' })[dir], siteFiles: dir => dir === '/c/orbit-notes' ? { docsIndex: true } : { docsIndex: false } }
  const other = url('https://ada-demo.github.io/other-thing/', 20)
  for (const phrase of ['open the website of orbit-notes', 'abre la web de orbit-notes', "open orbit-notes's website", 'open the orbit-notes website', 'abre la web del proyecto orbit-notes'])
    assert.equal(resolve(phrase, [other, url(W, 90)], extra).action.target.value, W, phrase)
  // no session address for it: its Pages address, read off the repo
  assert.equal(resolve('open the website of orbit-notes', [other], extra).action.target.value, 'https://ada-demo.github.io/orbit-notes/')
  // a project with no site: Claude, and never its folder
  for (const phrase of ['open the website of reflex', 'abre la web de reflex', "open reflex's website", 'the website of reflex'.replace(/^/, 'open ')]) {
    const got = resolve(phrase, [other, url(W, 90)], extra)
    assert.equal(got.status, 'pass', phrase)
  }
  // a name nobody knows
  assert.equal(resolve('open the website of nothing-known', [other], extra).status, 'pass')
  // an alias is the person's own word for where it lives
  assert.equal(resolve('abre la web de linkedin', [], { aliases: { linkedin: 'https://www.linkedin.com/feed/' } }).action.target.value, 'https://www.linkedin.com/feed/')
  // the rest of the phrase is a second request: Claude's
  assert.equal(resolve('open the website of orbit-notes and delete it', [url(W, 90)], extra).status, 'pass')
})

test('«the pr», «the repo», «the link»: the newest address of that kind', () => {
  const pr = 'https://github.com/ada-demo/orbit-notes/pull/42', repo = 'https://github.com/ada-demo/orbit-notes'
  assert.equal(resolve('open the pr', [url(pr, 60), url(repo, 50)]).action.target.value, pr)
  assert.equal(resolve('open the pull request', [url(pr, 60)]).action.target.value, pr)
  assert.equal(resolve('abre la pr', [url(pr, 60)]).action.target.value, pr)
  assert.equal(resolve('open the repo', [url(pr, 60), url(repo, 50)]).action.target.value, repo)
  assert.equal(resolve('abre el repo', [url(repo, 60)]).action.target.value, repo)
  assert.equal(resolve('open the pr', [url(repo, 60), url(W, 50)]).status, 'pass')
  assert.equal(resolve('open the repo', [url(W, 60)]).status, 'pass')
  assert.equal(resolve('open the link', [url(W, 60)]).action.target.value, W)
  assert.equal(resolve('abre el enlace', [url(pr, 60)]).action.target.value, pr)
})

test('«the doc», «the article», «the deck»…: the newest file of that kind Claude made, even through a command', () => {
  const docx = '/home/me/work/Brief.docx'
  for (const phrase of ['open the doc', 'open the document', 'open the article', 'open the draft', 'open the report', 'abre el doc', 'abre el artículo', 'abre el borrador', 'abre el informe', 'open this doc'])
    assert.deepEqual(outcome(resolve(phrase, [file(docx, 30)])), { status: 'action', verb: 'open', type: 'file', value: docx }, phrase)
  assert.equal(resolve('show me the doc', [file(docx, 30)]).action.verb, 'reveal')
  // the kind decides, not the newest: a newer image does not answer «the doc»
  assert.equal(resolve('open the doc', [file('/w/a.png', 5), file(docx, 30)]).action.target.value, docx)
  assert.equal(resolve('open the doc', [file('/w/a.png', 5)]).status, 'pass')
  assert.equal(resolve('open the doc', [url(W, 5)]).status, 'pass')
  // same turn, two docs: not for reflex to guess; far apart or stale: the newest if fresh
  assert.equal(resolve('open the doc', [file(docx, 30), file('/w/notes.md', 120)]).status, 'pass')
  assert.equal(resolve('open the doc', [file(docx, 30), file('/w/old.pdf', 3000)]).action.target.value, docx)
  assert.equal(resolve('open the doc', [file(docx, 4000)]).status, 'pass')
  assert.equal(resolve('open the doc', [file(docx, 30)], { isFile: () => false }).status, 'pass')
  // html, svg and the old .doc are shown, never opened (OPENABLE)
  assert.equal(resolve('open the doc', [file('/w/page.html', 5)]).status, 'pass')
  assert.equal(resolve('open the doc', [file('/w/Brief.doc', 5)]).status, 'pass')
  assert.equal(resolve('show the doc', [file('/w/Brief.doc', 5)]).action.verb, 'reveal')
  assert.equal(resolve('open the image', [file('/w/logo.svg', 5)]).status, 'pass')
  const by = (phrase, path) => resolve(phrase, [file(path, 5)])?.action?.target.value
  assert.equal(by('open the deck', '/w/Pitch.pptx'), '/w/Pitch.pptx')
  assert.equal(by('open the slides', '/w/Pitch.key'), '/w/Pitch.key')
  assert.equal(by('open the deck', '/w/Brief.docx'), undefined)
  assert.equal(by('open the spreadsheet', '/w/Budget.xlsx'), '/w/Budget.xlsx')
  assert.equal(by('open the photo', '/w/hero.jpg'), '/w/hero.jpg')
  assert.equal(by('open the video', '/w/demo.mp4'), '/w/demo.mp4')
  assert.equal(by('open the diagram', '/w/flow.png'), '/w/flow.png')
  assert.equal(by('open the pdf', '/w/Brief.pdf'), '/w/Brief.pdf')
  assert.equal(by('open the pdf', '/w/Brief.docx'), undefined)
  assert.equal(by('open the file', '/w/anything.docx'), '/w/anything.docx')
})

test('a noun with an article and more words is Claude\'s; a bare noun and a named folder are not pointing', () => {
  const recent = [url(W, 10), file('/w/Brief.docx', 10)]
  for (const phrase of ['open the website in the browser', 'open the website and delete it', 'abre la web y bórrala', 'open the doc with Pages', 'show the article in finder', 'open the doc, then close it'])
    assert.equal(resolve(phrase, recent).status, 'pass', phrase)
  for (const phrase of ['open website', 'abre docs', 'open the docs folder', 'abre la carpeta docs', 'open the website folder', 'open my documents', 'open the roadmap', 'open the repo reflex', 'abre el post de watchmen'])
    assert.equal(resolve(phrase, recent), undefined, phrase)
})

test('where else a pointer hides: anywhere in a phrase it never becomes a folder or a model\'s guess', () => {
  for (const phrase of ['quiero ver la web', 'take me to the docs', 'llévame a la web de reflex', 'I want to see the website', 'go to the article', 've a reflex site', 'open the doc', 'show me reflex\'s website'])
    assert.equal(namesGenericThing(phrase), true, phrase)
  for (const phrase of ['open website', 'open docs', 'open the docs folder', 'abre brand en la web', 'open brand in the browser', 'open brand on the web', 'quiero ver el estado del PR de brand', 'open the roadmap', 'open my documents', 'abre la carpeta brand', 'go to the settings'])
    assert.equal(namesGenericThing(phrase), false, phrase)
})

test('through plan(): a folder called website, docs or articles and a model that names a project never stand for «the website»', async () => {
  const index = { folders: { website: '/c/orbitdesk/website', docs: '/c/orbitdesk/docs', articles: '/m/Articles', reflex: '/c/reflex' }, apps: {}, shortcuts: [], files: [] }
  let asked = 0
  const model = { url: 'http://model.invalid' }
  const deps = { index, config: { aliases: {}, model }, zoxide: () => undefined, askModel: async () => { asked++; return { verb: 'open', target: 'reflex' } }, remoteOf: () => undefined, siteFiles: () => undefined }
  for (const phrase of ['open the website', 'open the website of reflex', 'abre la web de reflex', 'open the article', 'open the doc', 'open the docs', 'abre los docs', 'llévame a la web de reflex', 'take me to the docs', 'quiero ver la web', 'show me reflex\'s website'])
    assert.equal((await plan(phrase, deps)).status, 'pass', phrase)
  assert.equal(asked, 0, 'the model never saw one')
  // without the article the exact folder still opens, as it always did
  assert.equal((await plan('open website', deps)).action.target.value, '/c/orbitdesk/website')
  assert.equal((await plan('open the website folder', deps)).action.target.value, '/c/orbitdesk/website')
  // and with a session address the same phrase is that address
  const got = await plan('open the website', { ...deps, recent: [url(W, 60)], now: NOW })
  assert.deepEqual(outcome(got), { status: 'action', verb: 'open', type: 'url', value: W })
})

test('the CLI: --recent takes addresses; touched reports what a command made, running nothing', () => {
  const cli = new URL('../src/cli.mjs', import.meta.url).pathname
  const run = (...args) => JSON.parse(execFileSync('node', [cli, ...args], { encoding: 'utf8' }))
  const got = run('--json', '--recent', JSON.stringify([{ url: W, at: Date.now() - 5000 }]), 'open the website')
  assert.deepEqual(outcome(got), { status: 'action', verb: 'open', type: 'url', value: W })
  assert.equal(run('--json', '--recent', JSON.stringify([{ url: 'https://example.org/?token=1', at: Date.now() }]), 'open the website').status, 'pass')
  assert.deepEqual(run('touched', '--since', String(Date.now()), '--cwd', '/', '--', 'curl -s https://ada-demo.github.io/orbit-notes/ -o /definitely/missing.html'), [{ url: W }])
  assert.deepEqual(run('touched', '--since', 'nonsense', '--', 'echo hi'), [])
})
