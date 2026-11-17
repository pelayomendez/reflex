// The optional small model: FunctionGemma (or any model that calls tools) on an OpenAI-compatible
// server, Ollama by default. It only says which catalogue verb a phrase asks for and the words of
// its target; ground() still has to find that target, so the model cannot invent an action.
// The catalogue and the (absent) system message are shared with training: see catalogue.mjs.

import { toolsFor } from './catalogue.mjs'

/** @returns {Promise<{verb: string, target: string} | undefined>} */
// keep_alive asks Ollama to keep the model loaded between phrases (its default unloads it after five
// idle minutes, and the first phrase back then misses while it reloads); other servers ignore it.
export async function askModel(phrase, { url, name, timeoutMs = 2500, keep_alive = '1h' } = {}) {
  if (!url || !name) return undefined
  const tools = toolsFor()
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: name, temperature: 0, keep_alive, tools, messages: [{ role: 'user', content: phrase }] }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok) return undefined
    const call = (await response.json()).choices?.[0]?.message?.tool_calls?.[0]?.function
    if (!call || !tools.some(tool => tool.function.name === call.name)) return undefined
    const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments
    if (typeof args?.target !== 'string' || !args.target.trim()) return undefined
    return { verb: call.name, target: args.target.trim() }
  } catch {
    return undefined
  }
}
