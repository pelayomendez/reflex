# reflex — design

**Type "open brand" in Claude Code and it happens at once, without waking Claude.**

Acting on your own machine (open a folder, a page, an app; copy something; run a Shortcut) should never cost a model turn. reflex recognises those phrases as you type, shows what it will do above the prompt, and on Enter does it locally. Everything else goes to Claude untouched.

## A cognitive core for your Mac

Karpathy's "cognitive core" ([tweet](https://x.com/karpathy/status/1938626382248149433)) is a small model that lives always-on on every computer. It gives up encyclopedic knowledge for capability, uses tools heavily, keeps LoRA slots for on-device finetuning, and delegates to a cloud "oracle" when it needs to. Its argument is low latency, private access to local data and state, offline continuity and sovereignty.

reflex is that idea, scoped to one job: acting on your own machine.

| Cognitive core | reflex |
|---|---|
| always-on kernel | sits on every prompt; answers in milliseconds, before Enter |
| sacrifices knowledge for capability | knows nothing about the world, only your Mac: the index of your folders, repos, apps, files and Shortcuts |
| heavy tool use | a closed catalogue of typed verbs, each a fixed argument list |
| capability dial | templates (free) → small model (local) → Claude (oracle) |
| on-device LoRA slots | an adapter trained on *your* system: your repo names, your apps, the way you phrase things |
| delegates to cloud oracles | anything it is not sure of goes to Claude as typed |
| oracle as teacher | Claude writes the training phrases from your index; later, every action Claude ran that reflex could have run becomes a new example |

The loop that makes it yours: Claude teaches, the small model learns your system on your Mac (mlx-lm, LoRA, minutes), reflex measures it against its own test phrases and keeps the adapter only if it is better.

## Principles

- **Light.** One install, no configuration needed. Each extra (the small model, aliases) is optional.
- **Visible.** It never decides in silence: the action shows above the prompt before Enter.
- **Closed.** A short catalogue of typed verbs, run as fixed argument lists, never through a shell. Nothing in the first version writes, moves, deletes or sends; `quit` only asks an app to close and the app keeps its save prompts.
- **Conservative.** It takes a phrase only when the whole phrase is an action. Anything left over (`open X and fix the bug`) goes to Claude.

## Shape

```
 prompt box ──▶ plugin (Claude Code mod) ──▶ reflex CLI ──▶ open / osascript / shortcuts
                 · draws "⚡ open brand"        · templates (es, en)
                 · on Enter: run, drop prompt   · resolvers: zoxide, ~/Development, /Applications, Spotlight, aliases
                                                · optional: FunctionGemma via any OpenAI-compatible server (Ollama)
```

The CLI is the core and works on its own (`reflex "abre brand"`, `--dry-run`, `--json`, `reflex why`), so a zsh widget, herdr or other agents can use it later.

## Resolving a phrase

1. **Prefilter.** No catalogue verb in the phrase: not an action, nothing more runs.
2. **Templates.** Phrase patterns per language with slots, e.g. `(abre|ábreme|open) [la carpeta [de]] {target}`. A whole-phrase match only.
3. **Small model, if present.** FunctionGemma with the catalogue as typed functions. Used only when templates miss; its answer must pass step 4 and high confidence.
4. **Ground the slots.** Each slot must resolve to something real: a folder (aliases, zoxide, `~/Development/*`, home folders), an app in `/Applications`, a URL, a file (Spotlight), a Shortcut (`shortcuts list`). If not, no action.

## Catalogue (first version)

| Verb | Slots | Runs |
|---|---|---|
| `open` | folder · file · app · url | `open <path>` · `open -a <app>` · `open <url>` |
| `reveal` | folder · file | `open -R <path>` |
| `copy` | file (image or text) · text | `osascript` clipboard |
| `shortcut` | Shortcut name | `shortcuts run <name>` |
| `quit` | app, exact installed name | `osascript` asks the app to quit (Cmd-Q), only if it is running |
| `hide` | app, exact installed name | `osascript -l JavaScript`: `NSRunningApplication.hide` on the running app with that bundle path (no Apple Events, no Automation permission); never launches it |
| `settings` | a pane of the closed table (`PANES` in `src/system.mjs`) | `open x-apple.systempreferences:<pane id>` |
| `lock` | fixed phrases | `pmset displaysleepnow` |
| `volume` | `mute` · `unmute` · `up` · `down` · an integer 0–100 | `osascript -e 'set volume …'`, fixed statements; a level travels as an argument |

