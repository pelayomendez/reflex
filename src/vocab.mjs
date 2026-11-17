// The data the CLI decides from, and nothing else: no node:* here, so the Claude Code hooks (which have none) can read it too.
// The hooks derive their gate ("is this draft worth asking the CLI about?") from these very tables, so the gate and the
// deciding cannot drift apart. src/system.mjs and src/phrase.mjs import them.

// Every pane id below is read off this OS: System Settings' own Sidebar.plist (wifi, Bluetooth, Network,
// Notifications, Sound, General, Appearance, Privacy & Security, Displays, Battery, Keyboard, Trackpad) and
// the pane extension's CFBundleIdentifier under /System/Library/ExtensionKit/Extensions (checked on macOS 15,
// Darwin 24.6). Software Update is a sub-page of General, so its id comes from the extension alone.
// Anything not verified that way is not in the table.
export const PANES = [
  { label: 'Sound', id: 'com.apple.Sound-Settings.extension', es: ['sonido'], en: ['sound'] },
  { label: 'Bluetooth', id: 'com.apple.BluetoothSettings', es: ['bluetooth'], en: ['bluetooth'] },
  { label: 'Wi-Fi', id: 'com.apple.wifi-settings-extension', es: ['wifi', 'wi-fi'], en: ['wifi', 'wi-fi'] },
  { label: 'Network', id: 'com.apple.Network-Settings.extension', es: ['red', 'redes'], en: ['network'] },
  { label: 'Displays', id: 'com.apple.Displays-Settings.extension', es: ['pantalla', 'pantallas'], en: ['display', 'displays'] },
  { label: 'Battery', id: 'com.apple.Battery-Settings.extension', es: ['bateria'], en: ['battery'] },
  { label: 'Keyboard', id: 'com.apple.Keyboard-Settings.extension', es: ['teclado'], en: ['keyboard'] },
  { label: 'Trackpad', id: 'com.apple.Trackpad-Settings.extension', es: ['trackpad'], en: ['trackpad'] },
  { label: 'Notifications', id: 'com.apple.Notifications-Settings.extension', es: ['notificaciones'], en: ['notifications'] },
  { label: 'Privacy & Security', id: 'com.apple.settings.PrivacySecurity.extension', es: ['privacidad', 'privacidad y seguridad', 'seguridad y privacidad'], en: ['privacy', 'privacy and security', 'privacy & security'] },
  { label: 'General', id: 'com.apple.systempreferences.GeneralSettings', es: ['general'], en: ['general'] },
  { label: 'Software Update', id: 'com.apple.Software-Update-Settings.extension', es: ['actualizacion de software', 'actualizaciones de software', 'actualizaciones'], en: ['software update', 'software updates', 'updates'] },
  { label: 'Appearance', id: 'com.apple.Appearance-Settings.extension', es: ['apariencia', 'aspecto'], en: ['appearance'] },
]

// "abre ajustes" / "open settings" on their own: the System Settings app, whatever language the Mac is in.
export const SETTINGS_ROOT = {
  es: ['ajustes', 'configuracion', 'ajustes del sistema', 'configuracion del sistema', 'preferencias del sistema'],
  en: ['settings', 'system settings', 'system preferences'],
}
export const OPENERS = { es: ['abre', 'abreme', 'abrir', 'abrime', 'muestra', 'muestrame'], en: ['open', 'show', 'show me'] }
export const SETTINGS_WORDS = { es: ['ajustes', 'configuracion', 'preferencias'], en: ['settings', 'preferences'] }
export const DETERMINERS = { es: ['los', 'las', 'la', 'mis', 'mi', 'el'], en: ['the', 'my'] }
export const OF = ['de', 'del', 'de la', 'de los', 'de las']

