# reflex as a smarter CLI layer: which intents, and a schema that scales

Research spike, 2026-11-07. Read-only: nothing was installed and nothing but this file was written. Claims cite the sources at the end, all checked on 2026-11-07. *Unverified* marks a claim from a secondary source, from memory, or from a page whose body could not be read. The launcher comparison is in `vocabulary.md` and is not repeated here.

## Verdict

1. **Most of what developers type or alias is navigation, git, listing and editing.** In 2.2 million aliases from public dotfiles, the most aliased commands are `git` (12.9%), `ls` (10.3%), `cd` (6.6%), `grep` (3.5%) and `vim` (1.8%), and the largest single practice is *bookmarking locations* (14.6%) [P1]. In NL2Bash, the main natural-language-to-Bash corpus, `find` alone appears 6,268 times in 9,305 pairs, though the authors say the collection method inflates it [P2]. reflex already covers the biggest of these (go to a folder). The gaps the user feels are **edit this**, **a shell here**, **find that file** and **the repo on the web**.
2. **Every tool that scaled a vocabulary safely treats it as data.** Fig specs, tldr pages, Warp workflows, navi, Raycast manifests, thefuck rules, App Intents and hassil all list typed slots in a closed catalogue, and third parties add entries, not code paths. The open-ended tools (Copilot CLI, shell-gpt, aichat, Open Interpreter, Atuin AI) generate commands and keep them safe with a confirm step, a sandbox or danger scoring. All of them have since grown into agents. That job is Claude's.
3. **For reflex, the growth axis is target kinds and modifiers, not verbs.** Keep the five verbs. Add a closed table of *modifiers* ("en Cursor", "en la terminal", "en GitHub", "la ruta de", "el último") that rules strip from the phrase before the templates and the model see it. Then the model's prompt (`src/catalogue.mjs`) does not change, and nothing has to be retrained. That gives one mechanism for six of the seven intents recommended in §4.
4. **What not to add:** running project scripts, killing ports, content search over many files, and any "show me X" that prints output. They execute repo code, end processes, or return a list or text to read. The first two break "nothing writes, moves, deletes or sends"; the last two are Claude's job.

## 1. What people actually type

| Source | What it measures | Top intents | Caveat |
|---|---|---|---|
| Schröder & Cito, EMSE 2022 [P1] | 2.2M aliases in GitHub dotfiles | aliased commands: git 12.93%, ls 10.27%, cd 6.58%, grep 3.54%, vim 1.84%. Practices: bookmarking locations 14.59%, overriding defaults 14.48%, nicknaming 11.11%, abbreviating subcommands 8.84%. `gs` is 54% of `git status` aliases. Editor substitutions (`vi`→`vim`→`nvim`) are frequent | Aliases show what people repeat *enough to shorten*, not raw frequency. Public dotfiles only |
| NL2Bash, LREC 2018 [P2] | 9,305 English→Bash pairs, 102 utilities | `find` 6,268 occurrences, `xargs` 1,047; the rest only in a figure | Collected from Q&A and tutorial sites, which the authors say over-represents `find` |
| NLC2CMD, NeurIPS 2020 [P3] | NL2Bash plus the Tellina query log of real user queries | Top-15 utility figure not readable here (*unverified*) | Best accuracy reached 53.2% from a 13.8% baseline, so open translation stays hard even within a fixed utility set |
| tldr-pages [P4] | community example pages | No public per-page view counts found | Its placeholder convention (`{{path/to/file}}`, `{{path/to/directory}}`) is a de-facto list of target kinds |
| Atuin [P5] | personal history stats (`atuin stats`) | No public cross-user ranking. Sample outputs online disagree, so they are illustrative only | — |
| zoxide [P6] | "a smarter cd command" | Ranks directories by how often you use them. `z foo` jumps, `zi` picks with fzf | Its popularity is evidence for the navigation intent. reflex already reads its database |

**Ranked by frequency × value to a reflex user in Claude Code** (judgment, built on the rows above):

