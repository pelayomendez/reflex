<p align="center"><img src="assets/icon.png" width="160" alt=""></p>

# reflex

Type "open brand" in Claude Code and it happens at once, without waking Claude.

While you type, a line above the prompt says what Enter will do on your Mac: `⚡ open ~/Development/pelayomendez/brand`. Press Enter and it runs here; the prompt never reaches the model, so it costs no tokens and no turn. Anything that is not wholly an action goes to Claude as typed, and a leading `\` always sends it to Claude.

## What it does (first version)

| Say | It does |
|---|---|
| `abre brand` · `open Downloads` | opens a folder: your repos under `~/Development`, your home folders, zoxide's |
| `abre Figma` | opens an installed app |
| `abre github.com/pelayomendez` · `abre linkedin` | opens a page (an address, or an alias you set) |
| `muéstrame el post de watchmen` | shows a file in Finder, found by the words of its path |
| `copia la imagen de cache-nudge post` · `copia "hola"` | copies an image, a file or text to the clipboard |
| `ejecuta modo foco` | runs a Shortcut from the Shortcuts app |
| `cierra Slack` · `quit Figma` · `sal de Spotify` | asks an installed app to quit, the way Cmd-Q does |
| `oculta Slack` · `esconde Spotify` · `hide Slack` | hides a running app, nothing more (it comes back with a click; an app that is not running is left alone, never launched) |
| `abre ajustes de sonido` · `abre ajustes de aspecto` · `open Bluetooth settings` · `abre la configuración de red` · `ajustes de pantalla` · `privacy settings` | opens that System Settings pane. A closed list of 13 (sound, Bluetooth, Wi-Fi, network, displays, battery, keyboard, trackpad, notifications, privacy & security, general, software update, appearance, which Spanish macOS calls «Aspecto»); `abre ajustes` · `open settings` open the System Settings app |
| `bloquea la pantalla` · `bloquea el mac` · `lock screen` · `lock the mac` | locks the screen (puts the display to sleep). reflex asks `sysadminctl -screenLock status` first and acts only when «Require password» is *Immediately*; otherwise it passes, because it would only sleep the display |
| `silencia` · `mute` · `unmute` · `sube el volumen` · `baja el volumen` · `volumen al 30` · `volume 30` | mutes, unmutes, nudges the volume by 10 (up also unmutes, down keeps the mute state), or sets it to a whole number from 0 to 100 (`volumen al 30`, `pon el volumen en 30`, `volume 30`; after sube/baja only «a/al N» is a level, and a bare `volume 5` is not a request). A level leaves the mute state alone |
| `abre la papelera` · `open the trash` | opens the Trash in Finder |
| `vacía la papelera` · `vaciar la papelera` · `empty trash` · `empty the trash` | **asks first**: «¿Vaciar la Papelera: 312 elementos?» with «No» first (and the default). «No», Esc or anything else drops the prompt: it does not run and does not go to Claude. The count is read from Finder when you press Enter (never while you type), and the Trash is re-read right before emptying: if it grew since you said yes, nothing is emptied. An empty Trash, or a count Finder will not give, goes to Claude. Exact phrases only (polite forms too): questions, negations, compounds and «la papelera de reciclaje de Windows» are Claude's, and so is any of it when a folder, app, Shortcut or alias is called «papelera» or «trash» (a file never counts: reflex does not empty files). Needs Automation permission for Finder, granted to your terminal. Outside Claude Code (`reflex --json`, `-n`) it only reports that it would ask |
| `batería` · `¿qué batería tengo?` · `how much battery` | answers in the prompt (`⚡ Battery: 89%, discharging, 4:59 left`) from `pmset -g batt`, without Claude. Read-only |
| `espacio en disco` · `cuánto disco queda` · `disk space` · `free space` | answers from `df -H /System/Volumes/Data` (the Data volume; `/` is the sealed system snapshot) |
| `estado de la vpn` · `¿está conectada la vpn?` · `vpn status` · `am I on the vpn` | answers from `scutil --nc list`: the one VPN service, or the one `[roles] vpn` names by its service name. When the vpn role points to an app (OpenVPN Connect, AnyConnect) it passes: that app is not necessarily this service. Several services and no role, or an output reflex does not know, go to Claude |
| `activa el modo oscuro` · `pon el modo claro` · `turn on dark mode` · `turn off dark mode` · `alterna el modo oscuro` · `toggle appearance` (a bare «dark mode» is not a request: it may be the answer to a question of Claude's) | sets dark or light mode, or toggles it. Needs Automation permission for System Events; reflex reads the mode back and says so if it did not change |
| `apaga la pantalla` · `pon las pantallas en reposo` · `sleep displays` · `turn off the display` | puts the displays to sleep (`pmset displaysleepnow`) |
| `pon el salvapantallas` · `start the screen saver` | starts the screen saver |
| `oculta las demás` · `oculta las demás apps` · `hide other apps` | hides every app but the frontmost one and the one hosting your session (it passes when no app hosts it, in tmux or over ssh) |
| `haz una captura` · `graba la pantalla` · `take a screenshot` · `record the screen` | opens the Screenshot toolbar (⌘⇧5); the Screenshot app takes the picture, reflex needs no Screen Recording permission |
| `abre mission control` · `open mission control` | opens Mission Control |
| `abre el roadmap de reflex en el editor` · `open design.md in Cursor` | opens a text file in your editor, or a folder if the editor is an app. A bare «edita X» is Claude's (it most likely means change the file). At a line: `abre design.md en la línea 40 en Cursor` · `open design.md:40 in VS Code` |
| `abre una terminal en brand` · `open a terminal in reflex` · `terminal en descargas` · `abre brand en Ghostty` | opens a new terminal window in a folder (it cannot change the shell you are typing in) |
| `busca el roadmap` · `encuentra la factura de octubre` · `find design.md` · `busca watchmen-post.png` | shows the file in Finder when exactly one file or folder has that name (extension included when typed). Several, or a bare generic word like `busca tests` / `find the config` (most likely a code search), go to Claude |
| `abre la última captura` · `muestra la última descarga` · `open my latest screenshot` · `abre el último pdf de descargas` | the newest file of a kind (screenshot, download, or a pdf, image or video of `descargas`, `escritorio` or `documentos`), read off the disk when you press Enter. Open, show or copy |
| `copia la ruta de brand` · `copy the path of reflex` | copies the absolute path as text (not the file: `copia el roadmap de reflex` still copies the file) |
| `abre brand en GitHub` · `open reflex on github` · `abre el repo de brand en el navegador` | opens the repo's page on the web, read from its `origin` remote (no network until the browser opens) |

Spanish and English. Nothing it does writes, moves or sends. The one thing that deletes is Empty Trash, and it always asks first. Quitting only asks the app to close: it keeps its own save prompts, reflex never force-quits, and an app that is not running is left alone. Only apps, named exactly as installed; anything else («cierra brand», «close the tab») goes to Claude. Hiding follows the same rules as quitting (exact name, running only, never the app hosting your session).

The settings, lock and volume phrases are a closed table of fixed phrases (`src/system.mjs`), matched whole: «no bloquees la pantalla», «ya silencié el sonido», «¿bloquea la pantalla?», «volumen al 150» and anything joined with another request are Claude's. They need their own words («ajustes de», «volumen», «la pantalla»), so «abre sonido» still opens a folder called `sonido`, and «activa el sonido» or «pon el volumen a tope» go to Claude instead of becoming an open. No model is involved in any of them.

### Find and newest: forms and selectors

- **Find**: `busca`, `encuentra`, `localiza`, `find`, `locate` + the name. The same strict file grounding a model's answer gets: the whole name (accents, case and `-_.` aside; with its extension if typed, `package.json`), optionally scoped by a known folder (`busca el readme de brand`, `busca el roadmap en reflex`), never a word that merely occurs in a path. It acts only when exactly one item matches: several are Claude's, there is no list. A lone generic word (`tests`, `config`, `index`, `main`, `utils`, `readme`…) is a code search, not a file name, unless a kind word (`el archivo`, `the file`), an extension or a known folder comes with it. No closing place («en el finder»): that wording keeps going to the small model, as before. «¿Dónde está el roadmap?» is also the small model's, with the same grounding; the templates leave it alone. «Busca información sobre X», «busca el bug en …» and a name that is an app, an address or a Shortcut go to Claude.
- **Newest of a kind**: «la última captura» (the macOS screenshot folder, `defaults read com.apple.screencapture location`; with none set, Desktop, and only files named like a screenshot there: Screenshot, Captura de pantalla, Bildschirmfoto… or your own `name` prefix), «la última descarga» (`~/Downloads`, folders included: an extracted archive counts), and «el último pdf / la última imagen / el último vídeo de descargas, escritorio o documentos» (a place must be named). «Newest» is the modification time, so a folder shows when its contents last changed. Partial downloads and hidden files are skipped; two items equally new, an empty folder or an unreadable one go to Claude. `open` takes only documents and media (pdf, txt, md, rtf, csv, docx, xlsx, pptx, pages, numbers, key, images, audio, video) and plain folders; html, svg, archives, profiles, macro documents, scripts, programs, apps and bundles, files with no or an odd extension are for Claude: show or copy them instead.

### Where and with what: modifiers

A closing phrase says where an `open` happens: «en el editor», «en Cursor», «con VS Code», «para editar», «en la terminal», «en Ghostty», «in the editor», «in terminal», and the terminal openers «abre una terminal en X», «open a terminal in X», «terminal en X». Only an explicit open acts: «edita X» / «edit X» on its own goes to Claude, because inside Claude Code it most likely asks to change the file. The model never sees them: they are table entries in `src/modifiers.mjs`, stripped before the templates and the model read the phrase.

- **Editor**: text-like files only (md, txt, json, yaml, toml, js/ts and other source, css, html, xml, csv, ini, env, plus Makefile, Dockerfile and dotfiles like `.zshrc`; a PDF, image or document goes to Claude), or a folder when the editor is an app. The editor is the one the phrase names (it has to be installed), else `[editor]` in the config, else a GUI editor named in `$VISUAL` or `$EDITOR` (`code`, `cursor`, `zed`, `subl`, `mate`, `bbedit`, `nova`, `windsurf`), else the system's default text app (`open -t`, files only). A named editor that is not installed, or a configured one, is never replaced silently: the phrase goes to Claude. A line (`en la línea 40`, `at line 40`, `on line 40`, `línea 40` right after a stated editor, `:40` beside a stated editor; never a bare «line 3» that may be part of a name; 1 to 100000) works in Cursor and VS Code, through their `cursor://` and `vscode://` links; anywhere else it goes to Claude.
- **Terminal**: folders only. The terminal is the one the phrase names (Ghostty or iTerm, installed), else `[terminal]` in the config, else Terminal. It runs `open -a <app> <folder>`. Only Terminal, iTerm and Ghostty: they are the ones known to open the window in the folder given (checked by hand for Terminal and Ghostty); another terminal (Warp, Kitty, Alacritty…) may open its default directory instead, so it goes to Claude, named or configured.
- **Web** (`en GitHub`, `en GitLab`, `en el navegador`, `en la web`, `on github`, `in the browser`, `on the web`): a folder that is itself a checkout with an `origin` remote opens as that remote's page: `git@github.com:o/r.git`, `https://…/r.git` and `ssh://git@host:2222/g/sub/r.git` all become `https://host/…/r` (credentials and the ssh port never reach the address; a path on disk, a `file://` remote, a query or an Azure ssh address is refused). Naming GitHub asks for a GitHub origin, naming GitLab for any origin that is not GitHub or Bitbucket (self-hosted GitLab has any name); a mismatch goes to Claude, and so does a folder with no origin, a file, an app or a Shortcut. An alias or a typed address with `en el navegador` still opens as an address (`abre linkedin en el navegador`). This changes two old behaviours: `abre reflex en el navegador` used to open the local folder, and `abre figma en el navegador` used to open the app; the first now opens the repo page, the second goes to Claude.
- **Path** (`la ruta de X`, `la ruta completa de X`, `el path de X`, `the path of X`, `the full path of X`, optionally `al portapapeles`): the absolute path of the one file or folder named, copied as text. X is held to the strictness of a find. An app, an address or a Shortcut has no path to copy, and when a file is also called like the whole phrase («ruta de brand») which one is meant is not for reflex to guess.
- A modifier on a target that does not fit (a terminal on a file, an editor on an app, an address, or on another verb such as `copia`) goes to Claude, as do negations, past tense, questions, talk, compound requests, and a phrase that asks for an editor *and* a terminal. The preview says where: `⚡ edit roadmap.md in Cursor`, `⚡ terminal in brand (Ghostty)`.

