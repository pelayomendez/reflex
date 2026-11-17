// ~/.config/reflex/config.toml, all optional. A small reader for the little TOML reflex needs:
// [sections] and key = "string" lines, with # comments.

import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export const configPath = () => process.env.REFLEX_CONFIG ?? join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'reflex', 'config.toml')

export function loadConfig(path = configPath()) {
  const config = { aliases: {}, model: {}, roles: {} }
  if (!existsSync(path)) return config
  let section = config
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').trim()
    if (!line || line.startsWith('#')) continue
    const header = line.match(/^\[([\w.-]+)\]$/)
    if (header) { section = config[header[1]] ??= {}; continue }
    const pair = line.match(/^"?([^"=]+?)"?\s*=\s*"(.*)"$/)
    if (pair) section[pair[1].trim().toLowerCase()] = pair[2]
  }
  return config
}

export const expandHome = path => path.replace(/^~(?=\/|$)/, homedir())