| # | Intent | Frequency evidence | Value inside Claude Code |
|---|---|---|---|
| 1 | Go to a place (folder or repo) | bookmarking 14.6%, cd 6.6%, zoxide [P1][P6] | **done** (`abre brand`) |
| 2 | Edit a file or folder in my editor | vim 1.8% + editor substitution practices [P1] | high: the most common thing done right after "go to" |
| 3 | A shell in that folder | cd + bookmarking [P1] | high: reflex cannot `cd` the session's shell, but it can open a terminal window there |
| 4 | Find a file by name | `find` dominates NL2Bash [P2] | high: today "busca X" goes to Claude, which spends a turn on `mdfind` |
| 5 | Repo state and the repo on the web | git is the top aliased command [P1] | open on GitHub/GitLab: high, harmless. status/branch: medium, and it prints output (see §3) |
| 6 | Latest file of a kind (screenshot, download) | not measured; judgment | high in Claude Code: pasting the last screenshot into the prompt is a daily act |
| 7 | List, grep, disk usage, ports, scripts | ls/grep/du in [P1]; `xargs`/`grep` in [P2] | low for reflex: they print output or change state; Claude Code's own Bash/Grep tools do them |

## 2. How smart CLI tools structure and scale vocabulary

| Tool | Vocabulary is… | How third parties add to it | How it stays safe |
|---|---|---|---|
| Fig / Amazon Q completion specs [T1] | data: a "declarative schema" of `subcommands`, `options`, `args` per CLI, with *generators* for dynamic values | PR to `withfig/autocomplete`, 400+ contributors | It only completes; you still press Enter. Kiro CLI 3.0 dropped inline autocomplete (2026-11-03) [T2] |
| tldr-pages [P4] | data: examples with `{{typed_placeholders}}` | PR, style guide | Read-only reference |
| Warp workflows [T3] | data: YAML `name`, `command`, `arguments` (`name`, `description`, `default_value`), `tags` | `.warp/workflows/` in a repo (shared by git), or a PR to the public repo. YAML is legacy; Warp Drive replaces it | You see and edit the command before it runs |
| navi, pet, hoard [R1] | data: parameterised cheatsheets and snippets | files | Slots filled interactively |
| Raycast extensions [T4][T5] | data + code: manifest `commands` with `mode` and typed `arguments` (`text`, `password`, `dropdown` with fixed `data`); AI `tools` declared the same way | Store review | Each AI tool can export a `confirmation` function; returning `undefined` skips it |
| Alfred workflows [R2] | keyword or script filter → action; file actions filtered by file type | shared workflow files | User-built; no central gate |
| fish abbreviations [T6] | data: a word expands to text on space or Enter, with `--regex`, `--function`, `--command`, `--set-cursor` | dotfiles | The expansion is visible in the line before it runs |
| nushell [T7] | code with typed signatures (`path`, `int`, flags) and pipeline input/output types, checked at parse time | modules | Mismatches are caught before running |
| thefuck [T8] | code: each rule is `match(command)` + `get_new_command(command)`, with `enabled_by_default`, `requires_output`, `priority`. About 150 rules on by default (*count is approximate*) | pip packages named `thefuck_contrib_*` | Confirms by default (`--yeah` skips). Risky rules (`git_push_force`, `rm_root`) are off by default |
| App Intents / hassil [T9][R3] | data: verbs over typed entities, with a string query that finds the entity. hassil sentence templates use lists and ranges | apps declare intents; HA ships intent repos | Typed parameters; disambiguation; `UndoableIntent` [R2] |
| GitHub Copilot CLI [T10][T11] | open-ended. The old `gh copilot suggest`/`explain` was deprecated 2025-10-25 and archived; now a full agent | plugins, MCP | Tool permissions and approvals |
| shell-gpt [T12] | open-ended: `--shell` writes a command; custom functions are Python files whose docstring becomes the description | `~/.config/shell_gpt/functions` | `[E]xecute, [D]escribe, [A]bort`. Its README warns that the default `execute_shell_command` "might execute destructive commands" |
| aichat + llm-functions [T13] | tools from comment annotations (`# @describe`, `# @option`), compiled to JSON schema | a functions directory | none in the tool layer: the sample runs `eval` on the command |
| Open Interpreter [T14] | open-ended code execution; now a Rust coding agent "based on Codex". The Python original lives on as a community fork | MCP, skills, hooks | Native sandboxing and approvals (details on a page not read: *unverified*) |
| Atuin AI [R1] | open-ended, `?` on an empty prompt | — | The model scores danger and the server checks patterns; dangerous commands need Enter twice |

