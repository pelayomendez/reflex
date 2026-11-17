import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEVELOPER_LINE, toolsFor } from '../src/catalogue.mjs'
import { askModel } from '../src/model.mjs'

test('the catalogue has the four verbs, flat string parameters and no enum', () => {
  const tools = toolsFor()
  assert.deepEqual(tools.map(t => t.function.name), ['open', 'reveal', 'copy', 'shortcut'])
  for (const { type, function: fn } of tools) {
    assert.equal(type, 'function')
    assert.ok(fn.description)
    assert.deepEqual(fn.parameters.required, ['target'])
    assert.deepEqual(Object.keys(fn.parameters.properties), ['target'])
    for (const spec of Object.values(fn.parameters.properties)) assert.deepEqual(Object.keys(spec).sort(), ['description', 'type'])
    for (const spec of Object.values(fn.parameters.properties)) assert.equal(spec.type, 'string')
  }
  assert.ok(!JSON.stringify(tools).includes('enum'))
  assert.equal(DEVELOPER_LINE, 'You can do function calling with the following functions:')
})

test('askModel sends the catalogue and no system message', async () => {
  const real = globalThis.fetch
  let body
  globalThis.fetch = async (_url, init) => {
    body = JSON.parse(init.body)
    return { ok: true, json: async () => ({ choices: [{ message: { tool_calls: [{ function: { name: 'open', arguments: { target: 'brand' } } }] } }] }) }
  }
  try {
    const asked = await askModel('¿me abres brand?', { url: 'http://x/v1', name: 'm' })
    assert.deepEqual(asked, { verb: 'open', target: 'brand' })
  } finally { globalThis.fetch = real }
  assert.deepEqual(body.tools, toolsFor())
  assert.deepEqual(body.messages, [{ role: 'user', content: '¿me abres brand?' }])
  assert.equal(body.keep_alive, '1h')
})

test('askModel takes keep_alive from the config', async () => {
  const real = globalThis.fetch
  let body
  globalThis.fetch = async (_url, init) => { body = JSON.parse(init.body); return { ok: false } }
  try { await askModel('abre brand', { url: 'http://x/v1', name: 'm', keep_alive: '8h' }) } finally { globalThis.fetch = real }
  assert.equal(body.keep_alive, '8h')
})
