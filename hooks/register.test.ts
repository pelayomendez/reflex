// The prompt.submit flow of register.tsx with the engine stubbed beneath it: the CLI (`process.run`), the dialog
// (`AskUserQuestion`) and the transcript (`ui.log`) are hooks of the test. Nothing here runs the real CLI or touches a Trash.
import { expect, test } from 'claude-code/testing'

type Run = { argv: readonly string[] }
const PLAN = {
  phrase: 'vacía la papelera', status: 'confirm', step: 'template', lang: 'es', count: 312,
  question: '¿Vaciar la Papelera: 312 elementos?', labels: ['No', 'Sí, vaciar'],
  action: { verb: 'empty-trash', target: { type: 'system', value: 'trash', label: 'the Trash', via: 'system actions' } },
}
const done = (stdout: string, exitCode = 0, stderr = '') => ({ exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false })

// `answer`: a label, free text, 'throw' (the dialog fails), or null (dismissed).
function stage(on: any, { reached = [] as string[], plan = PLAN as any, answer = 'Sí, vaciar' as string | null, runs = [] as Run[], logs = [] as string[], asked = [] as string[], run = (argv: readonly string[]) => done('⚡ emptied the Trash (312 items)') } = {}) {
  on('process.run', (_: unknown, e: Run) => {
    runs.push(e)
    if (e.argv.includes('--json')) return { value: done(JSON.stringify(plan)) }
    if (e.argv.includes('learn')) return { value: done('') }
    return { value: run(e.argv) }
  })
  // What stands for the engine beneath the plugin: a prompt that gets here reached Claude.
  on('prompt.submit', (_: unknown, e: { text: string }) => { reached.push(e.text); return { text: e.text } })
  on('tool.call', { tool: 'AskUserQuestion' }, (_: unknown, e: any) => {
    const question = e.questions[0].question
    asked.push(question)
    if (answer === 'throw') throw new Error('dialog failed')
    if (answer === null) return { deny: 'dismissed' }
    return { result: { questions: e.questions, answers: { [question]: answer } } }
  })
  on('ui.log', (_: unknown, e: { text: string }) => { logs.push(e.text); return { value: undefined } })
  return { runs, logs, asked, reached }
}

const submit = ($: any, text = 'vacía la papelera') => $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })
const emptied = (runs: Run[]) => runs.filter(r => r.argv.includes('--confirmed'))

test('yes: the confirmed count goes to the CLI, with a longer leash, and the prompt is dropped', async ($, on) => {
  const seen = stage(on)
  const result: any = await submit($)
  expect(seen.asked).toEqual(['¿Vaciar la Papelera: 312 elementos?'])
  const run = emptied(seen.runs)
  expect(run.length).toBe(1)
  expect(run[0].argv.join(' ')).toMatch(/--confirmed 312 .*vacía la papelera$/)
  expect(result.drop).toMatch(/emptied the Trash/)
  expect(seen.logs.join('\n')).toMatch(/emptied the Trash \(312 items\) · without Claude/)
})

for (const [name, answer] of [['No', 'No'], ['free text', 'sí, hazlo ya'], ['dismissed', null], ['the dialog throws', 'throw']] as const) {
  test(`${name}: nothing is emptied, nothing goes to Claude`, async ($, on) => {
    const seen = stage(on, { answer })
    const result: any = await submit($)
    expect(emptied(seen.runs).length).toBe(0)
    expect(typeof result.drop).toBe('string')
    expect(seen.reached).toEqual([])
  })
}

// Hooks beneath the plugin are registered before the first call on $, so each plan is a test of its own.
for (const [name, plan] of [['the Trash is already empty (the CLI passed)', { status: 'pass', reason: 'the Trash is already empty' }], ['a plan with no count', { ...PLAN, count: undefined, question: undefined }], ['a count of zero', { ...PLAN, count: 0 }], ['labels that are not a yes and a no', { ...PLAN, labels: ['No'] }]] as const) {
  test(`${name}: Claude gets the prompt as typed, nothing is asked, nothing is emptied`, async ($, on) => {
    const seen = stage(on, { plan })
    await submit($)
    expect(seen.asked.length).toBe(0)
    expect(emptied(seen.runs).length).toBe(0)
    expect(seen.reached).toEqual(['vacía la papelera'])
  })
}

