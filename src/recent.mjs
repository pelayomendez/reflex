// What the hooks keep about the files Claude wrote, and how a tool call becomes an entry. Node-free on purpose: the hooks
// module (hooks/register.tsx) can import only plugin files that import nothing from node:*. Resolving a phrase against the
// list, which reads the disk, is src/context.mjs. See docs/research/session-context.md.

export const RECENT_CAP = 20
const ODD_CHARACTERS = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/

/** An entry reflex may keep and act on: an absolute path with no control characters, and a time. */
export const validEntry = entry => !!entry && typeof entry.path === 'string' && entry.path.startsWith('/') && !ODD_CHARACTERS.test(entry.path) && Number.isFinite(entry.at)

/**
 * The list after Claude wrote `path` at `at`: newest first, the path once, at most `cap` long. Only an absolute path with
 * no control characters is kept (a relative one names nothing reflex could open later).
 */
export function record(list, path, at, cap = RECENT_CAP) {
  const before = Array.isArray(list) ? list : []
  if (!validEntry({ path, at })) return before
  return [{ path, at }, ...before.filter(entry => entry.path !== path)].slice(0, cap)
}

/** The path a Write, Edit or NotebookEdit call is about, from the event's flat arguments. */
export const writtenPath = event => [event?.file_path, event?.notebook_path].find(value => typeof value === 'string')

/** Whether a finished tool call went through. Anything that says it failed is not a file Claude made. */
export const callSucceeded = result => !(result && typeof result === 'object' && (result.isError || result.is_error || result.error || typeof result.deny === 'string'))

/** A list as the CLI is handed it: what is not `{ path, at }` is dropped; not JSON or not a list is an empty list. */
export function parseRecent(text) {
  let parsed
  try { parsed = JSON.parse(text) } catch { return [] }
  return Array.isArray(parsed) ? parsed.filter(validEntry) : []
}

