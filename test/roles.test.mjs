import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { loadConfig } from '../src/config.mjs'
import { ground } from '../src/ground.mjs'
import { defaultHandlers, needsRefresh } from '../src/index.mjs'
import { plan } from '../src/plan.mjs'
import { ROLES, resolveRole, roleOf } from '../src/roles.mjs'

const base = {
  folders: { downloads: '/home/Downloads' },
  apps: {
    'openvpn connect': '/Applications/OpenVPN Connect.app',
    figma: '/Applications/Figma.app',
    calendar: '/System/Applications/Calendar.app',
    mail: '/System/Applications/Mail.app',
    notes: '/System/Applications/Notes.app',
  },
  shortcuts: [],
  files: ['/home/Downloads/vpn-meme.png', '/home/Downloads/vpn-speedtest.png'],
}
const config = { aliases: {}, model: {}, roles: {} }
const deps = (index = base, cfg = config) => ({ index, config: cfg, zoxide: () => undefined })
const outcome = ({ status, action, verb }) => status === 'action' ? { status, verb: action.verb, value: action.target.value } : { status, verb }

test('the role table is closed, es/en, and every word names one role', () => {
  assert.deepEqual(Object.keys(ROLES), ['vpn', 'mail', 'calendar', 'browser', 'music', 'notes', 'maps', 'photos', 'contacts', 'messages'])
  const words = Object.values(ROLES).flat()
  assert.equal(new Set(words).size, words.length)
  assert.equal(roleOf('Correo'), 'mail')
  assert.equal(roleOf('música'), 'music')
  assert.equal(roleOf('chat'), undefined)
})

test('resolution order: [roles] table, default handler, the only app holding the word, the system app', () => {
  const index = base
  // (c) the one installed app holding the word
  assert.equal(resolveRole('vpn', { index, config }), '/Applications/OpenVPN Connect.app')
  // (d) the system app
  assert.equal(resolveRole('calendar', { index, config }), '/System/Applications/Calendar.app')
  // (b) the default handler beats (c) and (d)
  const withDefault = { ...index, apps: { ...index.apps, mimestream: '/Applications/Mimestream.app' }, defaults: { mail: '/Applications/Mimestream.app' } }
  assert.equal(resolveRole('mail', { index: withDefault, config }), '/Applications/Mimestream.app')
  // (a) the person's table beats the default; by name or by path
  assert.equal(resolveRole('mail', { index: withDefault, config: { roles: { mail: 'Mail' } } }), '/System/Applications/Mail.app')
  assert.equal(resolveRole('mail', { index: withDefault, config: { roles: { mail: '/System/Applications/Mail.app' } } }), '/System/Applications/Mail.app')
  // a configured app that is not there is no role, never a guess
  assert.equal(resolveRole('vpn', { index, config: { roles: { vpn: 'WireGuard' } } }), undefined)
})

test('two candidates at a step decide nothing, and the later steps are not consulted', () => {
  const two = { ...base, apps: { ...base.apps, 'openvpn connect': '/Applications/OpenVPN Connect.app', 'nord vpn': '/Applications/NordVPN.app' } }
  assert.equal(resolveRole('vpn', { index: two, config }), undefined)
  // a non-system app of that name is not "the system app"
  const third = { ...base, apps: { calendar: '/Applications/Calendar.app' } }
  assert.equal(resolveRole('calendar', { index: third, config }), '/Applications/Calendar.app')
  assert.equal(resolveRole('maps', { index: { ...base, apps: { maps: '/Applications/Maps.app' } }, config }), '/Applications/Maps.app')
  assert.equal(resolveRole('music', { index: base, config }), undefined)
})

test('open and show a role word reach the app', async () => {
  for (const phrase of ['show me the vpn', 'open the vpn', 'abre el vpn', 'muéstrame el vpn'])
    assert.deepEqual(outcome(await plan(phrase, deps())), { status: 'action', verb: 'open', value: '/Applications/OpenVPN Connect.app' }, phrase)
  assert.deepEqual(outcome(await plan('muéstrame el calendario', deps())), { status: 'action', verb: 'open', value: '/System/Applications/Calendar.app' })
  assert.deepEqual(outcome(await plan('abre la agenda', deps())), { status: 'action', verb: 'open', value: '/System/Applications/Calendar.app' })
})