export const LOCK = {
  es: { verbs: ['bloquea', 'bloquear'], objects: ['la pantalla', 'el mac', 'mi mac', 'el ordenador'] },
  en: { verbs: ['lock'], objects: ['screen', 'the screen', 'the mac', 'my mac', 'mac', 'the computer'] },
}
export const ALL_LANGS = ['es', 'en']
export const ALL = ALL_LANGS
// Fixed volume phrases: what each one does, in both languages. Nothing else is a volume phrase.
export const VOLUME = {
  mute: { es: ['silencia', 'silenciar', 'silencia el sonido', 'silencia el volumen', 'silencia el audio', 'silenciar el sonido', 'silenciar el volumen'], en: ['mute', 'mute sound', 'mute the sound', 'mute the volume', 'mute audio'] },
  unmute: { es: ['quita el silencio', 'quitar el silencio'], en: ['unmute', 'unmute sound', 'unmute the sound', 'unmute the volume', 'unmute audio'] },
  up: { es: ['sube el volumen', 'subir el volumen', 'sube volumen', 'subir volumen'], en: ['volume up', 'turn up the volume', 'turn the volume up', 'raise the volume', 'increase the volume'] },
  down: { es: ['baja el volumen', 'bajar el volumen', 'baja volumen', 'bajar volumen'], en: ['volume down', 'turn down the volume', 'turn the volume down', 'lower the volume', 'decrease the volume'] },
}
// "volumen al 30", "pon el volumen a 30", "volume 30", "set the volume to 30": a lead, then an integer.
// After "sube/baja" only "a/al N" is a level ("sube el volumen en 20" or "baja el volumen 20" would be a change by 20).
export const LEVEL_LEADS = [
  ...['', 'pon el', 'pon'].flatMap(lead => ['al', 'a', 'en', ''].map(to => [lead, 'volumen', to].filter(Boolean).join(' '))),
  ...['sube el', 'baja el', 'subir el', 'bajar el'].flatMap(lead => ['al', 'a'].map(to => `${lead} volumen ${to}`)),
  'volume', 'volume to', 'volume at', 'set volume to', 'set volume at', 'set the volume to', 'set the volume at',
]
export const VOLUME_STEP = 10