What the data-catalogue family shares, and what reflex should copy:

- **Typed slots with a small set of kinds.** tldr's placeholder names, Fig's file and folder templates, Raycast's argument types and nushell's `path` all reduce to a handful: file, directory, app, URL, enum, free text. reflex's `Target` type (`folder|file|app|url|text|shortcut`) is already this.
- **Closed values where possible.** Raycast `dropdown` and Warp/hassil lists close a slot so nothing can be invented. reflex's grounding does the same against the index.
- **Visible before Enter.** fish abbreviations, Warp and Fig all show the result in the line first. reflex's `⚡` preview is the same contract.
- **Risky entries off or confirmed by default.** thefuck's disabled rules and Raycast's per-tool `confirmation` correspond to risk classes per verb (`research-reflex-features.md` §5).
- **Extension is data, not code.** Third parties add a spec, a page, a YAML file or a manifest entry. For reflex the extension point already exists: **a Shortcut is a user-defined verb**. A small editors/terminals table in config is the second one.

## 3. A schema that scales

```
action  = verb  target  [modifier]
verb    = open | reveal | copy | shortcut | quit           (closed; the model knows four)
target  = kind + words [+ selector]
kind    = folder | repo | file | app | url | shortcut | text
          + new: file@line, settings pane, remote (repo → URL), path (as text)
selector= exact name (today) | latest <kind> [in <folder>] | best match of a search
modifier= with <app> | in editor | in terminal | on the web | in Finder | to clipboard | path of
```

- **Modifiers are rules, not model output.** They form a closed, bilingual table, an extension of today's `PLACE_SUFFIX` / `placeVerb`. Each one either picks the verb (`en el finder` → reveal, as today) or adds a runner argument (`en Cursor` → `open -a Cursor`). Rules strip the modifier before the templates and before the model. The model still only has to copy the target out of the phrase, so the catalogue (its prompt) and the trained adapter stay as they are.
- **Kinds live in grounding.** A new kind is a new resolver (`ground.mjs`) plus a runner. The model never sees kinds; the `KINDS` words only hint which resolver to try.
- **Selectors are rules too.** "el último / la última / latest / last" plus a kind word picks the newest matching item, from Spotlight metadata or a folder's newest entry. A search selector ("busca X") reuses the file grounding, which already returns `ambiguous` with candidates.
- **Roles, not apps, in the phrase.** "en el editor" / "en la terminal" resolve through config (`[roles] editor = "Cursor"`, `terminal = "Ghostty"`), then `$VISUAL`/`$EDITOR` for terminal editors. Otherwise reflex picks the first installed of a short list (Cursor, VS Code, Zed / Ghostty, iTerm, Terminal). Unknown → Claude.
- **Retraining cost.** The catalogue is the model's prompt: adding or renaming a function, or adding a parameter, changes every training example. That means regenerating the set with `reflex teach` (Claude tokens), about 3–8 minutes of LoRA on an M4 plus fuse and convert (`training-on-mac.md`), and a new `reflex eval` gate. Adding a modifier, kind or selector costs none of that. Only new *request words* the model should learn (e.g. "busca" as a reveal form) need a `REQUEST_FORMS` entry and a retrain, which can wait for the next one.

### Candidate intents

