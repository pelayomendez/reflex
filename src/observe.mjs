// What the Claude Code hooks watch and log. The hooks (hooks/register.tsx) only call this; the
// logic is here so node --test can reach it. Node-free on purpose: the hooks module has no node:*. Every method is fail-silent and never returns
// something the caller has to await for a decision: observing never blocks or rewrites anything.

import { actionFromBash } from './oracle.mjs'

/** The words the plan took as the target (what a model would have to copy), when the trace has them. */
export function wordsOf(plan) {
  const step = [...(plan?.trace ?? [])].reverse().find(s => s.parsed?.target)
  return typeof step?.parsed?.target === 'string' ? step.parsed.target : undefined
}

const brief = target => target && { type: target.type, value: target.value }

/**
 * @param {{ log?: (entry: object) => unknown, ask?: (text: string) => Promise<object|null> }} deps
 *   ask: what would reflex do with this phrase (the plan), for a phrase typed after a leading backslash.
 */
export function createObserver({ log = () => {}, ask = async () => null } = {}) {
  let passed = null // the phrase this turn began with, when reflex passed it to Claude and nothing was logged yet
  const safe = fn => { try { return fn() } catch {} }

  return {
    /** A prompt reached Claude as typed. A new turn starts: only a passed phrase can have an oracle. */
    passed(text) { safe(() => { passed = typeof text === 'string' && text.trim() ? text.trim() : null }) },
    /** Any prompt that is not one of the person's typed phrases (slash command, queued): no phrase for the turn. */
    other() { safe(() => { passed = null }) },
    /** reflex acted on the phrase. `plan` is its plan, `action` what ran (the chosen candidate when it asked). */
    accepted(text, plan, action) {
      safe(() => {
        passed = null
        log({ kind: 'accepted', phrase: text.trim(), verb: action.verb, target: brief(action.target), step: plan.step, words: wordsOf(plan) })
      })
    },
    /** The person typed a leading backslash: log what reflex would have done, if it would have acted. */
    async override(text) {
      passed = null
      try {
        const plan = await ask(text.trim())
        if (!plan || (plan.status !== 'action' && plan.status !== 'choose')) return
        const verb = plan.status === 'action' ? plan.action.verb : plan.verb
        const targets = plan.status === 'action' ? [plan.action.target] : plan.candidates
        log({ kind: 'override', phrase: text.trim(), verb, target: brief(targets[0]), ...(targets.length > 1 && { candidates: targets.length }), step: plan.step, words: wordsOf(plan) })
      } catch {}
    },
    /** Claude is about to run a Bash command. The first one in a passed turn that reflex could have run is logged. */
    toolCall(name, input) {
      safe(() => {
        if (passed === null || name !== 'Bash') return
        const action = actionFromBash(input?.command)
        if (!action) return
        const phrase = passed
        passed = null
        log({ kind: 'oracle', phrase, command: input.command })
      })
    },
  }
}
