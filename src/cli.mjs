// reflex "<phrase>"          resolve and run it; exit 3 when it is not an action (it belongs to Claude)
// reflex -n "<phrase>"       show the plan and the commands, run nothing
// reflex --json "<phrase>"   the plan as JSON, run nothing (for plugins and agents)
// reflex --count --json "<phrase>"   as --json, and read the Trash's count from Finder when the phrase is Empty Trash (the hooks do it at Enter only)
// reflex --confirmed <n> "<phrase>"   run a confirmed Empty Trash: only if the Trash still holds no more than n items. Nothing else empties it
// reflex --recent '[{"path":"/abs/file.md","at":1700000000000}]' ...   the files Claude wrote (newest first), so "open it" can mean one
// reflex why "<phrase>"      every step of the decision
// reflex eval [--model] [--json] [--quoted] [--index file] [file]   score the held-out phrases against the fixture (or another Mac's index.json); exit 1 on any wrong action
// reflex teach [--count N] [--out DIR] [--index file] [--print-prompt]   have Claude write the training set (sends index names, never paths or contents)
// reflex learn [--export <file>] [--record <json>]   summarise the local log of what use taught; --export writes validated candidate examples (does not train)
// reflex index               rebuild the list of folders, apps and Shortcuts

import { homedir } from 'node:os'
import { createInterface } from 'node:readline/promises'
import { readFileSync } from 'node:fs'
import { loadConfig } from './config.mjs'
import { parseRecent } from './context.mjs'
import { evaluate, fakeDeps } from './eval.mjs'
import { loadIndex, readIndexFile } from './index.mjs'
import { readTrashCount } from './query.mjs'
import { exportExamples, printLearnSummary, summarise } from './learn.mjs'
import { logPath, readLog, recordEntry } from './learnlog.mjs'
import { plan } from './plan.mjs'
import { batchPlan, printSummary, teach } from './teach.mjs'
import { commandsFor, describe, run } from './run.mjs'

const args = process.argv.slice(2)
const flag = name => { const at = args.indexOf(name); if (at < 0) return false; args.splice(at, 1); return true }
const withModel = args[0] === 'eval' && flag('--model')
const withQuoted = args[0] === 'eval' && flag('--quoted')
const indexAt = args[0] === 'eval' ? args.indexOf('--index') : -1
const indexFile = indexAt >= 0 ? args.splice(indexAt, 2)[1] ?? '' : undefined
const json = flag('--json'), dry = flag('-n') || flag('--dry-run'), pickArg = args.indexOf('--pick')
const pick = pickArg >= 0 ? Number(args.splice(pickArg, 2)[1]) : undefined
const countTrash = flag('--count')
const confirmedAt = args.indexOf('--confirmed')
const confirmedArg = confirmedAt >= 0 ? args.splice(confirmedAt, 2)[1] : undefined
if (confirmedArg !== undefined && !/^[1-9]\d*$/.test(confirmedArg)) { console.error('reflex: --confirmed needs a whole number of items, 1 or more'); process.exit(2) }
const confirmed = confirmedArg === undefined ? undefined : Number(confirmedArg)
// The files Claude wrote this session, from the hooks: [{ path, at }] newest first. The CLI keeps no state of its own.
const recentAt = args.indexOf('--recent')
const recent = recentAt >= 0 ? parseRecent(args.splice(recentAt, 2)[1] ?? '') : undefined

