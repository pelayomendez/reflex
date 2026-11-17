# reflex — roadmap

reflex is a cognitive core for one Mac (see `design.md`): a small model that knows your system, acts on it locally, and hands everything else to Claude. Each phase ends with something usable and a number that says whether it worked.

## 0. Reflex without a model (done in PR #14)

Templates, the index of this Mac, grounding, the CLI and the Claude Code plugin.
- **Exit:** the 13 v0.1 stories pass by hand in a live session; the plugin line appears while typing and Enter runs the action without Claude.
- **Open:** live test of the plugin, then merge.

## 1. A way to measure

Without a score, training is guesswork. This comes before any model.
- `test/phrases/`: a held-out set of phrases (es, en) with the expected action, including negatives (`no abras nada`, compound requests) that must go to Claude.
- `reflex eval`: runs them through the real pipeline and reports right / wrong / passed to Claude, per step (templates, model).
- **Exit:** baseline numbers for templates alone and for base FunctionGemma (expected near 0%).

## 2. Claude as teacher

- `reflex teach`: Claude generates a few hundred training phrases from the catalogue and the local index (real repo names, apps, files), with varied phrasing, typos and negatives. Kept out of the held-out set.
- Data stays on the machine; it is a JSONL file in `~/.local/share/reflex/`.
- **Exit:** a reviewed dataset; a sample read by hand.

## 3. Train on this Mac

- Repo-local Python venv with `mlx-lm` (Apple silicon, no CUDA, no global install).
- `reflex train`: LoRA on FunctionGemma 270M → fuse → GGUF (llama.cpp) → `ollama create reflex-core`.
- Spike first: does mlx-lm load FunctionGemma and does llama.cpp convert it back? If not, LFM2.5-350M or Qwen3 0.6B.
- **Exit:** the adapter beats the baseline on the held-out set, with zero wrong actions (passing to Claude is fine; acting wrongly is not). Latency under 300 ms.

## 4. The dial in daily use

- Ship the trained model as the optional step after templates; `reflex why` shows which step answered.
- Confidence gate: the model's action still has to ground, otherwise Claude.
- **Roles** (`research/roles.md`): «show me the vpn», «abre el correo», «muéstrame el calendario» point at an app by its job, not its name. A closed table of role words, resolved per Mac (the `[roles]` config, the default handler, the one installed app holding the word, the system app), as data: templates and grounding only, the model catalogue untouched.
- **Session context** (`research/session-context.md`): «ábrelo», «abre ese doc», «open that doc», «muéstramelo» mean the file Claude just wrote. The hooks keep the files Claude wrote in plugin state and hand them to the CLI with each phrase; fixed deictic templates resolve to the newest file of the kind, and anything doubtful (old, gone, two candidates, more said) passes to Claude. Templates only, the model catalogue untouched.
- **Exit:** a week of real use; a log of what reflex took, what it passed on, and any wrong action.

## 5. Learning from the oracle (logging and `reflex learn` done in PR #52; retraining from use still open)