Two more actions come from modifiers (below), not from verbs: `edit` (an `open` of a file or folder in an editor) and `terminal` (an `open` of a folder in a terminal window). Like `quit`, they are not in the model's catalogue.

| Action | Slots | Runs |
|---|---|---|
| `edit` | file · folder (folder only in a GUI editor app) | `open -a <editor> <path>` · `open -t <file>` (system default) · at a line `open cursor://file/<path>:<line>` / `vscode://…` |
| `terminal` | folder | `open -a <terminal> <folder>` |

`quit` comes from the templates alone: it is not in the model's catalogue (`src/catalogue.mjs`), which stays as the model was trained, and a phrase that asks to close something never reaches the model. An app that hosts the session (an ancestor of the process) is never quit. The running check compares the app's bundle path, so a running app at a different path fails safe: it reports "not running".

### System actions (slice 3)

`settings`, `lock` and `volume` are one closed table in `src/system.mjs`; `hide` is a verb of `phrase.mjs` and `ground.mjs`, like `quit`. All four come from the templates alone, are not in the model's catalogue, and are checked by `plan()` before anything else (the table) or by the template verbs (hide). They are fixed phrases matched whole, so every gate (negation, past and reported speech, question, talk, compound) holds by construction: only a closed list of wordings matches, and a question matches only in the second person («¿puedes bajar el volumen?»). No free text reaches a command: a pane is an entry of `PANES`, a level is `\d{1,3}` ≤ 100 re-checked in `run.mjs`, the rest are constants.

- **Panes.** Ids were read off this OS (macOS 15, Darwin 24.6): System Settings' own `Sidebar.plist` for Wi-Fi, Bluetooth, Network, Notifications, Sound, General, Appearance, Privacy & Security, Displays, Battery, Keyboard and Trackpad, and the pane extension's `CFBundleIdentifier` for Software Update (a sub-page of General, so it has no sidebar entry). Ids changed in macOS 13 (System Preferences to System Settings) and may again; a pane that cannot be verified like this is not added. `abre ajustes` and `open settings` open `/System/Applications/System Settings.app` (any language; its name is localised, its path is not).
- **Lock.** `pmset displaysleepnow`: public, no permission, no sudo. It locks only when System Settings › Lock Screen › «Require password after screen saver begins or display is turned off» is *Immediately*, so the lock phrase runs `sysadminctl -screenLock status` at plan time (output on stderr, both streams read; injectable as `screenLockStatus`, and the exams inject a fixed answer) and acts only on «screenLock delay is immediate». Any other output, an error or a missing tool passes with the reason that reflex would only sleep the display. The older `CGSession -suspend` is gone from macOS 13 on (no `User.menu`), and the private `SACLockScreenImmediate` is not worth a private API.
- **Volume.** Up and down move by 10 (`VOLUME_STEP`) and clamp to 0–100. Only up unmutes; down and an absolute level leave the mute state as it is (the simplest honest preview: «volume 30%» does exactly that). After sube/baja only «a/al N» is a level; a bare «volume N» below 10 without % passes. Wording for these is a whole-phrase list, and «activa el sonido» is deliberately not one of them (it could mean unmute or Settings).
- **Collisions.** `mentionsSystem` (whole words, so `package-lock.json` is a name) keeps phrases that hold these words (volumen, mute, silencia, bloquea, lock, oculta, esconde, hide; a toggle opener with sonido, Bluetooth or Wi-Fi; a settings word with a pane name) away from the model, because the closest thing it could answer is an open of a folder called «sonido» or «volumen». A phrase that names a kind (carpeta, archivo, folder, file…) is about a file or folder and is exempt, unless its verb is itself hide/lock/mute-like. A name that is a plain open still works («abre sonido»); a folder, app or alias whose name is the whole of a pane phrase («ajustes de red») is left to the ordinary rules.
- **Hide.** The quit rules: an installed app named exactly, running only (by bundle path), never the app that hosts this session, never from a model, bare third-person questions pass.

