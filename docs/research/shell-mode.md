# reflex as a smart terminal: a shell mode

Design note, 2026-11-08. Read-only: nothing was installed and nothing but this file was written. It builds on `cli-layer.md` (which ruled out NL → shell generation *inside Claude Code*), `distribution.md` (zsh as a host) and `research-nl-shell.md` (the prior tools); it does not repeat them. Sources are at the end, checked on 2026-11-08 unless noted. *Unverified* marks a claim from memory, a secondary source, or a page that did not say it.

The idea: in zsh, type «busca en los archivos de esta carpeta los pdf y cópialos en descargas», «abre nano con notas.txt», «ve a brand», and get the right command.

## Verdict

1. **In a shell, reflex should write the command on the line, not run it.** Inside Claude Code reflex has to act, because the alternative is a model turn. In zsh the person is already at a command line, so the cheapest safe action is to *replace the buffer* with the command and let them press Enter. That is the one change that makes writes (`cp`, `mv`, `mkdir`) acceptable: reflex never runs a write, it only proposes one, and the person runs it.
2. **The small model does not need to know terminal commands.** The knowledge lives in a closed catalogue of command templates with typed slots, which is data (tldr, navi, Warp workflows and nli all work this way). The model, if used at all, only picks a template and copies slot words out of the phrase, and grounding checks them against the disk. That is the same job it does today.
3. **A first slice of about 20 templates needs no model at all**, like slices 2 and 3. A shell adapter comes later and fits "Adapters per plugin" well: the host already knows it is a shell, so the router is free.
4. **Recommendation:** add "Shell mode" under Later › Beyond Claude Code, after the zsh widget for today's actions. Exit: zero wrong commands on a shell exam with a fake filesystem.

## 1. Suggest on the line, execute, or execute with confirm

| Mode | Who does it (from `research-nl-shell.md`) | Writes allowed? | Fit with reflex |
|---|---|---|---|
| **Suggest on the line**: the command replaces the buffer; Enter runs it | zsh_codex, zsh-copilot, fish-ai (rewrite buffer, never auto-run); llm-cmd (prefills); shell_gpt Ctrl+L; Butterfish action mode; Atuin AI Tab [S3] | yes, the person runs them | **best.** The system decides the command, the person decides to run it. It is the "Visible" principle at its strongest: the preview *is* the command |
| **Execute** | reflex in Claude Code today; navi after slot fill | only harmless, reversible verbs | right inside Claude Code, wrong for writes in a shell |
| **Execute with confirm**: a menu or a second Enter | shell_gpt `[E]xecute`, aichat, ai-shell, tlm, Kiro `translate`; Atuin AI Enter runs, dangerous ones need an extra confirm [S3] | yes, behind the prompt | a confirm that pops after every request trains people to press `y`; it hides the command behind a menu instead of putting it where they can edit it |

Why suggest-on-line fits "precision first / the system decides":

- **Precision is checked before the line is written.** Every slot grounds against the disk (the folder exists, the glob matches 3 files, nothing at the destination has those names). Only a fully grounded template reaches the buffer; anything else leaves the buffer as typed.
- **The person keeps the last word without a dialog.** They can read, edit a flag, or Ctrl-U. History stores the command they ran, which is the honest record and teaches them the command.
- **One rule for every reflex action in a shell.** Even today's harmless ones («abre brand») go on the line as `open ~/Development/pelayomendez/brand`. The live preview already shows it while typing, so the cost is one extra Enter, and there is never a question of which Enter runs.

The new risk is **habit**: Enter-Enter becomes reflexive. So the catalogue must be safe to run blindly: every write template is non-destructive by construction (`cp -n`, `mv -n`, `mkdir -p`; see §3). A reflexive Enter can then cost a copy, never a file.

This needs one line in `design.md`'s "Closed" principle: *reflex never runs a write; in a shell host it may write one on the line.*

## 2. Knowledge without "knowing all commands"

**Open translation is a long tail.** NL2Bash has 9,305 pairs over 102 utilities, yet 4,602 distinct command templates; `find` alone appears 6,268 times and the 52 rarest utilities share 984 [P2]. The best NLC2CMD entry reached 53.2% [P3]. A 270M model cannot learn that space, and nothing should try. `cli-layer.md` reached the same conclusion; that is why every tool that scaled safely treats its vocabulary as data.

