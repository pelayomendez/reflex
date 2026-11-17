import { expect, test } from 'claude-code/testing'
import { mightBeAction, previewLine } from './preview.ts'
import { LEVEL_LEADS, LOCK, TABLE, VERBS, VOLUME } from '../src/vocab.mjs'

test('only drafts that open with an action word are worth a look', () => {
  for (const text of ['abre brand', 'Ábreme Figma', 'oye, copia esto', 'muéstrame el post', 'open github.com', '¿me abres brand?', 'cierra Slack', '¿me cierras Slack?', 'sal de Spotify', 'quit Slack', 'close Figma', 'terminal en brand', 'busca el roadmap', 'encuentra la factura de octubre', 'find design.md', 'locate the roadmap'])
    expect(mightBeAction(text)).toBe(true)
  // the fixed system phrases (src/system.mjs): the Trash, queries, appearance, displays, saver, hide others, screenshot, Mission Control
  for (const text of ['vacía la papelera', 'empty the trash', '¿puedes vaciar la papelera?', '¿qué batería tengo?', 'por favor, ¿qué batería tengo?', 'how much battery is left', 'espacio en disco', 'vpn status', 'estado de la vpn', 'am I on the vpn', 'activa el modo oscuro', 'pon el modo claro', 'turn off dark mode', 'toggle dark mode', 'apaga la pantalla', 'sleep displays', 'pon el salvapantallas', 'oculta las demás', 'hide other apps', 'haz una captura', 'take a screenshot', 'graba la pantalla', 'abre mission control', 'abre la papelera'])
    expect(mightBeAction(text)).toBe(true)
  for (const text of ['explícame el código', 'fix the bug', 'how much does it cost', 'cuánto cuesta', 'estado del repo', 'empty array handling', 'toggle the sidebar', '\\abre brand', '\\vacía la papelera', ''])
    expect(mightBeAction(text)).toBe(false)
})

