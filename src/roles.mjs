// Roles: people say "the vpn", "el correo", "the calendar" and mean the app that does that job, not a name.
// A closed table of role words (es/en) and, per Mac, the one app a role points to. Data only: the model
// catalogue never sees it. See docs/research/roles.md.

import { existsSync } from 'node:fs'
import { expandHome } from './config.mjs'
import { key } from './index.mjs'

export const ROLES = {
  vpn: ['vpn'],
  mail: ['mail', 'correo', 'email'],
  calendar: ['calendar', 'calendario', 'agenda'],
  browser: ['browser', 'navegador'],
  music: ['music', 'musica'],
  notes: ['notes', 'notas'],
  maps: ['maps', 'mapas'],
  photos: ['photos', 'fotos'],
  contacts: ['contacts', 'contactos'],
  messages: ['messages', 'mensajes'],
}

// The macOS app for each role, the last resort.
const SYSTEM_APP = { mail: 'mail', calendar: 'calendar', music: 'music', notes: 'notes', maps: 'maps', photos: 'photos', contacts: 'contacts', messages: 'messages' }
// URLs whose default handler is the role's app, asked once when the index is built.
export const HANDLER_URLS = { mail: 'mailto:someone@example.com', browser: 'https://example.com' }

/** The role a whole word names ("correo" is mail), or undefined. */
export const roleOf = word => Object.keys(ROLES).find(role => ROLES[role].includes(key(word)))

/**
 * The one app a role points to on this Mac, or undefined. In order: the person's `[roles]` table, the default
 * handler (kept in `index.defaults`), the only installed app whose name holds a role word, the system app.
 * Several candidates at a step that has any, with nothing decided before it, mean no role.
 */
export function resolveRole(role, { index, config = {} }) {
  const configured = config.roles?.[role]
  if (configured) {
    // The person's own choice is never replaced by a guess: it resolves or the role does not.
    if (/\/|\.app$/i.test(configured)) { const path = expandHome(configured); return existsSync(path) ? path : undefined }
    return index.apps[key(configured)]
  }
  if (role in HANDLER_URLS) {
    // The OS's answer decides: a path, or null for "no handler". No answer (the lookup failed, or the index predates
    // it) is not "none": guessing from names here could pick the wrong mail client.
    const handler = index.defaults?.[role]
    if (handler === undefined) return undefined
    if (handler) return handler
  }
  const holding = [...new Set(Object.entries(index.apps).filter(([name]) => ROLES[role].some(word => name.includes(word))).map(([, path]) => path))]
  if (holding.length) return holding.length === 1 ? holding[0] : undefined
  const system = SYSTEM_APP[role] && index.apps[SYSTEM_APP[role]]
  return system?.startsWith('/System/Applications/') ? system : undefined
}