**Personal use is short-headed.** In 2.2M public aliases, `git`, `ls`, `cd`, `grep` and `vim` are about 35% of aliased commands, and bookmarking locations is the largest practice (14.6%) [P1]. More important for this mode: a shell user *types* the commands they know. Shell mode is for the phrases they do not know the command for, or do not want to spell (`find … -exec cp -n {} …`). That set is small and repetitive per person.

**How many templates cover most real use?** No source measures it for NL requests (*unverified, judgment*). An estimate from the alias data and the slices reflex already shipped: 15–25 templates cover the bulk of what a person asks in words, and the long tail goes to Claude. Rather than guess, measure: log every shell-mode phrase that falls through, and add a template when a phrase shape recurs (the `reflex learn` loop, applied to shell).

**The catalogue entry.** A template is `{ id, phrases (es, en), slots, render, risk }`. Slots use a few kinds, the same that tldr placeholders, Fig and navi reduce to:

| Slot kind | Grounded against | Example |
|---|---|---|
| `place` | the index (aliases, zoxide, home folders, repos) and `cwd` («aquí», «esta carpeta») | «descargas» → `~/Downloads` |
| `filetype` | a closed table: word → extensions | «los pdf» → `*.pdf`; «imágenes» → `*.{png,jpg,jpeg,heic}` |
| `file` | `cwd` listing, then the existing Spotlight grounding | «notas» → `./notas.txt` (exactly one match) |
| `text` | nothing; quoted literally | «TODO» → `'TODO'` with `grep -F` |
| `scope` | closed words | «y subcarpetas / recursivamente» → recursive; default is this folder only |
| `editor` | closed table + `$EDITOR` | «nano», «vim», «el editor» |
| `branch` | `git branch --list` in `cwd` | «main» |

The render is a fixed string with slot holes; the slot values are inserted already quoted (§3). The model never writes shell.

**Where the knowledge comes from.** Templates are written by hand, checked against `man` and `--help` on this macOS (BSD `cp`, `find`, `du` differ from GNU). tldr pages (CC BY 4.0 [S4]) and navi cheatsheets [S5] are good *sources* for the render strings and their phrasings, not a runtime dependency. nli's idea (pick from a real spec instead of writing free text [S6]) is the model-side version of the same thing.

**Is a 270M model enough?** For picking one of ~20 templates and copying 1–3 slot words, probably yes, and it is what FunctionGemma is for: Google positions it for applications "with a defined API surface", fine-tuned for consistent behaviour [S7]; `design.md` cites 58% → 85% after fine-tuning on Mobile Actions. Each template becomes one function, its slots the parameters. What is new compared with today's catalogue: two slots of different kinds in one phrase (a filetype set and a destination), and Spanish clitic forms («cópialos», «muévelas»). Both are training data, not capability.

**A separate adapter, not the core one.** Adding 20 functions to `src/catalogue.mjs` changes every training example of the core model and lengthens its prompt (latency). The roadmap's "Adapters per plugin" says a split pays when the task is "of another kind"; shell mode is (multi-slot, output is a command line, different exam). And its main cost, the router, disappears: the zsh host *is* the routing signal. Serving needs per-request adapters (`llama-server` or MLX; Ollama loads one adapter per model, per the roadmap), or a second Ollama model.

## 3. Grounding and safety

**Grounded in the real filesystem.** The plan runs where the shell is: the widget passes `cwd` (and `$EDITOR`) with the phrase. Globs are expanded by reflex at plan time, through the same `listing` seam in `src/world.mjs` that tests fake. A template whose glob matches nothing, or a `file` with two matches, does not write a line.

**Preview what the line will do,** in the area below the buffer, while typing:

```
❯ busca en esta carpeta los pdf y cópialos en descargas
  → cp -n -- *.pdf ~/Downloads/     # 3 pdf → ~/Downloads (none there yet)
```

Counts, not lists; a name collision is shown («1 already in ~/Downloads, kept»), since `-n` skips it. The plan is recomputed on the replacing Enter, so the count on screen matches the line written. The shell expands the glob again on the final Enter; a file created in between is the only drift, and it is visible in the line.

**Never generated** (no template exists; a phrase that asks for them falls through):

