// What Claude did through Bash that reflex could have done itself, mapped to reflex's verb and target.
// Anything that is not exactly one of these simple forms is none: a second command, a substitution,
// a glob, an `open` flag we do not model.

// Node-free on purpose: the Claude Code hooks module may import it, and it has no node:* access.

/** Splits a command like a POSIX shell would, or returns null when it holds anything beyond plain words. */
export function words(command) {
  const out = []
  let word = null, i = 0
  const push = () => { if (word !== null) out.push(word); word = null }
  while (i < command.length) {
    const c = command[i]
    if (c === "'") {
      const end = command.indexOf("'", i + 1)
      if (end < 0) return null
      word = (word ?? '') + command.slice(i + 1, end); i = end + 1
    } else if (c === '"') {
      word ??= ''
      i++
      for (;;) {
        if (i >= command.length) return null
        const d = command[i]
        if (d === '"') { i++; break }
        if (d === '$' || d === '`') return null
        if (d === '\\' && /["\\$`]/.test(command[i + 1] ?? '')) { word += command[i + 1]; i += 2; continue }
        word += d; i++
      }
    } else if (c === '\\') {
      if (i + 1 >= command.length || command[i + 1] === '\n') return null
      word = (word ?? '') + command[i + 1]; i += 2
    } else if (/\s/.test(c)) {
      if (c === '\n') return null
      push(); i++
    } else if (/[;&|<>()`$*?[\]{}!#]/.test(c) || (c === '~' && word !== null)) {
      return null
    } else { word = (word ?? '') + c; i++ }
  }
  push()
  return out
}

const URL_RE = /^https?:\/\/\S+$/i
const isPath = value => /^(\/|~(\/|$)|\.{1,2}\/)/.test(value)

function pathTarget(value, home) {
  // Without a home the tilde stays: the CLI maps the command again, with the real one, when it records.
  const full = !home ? value : value === '~' ? home : value.startsWith('~/') ? home + value.slice(1) : value
  return { type: /\.app\/?$/i.test(full) ? 'app' : 'path', value: full.length > 1 ? full.replace(/\/+$/, '') : full }
}

/** @returns {{ verb: 'open'|'reveal'|'copy', target: { type: string, value: string } } | null} */
export function actionFromBash(command, { home = '' } = {}) {
  if (typeof command !== 'string') return null
  const trimmed = command.trim()
  // `echo -n /path | pbcopy`, `printf %s /path | pbcopy`: the one pipeline we read.
  const pipe = trimmed.match(/^([^|]*?)\s*\|\s*pbcopy\s*$/)
  if (pipe) {
    const head = words(pipe[1])
    if (!head) return null
    let rest
    if (head[0] === 'echo') rest = head[1] === '-n' ? head.slice(2) : head.slice(1)
    else if (head[0] === 'printf') rest = head[1] === '%s' ? head.slice(2) : head[1]?.includes('%') ? [] : head.slice(1)
    else return null
    return rest.length === 1 && isPath(rest[0]) ? { verb: 'copy', target: { type: 'text', value: pathTarget(rest[0], home).value } } : null
  }
  const parts = words(trimmed)
  if (!parts || parts[0] !== 'open') return null
  const args = parts.slice(1)
  if (args[0] === '--') args.shift()
  if (args.length === 2 && args[0] === '-a' && args[1] && !args[1].startsWith('-') && !isPath(args[1])) return { verb: 'open', target: { type: 'app', value: args[1] } }
  if (args.length === 2 && args[0] === '-R' && isPath(args[1])) return { verb: 'reveal', target: pathTarget(args[1], home) }
  if (args.length === 1 && URL_RE.test(args[0])) return { verb: 'open', target: { type: 'url', value: args[0] } }
  if (args.length === 1 && isPath(args[0])) return { verb: 'open', target: pathTarget(args[0], home) }
  return null
}
