# Handoff — 2026-11-08

Where reflex stands and how to pick it up. The person is now using it for a week; findings come back as they use it.

## State

- **Plugin:** reflex 0.5.0, installed from its own marketplace (`/plugin install reflex --marketplace pelayomendez/reflex`). After a merge that should reach the installed copy: bump `.claude-plugin/plugin.json`, then `claude plugin marketplace update pelayomendez && claude plugin update reflex@pelayomendez`.
- **Model in use:** `reflex-core:public` in Ollama (`~/.config/reflex/config.toml`), trained on three invented indexes, none of this Mac's names. Fallback: `reflex-core:v4` (trained on this Mac's names; never publish it).
- **Exams (all 0 wrong):** held-out 180/436, foreign index 177/288, model-only 106/127 (public); v4 179 / 174 / 97.
- **Verbs:** open, reveal, copy, Shortcut, quit, hide; modifiers: in the editor (at a line), terminal in a folder, on GitHub/the web, copy the path; find; newest of a kind; Settings panes, lock screen, volume; Empty Trash behind a confirm (`$.ui.ask`, «No» first), read-only answers (battery, disk, VPN) shown with `$.ui.log`, and reversible system commands (open Trash, dark/light mode, sleep displays, screen saver, hide others, Screenshot toolbar, Mission Control). All new verbs are templates only; the model catalogue (`src/catalogue.mjs`) is unchanged since v4.
- **Learning from use:** `~/.local/share/reflex/log.jsonl` records accepted actions, `\` overrides and Claude's Bash actions reflex could have run. `reflex learn` summarises; `reflex learn --export <file>` writes validated training examples. `[learn] log = "off"` disables it.
- **Brand:** icon approved (invented-creature template, brand `style.md`); landing in `docs/` (built by the brand repo's `scripts/build.mjs`). Repo is **private** and **Pages is off**: nothing is public yet.
- **Article:** notes with 18 lessons and the numbers in `docs/article/notes.md`; a first draft in `docs/article/draft-es.md` (uncommitted, not reviewed).

## Session context (branch `context-urls`)

Three wrong actions from real use are fixed and held by traps: «open the website» opened a folder called `website`, «open the website of reflex» opened the reflex folder (model step), «open the doc» / «open the article» opened `~/Documents` / `~/Documents/Articles`. A generic noun with an article (table `GENERIC_NOUNS` in `src/vocab.mjs`) is now deictic: it resolves only through the session's recent items (files and web addresses; `src/context.mjs`), else it goes to Claude. The hooks also record, after a successful Bash call, what `open` was given, the files a command made (mtime inside the call, read by `reflex touched`) and the http(s) addresses in the command, plus the addresses in Claude's reply (`turn.complete`'s `answer`). Exams after: held-out 214/518, foreign 180/288, model 106/174, context 119/227, all 0 wrong. Design and trade-offs: `docs/research/session-context.md`. `src/catalogue.mjs` is untouched (no retraining).

## This week

The person uses reflex as usual and reports. For each report:
- **A wrong action** (the top priority, the bar is 0): reproduce with `node src/cli.mjs --json "<phrase>"`, add the phrase to `test/phrases/heldout.jsonl` as a trap, fix, re-run the three exams.
- **A miss** (passed to Claude but reflex should have acted): note it; at the end of the week `reflex learn` shows them all.
- **A missing verb:** check `docs/research/vocabulary.md` and `cli-layer.md` first; new verbs go in as data (templates/modifiers), never in the model catalogue without a retraining plan.

Exams:
```
node src/cli.mjs eval --model
node src/cli.mjs eval --model --index test/phrases/foreign/index.json test/phrases/foreign/phrases.jsonl
node src/cli.mjs eval --model test/phrases/model.jsonl
```

## At the end of the week

1. `node src/cli.mjs learn`: what it took, what was overridden, what Claude did instead.
2. Decide: verbs or phrases to add; whether to fine-tune the public model with `learn --export` (keep it only if the exams improve with 0 wrong).
3. Publish, if the person says so: a privacy review of the git history, then repo public, Pages from `main` `/docs`, `ollama push pelayomendez/reflex-core` (keeps the FunctionGemma renderer/parser).
4. Article: decide the governing metaphor (the draft uses breaking in a horse; the person asked for the dragon film's themes, title only, no characters), resolve lesson 9's 18 vs 19 wrong, fill the token-cost gap from the week's log.

## Training recipe (public model)

- Data: `reflex teach --index test/phrases/synthetic/index-{a,b,c}.json` → `~/.local/share/reflex/train-public/`; negatives cut to 20% → `train-public2/` (33% collapsed the model to «-»).
- Train: `.venv-train/bin/mlx_lm.lora -c ~/.local/share/reflex/train-public2/lora.yaml` (rank 16, lr 5e-5, 300 iterations; step 300 kept).
- Package: fuse, copy the four tokenizer files from `fused/v4/` (mlx's fuse drops `tokenizer.model`; the converter needs the image tokens removed), `convert_hf_to_gguf.py --outtype q8_0`, `ollama create` with `gguf/Modelfile.v4` pointing at the new GGUF.

## Later (roadmap)

Shell mode (suggest a command on the zsh line from a closed catalogue; study ShellOracle first), adapters per plugin (MCP apps, a Teams plugin), other hosts (zsh, Codex, Cursor), other systems. See `docs/roadmap.md`.
