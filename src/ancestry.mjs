// The executable paths of this process's ancestors, nearest first, read with `ps` (no installs). Quit uses
// it to refuse an app that hosts the session: quitting the terminal Claude Code runs in would end the session.

import { execFileSync } from 'node:child_process'

export function processAncestry(start = process.pid) {
  const found = []
  let pid = start
  for (let depth = 0; depth < 64 && pid > 1; depth++) {
    let line
    try { line = execFileSync('ps', ['-o', 'ppid=,comm=', '-p', String(pid)], { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { break }
    const match = line.match(/^(\d+)\s+(.+)$/)
    if (!match) break
    found.push(match[2])
    pid = Number(match[1])
  }
  return found
}