test('an alias, then an exact app or folder, then a file of that name, beat a role', async () => {
  const aliased = deps(base, { ...config, aliases: { vpn: 'https://vpn.example.com/' } })
  assert.deepEqual(outcome(await plan('abre el vpn', aliased)), { status: 'action', verb: 'open', value: 'https://vpn.example.com/' })
  const folder = { ...base, folders: { ...base.folders, calendario: '/home/calendario' } }
  assert.deepEqual(outcome(await plan('abre el calendario', deps(folder))), { status: 'action', verb: 'open', value: '/home/calendario' })
  assert.deepEqual(outcome(await plan('show me the notes', deps({ ...base, folders: { notes: '/home/Notes' } }))), { status: 'action', verb: 'reveal', value: '/home/Notes' })
  const file = { ...base, files: [...base.files, '/home/Docs/vpn'] }
  // the files named so (and the two others holding the word) are asked about: no app is brought up
  const asked = await plan('show me the vpn', deps(file))
  assert.equal(asked.status, 'choose')
  assert.ok(asked.candidates.every(target => target.type !== 'app'))
})

test('a kind word, a find and a closing place leave the role out', async () => {
  for (const phrase of ['show me the vpn meme', 'abre la carpeta calendario', 'open the vpn app folder', 'busca vpn', 'find vpn', 'show me the vpn in finder']) {
    const got = await plan(phrase, deps())
    assert.notEqual(got.action?.target.value, '/Applications/OpenVPN Connect.app', phrase)
    assert.notEqual(got.action?.target.value, '/System/Applications/Calendar.app', phrase)
  }
  assert.deepEqual(outcome(await plan('show me the vpn meme', deps())), { status: 'action', verb: 'reveal', value: '/home/Downloads/vpn-meme.png' })
  assert.equal(ground({ verb: 'reveal', target: 'vpn', raw: 'busca vpn' }, { ...deps(), exact: true }).status, 'none')
  assert.notEqual(ground({ verb: 'open', target: 'vpn', kind: 'file' }, deps()).target?.type, 'app')
})

test('quit and hide stay exact-names-only', () => {
  const run = verb => ground({ verb, target: 'vpn' }, { ...deps(), ancestors: () => ['/bin/zsh'] })
  assert.equal(run('quit').status, 'none')
  assert.equal(run('hide').status, 'none')
  assert.equal(ground({ verb: 'quit', target: 'openvpn connect' }, { ...deps(), ancestors: () => ['/bin/zsh'] }).status, 'ok')
})

test('copy never resolves a role', () => {
  assert.notEqual(ground({ verb: 'copy', target: 'vpn' }, deps()).target?.type, 'app')
})

test('on the model path a role stands only when the target is exactly a role word', () => {
  const model = target => ground({ verb: 'open', target, raw: `abre ${target}` }, { ...deps(), source: 'model' })
  assert.equal(model('vpn').target?.value, '/Applications/OpenVPN Connect.app')
  assert.equal(model('vpn client').status, 'none')
  assert.equal(model('vpn app').target?.type, undefined)
})

test('[roles] in config.toml reads app names and paths', () => {
  const dir = mkdtempSync(join(tmpdir(), 'reflex-roles-'))
  const file = join(dir, 'config.toml')
  writeFileSync(file, '[roles]\nvpn = "OpenVPN Connect"\nmail = "/Applications/Mimestream.app"  # my mail\n[aliases]\nx = "https://x.test/"\n')
  const loaded = loadConfig(file)
  assert.deepEqual(loaded.roles, { vpn: 'OpenVPN Connect', mail: '/Applications/Mimestream.app' })
  assert.deepEqual(loadConfig(join(dir, 'none.toml')).roles, {})
})

// ---- review round: a configured role is final, a role word never falls through, defaults tell "failed" from "none"

const withMimestream = { ...base, apps: { ...base.apps, mimestream: '/Applications/Mimestream.app' }, defaults: { mail: null, browser: null } }