## Modifiers

`docs/research/cli-layer.md` names the growth axis: target kinds and modifiers, not verbs. A modifier is a closed, bilingual table entry (`src/modifiers.mjs`: prepositions, determiners, nouns, whole clauses, editor and terminal app names) that generalises the old place suffix («en el finder», «al portapapeles»). The pipeline:

1. `extractModifier` reads the typed phrase and cuts the modifier out of it, leaving the request («¿me abres el roadmap de reflex en el editor?» becomes «¿me abres el roadmap de reflex?»). «terminal en X» is rewritten to «abre X» and is for the templates alone, since the model was not trained on them. Two modifiers that disagree (an editor and a terminal, two apps, a line next to a terminal) are a refusal.
2. `resolveApp` picks the app: the phrase, then the config, then `$VISUAL`/`$EDITOR` (GUI commands only), then the system default. An app that is not in the index is a refusal, so is a configured one that cannot be honoured. Nothing is silently replaced.
3. The rest is the ordinary pipeline, templates then model, with the same gates and the same strict grounding. One difference: with a modifier a dotted word (`design.md`) is a file, not an address.
4. The result must be an `open` of something that fits: files and folders for an editor (a folder only when the editor is an app), folders for a terminal. Anything else, another verb included, goes to Claude. «Which one?» questions keep only the candidates that fit.

Decisions: a bare «edita X» / «edit X» is not an action: inside Claude Code it most likely means "change the file", which is Claude's job, so only an explicit open (`abre X en el editor`, `en Cursor`, `para editar`) acts. An editor opens text-like files only (an extension allowlist plus Makefile, Dockerfile and dotfiles); a PDF or an image goes to Claude. A bare «line 3» is never read as a line (it may name a file); a line needs «en la línea N», «at line N», «on line N», «línea N» after a stated editor, or «:N» beside one. Terminals are limited to Terminal, iTerm and Ghostty, the ones known to open in the given folder; another may open its default directory, which would be a wrong action. A folder opens in the editor when it is a GUI app, because `open -a Cursor <folder>` opens it as a project; the system default text app cannot, so there a folder goes to Claude. A line number needs an editor reflex can address (Cursor, VS Code); the others cannot honour it, so the phrase goes to Claude rather than opening the file without the line.

### Slice 2: find, newest of a kind, path, repo on the web

Four more forms, all templates and rules, none in the model's catalogue (`src/catalogue.mjs` is byte-identical, so nothing is retrained):