// Everything else the table knows, as data: each entry is a verb of run.mjs, a value, and the exact phrases (accents
// and case aside, matched whole) that ask for it. The three tiers:
//   action  -- reversible, runs on Enter like lock and volume;
//   query   -- read-only, answered in the prompt from one fixed command (src/query.mjs);
//   confirm -- irreversible: only ever a plan that asks, and runs through a confirmed count (the hooks' $.ui.ask).
// A state-changing entry always has a verb in its phrase: a bare noun («dark mode», «screenshot») may be the answer to one
// of Claude's questions, so it is never a request. Only a query may be a bare noun («batería»).
// `asking` are query phrases that read as a statement unless asked («¿estoy conectado a la vpn?»): they need the question mark.
// `names` are the words a folder, app, Shortcut or alias could carry for this very thing: when one does, the phrase is that
// thing's and the ordinary rules take it (an app of macOS itself, under /System, is the thing, not another). A file never
// counts: reflex never empties a file, and a repo full of icons called trash.svg would otherwise make these phrases dead on
// every developer's Mac.
const cross = (verbs, objects) => verbs.flatMap(verb => objects.map(object => `${verb} ${object}`))
const TRASH = ['papelera', 'la papelera', 'trash', 'the trash']
export const TABLE = [
  { tier: 'confirm', verb: 'empty-trash', value: 'trash', label: 'the Trash', names: TRASH,
    es: cross(['vacia', 'vaciar'], ['la papelera']), en: ['empty trash', 'empty the trash'] },
  { tier: 'action', verb: 'open-trash', value: 'trash', label: 'the Trash', names: TRASH,
    es: cross(['abre', 'abreme', 'abrir', 'muestra', 'muestrame', 'ensena', 'ensename'], ['la papelera', 'papelera', 'mi papelera']),
    en: cross(['open', 'show', 'show me'], ['trash', 'the trash', 'my trash']) },
  { tier: 'action', verb: 'appearance', value: 'dark', label: 'dark mode',
    es: [...cross(['activa', 'activar', 'pon', 'poner', 'enciende'], ['el modo oscuro', 'modo oscuro']), 'cambia a modo oscuro', 'cambia al modo oscuro'],
    en: ['turn on dark mode', 'turn on the dark mode', 'enable dark mode', 'activate dark mode', 'switch to dark mode', 'switch to the dark mode', 'set dark mode'] },
  { tier: 'action', verb: 'appearance', value: 'light', label: 'light mode',
    es: [...cross(['activa', 'activar', 'pon', 'poner', 'enciende'], ['el modo claro', 'modo claro']), 'cambia a modo claro', 'cambia al modo claro', ...cross(['desactiva', 'desactivar', 'quita', 'quitar', 'apaga'], ['el modo oscuro'])],
    en: ['turn on light mode', 'turn on the light mode', 'enable light mode', 'activate light mode', 'switch to light mode', 'switch to the light mode', 'set light mode', 'turn off dark mode', 'disable dark mode'] },
  { tier: 'action', verb: 'appearance', value: 'toggle', label: 'dark/light mode',
    es: cross(['alterna', 'alternar', 'cambia'], ['el modo oscuro', 'el modo claro', 'el aspecto']),
    en: ['toggle dark mode', 'toggle light mode', 'toggle the dark mode', 'toggle appearance', 'toggle the appearance'] },
  { tier: 'action', verb: 'sleep-displays', value: 'displays', label: 'the displays',
    es: [...cross(['pon', 'poner'], ['las pantallas en reposo', 'la pantalla en reposo']), ...cross(['apaga', 'apagar', 'duerme', 'dormir'], ['la pantalla', 'las pantallas'])],
    en: ['sleep displays', 'sleep the displays', 'sleep display', 'sleep the display', 'sleep the screen', 'turn off the display', 'turn off the displays', 'turn off the screen', 'turn off display'] },
  { tier: 'action', verb: 'screensaver', value: 'screensaver', label: 'the screen saver', names: ['salvapantallas', 'screen saver', 'screensaver'],
    es: cross(['pon', 'poner', 'activa', 'activar', 'enciende', 'inicia', 'iniciar', 'muestra'], ['el salvapantallas']),
    en: ['start the screen saver', 'start screen saver', 'start the screensaver', 'show the screen saver', 'show screen saver', 'turn on the screen saver'] },
  { tier: 'action', verb: 'hide-others', value: 'others', label: 'other apps',
    es: cross(['oculta', 'ocultar', 'esconde', 'esconder'], ['las demas', 'las demas apps', 'las demas aplicaciones', 'todas las demas', 'todas las demas apps', 'el resto', 'el resto de apps']),
    en: ['hide other apps', 'hide all other apps', 'hide the other apps'] },
  { tier: 'action', verb: 'screenshot-toolbar', value: 'screenshot', label: 'the Screenshot toolbar', names: ['screenshot', 'screenshots', 'captura de pantalla', 'captura', 'pantallazo'],
    es: [...cross(['haz', 'hacer', 'toma', 'tomar'], ['una captura', 'una captura de pantalla', 'un pantallazo']), 'captura la pantalla', 'graba la pantalla', 'grabar la pantalla'],
    en: ['take a screenshot', 'take a screen shot', 'record the screen', 'record my screen', 'take a screen recording'] },
  { tier: 'action', verb: 'mission-control', value: 'missioncontrol', label: 'Mission Control', names: ['mission control'],
    es: cross(['abre', 'abreme', 'abrir', 'muestra', 'muestrame'], ['mission control', 'el mission control']),
    en: cross(['open', 'show', 'show me'], ['mission control']) },
  { tier: 'query', verb: 'query', value: 'battery', label: 'battery',
    es: ['bateria', 'que bateria tengo', 'cuanta bateria queda', 'cuanta bateria me queda', 'cuanta bateria tengo', 'nivel de bateria', 'estado de la bateria'],
    en: ['battery', 'battery level', 'battery status', 'how much battery', 'how much battery is left', 'how much battery do i have', 'how much battery have i got', 'what is my battery', 'whats my battery'] },
  { tier: 'query', verb: 'query', value: 'disk', label: 'disk space',
    es: ['espacio en disco', 'espacio libre', 'cuanto disco queda', 'cuanto espacio libre queda', 'cuanto espacio libre tengo', 'cuanto espacio queda', 'cuanto espacio me queda'],
    en: ['disk space', 'free space', 'free disk space', 'how much disk space', 'how much disk space is left', 'how much disk is left', 'how much free space', 'how much free space do i have', 'how much space is left', 'how much space do i have left'] },
  { tier: 'query', verb: 'query', value: 'vpn', label: 'VPN status',
    es: ['estado de la vpn', 'estado vpn', 'esta conectada la vpn'], asking: ['estoy conectado a la vpn'],
    en: ['vpn status', 'is the vpn connected', 'is the vpn on', 'is the vpn up', 'am i on the vpn', 'am i connected to the vpn'] },
]

