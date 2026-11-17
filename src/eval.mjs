// The score for every step of reflex: each held-out case goes through plan() and is marked
//   right   — the expected action, or the expected question ("which one?"), or a pass where one was expected
//   wrong   — it acted (or asked) when it should not have, or on a different verb or target
//   missed  — it passed when an action was expected (those phrases go to Claude, which is fine)
//   passed  — a correct pass
// Wrong is the number that matters. Anything that ends up with Claude (a miss or a correct pass)
// is credited to the "claude" step; the others to the step that answered, template or model.

import { performance } from 'node:perf_hooks'
import { plan } from './plan.mjs'

// The fixed clock of an exam's `recent` lists.
const CLOCK = Date.UTC(2026, 10, 13, 12, 0, 0)
const OUTCOMES = ['right', 'wrong', 'missed', 'passed']

// One rule for "choose" (reflex asks "which one?"): wrong means reflex took a phrase away from Claude
// when it should not have, or acted on the wrong thing. So a question where a pass was expected is
// wrong (it interrupts), and a question where an action was expected is missed (nothing runs).
export function classify(expect, got) {
  if (expect.status === 'pass') return got.status === 'pass' ? 'passed' : 'wrong'
  if (got.status === 'pass') return 'missed'
  // A confirm and an answer are what they are: another status, or another verb or target, is a wrong action.
  if (expect.status === 'confirm' || expect.status === 'answer') return got.status === expect.status && got.action.verb === expect.verb && got.action.target.value === expect.value ? 'right' : 'wrong'
  if (got.status === 'confirm' || got.status === 'answer') return 'wrong'
  if (expect.status === 'choose') return got.status === 'choose' ? 'right' : 'wrong'
  if (got.status === 'choose') return 'missed'
  // An expectation may also pin the app and the line a modifier chose ("app": null is the system's text app), and the
  // type of the target: a copied path ("text") and the copied file ("file") have the same value.
  const using = got.action.with
  const same = got.action.verb === expect.verb && got.action.target.value === expect.value
    && (expect.app === undefined || using?.app === expect.app) && (expect.line === undefined || using?.line === expect.line)
    && (expect.type === undefined || got.action.target.type === expect.type)
  return same ? 'right' : 'wrong'
}

/**
 * A fake world for plans that read the disk: `{ listings: { dir: [{ name, mtimeMs }] }, screenshots: { dir, prefix },
 * remotes: { dir: 'the origin as written' } }`. Without data nothing exists, so an exam never reads the Mac it runs on.
 */
export function fakeDeps(data = {}) {
  const { listings = {}, screenshots = {}, remotes = {} } = data
  return {
    listing: dir => (Object.hasOwn(listings, dir) ? listings[dir] : []),
    screenshotLocation: () => screenshots,
    // An exam never asks this Mac how it locks.
    screenLockStatus: () => 'screenLock delay is immediate',
    // ...and never reads it for a query or a Trash count either: with nothing to read, those phrases pass.
    readCommand: () => { throw new Error('an exam does not read this Mac') },
    remoteOf: dir => (Object.hasOwn(remotes, dir) ? remotes[dir] ?? undefined : undefined),
  }
}

export async function evaluate(cases, deps = {}) {
  const results = []
  for (const { phrase, expect, tags = [], recent } of cases) {
    const started = performance.now()
    // A case may carry the files Claude wrote: `recent: [{ path, ago (seconds), missing? }]` against a fixed clock, files
    // existing unless marked missing. Cases without one see no list, exactly as before.
    const context = recent && { recent: recent.map(({ path, ago }) => ({ path, at: CLOCK - ago * 1000 })), now: CLOCK, isFile: path => !recent.some(entry => entry.path === path && entry.missing) }
    const got = await plan(phrase, { zoxide: () => undefined, ...fakeDeps(), ...deps, ...context })
    const ms = performance.now() - started
    results.push({
      phrase, tags, expect, ms,
      outcome: classify(expect, got),
      step: got.status === 'pass' ? 'claude' : got.step,
      got: got.status === 'action' || got.status === 'confirm' || got.status === 'answer' ? { status: got.status, verb: got.action.verb, value: got.action.target.value, type: got.action.target.type, ...(got.action.with && { app: got.action.with.app, line: got.action.with.line }) }
        : got.status === 'choose' ? { status: 'choose', candidates: got.candidates.length } : { status: 'pass', reason: got.reason },
    })
  }
  const empty = () => Object.fromEntries(OUTCOMES.map(name => [name, 0]))
  const summary = { total: results.length, ...empty(), byStep: { template: empty(), model: empty(), claude: empty() } }
  for (const { outcome, step } of results) { summary[outcome]++; summary.byStep[step][outcome]++ }
  const times = results.map(r => r.ms).sort((a, b) => a - b)
  summary.p50 = percentile(times, 50)
  summary.p95 = percentile(times, 95)
  return { results, summary }
}

export function percentile(sorted, p) {
  if (!sorted.length) return 0
  return sorted[Math.min(sorted.length - 1, Math.ceil(p / 100 * sorted.length) - 1)]
}