- When Claude runs something reflex could have run (`open …` through Bash), log the phrase and the action as a new example.
- Phrases accepted in the preview count as confirmed; `\` overrides count as negatives.
- `reflex train` reruns as the index and the log change; keep the new adapter only if `reflex eval` improves.
- **Exit:** a second adapter, measurably better than the first, trained only from use.

## 6. Publish

- Article: reflex as an implementation of Karpathy's cognitive core, scoped to one machine — with the numbers from phases 1, 3 and 5.
- Brand: icon, page, release; install as a Claude Code plugin with the model optional.
- Pitch: one small model, any host, any system — as a direction; say only what has shipped.

## 7. One model for every Mac (foreign-index exam PR #44; public model trained on invented names 2026-11-08, beats v4 with 0 wrong; publishing still open)

The model learns the task (split a phrase into what to do and what to do it to), not this Mac: the target is copied from the phrase and grounded against each machine's own index. So one trained model can ship to everyone.
- Evaluate on a foreign index: a held-out set built from someone else's repo, app and file names, to prove the model did not learn this Mac's names.
- Publish the model: `ollama push` (keeps the FunctionGemma renderer and parser the training format depends on), Hugging Face GGUF only as a mirror, under the Gemma terms.
- The public model is trained on invented names only: v4 learned from this Mac's repo and file names, which is a privacy leak and useless to anyone else. See `research/distribution.md`.
- Retraining on your own use (phase 5) becomes optional personalisation, not a requirement.
- **Exit:** the published model on a clean Mac with a different index: zero wrong actions, recall within a few points of this Mac's.

## Later

Secondary for now: reflex first proves itself in Claude Code on the Mac. Hosts compared in `research/distribution.md`, verbs in `research/vocabulary.md`.

### Queries, a confirm tier and more system commands (done, see `research/system-commands.md`)

Built as templates only: the model catalogue is untouched.
- **Queries** answer in the prompt from one fixed read-only command each: battery (`pmset -g batt`), disk space (`df -H /System/Volumes/Data`), VPN status (`scutil --nc list`, through `[roles] vpn` or the only service). Anything the parser does not know passes to Claude. Still open: uptime and the local IP.
- **A confirm tier** (`plan.status === 'confirm'`) for Empty Trash alone: exact phrases, a Finder count read only at Enter, «No» first and the default, a re-read right before emptying. Restart, shut down and log out wait for a week of use of Empty Trash with no surprise.
- **Reversible commands:** open Trash, dark/light mode, sleep displays, screen saver, hide others, the Screenshot toolbar, Mission Control. Still open: sleep, eject all disks, keep awake.

### A stricter choose list

Follows from roles (`research/roles.md`), not built.
- **A choose list of documents that merely holds the word passes to Claude:** when the only candidates for «show me the vpn» are files whose name contains the word (no exact name, no role), asking «which one?» is a guess dressed as a question; Claude reads better than a list of two PDFs.

### Beyond Claude Code

The deciding lives in the CLI (`reflex --json`), so each host only asks it, draws and intercepts — the same thin layer the Claude Code plugin is.
- **zsh / bash:** a line-editor widget: preview under the prompt, Enter runs the action.
- **Other agent CLIs** (Codex and the like): their prompt hooks where they have them, otherwise an MCP tool the agent calls.
- **Editors:** a VS Code extension (command palette and chat input).
- **Launchers:** Raycast or Alfred script command.
- **Exit:** two hosts besides Claude Code in daily use, with no change to `src/` beyond what the host needs to read.

### Shell mode

A smart terminal on top of the zsh widget: «busca los pdf de esta carpeta y cópialos en descargas» becomes a command written on the line for the person to read and run. See `research/shell-mode.md`.
- **Suggest, never run:** the command goes on the line; writes are non-destructive by construction (`cp -n`, `mv -n`, `mkdir -p`); `rm`, `chmod`, `sudo`, `curl | sh` and git that loses work have no template.
- **A closed catalogue, not shell knowledge:** about 20 templates with typed slots (place, filetype, file, text, editor, branch), slots grounded in the real disk, a preview of what a glob matches («3 pdf → ~/Downloads»).
- **First slice, no model:** cd/open, find by name or type, copy/move matching files to a known folder, open in editor/nano/vim, grep, du/df, git status/log/branch/diff/switch. Later a LoRA adapter for free phrasing (see Adapters per plugin), chosen by being in the shell, no router.
- **Stays Claude's:** pipelines, tools outside the catalogue, anything destructive, scripts, reading output.
- **Before building:** study [ShellOracle](https://github.com/djcopley/ShellOracle), the closest prior art (local model via Ollama, zsh hotkey, writes the command on the line): its zsh widget, hotkey and buffer handling, and whether its license lets us reuse any of it. It generates freely; reflex keeps the closed catalogue and grounding.
- **Exit:** zero wrong commands on a shell exam over a fake filesystem; every destructive request produces no line.

### Beyond the Mac

- **Actions:** a Linux layer (`xdg-open`, file manager reveal, `wl-copy`/`xclip`, `.desktop` apps) and a Windows one (`start`, Explorer `/select`, `clip`, Start-menu apps). Index and grounding unchanged.
- **Training elsewhere:** the same recipe (LoRA, mask the prompt, same data and format) with PyTorch (`peft` or Unsloth) on CUDA, converting to the same GGUF. MLX stays the Mac path.
- **Exit:** the same held-out numbers from a model trained on a non-Mac machine, and reflex acting on Linux.

### Adapters per plugin

One base model, one small LoRA per plugin, each with its own tools and its own exam; a router picks the adapter (rules first: the verb or a plugin keyword; a router model only for what the rules cannot tell). The way Apple ships on-device features, and what LoRAX or llama.cpp serve with a per-request adapter.
- **Why later:** reflex is one task today (find *what*; the phrase states the verb), so a split costs a second pass (~155 → ~300 ms), compounds router errors and leaves each adapter fewer examples.
- **When it pays:** a task of another kind, where one shared model would get worse at opening folders while learning it.
- **Serving:** Ollama loads one adapter per model; per-request swapping needs `llama-server` or MLX.
- **Use cases to try:** acting through an app's MCP server (the phrase becomes that server's tool call, still without waking Claude); a Microsoft Teams plugin («escribe a Ana que llego tarde» → a draft, confirmed before sending); mail drafts; reminders with dates.
- **Exit:** two plugin adapters next to the core one, each with zero wrong on its own exam, and the core's numbers unchanged.

### More verbs (partly done: quit #45, editor/terminal #49, find/newest/path/web #50, settings/hide/lock/volume #54)

More verbs (mail drafts, reminders, settings), moving and deleting with confirmation and undo.
- **System commands** (Trash, queries, appearance, power; a confirm tier for Empty Trash): catalogue, risk tiers and a ranked next slice in `research/system-commands.md`.