// Phrase vocabulary (src/phrase.mjs reads it)
export const VERBS = {
  open: ['abre', 'abreme', 'abrir', 'abrime', 'open'],
  reveal: ['muestra', 'muestrame', 'ensena', 'ensename', 'revela', 'reveal', 'show'],
  copy: ['copia', 'copiame', 'copiar', 'copy'],
  shortcut: ['ejecuta', 'lanza', 'run'],
  // Quit comes from the templates only: it is not in the model's catalogue (src/catalogue.mjs).
  quit: ['cierra', 'cierrame', 'cerrar', 'close', 'quit'],
  // Hide is the templates' alone as well: a graceful hide of an installed app, by exact name, like quit.
  hide: ['oculta', 'ocultar', 'esconde', 'esconder', 'hide'],
  // Find comes from the templates only, too: "busca el roadmap" reveals the one file of that name (see plan.mjs).
  find: ['busca', 'buscame', 'buscar', 'encuentra', 'encuentrame', 'encontrar', 'localiza', 'localizame', 'localizar', 'find', 'locate'],
}
export const FILLERS = /^(oye|hey|porfa|por favor|please|puedes|can you|could you)\b[\s,]*/
export const QUIT_LEADS = ['sal de', 'salir de', 'me cierras']
export const QUIT_LEAD = new RegExp(`^(${QUIT_LEADS.join('|')})\\s+`)
// "terminal en brand": a phrase that opens with the noun (src/modifiers.mjs)
export const TERMINAL_NOUNS = ['terminal']
export const REQUEST = /\b(abr\w*|open\w*|launch\w*|lanz\w*|start|arranc\w*|inicia\w*|ejecut\w*|run|muestr\w*|mostr\w*|ensen\w*|show|reveal\w*|revel\w*|copi\w*|copy|bring|take|llev\w*|pon\w*|turn|enciend\w*|ve|go|vamos|quiero|necesito|want|need|ver|let me see|i want to see|dame|give|get|saca|sac\w*|trae\w*|find|busca\w*|encuentra\w*|activ\w*|pasa|pasame|pasas|trigger|donde esta)\b/
export const PUT = /^put\b|(?<!\b(i|we|you|he|she|they) )\bput\b.+\b(on (the )?screen|in (the )?(finder|front))$/