test('a CLI that fails after the yes is reported and drops the prompt', async ($, on) => {
  const seen = stage(on, { run: () => done('', 1, 'the Trash grew from 312 to 340 items since you confirmed: not emptied') })
  const result: any = await submit($)
  expect(result.drop).toBe('reflex: failed')
  expect(seen.logs.join('\n')).toMatch(/grew from 312 to 340/)
})

test('a query answers in the transcript and is not sent to Claude', async ($, on) => {
  const answer = { phrase: 'batería', status: 'answer', step: 'template', answer: 'Battery: 89%, discharging, 4:59 left', action: { verb: 'query', target: { type: 'query', value: 'battery', label: 'battery', via: 'system actions' } } }
  const seen = stage(on, { plan: answer })
  const result: any = await submit($, 'batería')
  expect(result.drop).toBe('Battery: 89%, discharging, 4:59 left')
  expect(seen.logs.join('\n')).toMatch(/Battery: 89%.*without Claude/)
  expect(seen.runs.filter(r => !r.argv.includes('--json') && !r.argv.includes('learn')).length).toBe(0)
})

test('Enter asks the CLI for the count; typing never does', async ($, on) => {
  const seen = stage(on)
  await submit($)
  expect(seen.runs.find(r => r.argv.includes('--json'))!.argv).toContain('--count')
})

// What the hooks keep for «open the doc» / «open the website»: files and addresses from Bash calls and from Claude's reply.
// The CLI is stubbed (`touched` answers what its disk read would), so what is under test is what the hooks keep and hand over.
function remember(on: any, { touched = '[]', bash = { result: { stdout: '', stderr: '', interrupted: false } } as any, runs = [] as Run[] } = {}) {
  on('process.run', (_: unknown, e: Run) => {
    runs.push(e)
    if (e.argv.includes('touched')) return { value: done(touched) }
    return { value: done(e.argv.includes('--json') ? JSON.stringify({ phrase: 'x', status: 'pass', reason: 'stub' }) : '') }
  })
  on('prompt.submit', (_: unknown, e: { text: string }) => ({ text: e.text }))
  on('tool.call', { tool: 'Bash' }, () => bash)
  on('turn.complete', (_: unknown, e: { answer: string }) => ({ text: e.answer }))
  on('ui.log', () => ({ value: undefined }))
  return runs
}
// The list the next prompt hands the CLI, as parsed JSON (undefined when no `--recent` went).
async function handed($: any, runs: Run[]) {
  await submit($, 'open the website')
  const argv = runs.filter(r => r.argv.includes('--json')).at(-1)!.argv
  const at = argv.indexOf('--recent')
  return at < 0 ? undefined : JSON.parse(argv[at + 1])
}
const turn = ($: any, answer: string, extra: object = {}) => $.turn.complete({ answer, reason: 'answer', durationMs: 1, isAborted: false, turnId: 't1', ...extra })

test('a Bash command that made a file: the file the CLI found goes on the list, with the time of the call', async ($, on) => {
  const runs = remember(on, { touched: JSON.stringify([{ path: '/w/Brief.docx' }]) })
  await $.tool.call({ tool: 'Bash', command: 'textutil -convert docx in.html -output Brief.docx' })
  const touchedRun = runs.find(r => r.argv.includes('touched'))!
  expect(touchedRun.argv).toContain('--since')
  expect(touchedRun.argv.at(-1)).toBe('textutil -convert docx in.html -output Brief.docx')
  const list = await handed($, runs)
  expect(list.map((item: any) => item.path)).toEqual(['/w/Brief.docx'])
  expect(typeof list[0].at).toBe('number')
})

