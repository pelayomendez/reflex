// Selectors: "the latest <kind>", a rule that picks the newest file of a kind in a known place. The kinds are a
// closed table (this file's data), not anything the model sees: «abre la última captura», «muestra la última
// descarga», «el último pdf de descargas», «open my latest screenshot». The newest file is read off the disk
// at the moment the phrase is planned, so what the preview names is what Enter opens.

import { basename, extname, join } from 'node:path'
import { homedir } from 'node:os'
import { key } from './index.mjs'

const IMAGES = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'tiff', 'bmp']

// Words are folded (no accents, lower case): phrases are matched folded.
export const LATEST_WORDS = ['ultimo', 'ultima', 'latest', 'last', 'newest', 'most recent']
export const LATEST_POSTFIX = ['mas reciente', 'most recent']
const DETERMINERS = ['el', 'la', 'mi', 'my', 'the']
const PLACE_PREPOSITIONS = ['de', 'del', 'en', 'from', 'in', 'on', 'of']

// Where a folder word points, by the names the index gives the home folders (Spanish first).
export const PLACES = {
  downloads: { words: ['descargas', 'downloads'], keys: ['descargas', 'downloads'] },
  desktop: { words: ['escritorio', 'desktop'], keys: ['escritorio', 'desktop'] },
  documents: { words: ['documentos', 'documents'], keys: ['documentos', 'documents'] },
}

// `place`: where to look. 'screenshots' is the macOS screenshot location; a named place is a home folder; `needsPlace`
// kinds are looked for only in a place the phrase names ("el último pdf de descargas"), because "my latest pdf" says nothing of where.
export const KINDS = {
  screenshot: { words: ['captura de pantalla', 'captura', 'screenshot', 'pantallazo'], place: 'screenshots', extensions: IMAGES },
  download: { words: ['descarga', 'download'], place: 'downloads' },
  pdf: { words: ['pdf'], needsPlace: true, extensions: ['pdf'] },
  image: { words: ['imagen', 'image', 'foto', 'picture', 'photo'], needsPlace: true, extensions: IMAGES },
  video: { words: ['video'], needsPlace: true, extensions: ['mp4', 'mov', 'm4v', 'mkv', 'avi', 'webm'] },
}

// On the Desktop (the default screenshot place) other images live too, so only files named like a screenshot count,
// in the languages macOS names them in. A prefix the person set (`defaults write com.apple.screencapture name`) counts as well.
export const SCREENSHOT_NAMES = ['screenshot', 'screen shot', 'captura de pantalla', 'bildschirmfoto', "capture d'ecran", 'schermafbeelding', 'cattura schermo', 'captura de tela']

// Files that are not finished or not for people to look at.
const PARTIAL = new Set(['crdownload', 'download', 'part', 'partial', 'opdownload', 'tmp', 'aria2'])
// What `open` may take: documents and media, which open in a viewer and do nothing else. Everything else (pages that run
// scripts, archives that extract and write, profiles, documents with macros, scripts, programs, files with no extension or with
// an extension that is not exactly one of these) is never opened from "open my latest download": reveal and copy are harmless.
export const OPENABLE = new Set(['pdf', 'txt', 'md', 'rtf', 'csv', 'docx', 'xlsx', 'pptx', 'pages', 'numbers', 'key', ...IMAGES.filter(ext => ext !== 'svg'), 'tif', 'mp3', 'm4a', 'wav', 'aac', 'flac', 'aiff', 'mp4', 'mov', 'm4v', 'mkv', 'avi', 'webm'])
const ODD_CHARACTERS = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/
// A folder opens in Finder; a bundle (.app, .pkg, .bundle…) would run or install. Only a folder with no extension, or a version-like
// one ("release v1.2"), is taken for a plain folder.
function opensSafely(name, isDir) {
  if (ODD_CHARACTERS.test(name) || name.endsWith('.')) return false
  const ext = extname(name).slice(1)
  return isDir ? ext === '' || /^\d+$/.test(ext) : OPENABLE.has(ext.toLowerCase())
}

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const any = words => `(?:${[...words].sort((a, b) => b.length - a.length).map(escape).join('|').replace(/ /g, '\\s+')})`
const DET = `(?:${any(DETERMINERS)}\\s+)?`
const PLACE_WORDS = any(Object.values(PLACES).flatMap(place => place.words))
const KIND_WORDS = any(Object.values(KINDS).flatMap(kind => kind.words))
const PLACE = `(?:\\s+${any(PLACE_PREPOSITIONS)}\\s+(?:${any(DETERMINERS)}\\s+)?(?:(?:carpeta|folder)\\s+(?:de\\s+)?)?(${PLACE_WORDS})(?:\\s+(?:folder|carpeta))?)?`
const LEADING = new RegExp(`^${DET}${any(LATEST_WORDS)}\\s+(${KIND_WORDS})${PLACE}$`)
const TRAILING = new RegExp(`^${DET}(${KIND_WORDS})\\s+${any(LATEST_POSTFIX)}${PLACE}$`)