// The request forms `teach` shows the teacher, each with the verb it asks for. The paraphrase prompt is
// built from this table and a test holds every form against REQUEST (or the place rule for a closing
// place), so what the model is taught and what the gate lets through cannot drift apart. The hooks' gate reads them too.
export const REQUEST_FORMS = [
  ...['quiero ver', 'necesito', 'llévame a', 'me llevas a', 've a', 'take me to', 'bring up', 'go to', 'let me see', 'I want to see', 'lanza', 'launch', 'activa', 'enciende'].map(form => ({ form, verb: 'open' })),
  ...['pon … en el finder', 'muestra … en el finder', 'llévame … en el finder', 'put … in finder', 'show … in finder', 'dónde está …'].map(form => ({ form, verb: 'reveal' })),
  ...['pásame', 'pásame … al portapapeles', 'copia … al portapapeles', 'copy … to the clipboard', 'put … to the clipboard'].map(form => ({ form, verb: 'copy' })),
  ...['ejecuta el atajo', 'run the shortcut'].map(form => ({ form, verb: 'shortcut' })),
]
// Forms that state a wish, not a command: «quiero ver el log» / «I want to see the stack trace» are sentences to Claude far more
// often than requests. The model path still answers them when they reach the CLI, but the hooks' gate does not send them.
export const UNGATED_FORMS = ['quiero ver', 'necesito', 'let me see', 'I want to see']
// Words that make a phrase a question or talk, not a request (src/plan.mjs keeps it from the model; the gate from the CLI)
export const QUESTION = /\b(por que|porque|why|como|how|que pasa|si funciona|whether|who|quien|what|when|cuando|where|donde|which|cual|whose|cuant(o|os|a|as)|para que|(ver|saber) que|see (that|if))\b/

// Generic nouns: a word that names a KIND of thing, not one thing («the website», «el doc», «la web de reflex»). With a
// definite article or a demonstrative the person points at something in the conversation, so such a phrase is deictic:
// it resolves only through the session's recent items (src/context.mjs) and otherwise belongs to Claude. It never
// grounds by name, whatever folder or file happens to be called «website» or «docs» (every developer Mac has some).
// `kind` is what the resolver looks for: web (a page, never a code host), pr, repo, link (any address), doc, deck,
// sheet, image, video, diagram, pdf, file (any file). Accents folded, lower case; longest noun wins ("pull request").
// Singular only, but «docs»: «documents», «documentos» and «pictures» are folders on every Mac, and «open my documents» means one.
export const DEICTIC_DETERMINERS = {
  en: ['the', 'this', 'that', 'these', 'those', 'my'],
  es: ['el', 'la', 'los', 'las', 'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas', 'aquel', 'aquella', 'mi', 'mis'],
}
export const GENERIC_NOUNS = [
  { kind: 'web', en: ['website', 'web site', 'site', 'web', 'webpage', 'web page', 'page', 'landing', 'landing page', 'homepage', 'home page'], es: ['web', 'pagina', 'pagina web', 'sitio', 'sitio web', 'landing', 'pagina de inicio'] },
  { kind: 'pr', en: ['pr', 'pull request', 'merge request', 'mr'], es: ['pr', 'pull request', 'merge request', 'mr'] },
  { kind: 'repo', en: ['repo', 'repository'], es: ['repo', 'repositorio'] },
  { kind: 'link', en: ['link', 'url', 'address'], es: ['link', 'enlace', 'url', 'direccion'] },
  // Only these four mean "the document Claude just made". The others are guarded as well but resolve only to a file whose own name holds the word.
  { kind: 'doc', en: ['doc', 'document', 'article', 'draft'], es: ['doc', 'documento', 'articulo', 'borrador'] },
  { kind: 'docword', en: ['docs', 'post', 'report', 'paper'], es: ['docs', 'post', 'informe', 'reporte'] },
  { kind: 'deck', en: ['deck', 'slides', 'slide deck', 'presentation'], es: ['deck', 'diapositivas', 'presentacion', 'slides'] },
  { kind: 'sheet', en: ['spreadsheet', 'sheet'], es: ['hoja de calculo', 'hoja', 'spreadsheet'] },
  { kind: 'image', en: ['image', 'picture', 'photo', 'screenshot', 'pic'], es: ['imagen', 'foto', 'captura', 'captura de pantalla', 'pantallazo'] },
  { kind: 'video', en: ['video', 'clip', 'recording'], es: ['video', 'clip', 'grabacion'] },
  { kind: 'diagram', en: ['diagram', 'chart', 'graph'], es: ['diagrama', 'grafico'] },
  { kind: 'pdf', en: ['pdf'], es: ['pdf'] },
  { kind: 'file', en: ['file'], es: ['archivo', 'fichero'] },
]