if (args[0] === 'teach') {
  const option = name => { const at = args.indexOf(name); return at < 0 ? undefined : args.splice(at, 2)[1] }
  const printPrompt = flag('--print-prompt')
  if (args.includes('--index') && !args[args.indexOf('--index') + 1]) { console.error('reflex teach: --index needs a file'); process.exit(2) }
  const count = option('--count'), out = option('--out'), teachIndex = option('--index')
  if (count !== undefined && !(Number(count) >= 1)) { console.error('reflex teach: --count needs a positive number'); process.exit(2) }
  let index
  try { index = teachIndex === undefined ? undefined : readIndexFile(teachIndex) } catch (error) { console.error(`reflex teach: ${error.message}`); process.exit(1) }
  if (printPrompt) {
    for (const [at, batch] of batchPlan(index ?? loadIndex(), { count: count ? Number(count) : undefined }).entries())
      console.log(`===== batch ${at + 1}: ${batch.count} examples =====\n${batch.prompt}\n`)
    process.exit(0)
  }
  try {
    const result = await teach({ count: count && Number(count), out, indexFile: teachIndex })
    printSummary(result)
    if (!result.written) { console.error(`reflex teach: nothing was kept, ${result.out} is untouched`); process.exit(1) }
  } catch (error) { console.error(`reflex teach: ${error.message}`); process.exit(1) }
  process.exit(0)
}
if (args[0] === 'learn') {
  const recordAt = args.indexOf('--record')
  if (recordAt >= 0) {
    // From the hooks: silent, and always exit 0 so a logging problem is never seen.
    try { recordEntry(JSON.parse(args[recordAt + 1])) } catch {}
    process.exit(0)
  }
  const at = args.indexOf('--export')
  const file = at >= 0 ? args.splice(at, 2)[1] : undefined
  if (at >= 0 && (!file || file.startsWith('--'))) { console.error('reflex learn: --export needs a file'); process.exit(2) }
  const entries = readLog()
  if (!entries.length) console.log(`nothing logged yet (${logPath()})`)
  else printLearnSummary(summarise(entries))
  if (file) {
    try {
      const result = await exportExamples(entries, file)
      printSummary({ ...result, out: file })
    } catch (error) { console.error(`reflex learn: ${error.message}`); process.exit(1) }
  }
  process.exit(0)
}
if (args[0] === 'index') {
  const index = loadIndex({ refresh: true })
  console.log(`${Object.keys(index.folders).length} folders, ${Object.keys(index.apps).length} apps, ${index.shortcuts.length} Shortcuts`)
  process.exit(0)
}
if (args[0] === 'eval') {
  const code = await runEval(args[1])
  // A pipe is written asynchronously: exiting at once cuts a long --json report off at 64 KB.
  await new Promise(resolve => process.stdout.write('', resolve))
  process.exit(code)
}
const why = args[0] === 'why' && args.length > 1 ? args.shift() : undefined
const phrase = args.join(' ').trim()
if (!phrase) { console.error('usage: reflex [-n|--json] "<phrase>" · reflex why "<phrase>" · reflex index'); process.exit(2) }

const result = await plan(phrase, { recent, ...(countTrash && { countTrash: () => readTrashCount() }) })
if (json) { console.log(JSON.stringify({ ...result, home: homedir() })); process.exit(0) }
if (why) { printWhy(result); process.exit(0) }

if (result.status === 'pass') { console.error(`not an action (${result.reason})`); process.exit(3) }
// A query changes nothing: its answer is the whole result, dry run or not.
if (result.status === 'answer') { console.log(`⚡ ${result.answer}`); process.exit(0) }
let action = result.action
if (result.status === 'confirm') {
  // Only a host that asked and got a yes says --confirmed. Without it nothing runs, and -n never runs anything.
  if (dry) { console.log(`⚡ would ask first, then ${describe(action, 'future')}  (${result.step}, ${action.target.via}); nothing runs`); process.exit(0) }
  if (confirmed === undefined) { console.error(`reflex: "${phrase}" needs a confirmation (${describe(action, 'future')}); run it from Claude Code, where it asks`); process.exit(5) }
  action = { ...action, confirmed }
}
if (result.status === 'choose') {
  const choice = pick ?? (process.stdin.isTTY && !dry ? await ask(result) : undefined)
  if (!choice || !result.candidates[choice - 1]) {
    result.candidates.forEach((candidate, at) => console.log(`${at + 1}. ${candidate.label}`))
    console.error(`several matches: run again with --pick <n>`)
    process.exit(4)
  }
  action = { verb: result.verb, target: result.candidates[choice - 1], with: result.with }
}
if (dry) {
  console.log(`⚡ ${describe(action, 'future')}  (${result.step}, ${action.target.via})`)
  for (const command of commandsFor(action)) console.log('  ' + command.map(part => typeof part === 'object' ? `<${Object.keys(part)[0]}>` : part).join(' '))
  process.exit(0)
}
try { console.log(`⚡ ${run(action)}`) } catch (error) { console.error(`reflex: ${error.message}`); process.exit(1) }