## Install

```
/plugin install reflex --marketplace pelayomendez/reflex
```

Or, while developing it: `claude --plugin-dir /path/to/reflex`.

Needs Node.js 20 or newer on macOS. Optional:

- **zoxide**, for the folders you visit most.
- **A small local model** for freer phrasing ("¿me abres brand?"): `ollama pull mfpelayo/reflex-core` (FunctionGemma 270M taught the task on invented Macs, so it knows no one's names), then in `~/.config/reflex/config.toml`:
  ```toml
  [model]
  url = "http://localhost:11434/v1"
  name = "mfpelayo/reflex-core"
  keep_alive = "1h"   # how long Ollama keeps it loaded between phrases (default 1h)
  ```
- **Aliases**, in the same file:
  ```toml
  [aliases]
  linkedin = "https://www.linkedin.com/feed/"
  ```
- **Roles**, the app you mean when you say what it does («show me the vpn», «abre el correo», «muéstrame el calendario»). A closed list of ten: vpn, mail (mail, correo, email), calendar (calendar, calendario, agenda), browser (browser, navegador), music (music, música), notes (notes, notas), maps (maps, mapas), photos (photos, fotos), contacts (contacts, contactos), messages (messages, mensajes). Each resolves to one app on your Mac: the `[roles]` table below, else the default handler (`mailto:` for mail, `https:` for the browser, read when the index is built), else the only installed app whose name holds the word (`vpn` is OpenVPN Connect), else the macOS app (Calendar, Mail, Music, Notes, Maps, Photos, Contacts, Messages). If two apps fit at a step and nothing earlier decided, or the handler lookup gave no answer, the phrase goes to Claude: a role word never falls back to a looser match or a list of files. Your `[roles]` entry is your explicit choice and wins even over an app named exactly that (`mail = "Mimestream"` makes «open mail» open Mimestream); the default handler is only inferred, so it does not (an installed Mail.app is still what «open mail» opens). An alias or a folder named exactly that wins over any role; a kind word («the vpn pdf», «carpeta calendario»), `busca`/`find`, `quit` and `hide` never use one. Opens and shows only:
  ```toml
  [roles]
  vpn = "OpenVPN Connect"        # an app name, or a path to a .app
  mail = "/Applications/Mimestream.app"
  ```
  A configured app that is not installed means no role for that word, never a different app.
- **Editor and terminal**, for «en el editor» and «en la terminal»:
  ```toml
  [editor]
  app = "Cursor"        # any installed app; or `command = "code"` for a GUI editor's command
  [terminal]
  app = "Ghostty"       # Terminal (default), iTerm or Ghostty
  ```

## From the terminal

```bash
bin/reflex "abre brand"          # does it
bin/reflex -n "abre brand"       # says what it would do
bin/reflex why "abre brand"      # how it decided
bin/reflex --json "abre brand"   # the plan, for scripts and agents
bin/reflex index                 # rebuild the list of folders, apps, files and Shortcuts
bin/reflex teach --count 300     # have Claude write the training set for the small model
bin/reflex learn                 # summarise the local log of what use taught
bin/reflex learn --export f.jsonl   # candidate training examples from that log (does not train)
```

`teach` asks Claude (through `claude -p`) for training phrases and writes `train.jsonl` and `valid.jsonl` to `~/.local/share/reflex/train/` (`--out DIR` to change it). It sends Claude **names from your index** (folder, app and Shortcut names, and file names; a file name is a name it sends), never full paths or file contents. `bin/reflex teach --print-prompt` shows exactly what would be sent, without sending it. The teacher runs in batches of about 45 phrases, without tools or MCP servers. Copying quoted text (`copia "hola"`) is not something the model learns: it goes to Claude.

## Privacy: what reflex remembers

In Claude Code, reflex keeps a log of what use teaches it, so a later round of training can learn from it. It is one JSON line per event in `~/.local/share/reflex/log.jsonl` (`$XDG_DATA_HOME/reflex/` if set), written with owner-only permissions. It stays on this Mac: nothing reads it except `reflex learn`, and nothing sends it anywhere. It is outside the repo, so it cannot be committed by accident.

- `accepted`: a phrase reflex acted on, with the verb and target it chose.
- `override`: a phrase you typed after a leading `\` that reflex would have acted on, and what it would have done.
- `oracle`: a phrase reflex passed to Claude, and the first Bash command Claude ran in that turn that reflex could have run itself (`open <path>`, `open -a <App>`, `open -R <path>`, `open <url>`, a path piped to `pbcopy`), mapped to a verb and target.

**Phrases can be personal**, and so can the paths in the log. To turn the log off, put this in `~/.config/reflex/config.toml`:

```toml
[learn]
log = "off"
```

To delete what is already there: `rm ~/.local/share/reflex/log.jsonl`. `reflex learn --export` writes examples to a file you name, after dropping anything that does not ground in your index; read that file before you share it, since the phrases are yours.

Design and research: [docs/design.md](docs/design.md), `docs/research/`.