- **`web` modifier** (`src/modifiers.mjs`, same table and same stripping as the editor and the terminal). The folder the rest of the phrase names must itself be a git checkout with an `origin` remote (`src/world.mjs` reads it with `git remote get-url origin`, no network, only on a phrase that has the modifier). `src/remote.mjs` turns the remote into `https://host/path`: scp-like, `https`, `ssh://` (port dropped), `git://`, credentials removed, `.git` and trailing slashes stripped; anything that is not clearly `owner/repo` on a dotted host (a disk path, `file://`, a query, an ssh-only host such as Azure's) is refused. A named host is held to the origin (`MODIFIERS.web.forges`): GitHub needs a `github` host, GitLab only rules out the other forges because a self-hosted one has any name. A url target (alias, typed address) keeps opening as an address, so `abre linkedin en el navegador` is as before; this replaces the old place suffix for «en el navegador», which opened the local folder (an `open` of a folder in the browser was never what the phrase asked).
- **`path` modifier.** «copia la ruta de X» (and «the full path of X», «al portapapeles») is rewritten to the find «busca X», so X is grounded as strictly as a find, then the result is copied as a `text` target: the same `copy` action and runner as a quoted text (`pbcopy`), not a new verb. The file itself is still `copia el roadmap de reflex`. Evals tell them apart through `expect.type` (`text` against `file`). If the whole phrase also names a file («ruta de brand» as a filename) the phrase goes to Claude. It never reaches the model.
- **`find` verb** (`busca`, `encuentra`, `localiza`, `find`, `locate`; templates only, like `quit`): a reveal of the one file or folder whose name is that, grounded with the model's strictness (`ground(..., { exact: true })`): the whole name, extension included when typed, scoped by an optional known folder. Only a single match acts; several are Claude's (in Claude Code «busca tests» most likely means a code search, so there is no list), and a lone generic word (`GENERIC` in `src/plan.mjs`) acts only with a kind word, an extension or a folder. A target that is an alias, an app or a Shortcut is not a find (and the model route, which a find with a closing place still takes, is held to the same rule). «¿Dónde está X?» was already the model's, with this grounding (`REQUEST_FORMS`: reveal); it stays so, because the templates answering it would take whole phrases away from the model exam and its gate test.
- **Selectors** (`src/selectors.mjs`, data: `KINDS`, `PLACES`, `LATEST_WORDS`). «la última / el último / my latest / the most recent» + a kind from a closed table: screenshot (`captura`, `screenshot`; the folder macOS saves to, else Desktop restricted to files named like a screenshot), download (`descarga`; `~/Downloads`), and pdf, image or video by extension in a place the phrase names (`descargas`, `escritorio`, `documentos`). The newest file by mtime is read when the phrase is planned, which is also when it is run (the CLI plans again on Enter), so the preview names the file Enter opens. Skipped: hidden files, partial downloads, directories. A download may also be a folder (an extracted archive); the other kinds are files. "Newest" is the mtime, so a folder shows its last change. Not acted on: a tie, an empty or unreadable folder, a kind with no place, a place the kind does not live in, and, for `open`, anything outside an allowlist (`OPENABLE` in `src/selectors.mjs`: documents and media, and plain folders; an `.app` or other bundle, html, svg, archives, profiles, macro documents, scripts, no or an odd extension, control or bidi characters in the name): reveal and copy take those. A file that is really named «última captura» is the other reading of the phrase and goes to Claude.

The disk a plan reads is behind three functions (`listing`, `screenshotLocation`, `remoteOf` in `src/world.mjs`) that tests and the exams replace with a fake (`fakeDeps` in `src/eval.mjs`, fed by an `fs` block in `fixture.json` or in a foreign `index.json`), so an exam never reads the Mac it runs on.

## Control

- Above the prompt while typing: `⚡ open ~/Development/pelayomendez/brand`. Nothing shows for non-actions.
- `\` at the start sends the phrase to Claude as typed.
- After an action, one line in the transcript: `⚡ reflex: opened brand`.
- `reflex why "<phrase>"`: which step answered, the template or model, the slots and how they resolved.

## Configuration (optional)

`~/.config/reflex/config.toml`

```toml
[aliases]
linkedin = "https://www.linkedin.com/feed/"
posts = "~/Development/pelayomendez/brand/posts"

[model]           # absent: templates only
url = "http://localhost:11434/v1"
name = "functiongemma"

[editor]          # for «en el editor»: absent → $VISUAL/$EDITOR if a GUI editor, else the system text app
app = "Cursor"    # or: command = "code" (a GUI editor's command; reflex still runs `open -a`)

[terminal]        # for «una terminal en X»: absent → Terminal
app = "Ghostty"
```

## Training (next)

Base FunctionGemma resolves none of our free-form phrases (Google reports 58% before finetuning, 85% after). So the small model ships only with an adapter for this Mac:

1. **Teach.** Claude generates a few hundred phrases (es, en) from the catalogue and the local index, plus a held-out set and negatives ("no abras nada").
2. **Train.** `mlx_lm.lora` on Apple silicon, repo-local venv. Fuse, convert to GGUF, `ollama create reflex`.
3. **Measure.** `reflex eval`: the held-out phrases through the real pipeline (grounding included). Keep the adapter only if it beats the last one; fall back to a smaller model (LFM2.5-350M) if FunctionGemma does not get there.
4. **Relearn.** `reflex train` reruns it as the index changes, and with phrases Claude handled that reflex could have.

## Later, if the first version earns it

Mail drafts, reminders, system settings; moving and deleting with confirmation and undo; a zsh widget; an MCP tool for other agents; risk classes per verb.

Research behind these choices: `docs/research/`. The ideas explained for learning: `docs/learn/`.
