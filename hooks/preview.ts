// What the plugin shows and says, from the CLI's JSON plan. Kept apart from register.tsx so it
// can be tested without the engine.

import { FILLERS, LEVEL_LEADS, LOCK, OPENERS, PANES, QUESTION, QUIT_LEADS, REQUEST_FORMS, SETTINGS_ROOT, SETTINGS_WORDS, TABLE, TERMINAL_NOUNS, UNGATED_FORMS, VERBS, VOLUME } from '../src/vocab.mjs'

export type Target = { type: string; value: string; label: string; via: string }
// `with` is what a modifier chose: the app (a path, or null for the system's text app), its name and the line.
export type Using = { role: string; app: string | null; label: string; line?: number }
export type Plan =
  | { status: 'action'; step: string; action: { verb: string; target: Target; with?: Using } }
  | { status: 'choose'; step: string; verb: string; candidates: Target[]; with?: Using }
  // Empty Trash: only ever asks. `count`, `question` and `labels` come with the plan asked for at Enter; the preview has none.
  | { status: 'confirm'; step: string; action: { verb: string; target: Target }; lang?: string; count?: number; question?: string; labels?: string[] }
  // A read-only query, already answered (the CLI read it): shown in the prompt, nothing runs.
  | { status: 'answer'; step: string; action: { verb: string; target: Target }; answer: string }
  | { status: 'pass'; reason: string }

const FUTURE: Record<string, string> = { open: 'open', reveal: 'show in Finder', copy: 'copy', shortcut: 'run Shortcut', quit: 'quit', edit: 'edit', terminal: 'terminal' }

// Worth asking the CLI about at all, derived from the very tables the CLI decides from (src/vocab.mjs), so the two cannot drift
// apart: the draft is (the start of) a phrase of the system table, opens with a verb or a command form of the phrase grammar
// (after fillers and at most one lead word), or names a Settings pane or the terminal. A request word buried in a sentence
// does not count, and neither does a question or a wish («quiero ver…», «I want to see…»): those are Claude's. The CLI still
// has the last word; this only keeps it from being asked about ordinary prompts.
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const tidy = (text: string) => {
  let said = fold(text).replace(/\s+/g, ' ').replace(/^[¿¡\s]+/, '')
  for (let again = true; again;) { const cut = said.replace(FILLERS, '').replace(/^[¿¡\s]+/, ''); again = cut !== said; said = cut }
  return said
}
const LANGS = ['es', 'en'] as const
const PHRASES: string[] = [
  ...TABLE.flatMap(entry => [...entry.es, ...entry.en, ...(entry.asking ?? [])]),
  ...LANGS.flatMap(lang => LOCK[lang].verbs.flatMap(verb => LOCK[lang].objects.map(object => `${verb} ${object}`))),
  ...Object.values(VOLUME).flatMap(words => [...words.es, ...words.en]),
  ...LEVEL_LEADS,
  ...QUIT_LEADS,
]
const VERB_STEMS: string[] = [...Object.values(VERBS).flat(), ...LANGS.flatMap(lang => OPENERS[lang])]
const UNGATED = new Set(UNGATED_FORMS.map(fold))
const FORM_LEADS: string[] = REQUEST_FORMS.map(({ form }) => fold(form.split('…')[0].trim())).filter(lead => lead && !UNGATED.has(lead))
const FIRST_WORDS = new Set<string>([
  ...LANGS.flatMap(lang => [...SETTINGS_WORDS[lang], ...SETTINGS_ROOT[lang]]),
  ...PANES.flatMap(pane => [...pane.es, ...pane.en]),
  ...TERMINAL_NOUNS,
].map(text => text.split(' ')[0]))

export const mightBeAction = (text: string) => {
  if (text.trimStart().startsWith('\\')) return false
  const said = tidy(text)
  if (!said) return false
  // As typed, or after one leading word ("oye", "me abres", "ábreme…").
  const drafts = [said, said.replace(/^\S+[\s,]+/, '')].filter(Boolean)
  // A whole phrase of the table (or the start of one, as it is typed) is asked about, questions included: queries are questions.
  if (drafts.some(draft => PHRASES.some(phrase => draft.startsWith(phrase) || (draft.length >= 3 && phrase.startsWith(draft))))) return true
  // Anything else that asks a question or talks is Claude's ("find out why this fails").
  if (QUESTION.test(said.replace(/^donde esta\b/, ''))) return false
  return drafts.some(draft => {
    const [first] = draft.split(/[\s,]+/)
    return VERB_STEMS.some(verb => first.startsWith(verb)) || FIRST_WORDS.has(first) || FORM_LEADS.some(lead => draft === lead || draft.startsWith(`${lead} `))
  })
}

export const shortPath = (value: string, home: string) => (home && value.startsWith(home) ? '~' + value.slice(home.length) : value)

// What each system verb says it will do; `lock`, `volume`, `settings` and `hide` have no entry in FUTURE.
const SYSTEM_FUTURE: Record<string, (target: Target) => string> = {
  'open-trash': () => 'open the Trash',
  appearance: target => (target.value === 'toggle' ? 'toggle dark/light mode' : `switch to ${target.value} mode`),
  'sleep-displays': () => 'sleep the displays',
  screensaver: () => 'start the screen saver',
  'hide-others': () => 'hide other apps',
  'screenshot-toolbar': () => 'open the Screenshot toolbar',
  'mission-control': () => 'open Mission Control',
  lock: () => 'lock screen',
  volume: target => target.label,
  settings: target => `settings: ${target.label}`,
  hide: target => `hide ${target.label}`,
}

export function previewLine(plan: Plan, home: string): string | null {
  if (plan.status === 'confirm') return `⚡ ${plan.action.verb === 'empty-trash' ? 'empty the Trash' : plan.action.target.label} (asks first)   ⏎ asks · start with \\ to ask Claude`
  if (plan.status === 'answer') return `⚡ ${plan.answer}   ⏎ shows it here · start with \\ to ask Claude`
  if (plan.status === 'action') {
    const { verb, target } = plan.action
    const using = plan.action.with
    const hint = '   ⏎ runs here · start with \\ to ask Claude'
    if (verb in SYSTEM_FUTURE) return `⚡ ${SYSTEM_FUTURE[verb](target)}${hint}`
    if (verb === 'edit' && using) return `⚡ edit ${target.label}${using.line ? `:${using.line}` : ''} in ${using.label}${hint}`
    if (verb === 'terminal' && using) return `⚡ terminal in ${target.label} (${using.label})${hint}`
    // Text (a quoted copy, or the path of something) shows its label: "the path of brand (…)" is not the folder.
    return `⚡ ${FUTURE[verb]} ${['app', 'shortcut', 'text'].includes(target.type) ? target.label : shortPath(target.value, home)}${hint}`
  }
  if (plan.status === 'choose')
    return `⚡ ${FUTURE[plan.verb]}: ${plan.candidates.length} matches, ⏎ to choose · start with \\ to ask Claude`
  return null
}