test('the line says what Enter will do', () => {
  const folder = { type: 'folder', value: '/Users/p/Development/brand', label: 'brand', via: 'known folders' }
  expect(previewLine({ status: 'action', step: 'template', action: { verb: 'open', target: folder } }, '/Users/p')).toMatch(/^⚡ open ~\/Development\/brand/)
  expect(previewLine({ status: 'choose', step: 'template', verb: 'reveal', candidates: [folder, folder] }, '/Users/p')).toMatch(/2 matches/)
  const app = { type: 'app', value: '/Applications/Slack.app', label: 'Slack', via: 'installed apps' }
  expect(previewLine({ status: 'action', step: 'template', action: { verb: 'quit', target: app } }, '/Users/p')).toMatch(/^⚡ quit Slack /)
  const file = { type: 'file', value: '/Users/p/Development/reflex/docs/roadmap.md', label: 'roadmap.md', via: 'file list' }
  const cursor = { role: 'editor', app: '/Applications/Cursor.app', label: 'Cursor' }
  expect(previewLine({ status: 'action', step: 'template', action: { verb: 'edit', target: file, with: cursor } }, '/Users/p')).toMatch(/^⚡ edit roadmap.md in Cursor /)
  expect(previewLine({ status: 'action', step: 'template', action: { verb: 'edit', target: file, with: { ...cursor, line: 40 } } }, '/Users/p')).toMatch(/^⚡ edit roadmap.md:40 in Cursor /)
  const ghostty = { role: 'terminal', app: '/Applications/Ghostty.app', label: 'Ghostty' }
  expect(previewLine({ status: 'action', step: 'template', action: { verb: 'terminal', target: folder, with: ghostty } }, '/Users/p')).toMatch(/^⚡ terminal in brand \(Ghostty\) /)
  expect(previewLine({ status: 'choose', step: 'template', verb: 'edit', candidates: [file, file], with: cursor }, '/Users/p')).toMatch(/^⚡ edit: 2 matches/)
  const path = { type: 'text', value: '/Users/p/Development/brand', label: 'the path of brand (/Users/p/Development/brand)', via: 'known folders' }
  expect(previewLine({ status: 'action', step: 'template', action: { verb: 'copy', target: path } }, '/Users/p')).toMatch(/^⚡ copy the path of brand \(/)
  const page = { type: 'url', value: 'https://github.com/p/brand', label: 'github.com/p/brand', via: 'origin remote of brand' }
  expect(previewLine({ status: 'action', step: 'template', action: { verb: 'open', target: page } }, '/Users/p')).toMatch(/^⚡ open https:\/\/github.com\/p\/brand /)
  expect(previewLine({ status: 'pass', reason: 'x' }, '/Users/p')).toBe(null)
})

test('the system verbs say what Enter will do, a confirm says it asks, an answer is the line itself', () => {
  const sys = (label: string, value = 'x') => ({ type: 'system', value, label, via: 'system actions' })
  const act = (verb: string, target = sys('x')) => previewLine({ status: 'action', step: 'template', action: { verb, target } }, '/Users/p')
  expect(act('open-trash', sys('the Trash', 'trash'))).toMatch(/^⚡ open the Trash /)
  expect(act('appearance', sys('dark mode', 'dark'))).toMatch(/^⚡ switch to dark mode /)
  expect(act('appearance', sys('dark/light mode', 'toggle'))).toMatch(/^⚡ toggle dark\/light mode /)
  expect(act('sleep-displays')).toMatch(/^⚡ sleep the displays /)
  expect(act('screensaver')).toMatch(/^⚡ start the screen saver /)
  expect(act('hide-others')).toMatch(/^⚡ hide other apps /)
  expect(act('screenshot-toolbar')).toMatch(/^⚡ open the Screenshot toolbar /)
  expect(act('mission-control')).toMatch(/^⚡ open Mission Control /)
  expect(act('lock')).toMatch(/^⚡ lock screen /)
  expect(act('settings', { type: 'settings', value: 'x-apple.systempreferences:a', label: 'Sound', via: 'system actions' })).toMatch(/^⚡ settings: Sound /)
  const confirm = previewLine({ status: 'confirm', step: 'template', action: { verb: 'empty-trash', target: sys('the Trash', 'trash') } }, '/Users/p')
  expect(confirm).toMatch(/^⚡ empty the Trash \(asks first\)/)
  expect(confirm).not.toMatch(/\d+ (items|elementos)/)
  const answer = previewLine({ status: 'answer', step: 'template', action: { verb: 'query', target: sys('battery', 'battery') }, answer: 'Battery: 89%, discharging, 4:59 left' }, '/Users/p')
  expect(answer).toMatch(/^⚡ Battery: 89%, discharging, 4:59 left /)
})

test('the gate lets through every phrase the CLI can act on, as it did not for lock, volume, mute and hide', () => {
  // the phrases this used to drop on the floor
  for (const text of ['bloquea la pantalla', 'bloquea el mac', 'lock screen', 'silencia', 'mute', 'unmute', 'volumen al 30', 'sube el volumen', 'baja el volumen', 'volume 30', 'pon el volumen al 30', 'oculta Slack', 'hide Slack', 'esconde Spotify'])
    expect(mightBeAction(text)).toBe(true)
  // Settings panes and the root, quit, roles, deictic, the terminal modifier, find, newest, the model's request forms
  for (const text of ['ajustes de sonido', 'privacy settings', 'sound settings', 'bluetooth settings', 'configuración de red', 'cierra Slack', 'sal de Spotify', '¿me cierras Slack?', 'abre el correo', 'show me the vpn', 'ábrelo', 'muéstramelo', 'open that doc', 'terminal en brand', 'abre una terminal en brand', 'busca el roadmap', 'abre la última captura', 'llévame a brand', 'put brand in finder', 'dónde está el roadmap', 'oye, copia esto'])
    expect(mightBeAction(text)).toBe(true)
  // drift check: every phrase of the tables, bare and polite
  const phrases = [...TABLE.flatMap(entry => [...entry.es, ...entry.en]), ...Object.values(VOLUME).flatMap(words => [...words.es, ...words.en]),
    ...['es', 'en'].flatMap(lang => LOCK[lang as 'es' | 'en'].verbs.flatMap((verb: string) => LOCK[lang as 'es' | 'en'].objects.map((object: string) => `${verb} ${object}`))),
    ...LEVEL_LEADS.map((lead: string) => `${lead} 30`), ...Object.values(VERBS).flat().map((verb: string) => `${verb} brand`)]
  for (const phrase of phrases) {
    expect([phrase, mightBeAction(phrase)]).toEqual([phrase, true])
    expect([`por favor, ${phrase}`, mightBeAction(`por favor, ${phrase}`)]).toEqual([`por favor, ${phrase}`, true])
  }
  // ...and ordinary prompts to Claude still stay out
  // a bare noun, a sentence that merely holds a request word, a question: Claude's, the CLI is not asked
  for (const text of ['I want to see the stack trace of the failing build', 'go ahead and fix the failing test', 'take a look at the diff', 'find out why this fails', 'el modo oscuro no funciona en el header', 'why does the build go red', 'dark mode', 'modo oscuro', 'screenshot', 'mission control', 'salvapantallas', 'quiero ver el log', 'necesito arreglar el test', 'let me see the output', 've el resultado y dime', 'please take a look'])
    expect([text, mightBeAction(text)]).toEqual([text, false])
  for (const text of ['refactor the parser', 'why does this test fail', 'explícame el código', 'how much does it cost', 'add a battery icon to the header', 'review this diff'])
    expect(mightBeAction(text)).toBe(false)
})
