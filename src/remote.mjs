// A repo's `origin` remote as an https address of its page on the web. Pure text: nothing here runs git or
// touches the network. Anything that is not clearly a hosted repo (a path on disk, a file:// URL, an address
// with a query, a host that needs another URL, a name with odd characters) is refused rather than guessed.

// Hosts whose ssh address is not the host of their web page, so the plain conversion would open a dead page.
const NEEDS_ANOTHER_URL = /^(ssh\.dev\.azure\.com|vs-ssh\.visualstudio\.com)$/i
const HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i
const SEGMENT = /^[\w.~-]+$/
const SCP = /^(?:[^@/\s]+@)?([^:/\s]+):(?!\/\/)(.*)$/
const SCHEMES = new Set(['https:', 'http:', 'ssh:', 'git:'])

/**
 * @param {unknown} remote what `git remote get-url origin` printed
 * @returns {{ url: string, host: string } | { reason: string }}
 */
export function webUrl(remote) {
  if (typeof remote !== 'string') return { reason: 'no remote' }
  const text = remote.trim()
  if (!text) return { reason: 'no remote' }
  let host, port, path
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    let parsed
    try { parsed = new URL(text) } catch { return { reason: `not an address: ${redact(text)}` } }
    if (!SCHEMES.has(parsed.protocol)) return { reason: `${parsed.protocol} is not a web address` }
    if (parsed.search || parsed.hash) return { reason: 'the remote has a query or a fragment' }
    host = parsed.hostname
    // The port of an ssh or git address is the ssh port, not the web page's; an https one is kept, an http one cannot be upgraded safely.
    const web = parsed.protocol === 'https:' || parsed.protocol === 'http:'
    if (parsed.protocol === 'http:' && parsed.port) return { reason: 'an http remote on a port cannot be turned into https' }
    port = web ? parsed.port : ''
    path = parsed.pathname
  } else {
    const scp = SCP.exec(text)
    if (!scp) return { reason: `not a hosted repo: ${redact(text)}` }
    ;[, host, path] = scp
  }
  if (!HOST.test(host)) return { reason: `${host} is not a host name` }
  if (NEEDS_ANOTHER_URL.test(host)) return { reason: `${host} is an ssh address whose web page lives elsewhere` }
  const segments = path.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\.git$/, '').split('/')
  if (segments.length < 2 || !segments.every(part => SEGMENT.test(part) && part !== '.' && part !== '..')) return { reason: 'the path is not owner/repo' }
  const url = `https://${host.toLowerCase()}${port ? `:${port}` : ''}/${segments.join('/')}`
  return { url, host: new URL(url).host }
}

// An address with credentials in it never goes into a reason.
const redact = text => text.replace(/\/\/[^/@\s]*@/, '//')