async function ask(result) {
  result.candidates.forEach((candidate, at) => console.log(`${at + 1}. ${candidate.label}`))
  const readline = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await readline.question('which one? ')
  readline.close()
  return Number(answer)
}

function printWhy(result) {
  console.log(`"${result.phrase}" → ${result.status === 'action' || result.status === 'confirm' ? describe(result.action, 'future') : result.status === 'answer' ? `answer: ${result.answer}` : result.status === 'choose' ? `${result.candidates.length} matches` : `Claude (${result.reason})`}`)
  for (const step of result.trace) {
    if (step.reason) { console.log(`  ${step.step}: ${step.reason}`); continue }
    const { verb, target, kind } = step.parsed
    console.log(`  ${step.step}: verb ${verb}, target "${target}"${kind ? `, kind ${kind}` : ''}`)
    const found = step.found
    if (found.status === 'ok') console.log(`    found ${found.target.type} ${found.target.value} (${found.target.via})`)
    else if (found.status === 'ambiguous') found.candidates.forEach(c => console.log(`    candidate ${c.type} ${c.value} (${c.via})`))
    else console.log(`    ${found.reason}`)
  }
}

async function runEval(file) {
  const here = new URL('../test/phrases/', import.meta.url)
  const fail = message => { console.error(`reflex eval: ${message}`); return 2 }
  let fixture, cases
  try {
    fixture = JSON.parse(readFileSync(new URL('fixture.json', here), 'utf8'))
    // --index: someone else's index (the shape loadIndex() returns). Nothing of this fixture's carries over,
    // aliases included, so the run says what the model does on names it never saw.
    if (indexFile !== undefined) {
      const index = readIndexFile(indexFile)
      fixture = { index, config: { aliases: {}, model: {} }, fs: index.fs }
    }
    const path = file ?? new URL('heldout.jsonl', here)
    cases = readFileSync(path, 'utf8').replace(/\n$/, '').split('\n').map((text, at) => {
      let parsed
      try { parsed = JSON.parse(text) } catch { throw new Error(`line ${at + 1} is not JSON`) }
      if (typeof parsed?.phrase !== 'string' || !['action', 'choose', 'pass', 'confirm', 'answer'].includes(parsed.expect?.status)) throw new Error(`line ${at + 1} needs a "phrase" and an "expect" with a status`)
      return parsed
    })
  } catch (error) {
    return fail(error.code === 'ENOENT' ? `cannot read ${error.path}` : error.message.split('\n')[0])
  }
  // Quoted-text copies are template-only by design: no model answer reaches them, so they stay out of the score.
  if (!withQuoted) cases = cases.filter(c => !c.tags?.includes('quoted'))
  if (!cases.length) return fail('no cases')
  // Templates only unless --model: the fixture's config has no model, so none is asked.
  const config = { ...fixture.config, model: withModel ? loadConfig().model : {} }
  if (withModel && !(config.model.url && config.model.name)) return fail('--model needs [model] url and name in the config')
  // No environment either: $EDITOR on this Mac must not change what an editor phrase does.
  // The disk a plan reads (newest files, remotes) is the fixture's own `fs` data, never this Mac's.
  const { results, summary } = await evaluate(cases, { index: fixture.index, config, env: {}, ...fakeDeps(fixture.fs) })
  if (json) console.log(JSON.stringify({ summary, results }))
  else printEval(results, summary)
  return summary.wrong ? 1 : 0
}

function printEval(results, summary) {
  const row = (label, s) => `${label.padEnd(9)} right ${String(s.right).padStart(3)}  wrong ${String(s.wrong).padStart(3)}  missed ${String(s.missed).padStart(3)}  passed ${String(s.passed).padStart(3)}`
  for (const r of results.filter(r => r.outcome === 'wrong')) console.log(`WRONG  "${r.phrase}"  expected ${JSON.stringify(r.expect)}  got ${JSON.stringify(r.got)}  (${r.step})`)
  if (summary.wrong) console.log()
  console.log(row('total', summary) + `   of ${summary.total}`)
  for (const [step, s] of Object.entries(summary.byStep)) console.log(row(step, s))
  console.log(`latency   p50 ${summary.p50.toFixed(1)} ms  p95 ${summary.p95.toFixed(1)} ms`)
}