Risk: **harmless** (opens or shows, undo by closing) · **side effects** (changes running state) · **destructive**. "Fits" = fits "nothing writes, moves, deletes or sends".

| Intent | Value | Risk | Fits | Templates / model | Runs | ES / EN |
|---|---|---|---|---|---|---|
| **Open in editor** (file or folder, optional line) | high | harmless | yes | modifier only; model unchanged | `open -a <Editor> <path>`; at a line `code -g path:line` [T15] (Cursor's CLI is a VS Code fork with the same flag: *unverified*) | "abre brand en Cursor", "edita el README de reflex", "abre phrase.mjs en la línea 40" / "open reflex in VS Code", "edit the watchmen post" |
| **Terminal in a folder** | high | harmless | yes | modifier only | `open -a <Terminal> <folder>` opens a new window there (*unverified per app*). It cannot change the session's own cwd | "abre una terminal en brand", "terminal en descargas" / "open a terminal in reflex", "shell in brand" |
| **Find a file by name** | high | harmless | yes | `busca/encuentra/localiza/find/locate` → reveal in templates; model learns the form at the next retrain | the existing Spotlight grounding; one match → reveal, several → candidates in the preview, none → Claude | "busca el post de watchmen", "¿dónde está el contrato de alquiler?" / "find the cache-nudge image", "locate the watchmen post" |
| **Latest of a kind** | high | harmless | yes | selector rule | newest by `kMDItemDateAdded` in the screenshot location or Downloads, then open/reveal/copy | "copia la última captura", "abre la última descarga" / "copy the latest screenshot", "open my last download" |
| **Copy path** | high | harmless | yes | modifier ("la ruta de") → copy, kind text | path to clipboard | "copia la ruta de brand" / "copy the path of reflex" |
| **Repo on the web** | high | harmless | yes | modifier ("en GitHub/GitLab", "on the web") on a repo | `git remote get-url origin` read locally → URL → `open`. No network until the browser opens | "abre reflex en GitHub", "brand en la web" / "open reflex on GitHub" |
| **Settings pane** (from `vocabulary.md`) | medium | harmless | yes | kind, fixed bilingual table | `open x-apple.systempreferences:…` (*unverified per pane*) | "abre ajustes de sonido", "abre almacenamiento" / "open sound settings" |
| Git status / branch | medium | harmless | yes, but prints | needs an output surface | one line in the transcript; a mod `{text}` result enters Claude's context [R4] | "¿en qué rama está brand?" / "what branch is reflex on" |
| Disk usage | low | harmless | yes, but slow and prints | — | better: the Storage settings pane above | "cuánto ocupa descargas" / "disk usage of Downloads" |
| Run a project script | medium | side effects (runs repo code, long-lived, may write) | **no** | — | at most: open a terminal there and *type* the command without running it (*unverified per terminal*) | "arranca brand", "npm run dev en reflex" |
| Kill a port | medium | destructive (ends a process) | **no** | — | — | "mata el puerto 3000" / "kill port 3000" |
| Content search | medium | harmless | yes, but a list | — | Claude Code's Grep tool does it better | "busca 'TODO' en reflex" |

## 4. Recommendation

Status 2026-11-07: 1 to 3 shipped (PR #49); 4 to 7 shipped as slice 2 (`docs/design.md`, "Slice 2"). «Dónde está» stays the small model's, and `NOT_DONE` still keeps «necesito buscar X» for Claude.

Add these, in this order. None adds a verb to the model's catalogue.

1. **Modifier table** (the schema change): generalise `PLACE_SUFFIX` into a bilingual, closed table of `{ words, verb?, runner }`. Strip it before the templates and the model, and show it in the preview (`⚡ open reflex in Cursor`). Add a `[roles]` section in config.
2. **Open in editor**, with an optional line (`en la línea N`, `:N`, `at line N`).
3. **Terminal in a folder.**
4. **Find a file** → reveal: move `buscar/encuentra/find/locate` out of `NOT_DONE` for a target that grounds as a file or folder, and show candidates when it is ambiguous. Add "busca" to `REQUEST_FORMS` at the next retrain.
5. **Latest of a kind** (screenshot, download), usable with open, reveal and copy.
6. **Copy path.**
7. **Repo on the web.**

Each needs an eval set of its own (positives plus near-misses such as "busca info sobre X", "abre una terminal y ejecuta…"), and the exit rule stays zero wrong actions.

**Do not add:**

- **Command generation of any kind** (NL → shell). That is what Copilot CLI, shell-gpt and Atuin AI do, and each ended up needing confirmation, sandboxes or danger scoring. Claude Code already is that agent.
- **Verbs that run code or end processes**: `npm run`, `make`, `kill`, `docker`. They are not instant or reversible, and they run repo-defined code.
- **Answers and lists** (git log, grep hits, du, ls). A list or a block of output is something to read and act on, which is Claude's job. A mod `{text}` result costs context tokens on the next turn [R4], which works against reflex's point. If git branch earns a place later, cap it at one line.
- **Per-CLI specs** à la Fig. They are maintained forever and add no actions [T2].

## Sources

All checked 2026-11-07.

- [P1] Schröder & Cito, "An Empirical Investigation of Command-Line Customization", EMSE 2022: https://arxiv.org/html/2012.10206v2
- [P2] Lin et al., "NL2Bash", LREC 2018: https://arxiv.org/html/1802.08979v2
- [P3] Agarwal et al., "NeurIPS 2020 NLC2CMD Competition": https://proceedings.mlr.press/v133/agarwal21b/agarwal21b.pdf (figure unread; PDF not renderable here)
- [P4] tldr-pages style guide (placeholders): https://github.com/tldr-pages/tldr/blob/main/contributing-guides/style-guide.md
- [P5] Atuin: https://atuin.sh/ (no aggregate stats published; per-user `atuin stats` only)
- [P6] zoxide: https://github.com/ajeetdsouza/zoxide
- [T1] Fig autocomplete specs: https://github.com/withfig/autocomplete
- [T2] Kiro CLI 3.0 drops inline autocomplete: https://kiro.dev/blog/cli-3/ (via `research-reflex-features.md`)
- [T3] Warp YAML workflows: https://docs.warp.dev/terminal/entry/yaml-workflows/
- [T4] Raycast manifest: https://developers.raycast.com/information/manifest
- [T5] Raycast AI tool confirmation: https://developers.raycast.com/api-reference/tool
- [T6] fish `abbr`: https://fishshell.com/docs/current/cmds/abbr.html
- [T7] nushell custom commands: https://www.nushell.sh/book/custom_commands.html
- [T8] thefuck: https://github.com/nvbn/thefuck
- [T9] Apple App Intents, app entities: https://developer.apple.com/documentation/appintents/app-entities (page body not readable: entity/query details *unverified*)
- [T10] gh-copilot (deprecated 2025-10-25, archived): https://github.com/github/gh-copilot
- [T11] GitHub Copilot CLI: https://docs.github.com/en/copilot/how-tos/use-copilot-for-common-tasks/use-copilot-in-the-cli
- [T12] shell-gpt: https://github.com/TheR1D/shell_gpt
- [T13] llm-functions (aichat): https://github.com/sigoden/llm-functions
- [T14] Open Interpreter: https://github.com/openinterpreter/open-interpreter
- [T15] VS Code command line (`--goto file:line`): https://code.visualstudio.com/docs/configure/command-line
- [R1] `research-nl-shell.md` (navi, pet, hoard, Atuin AI)
- [R2] `research-reflex-features.md` (Alfred file actions, Warp packs, App Intents `UndoableIntent`)
- [R3] hassil template syntax: https://developers.home-assistant.io/docs/voice/intent-recognition/template-sentence-syntax/
- [R4] `research-actions-proxy.md` (mod `{text}` results enter context)