test('a [roles] entry is final for the role words, even over an exact app name; an alias or an exact folder still wins', async () => {
  const mine = deps(withMimestream, { ...config, roles: { mail: 'Mimestream' } })
  for (const phrase of ['open mail', 'abre mail', 'abre el correo', 'show me mail'])
    assert.deepEqual(outcome(await plan(phrase, mine)), { status: 'action', verb: 'open', value: '/Applications/Mimestream.app' }, phrase)
  // without the entry an exact app name is the app
  assert.deepEqual(outcome(await plan('open mail', deps(withMimestream))), { status: 'action', verb: 'open', value: '/System/Applications/Mail.app' })
  // the default handler is inferred, not chosen: it does not override an exact app name
  const handler = { ...withMimestream, defaults: { mail: '/Applications/Mimestream.app' } }
  assert.deepEqual(outcome(await plan('open mail', deps(handler))), { status: 'action', verb: 'open', value: '/System/Applications/Mail.app' })
  assert.deepEqual(outcome(await plan('abre el correo', deps(handler))), { status: 'action', verb: 'open', value: '/Applications/Mimestream.app' })
  // alias and exact folder beat the entry
  assert.deepEqual(outcome(await plan('open mail', deps(withMimestream, { ...mine.config, aliases: { mail: 'https://mail.example.com/' } }))), { status: 'action', verb: 'open', value: 'https://mail.example.com/' })
  assert.deepEqual(outcome(await plan('open mail', deps({ ...withMimestream, folders: { mail: '/home/mail' } }, mine.config))), { status: 'action', verb: 'open', value: '/home/mail' })
})

test('a role word never falls through: a missing configured app or two candidates pass to Claude', async () => {
  const missing = deps(base, { ...config, roles: { vpn: 'WireGuard' } })
  const two = deps({ ...base, apps: { ...base.apps, nordvpn: '/Applications/NordVPN.app' } })
  for (const [phrase, d] of [['abre el vpn', missing], ['show me the vpn', missing], ['open the vpn', missing], ['abre el vpn', two], ['show me the vpn', two], ['show me the vpn in finder', deps()]]) {
    const got = await plan(phrase, d)
    assert.equal(got.status, 'pass', phrase)
  }
  // the model's answer meets the same wall
  assert.equal(ground({ verb: 'open', target: 'vpn', raw: 'abre vpn' }, { ...two, source: 'model' }).status, 'none')
})

test('a role with a handler URL whose lookup failed, or is missing (an old cache), passes instead of guessing', async () => {
  const old = { ...base, apps: { ...base.apps, 'google chrome': '/Applications/Google Chrome.app' } } // no `defaults` at all
  for (const phrase of ['abre el correo', 'abre el navegador', 'show me the browser']) assert.equal((await plan(phrase, deps(old))).status, 'pass', phrase)
  // a lookup that answered "no handler" (null) lets the app steps decide
  assert.deepEqual(outcome(await plan('abre el correo', deps({ ...old, defaults: { mail: null } }))), { status: 'action', verb: 'open', value: '/System/Applications/Mail.app' })
  // a role without a handler URL does not need one
  assert.deepEqual(outcome(await plan('abre el vpn', deps(old))), { status: 'action', verb: 'open', value: '/Applications/OpenVPN Connect.app' })
})

test('defaultHandlers keeps "failed" apart from "no handler", and the index is retried when a lookup failed', () => {
  const answers = { 'mailto:someone@example.com': '/Applications/Mimestream.app', 'https://example.com': new Error('timed out') }
  const ask = url => { const answer = answers[url]; if (answer instanceof Error) throw answer; return answer }
  assert.deepEqual(defaultHandlers(ask), { defaults: { mail: '/Applications/Mimestream.app' }, complete: false })
  assert.deepEqual(defaultHandlers(() => ''), { defaults: { mail: null, browser: null }, complete: true })
  assert.deepEqual(defaultHandlers(() => '/x/Thing.app'), { defaults: { mail: '/x/Thing.app', browser: '/x/Thing.app' }, complete: true })
  const fresh = { builtAt: 1000, defaults: {}, defaultsComplete: true }
  assert.equal(needsRefresh(fresh, 1000 + 1000), false)
  assert.equal(needsRefresh(fresh, 1000 + 11 * 60 * 1000), true)
  assert.equal(needsRefresh({ ...fresh, defaultsComplete: false }, 1001), true)
  assert.equal(needsRefresh({ builtAt: 1000 }, 1001), true) // an old cache without defaults
})