const kindOf = word => Object.entries(KINDS).find(([, kind]) => kind.words.some(w => w.replace(/\s+/g, ' ') === word.replace(/\s+/g, ' ')))?.[0]
const placeOf = word => Object.entries(PLACES).find(([, place]) => place.words.includes(word))?.[0]

/**
 * Reads "the latest <kind> [of <place>]" off the words after the verb (folded, closing place already removed).
 * @returns {{ kind: string, place?: string } | undefined} nothing when the words are anything else
 */
export function latestOf(rest) {
  const match = LEADING.exec(rest) ?? TRAILING.exec(rest)
  if (!match) return undefined
  return { kind: kindOf(match[1]), place: match[2] && placeOf(match[2]) }
}

const home = path => path.replace(homedir(), '~')
const folderOf = (index, place) => PLACES[place].keys.map(name => index.folders[name]).find(Boolean)

/**
 * The newest file of a kind, read off the disk now.
 * @param {{ kind: string, place?: string }} wanted
 * @param {{ verb: string, index: object, listing: Function, screenshotLocation: Function }} how
 * @returns {{ status: 'ok', target: object } | { status: 'none', reason: string }}
 */
export function newest({ kind, place }, { verb, index, listing, screenshotLocation }) {
  const spec = KINDS[kind]
  const none = reason => ({ status: 'none', reason })
  let dir, onlyScreenshotNames = false, prefix
  if (spec.place === 'screenshots') {
    if (place) return none(`"${kind}" has its own place: it is not looked for in ${place}`)
    const where = screenshotLocation()
    dir = where.dir
    if (!dir) {
      dir = folderOf(index, 'desktop')
      onlyScreenshotNames = true
      prefix = where.prefix
    }
  } else if (spec.place) {
    if (place && place !== spec.place) return none(`"${kind}" is looked for in ${spec.place}, not in ${place}`)
    dir = folderOf(index, spec.place)
  } else {
    if (!place) return none(`say where to look for the latest ${kind} (descargas, escritorio, documentos)`)
    dir = folderOf(index, place)
  }
  if (!dir) return none('that folder is not known')
  let files
  try { files = listing(dir) } catch (error) { return none(`cannot read ${home(dir)}: ${error.message}`) }
  const names = prefix ? [...SCREENSHOT_NAMES, key(prefix)] : SCREENSHOT_NAMES
  const found = files.filter(({ name, isDir }) => {
    if (name.startsWith('.')) return false
    const ext = extname(name).slice(1).toLowerCase()
    if (PARTIAL.has(ext)) return false
    // Pdf, image, video and screenshot are files; a download may also be a folder (an extracted archive, an app).
    if (spec.extensions && (isDir || !spec.extensions.includes(ext))) return false
    return !onlyScreenshotNames || names.some(start => key(name).startsWith(start))
  }).sort((a, b) => b.mtimeMs - a.mtimeMs)
  if (!found.length) return none(`no ${kind} in ${home(dir)}`)
  if (found.length > 1 && found[0].mtimeMs === found[1].mtimeMs) return none(`two files in ${home(dir)} are equally new`)
  const [{ name, isDir }] = found
  if (verb === 'open' && !opensSafely(name, isDir)) return none(`${name} is the newest, and opening it could run it or write files (show it in Finder instead)`)
  return { status: 'ok', target: { type: isDir ? 'folder' : 'file', value: join(dir, name), label: basename(name), via: `newest ${kind} in ${home(dir)}` } }
}
