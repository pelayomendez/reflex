// Phrase → plan. Templates first; the small model for any phrase they could not place (bar negations
// and compounds); and in both cases the target has to exist.

import { basename } from 'node:path'
import { processAncestry } from './ancestry.mjs'
import { loadConfig } from './config.mjs'
import { namesGenericThing, resolveDeictic } from './context.mjs'
import { ground } from './ground.mjs'
import { key, loadIndex } from './index.mjs'
import { MODIFIERS, extractModifier, isTextFile, resolveApp } from './modifiers.mjs'
import { askModel } from './model.mjs'
import { FILLERS, JOINED, REQUEST, copiedFrom, formVerb, normalise, parse, placeVerb, splitPlace, statedVerb, verbWords } from './phrase.mjs'
import { answerFor } from './query.mjs'
import { PUT, QUESTION } from './vocab.mjs'
export { PUT }
import { webUrl } from './remote.mjs'
import { mentionsSystem, systemAction } from './system.mjs'
import { latestOf, newest } from './selectors.mjs'
import { listing, remoteOf, screenshotLocation } from './world.mjs'
export { REQUEST, REQUEST_FORMS } from './phrase.mjs'

// Anything the templates leave is worth asking the model about ("¿me abres brand?", "llévame a brand"),
// except a negation or a compound request: those are for Claude whatever a model would make of them.
const NEGATION = /\b(no|nunca|never|dont|don't|do not|not)\b/
// Something already done or long gone ("ya abrí figma", "I opened figma yesterday") is not a request even
// though it holds a request stem. Read off the phrase as typed, because the accent is what tells
// "abrí" from a present form; the normalised text carries the time words and "ya" + a past verb.
const PAST_WORD = /\b(yesterday|ayer|antes)\b/
const PAST_STEM = /\b(abr|lanz|lanc|ejecut|mostr|ensen|revel|copi|llev|pus|encend|sac|busc|encontr|activ|inici|arranc|pas)\w*[éóí](?![a-zñ])|\b(open|launch|start|show|reveal|copi|turn|trigger|activat)ed\b/
// Phrases that open on a time or a condition ("ya abri figma", "cuando abro figma falla", "si pones brand"),
// and progressive forms ("I'm opening figma", "estoy abriendo figma"), describe an action rather than
// request one: no model, whatever it would make of them.
const REPORTED = /^(ya|cuando|si|when|if|acabo de|despues|luego|then)\b/
const PROGRESSIVE = /\b(abr|lanz|ejecut|mostr|ensen|revel|copi|llev|pon|encend|sac|busc|encontr|activ|inici|arranc|trae)(iendo|ando|yendo)\b|\b(open|launch|start|show|reveal|copy|bring|turn|trigger|activat|find|giv|tak|putt|runn|gett|go)ing\b/
// "put" is a request as an imperative ("put brand", "please put figma") or with a place ("put it on the
// screen", "put it in finder"); "I put brand in the trash" reports something done.
// A model sometimes drags the phrase's closing filler into the target ("brand ya").
const TARGET_FILLER = /(\s+(ya|now|please|porfa|again|otra vez|ahora|for me|para m[ií]|anda))+$/
// ...and its leading article ("el modo foco", "the figma").
const TARGET_ARTICLE = /^(el|la|the)\s+/
// Questions and talk ("what is brand", "explícame figma") name real things without asking for anything
// to be done. The copy rule only proves the words were said, so a model that answers them with an
// action would be acting on conversation: they never reach it. Requests phrased as questions ("¿me
// abres brand?", "can you open…") start with a request form instead, and still do.
const TALK = /^(what|whats|why|how|which|is|are|does|do|explain|tell me|describe|que|por que|como|cual|es|explica|explicame|cuentame|dime)\b/
// A remark that holds a request word without asking for the file: an embedded question ("quiero ver por
// qué falla el roadmap", "I need to see who wrote the syntax") and a request for some other action
// ("necesito arreglar el README", "I need to fix the roadmap") name real things and want something else
// done. Both skip the model. A request word followed by an open, see or copy verb ("quiero ver",
// "necesito abrir", "I want to see") is still a request. "qué" is read off the typed phrase, because
// only the accent tells it from the conjunction in "quiero que abras brand" (an unaccented "que" counts only right after ver or saber, and "see that" / "see if" are remarks too); "dónde está …" opening the
// phrase is the reveal form, so it is exempt.
const QUESTION_ACCENTED = /(?<![\p{L}])qué(?![\p{L}])/u
const asksQuestion = (phrase, said) => QUESTION.test(said.replace(FILLERS, '').replace(/^donde esta\b/, '')) || QUESTION_ACCENTED.test(phrase.toLowerCase().normalize('NFC'))
const OTHER_ACTION = /\b(quiero|necesito|want|need|i'd like|id like)\s+(to\s+)?(?!(ver|abrir|copiar|mostrar|ensenar|revelar|lanzar|ejecutar|encontrar|buscar|pasar|open|see|view|copy|show|reveal|launch|run|find|bring|go|look)\b)(\w+(ar|er|ir)\b|(?<=\bto\s)\w+)/

// A phrase that asks to close or quit something is never for the model: its catalogue has no quit, so the
// closest thing it could answer is an open of the same app. Quit is the templates' alone.
// Only where the closing word is the verb: the start of the phrase, or right after a request lead
// ("necesito que cierres X", "can you close X"). Inside a target ("closet", "cerrajeria", "the exit folder") it is a name.
const CLOSE_LEAD = '(?:(?:necesito|quiero) que|i need you to|i want you to|puedes|can you|could you|would you|please|porfa|por favor|me)\\s+'
const CLOSING_WORD = new RegExp(`^(?:${CLOSE_LEAD})*(?:cierr\\w*|cerr(?:ar|ad[oa]s?|ando|e|o)|close[sd]?|closing|quit\\w*|sal de|salir de)\\b`)

export async function plan(phrase, deps = {}) {
  const config = deps.config ?? loadConfig()
  const index = deps.index ?? loadIndex()
  // "abre ese doc", "open it": the file Claude wrote, from the list the hooks hand over, or Claude's. Never the model's, never a name.
  const deictic = resolveDeictic(phrase, deps.recent, { now: deps.now, isFile: deps.isFile, index, aliases: config.aliases, remoteOf: deps.remoteOf, siteFiles: deps.siteFiles })
  if (deictic) return deictic
  // A fixed system phrase ("abre ajustes de sonido", "bloquea la pantalla", "volumen al 30") is the table's alone.
  const system = systemAction(phrase, { index, config, screenLockStatus: deps.screenLockStatus })
  if (system?.reason) return { phrase, status: 'pass', reason: system.reason, trace: [{ step: 'template', reason: system.reason }] }
  if (system) return systemPlan(phrase, system, { ...deps, config })
  const modifier = extractModifier(phrase)
  if (!modifier) return resolve(phrase, { ...deps, config, index })
  const refused = reason => ({ phrase, status: 'pass', reason, trace: [{ step: 'modifier', reason }] })
  if (modifier.conflict) return refused(`more than one thing asked: ${modifier.conflict}`)
  const here = { ...deps, config, index }
  if (modifier.role === 'path') {
    // "copia la ruta de X" is also a request to copy a file called "ruta de X": when that reading finds something, which one is meant is not for reflex to guess.
    const ordinary = await resolve(phrase, here, { templatesOnly: true })
    if (ordinary.status !== 'pass') return refused('a file may be named like the whole phrase: it could mean copying that file')
    return withPath(phrase, await resolve(modifier.phrase, here, { templatesOnly: true }))
  }
  // A web page of a repo, or an address as before: an address in the phrase stays an address.
  if (modifier.role === 'web') return withWeb(phrase, await resolve(modifier.phrase, here, { templatesOnly: modifier.rewritten }), modifier.app, here)
  const resolved = resolveApp(modifier, { index, config, env: deps.env })
  if ('reason' in resolved) return refused(resolved.reason)
  const using = { ...resolved, line: modifier.line }
  // What stays is an ordinary request to open something; the modifier then decides whether what it found fits.
  const inner = await resolve(modifier.phrase, { ...deps, config, index }, { path: true, templatesOnly: modifier.rewritten })
  return withModifier(phrase, inner, modifier.role, using)
}

// What a table entry becomes. A plain action is what it says. A query is read now and answers in the prompt, or passes when its
// output is not certain. A confirm only ever asks: the count is read when `countTrash` is handed over (at Enter, never while
// previewing), and nothing is emptied by a plan.
const CONFIRM = {
  es: { question: count => `¿Vaciar la Papelera: ${count} ${count === 1 ? 'elemento' : 'elementos'}?`, labels: ['No', 'Sí, vaciar'] },
  en: { question: count => `Empty the Trash: ${count} ${count === 1 ? 'item' : 'items'}?`, labels: ['No', 'Yes, empty'] },
}
function systemPlan(phrase, system, deps) {
  const { verb, target } = system.action
  const trace = [{ step: 'template', parsed: { verb, target: target.label }, found: { status: 'ok', target } }]
  const pass = reason => ({ phrase, status: 'pass', reason, trace: [{ step: 'template', reason }] })
  let action = system.action
  if (system.tier === 'query') {
    const answered = answerFor(target.value, { read: deps.readCommand, config: deps.config, index: deps.index })
    return answered.text ? { phrase, status: 'answer', step: 'template', action, answer: answered.text, trace } : pass(answered.reason)
  }
  if (system.tier === 'confirm') {
    const asking = { phrase, status: 'confirm', step: 'template', action, lang: system.lang, trace }
    if (!deps.countTrash) return asking
    let count
    try { count = deps.countTrash() } catch {}
    if (!Number.isInteger(count) || count < 0) return pass('could not read the Trash count from Finder')
    if (count === 0) return pass('the Trash is already empty')
    const { question, labels } = CONFIRM[system.lang]
    return { ...asking, count, question: question(count), labels }
  }
  if (verb === 'hide-others') {
    // Every regular app but the frontmost is hidden, and never the one that hosts this session, whatever is in front.
    const chain = (deps.ancestors ?? processAncestry)()
    if (!chain.length) return pass('could not tell which app hosts this session')
    const hosts = [...new Set(chain.map(exe => /^(.*?\.app)\/Contents\//.exec(exe)?.[1]).filter(Boolean))]
    // A chain with no app in it (tmux, ssh, launchd) hides nothing the host could be: the frontmost app alone is no safeguard.
    if (!hosts.length) return pass('could not find the app hosting this session')
    action = { ...action, target: { ...target, hosts } }
  }
  return { phrase, status: 'action', step: 'template', action, trace }
}

const PATH_TYPES = new Set(['file', 'folder'])
// Words that, alone, are what one searches the code for rather than the name of a file.
const GENERIC = new Set(['test', 'tests', 'spec', 'specs', 'config', 'configs', 'configuration', 'settings', 'index', 'main', 'app', 'src', 'lib', 'utils', 'util', 'helpers', 'build', 'dist', 'docs', 'doc', 'setup', 'env', 'types', 'constants', 'router', 'routes', 'server', 'client', 'api', 'model', 'models', 'schema', 'styles', 'style', 'scripts', 'script', 'readme', 'license', 'changelog', 'package', 'data', 'common', 'core', 'base', 'default', 'init', 'cli', 'bin', 'hooks', 'components', 'pages', 'views', 'controllers', 'services', 'middleware', 'handlers', 'tools', 'assets', 'public', 'static', 'vendor', 'node_modules'])
const pathTarget = target => ({ type: 'text', value: target.value, label: `the path of ${basename(target.value)} (${target.value})`, via: target.via })

// "copia la ruta de X": what the find found, as its absolute path copied as text, not the file itself.
function withPath(phrase, inner) {
  const trace = [{ step: 'modifier', role: 'path' }, ...inner.trace]
  const refuse = reason => ({ phrase, status: 'pass', reason, trace: [...trace, { step: 'modifier', reason }] })
  if (inner.status === 'pass') return { ...inner, phrase, trace }
  if (inner.status === 'action') {
    if (!PATH_TYPES.has(inner.action.target.type)) return refuse(`a ${inner.action.target.type} has no path to copy`)
    return { ...inner, phrase, action: { verb: 'copy', target: pathTarget(inner.action.target) }, trace }
  }
  return { ...inner, phrase, verb: 'copy', candidates: inner.candidates.map(pathTarget), trace }
}

// "abre X en GitHub / en el navegador": a folder that is a git checkout with an origin opens as that remote's page.
function withWeb(phrase, inner, host, { remoteOf: read = remoteOf }) {
  const trace = [{ step: 'modifier', role: 'web', ...(host && { host }) }, ...inner.trace]
  const refuse = reason => ({ phrase, status: 'pass', reason, trace: [...trace, { step: 'modifier', reason }] })
  if (inner.status === 'pass') return { ...inner, phrase, trace }
  const verb = inner.status === 'action' ? inner.action.verb : inner.verb
  if (verb !== 'open') return refuse(`"${verb}" does not take a web page`)
  const page = target => {
    if (target.type !== 'folder') return { reason: `a ${target.type} has no page on the web` }
    const remote = read(target.value)
    if (!remote) return { reason: `${target.label} is not a git repo with an origin remote` }
    const web = webUrl(remote)
    if (!web.url) return { reason: web.reason }
    if (host && !MODIFIERS.web.forges[host].test(web.host)) return { reason: `its origin is on ${web.host}, not on ${host}` }
    return { target: { type: 'url', value: web.url, label: web.url.replace(/^https:\/\//, ''), via: `origin remote of ${target.label}` } }
  }
  if (inner.status === 'action') {
    const { target } = inner.action
    // An address (an alias, a typed URL) is opened as it ever was, but never "on GitHub".
    if (target.type === 'url') return host ? refuse(`an address is not a repo on ${host}`) : { ...inner, phrase, trace }
    const found = page(target)
    return found.target ? { ...inner, phrase, action: { verb: 'open', target: found.target }, trace } : refuse(found.reason)
  }
  // Several folders that fit the words: which repo is meant is not worth a question about web pages.
  return refuse('several folders match: say which repo')
}

const fits = (role, target, using) => role === 'terminal' ? target.type === 'folder' : (target.type === 'file' && isTextFile(target.value)) || (target.type === 'folder' && using.app !== null)
const VERB = { editor: 'edit', terminal: 'terminal' }

function withModifier(phrase, inner, role, using) {
  const trace = [{ step: 'modifier', role, app: using.label, via: using.via }, ...inner.trace]
  const refuse = reason => ({ phrase, status: 'pass', reason, trace: [...trace, { step: 'modifier', reason }] })
  if (inner.status === 'pass') return { ...inner, phrase, trace }
  const verb = inner.status === 'action' ? inner.action.verb : inner.verb
  if (verb !== 'open') return refuse(`"${verb}" does not take ${role === 'editor' ? 'an editor' : 'a terminal'}`)
  const as = { role, app: using.app, label: using.label, line: using.line, scheme: using.scheme }
  if (inner.status === 'action') {
    const { target } = inner.action
    if (!fits(role, target, using)) return refuse(`a ${target.type} cannot be opened in ${role === 'editor' ? 'an editor' : 'a terminal'}`)
    return { ...inner, phrase, action: { verb: VERB[role], target, with: as }, trace }
  }
  const candidates = inner.candidates.filter(target => fits(role, target, using))
  if (candidates.length < 2) return refuse(`fewer than two of the matches can be opened in ${role === 'editor' ? 'an editor' : 'a terminal'}`)
  return { ...inner, phrase, verb: VERB[role], candidates, with: as, trace }
}

async function resolve(phrase, deps, { path = false, templatesOnly = false } = {}) {
  const { config, index } = deps
  const model = deps.askModel ?? askModel
  const parsed = parse(phrase)
  const trace = []

  // "the website", "la web de reflex", "take me to the docs": a generic noun with an article points at something in the
  // conversation. It resolved (or passed) in resolveDeictic when the phrase opened with it; anywhere else in a phrase it is Claude's:
  // neither a folder called "website" nor the model's guess may stand for it. Quoted text to copy is only text.
  if (parsed.kind !== 'text' && namesGenericThing(phrase)) {
    const reason = 'a generic word with an article ("the website", "el doc") points at something in the conversation, not at a folder or file of that name: for Claude'
    return { phrase, status: 'pass', reason, trace: [{ step: 'template', reason }] }
  }

  if ('verb' in parsed) {
    const latest = selectLatest(phrase, parsed, { index, config, ...deps })
    if (latest) {
      trace.push({ step: 'template', parsed: latest.parsed, found: latest.found })
      return latest.found.status === 'ok' ? result(phrase, 'template', latest.parsed, latest.found, trace) : { phrase, status: 'pass', reason: latest.found.reason, trace }
    }
    // "busca X": the verb is a reveal, X is held to the strictness of a model's answer (the whole name of exactly one file or
    // folder; several are Claude's, no list). No closing place: those keep the model's way.
    const finding = parsed.verb === 'find'
    const asked = finding ? { ...parsed, verb: 'reveal', raw: `busca ${normalise(phrase).replace(FILLERS, '').split(' ').slice(1).join(' ')}` } : parsed
    let found = ground(asked, { index, config, ...deps, asPath: path, ...(finding && { exact: true }) })
    // A find reveals a file or a folder: an alias, an app or a Shortcut of that name is not what was asked.
    const types = found.status === 'ok' ? [found.target] : found.status === 'ambiguous' ? found.candidates : []
    if (finding && types.some(target => !PATH_TYPES.has(target.type))) found = { status: 'none', reason: `"${parsed.target}" is not a file or a folder` }
    // "busca tests", "find the config" most likely search the code: a lone generic word names a file only with a kind word,
    // an extension or a folder beside it.
    if (finding && found.target?.type === 'file' && !parsed.kind && GENERIC.has(key(parsed.target))) found = { status: 'none', reason: `"${parsed.target}" alone is a word to search for, not a file name (say "el archivo ${parsed.target}" or name its folder)` }
    trace.push({ step: 'template', parsed: asked, found })
    if (found.status !== 'none') return result(phrase, 'template', asked, found, trace)
  } else {
    trace.push({ step: 'template', reason: parsed.reason })
    if (/^(starts with|more than one)/.test(parsed.reason)) return { phrase, status: 'pass', reason: parsed.reason, trace }
  }

  const said = normalise(phrase)
  if (!templatesOnly && config.model?.url && !NEGATION.test(said) && !JOINED.test(said) && (REQUEST.test(said) || PUT.test(said.replace(FILLERS, ''))) && !PAST_WORD.test(said) && !REPORTED.test(said.replace(FILLERS, '')) && !PROGRESSIVE.test(said) && !PAST_STEM.test(phrase.toLowerCase().normalize('NFC')) && !TALK.test(said.replace(FILLERS, '')) && !asksQuestion(phrase, said) && !OTHER_ACTION.test(said) && !CLOSING_WORD.test(said.replace(FILLERS, '')) && !mentionsSystem(said)) {
    const raw = await model(phrase, config.model)
    const asked = raw && { ...raw, target: String(raw.target ?? '').trim().replace(TARGET_FILLER, '').replace(TARGET_ARTICLE, '') }
    const place = placeVerb(phrase)
    if (asked?.verb === 'quit') trace.push({ step: 'model', reason: 'quit is not something a model may ask for' })
    else if (asked && !copiedFrom(phrase, asked.target)) trace.push({ step: 'model', reason: 'target is not copied from the phrase' })
    else if (asked) {
      // What the phrase states decides the verb: the place it names, then the request form it opens with;
      // the model's verb only stands when it states none. The target still grounds strictly.
      // A place and a stated verb that disagree ("necesito copiar brand en el finder") ask for two things: pass.
      const said_ = statedVerb(phrase)
      const stated = place && said_ && said_ !== 'pass' && said_ !== place ? 'pass' : place ?? said_
      // A phrase that opens with a find verb ("find the contrato in finder") is a reveal of a file or folder, whatever the model made of it.
      const finds = verbWords.find.includes(said.replace(FILLERS, '').split(' ')[0])
      let proposal = { ...asked, verb: finds ? 'reveal' : stated ?? shortcutKind(phrase, asked) ?? formVerb(phrase) ?? asked.verb, target: key(asked.target), raw: phrase }
      if (finds && place && place !== 'reveal') trace.push({ step: 'model', reason: `a find is a reveal, not a ${place}` })
      else if (stated === 'pass') trace.push({ step: 'model', reason: 'the phrase asks for a verb reflex does not do' })
      else {
      let found = ground(proposal, { index, config, ...deps, source: 'model', asPath: path })
      if (finds && found.target && !PATH_TYPES.has(found.target.type)) found = { status: 'none', reason: `"${proposal.target}" is not a file or a folder` }
      // The template's find rules hold on the model's way too: one match only, and a lone generic word is a code search.
      if (finds && found.status === 'ambiguous') found = { status: 'none', reason: `more than one "${proposal.target}": Claude's` }
      if (finds && found.target?.type === 'file' && GENERIC.has(key(proposal.target))) found = { status: 'none', reason: `"${proposal.target}" alone is a word to search for, not a file name` }
      if (found.target?.type === 'shortcut') proposal = { ...proposal, verb: 'shortcut' }
      trace.push({ step: 'model', parsed: proposal, found })
      if (found.status !== 'none') return result(phrase, 'model', proposal, found, trace)
      }
    } else trace.push({ step: 'model', reason: 'no action proposed' })
  }
  return { phrase, status: 'pass', reason: trace.at(-1).found?.reason ?? trace.at(-1).reason, trace }
}

// "abre la última captura": the newest file of a kind in a known place, read off the disk now. A phrase that holds
// the selector and cannot be honoured (nothing there, a tie, a file that opening could run) is Claude's, never the model's.
function selectLatest(phrase, parsed, deps) {
  if (!['open', 'reveal', 'copy', 'find'].includes(parsed.verb)) return undefined
  const [, ...rest] = normalise(phrase).replace(FILLERS, '').split(' ')
  const { text, place } = splitPlace(rest.join(' '))
  const wanted = latestOf(text)
  if (!wanted) return undefined
  const shown = { ...parsed, target: text }
  const none = reason => ({ parsed: shown, found: { status: 'none', reason } })
  // "busca la última captura" reveals it, like every find; with a closing place a find keeps its model's way, and so does a verb that disagrees with it.
  const verb = place ?? (parsed.verb === 'find' ? 'reveal' : parsed.verb)
  if (place && parsed.verb !== 'open' && place !== parsed.verb) return none(`"${parsed.verb}" and a place that asks to ${place}`)
  // A file really called "última captura" is the other reading of the phrase: not for reflex to choose between them.
  if (ground(parsed, { ...deps, zoxide: () => undefined }).status !== 'none') return none('a file or folder may be named like that')
  const found = newest(wanted, { verb, index: deps.index, listing: deps.listing ?? listing, screenshotLocation: deps.screenshotLocation ?? screenshotLocation })
  return { parsed: { ...shown, verb }, found }
}

// "necesito el atajo modo noche": the opening form says open, the kind word says Shortcut. When the model
// agrees and the form is an open or a Shortcut one (or there is none), the Shortcut stands; a reveal or copy
// form never runs one.
const shortcutKind = (phrase, asked) => asked.verb === 'shortcut' && ['open', 'shortcut'].includes(formVerb(phrase)) && /\b(atajo|shortcut)\s/.test(normalise(phrase)) ? 'shortcut' : undefined

function result(phrase, step, parsed, found, trace) {
  return found.status === 'ok'
    // Showing an app brings it up: the template's reveal of an installed app is an open of it.
    ? { phrase, status: 'action', step, action: { verb: found.target.type === 'app' && parsed.verb === 'reveal' ? 'open' : parsed.verb, target: found.target }, trace }
    : { phrase, status: 'choose', step, verb: parsed.verb, candidates: found.candidates, trace }
}
