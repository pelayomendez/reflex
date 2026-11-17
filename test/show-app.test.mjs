import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parse } from '../src/phrase.mjs'
import { plan } from '../src/plan.mjs'

// "show me the calendar" with a Calendar app, a "Calendar 2031" folder and calendar files around it.
const index = {
  folders: { 'calendar 2031': '/home/Documents/Calendar 2031', 'work calendar': '/home/Work Calendar', docs: '/home/Docs' },
  apps: { calendar: '/System/Applications/Calendar.app', figma: '/Applications/Figma.app', notes: '/System/Applications/Notes.app' },
  shortcuts: [],
  files: ['/home/Docs/icons/calendar.svg', '/home/Docs/src/calendar-add.tsx', '/home/Docs/notes.md'],
}
const deps = { index, config: { aliases: {}, model: {} }, zoxide: () => undefined }
const decide = phrase => plan(phrase, deps)
const calendar = { verb: 'open', value: '/System/Applications/Calendar.app' }
const outcome = ({ status, action, verb }) => status === 'action' ? { status, verb: action.verb, value: action.target.value } : { status, verb }

test('"me" after a show verb is the indirect object, not part of the name', () => {
  for (const phrase of ['show me the calendar', 'show me calendar', 'show me el calendar'])
    assert.deepEqual(parse(phrase), { verb: 'reveal', target: 'calendar', kind: undefined, raw: phrase }, phrase)
  // Spanish already folds "me" into the verb
  assert.equal(parse('muéstrame el calendar').target, 'calendar')
  assert.equal(parse('enséñame la calendar').target, 'calendar')
  // "me" alone, or inside a name, is left as it was typed
  assert.equal(parse('show me').reason, 'no target')
  assert.equal(parse('show me.txt').target, 'me.txt')
})

test('an exactly named app beats partial folder and file matches, and show brings it up', async () => {
  for (const phrase of ['show me the calendar', 'show calendar', 'muéstrame el calendar', 'enséñame el calendar', 'muestra la calendar', 'show me the calendar app'])
    assert.deepEqual(outcome(await decide(phrase)), { status: 'action', ...calendar }, phrase)
})

test('an exactly named folder or file keeps the existing behaviour', async () => {
  assert.deepEqual(outcome(await decide('show me calendar 2031')), { status: 'action', verb: 'reveal', value: '/home/Documents/Calendar 2031' })
  assert.deepEqual(outcome(await decide('show me calendar.svg')), { status: 'action', verb: 'reveal', value: '/home/Docs/icons/calendar.svg' })
  // a folder also called "notes" beside the app: not for reflex to pick, so it does what it did before (reveal the folder)
  const twin = await plan('show me notes', { ...deps, index: { ...index, folders: { ...index.folders, notes: '/home/Notes' } } })
  assert.deepEqual(outcome(twin), { status: 'action', verb: 'reveal', value: '/home/Notes' })
  // and so does a file whose whole name is exactly that; a name with an extension ("notes.md", "calendar.svg") is only a partial match
  const file = await plan('show me notes', { ...deps, index: { ...index, files: ['/home/Docs/notes'] } })
  assert.deepEqual(outcome(file), { status: 'action', verb: 'reveal', value: '/home/Docs/notes' })
  assert.deepEqual(outcome(await plan('show me notes', deps)), { status: 'action', verb: 'open', value: '/System/Applications/Notes.app' })
})

test('a closing "in finder" keeps reveal: no app is brought up', async () => {
  for (const phrase of ['show me the calendar in finder', 'muéstrame el calendar en el finder']) {
    const got = await decide(phrase)
    assert.notEqual(got.action?.target.type, 'app', phrase)
    assert.equal(got.action?.verb ?? got.verb, 'reveal', phrase)
  }
})

test('other verbs and unknown names are untouched', async () => {
  assert.deepEqual(outcome(await decide('abre calendar')), { status: 'action', ...calendar })
  assert.deepEqual(outcome(await decide('show me the figma')), { status: 'action', verb: 'open', value: '/Applications/Figma.app' })
  assert.equal((await decide('show me the weather')).status, 'pass')
  // only an exact name: "cal" is a prefix of the app, and reveal never guessed an app from a part
  assert.notEqual((await decide('show me cal')).action?.target.type, 'app')
})