- `rm`, `rmdir`, `trash`-style deletion; `mv` or `cp` without `-n`; any `>` redirect onto a file.
- `chmod`/`chown` (recursive or not), `sudo`, `dd`, `diskutil`, `kill`/`pkill`.
- `curl … | sh` and any pipe into a shell or interpreter; `eval`; `xargs` with free text.
- git that loses work: `reset --hard`, `clean`, `push --force`, `checkout -- .`, `branch -D`.

**Fallback output gets the same screen.** If an off-catalogue phrase is sent to Claude (§4) and the answer matches a deny pattern (oneliner's blacklist idea [`research-nl-shell.md`]), it is written as a comment: `# ⚠ reflex: destructive, check it: rm -rf build`. Enter on a comment does nothing, but only with `setopt interactive_comments`, which zsh leaves off in interactive shells [S1]; without it, the line is held in the preview and not written at all.

**Quoting.** Slot values never pass through a shell in reflex's own process; the render quotes each one (single quotes, `'\''` for an inner quote; `~` left unquoted as a prefix only), puts `--` before paths, and uses `grep -F` so text is never a regex. Globs come only from the closed `filetype` table, so user words never contain glob characters. Names with newlines, control or bidi characters are refused, the rule `src/selectors.mjs` already applies. Every rendered line is checked with `zsh -n` in the exam.

## 4. Architecture

```
zsh line ──▶ widget (reflex.zsh) ──socket──▶ reflex serve (long-lived Node)
             · zle-line-pre-redraw: debounce,      · plan(phrase, {cwd, editor, host: "shell"})
               ask, draw POSTDISPLAY              · shell templates → ground → render
             · accept-line override: replace       · optional: shell adapter
               BUFFER, do not execute             · miss → nothing (buffer untouched)
             · Alt-? : ask Claude / Copilot ──▶ claude -p "one command" ──▶ deny check ──▶ BUFFER
```

- **Latency.** A cold `node src/cli.mjs` per keystroke is the main cost in shells (`distribution.md`); `reflex serve` over a Unix socket removes it and serves every host. Templates answer in milliseconds; the model step is ~155 ms (roadmap). The preview should be asynchronous: zsh can watch the socket fd with `zle -F` and redraw when the answer arrives, so typing never waits [S1] (zsh-autosuggestions uses this pattern for its async mode: *unverified*).
- **When does Enter mean "translate"?** zsh would try to run «busca …» as a command. The override of `accept-line` takes the phrase only if its first word is **not** a command, alias, function or builtin (`whence`), and reflex has a plan. `open`, `find`, `cd`, `grep` are real commands, so English phrases starting with them stay shell; for those, a prefix (`,` or `?`, as Atuin uses `?` [S3]) or a hotkey forces reflex. Spanish verbs (busca, abre, copia, ve) rarely collide. Anything that is a command runs exactly as zsh would.
- **UX, borrowed.** From zsh-autosuggestions: the dimmed suggestion after the cursor via `POSTDISPLAY` and `region_highlight`, accepted with → or Enter [S2]. From Atuin AI: Enter runs, Tab edits [S3]; here the first Enter writes and the second runs. From fish abbreviations: the expansion happens in the line, visibly, before it runs.
- **`cd` becomes possible.** Inside Claude Code reflex cannot change the session's cwd (`cli-layer.md`); in a widget it can, because the line runs in the user's own shell. «ve a brand» → `cd ~/Development/pelayomendez/brand` is the single most valuable template by the alias data.
- **Fallback.** A miss leaves the buffer as typed and says so in one line (`zle -M`). A key sends it to `claude -p` (or Copilot CLI) with a prompt that asks for one command and nothing else; the answer is deny-checked and written with a `# from Claude` tail comment, never run. If the person runs it unedited and it matches a template shape, it is logged as a candidate example (roadmap phase 5, for shell).
- **fish.** `commandline -r` replaces the buffer and a function bound to Enter can skip `execute` [S8]; no `POSTDISPLAY` equivalent, so the preview needs a repaint or the right prompt (*unverified*, as `distribution.md` says). Abbreviations expand single words, not phrases [S9].
- **bash.** `bind -x` with `READLINE_LINE` can replace the line on a key [S10]; Readline has no per-keystroke hook, so no live preview, only translate-on-key.

## 5. Recommendation

**Add "Shell mode" to the roadmap**, Later › Beyond Claude Code, as the second step of the zsh host: (a) the widget for today's actions, on the line; (b) shell templates. It extends "Adapters per plugin" with a use case where the host routes.

**First slice: ~20 templates, templates only, no model.**

| Group | Templates (render on macOS) |
|---|---|
| Navigate | `cd <place>` · `open <place>` (Finder) · `open .` |
| Find | `find <here> -iname '*<name>*'` · by type `find <here> [-maxdepth 1] -type f -iname '*.<ext>'` · newest `ls -lt <place> \| head` |
| Copy / move (write, non-destructive) | `cp -n -- <glob> <place>/` · `mv -n -- <glob> <place>/` · one file `cp -n -- <file> <place>/` · `mkdir -p <place>/<name>` |
| Edit / view | `<editor> <file>` (nano, vim, `$EDITOR`) · `open -a <App> <file>` · `less <file>` |
| Search text | `grep -rnF -- '<text>' <here>` · count `grep -rlF -- '<text>' <here> \| wc -l` |
| Disk | `du -sh -- <place>` · `du -sh -- <place>/* \| sort -h` · `df -h /` |
| Git (read, plus one switch) | `git status -sb` · `git log --oneline -n 10` · `git branch` · `git diff --stat` · `git switch <branch>` (git itself refuses to lose work) |

**Exit criterion.** A shell exam (es + en, positives and near-misses: «borra los pdf», «cópialos encima», «busca info sobre X», compound requests) run through `reflex eval` with a fake filesystem (`fakeDeps`): **zero wrong commands** (wrong = a different template, a different file set or destination, or a line that fails `zsh -n`), and every destructive ask produces no line. Then a week of daily use with the fall-through log.

**What stays Claude's:** composition beyond one template (pipelines, loops, `xargs`), tools not in the catalogue, flag tuning («sin los ocultos, ordenado por tamaño»), anything destructive, scripts and project commands, and reading output and deciding what to do next. The model step (a shell adapter) waits until the fall-through log shows phrasings the templates miss often enough to justify a training set.

## Sources

Checked 2026-11-08 unless noted.

- [P1] Schröder & Cito, "An Empirical Investigation of Command-Line Customization", EMSE 2022: https://arxiv.org/html/2012.10206v2 (via `cli-layer.md`, 2026-11-07)
- [P2] Lin et al., "NL2Bash", LREC 2018 (9,305 pairs, 102 utilities, 4,602 templates): https://arxiv.org/html/1802.08979v2
- [P3] Agarwal et al., NLC2CMD Competition, NeurIPS 2020: https://proceedings.mlr.press/v133/agarwal21b/agarwal21b.pdf (via `cli-layer.md`)
- [S1] zsh Line Editor (`POSTDISPLAY`, `zle-line-pre-redraw`, `zle -F`, `accept-line`) and options (`INTERACTIVE_COMMENTS`): https://zsh.sourceforge.io/Doc/Release/Zsh-Line-Editor.html, https://zsh.sourceforge.io/Doc/Release/Options.html (from memory for the option default: *unverified* here)
- [S2] zsh-autosuggestions: https://github.com/zsh-users/zsh-autosuggestions (via `research-reflex-features.md`)
- [S3] Atuin AI ("Press enter to run, or tab to insert"; danger scoring and server pattern check): https://docs.atuin.sh/latest/ai/introduction/
- [S4] tldr-pages (CC BY 4.0; no page count stated): https://github.com/tldr-pages/tldr
- [S5] navi: https://github.com/denisidoro/navi (via `research-nl-shell.md`)
- [S6] nli, constrained choice over Fig specs / `--help` (archived): https://github.com/masaki39/natural-language-interface (via `research-nl-shell.md`)
- [S7] FunctionGemma (270M, "defined API surface", fine-tune for consistency): https://ai.google.dev/gemma/docs/functiongemma
- [S8] fish `commandline`: https://fishshell.com/docs/current/cmds/commandline.html
- [S9] fish `abbr`: https://fishshell.com/docs/current/cmds/abbr.html
- [S10] Bash `bind -x` and `READLINE_LINE`: https://www.gnu.org/software/bash/manual/html_node/Bash-Builtins.html (from memory: *unverified* here)
- Prior reflex research: `cli-layer.md`, `distribution.md`, `research-nl-shell.md`, `research-reflex-features.md`, `training-on-mac.md`