test('a Bash command that failed records nothing and asks the CLI nothing', async ($, on) => {
  const runs = remember(on, { bash: { isError: true, result: 'exit 1', text: 'exit 1' }, touched: JSON.stringify([{ path: '/w/Brief.docx' }]) })
  await $.tool.call({ tool: 'Bash', command: 'textutil -convert docx in.html -output Brief.docx' })
  expect(runs.some(r => r.argv.includes('touched'))).toBe(false)
  expect(await handed($, runs)).toBeUndefined()
})

test('only an address given to open is kept from a Bash command; curl, git and echo are not, and open asks the CLI', async ($, on) => {
  const runs = remember(on, { touched: JSON.stringify([{ url: 'https://ada-demo.github.io/orbit-notes/' }]) })
  await $.tool.call({ tool: 'Bash', command: 'open https://ada-demo.github.io/orbit-notes/' })
  expect((await handed($, runs)).map((item: any) => item.url)).toEqual(['https://ada-demo.github.io/orbit-notes/'])
})

test('an address in curl, git or echo is never kept, and asks the CLI nothing', async ($, on) => {
  const runs = remember(on)
  for (const command of ['curl -s https://ada-demo.github.io/orbit-notes/', 'git clone https://github.com/ada-demo/orbit-notes', 'echo https://ada-demo.github.io/orbit-notes/'])
    await $.tool.call({ tool: 'Bash', command })
  expect(runs.some(r => r.argv.includes('touched'))).toBe(false)
  expect(await handed($, runs)).toBeUndefined()
})

// A Bash output has no exit code: a failing command comes back as isError; a command moved to the background, or an exit Claude
// Code reads as meaningful (returnCodeInterpretation), has not made what the command line says.
for (const [name, bash] of [['returnCodeInterpretation', { result: { stdout: '', stderr: '', interrupted: false, returnCodeInterpretation: 'No matches found' } }], ['a background task', { result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b1' } }], ['an interrupt', { result: { stdout: '', stderr: '', interrupted: true } }]] as const) {
  test(`a Bash call with ${name} records nothing`, async ($, on) => {
    const runs = remember(on, { bash: bash as any, touched: JSON.stringify([{ path: '/w/Brief.docx' }]) })
    await $.tool.call({ tool: 'Bash', command: 'textutil -convert docx in.html -output Brief.docx' })
    expect(runs.some(r => r.argv.includes('touched'))).toBe(false)
    expect(await handed($, runs)).toBeUndefined()
  })
}

test('a command that touched nothing worth keeping leaves the list as it was', async ($, on) => {
  const runs = remember(on)
  await $.tool.call({ tool: 'Bash', command: 'git status' })
  await $.tool.call({ tool: 'Bash', command: 'ls -la' })
  expect(runs.some(r => r.argv.includes('touched'))).toBe(false)
  expect(await handed($, runs)).toBeUndefined()
})

test('the addresses in Claude\'s reply go on the list; a subagent\'s reply and an unsafe address do not', async ($, on) => {
  const runs = remember(on)
  await turn($, 'Published at https://ada-demo.github.io/orbit-notes/ (PR https://github.com/ada-demo/orbit-notes/pull/42), not https://example.org/x?api_key=zzz.')
  await turn($, 'sub: https://sub.example.org/', { agentId: 'a1' })
  const list = await handed($, runs)
  expect(list.map((item: any) => item.url)).toEqual(['https://ada-demo.github.io/orbit-notes/', 'https://github.com/ada-demo/orbit-notes/pull/42'])
})

test('a Write still records its file, and an address does not displace it', async ($, on) => {
  const runs = remember(on)
  on('tool.call', { tool: 'Write' }, () => ({ result: { type: 'create', filePath: '/w/plan.md' } }))
  await $.tool.call({ tool: 'Write', file_path: '/w/plan.md', content: 'x' })
  await turn($, 'See https://ada-demo.github.io/orbit-notes/')
  const list = await handed($, runs)
  expect(list.map((item: any) => item.path ?? item.url).sort()).toEqual(['/w/plan.md', 'https://ada-demo.github.io/orbit-notes/'])
})
