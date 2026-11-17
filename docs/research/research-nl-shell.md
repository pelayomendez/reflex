# Natural language to shell commands: prior art and how each keeps cost down

Follow-up to `research-actions-proxy.md`. The angle: an actions proxy is "natural language added to the normal CLI". Researched 2026-11-06. Dates come from GitHub release pages unless noted otherwise.

## 1. Model call on every request (cloud)

| Tool | Status | How the phrase becomes a command | Confirmation / safety |
|---|---|---|---|
| [GitHub Copilot CLI](https://github.com/github/copilot-cli) (`copilot`) | Active. [v1.0.106, 2026-11-06](https://github.com/github/copilot-cli/releases). The old `gh copilot suggest/explain` extension [stopped working on 2025-10-25](https://github.blog/changelog/2025-09-25-upcoming-deprecation-of-gh-copilot-cli-extension/) | Full agent, Claude Sonnet 4.5 by default. **Each prompt costs one premium request** | Previews every action and asks for approval. Users complained that the one-shot `suggest` flow [was lost](https://github.com/github/copilot-cli/issues/53) |
| Amazon Q `translate` → [Kiro CLI](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/upgrade-to-kiro.html) (ex-Fig) | Q CLI is [frozen, security fixes only](https://github.com/aws/amazon-q-developer-cli). Kiro CLI is closed source (Nov 2025) | `kiro-cli translate "…"`: one model call that returns up to 5 alternatives (`-n`) | Execute, edit, regenerate or cancel. There is an open bug where [output comes back wrapped in markdown fences](https://github.com/kirodotdev/Kiro/issues/5006) |
| [Warp `#` Generate](https://docs.warp.dev/agent-platform/local-agents/generate) | **Legacy**, replaced by the agent's "Full Terminal Use" | OpenAI/Anthropic call as you type ([origin: Codex](https://www.warp.dev/blog/story-behind-ai-command-search)) | Run, or **save as a Workflow** in Warp Drive (a manual "learn once") |
| [Atuin AI](https://docs.atuin.sh/latest/ai/introduction/) | New in [v18.13](https://blog.atuin.sh/atuin-v18-13/). Free while in testing, needs a Hub account | `?` on an empty prompt sends a hosted LLM call. A [self-hosted `atuin-ai-server` or custom endpoint](https://docs.atuin.sh/latest/ai/settings/) is possible | Enter runs, Tab edits. The model scores danger and the server checks patterns on top. Dangerous commands need Enter twice. Only the OS and shell are sent by default, and cwd and the last command are opt-in. `yolo` is off |
| [shell_gpt](https://github.com/TheR1D/shell_gpt) (`sgpt -s`) | Active, [1.5.1](https://github.com/TheR1D/shell_gpt/releases) | One call. Ctrl+L puts the result on the line for editing | `[E]xecute, [D]escribe, [A]bort`. `DEFAULT_EXECUTE_SHELL_CMD=false` |
| [llm-cmd](https://simonwillison.net/2024/Mar/26/llm-cmd/) | Alpha, [0.2a0 from Sep 2024](https://simonwillison.net/2024/Sep/9/llm-cmd/), dormant. [`llm` itself is active (0.37.1)](https://simonwillison.net/2026/Nov/3/llm/) | One call. The system prompt asks for the raw command only | Prefills an editable line, so Enter runs it and Ctrl+C cancels. The author warns it is risky |
| [BuilderIO ai-shell](https://github.com/BuilderIO/ai-shell) | **Inactive**: [v1.0.12, Oct 2024](https://github.com/BuilderIO/ai-shell/tags) | One call, then a run/revise/cancel menu | Explains the command first |
| [aichat](https://github.com/sigoden/aichat) `-e` | [v0.30.0, Jul 2025](https://github.com/sigoden/aichat/releases). Quiet since | One call, and it supports Ollama | Execute / revise / describe / copy menu |
| [Butterfish](https://github.com/bakks/butterfish) | Active, [v0.4.3, Jun 2026](https://github.com/bakks/butterfish/releases) | A shell wrapper. Action mode asks for exactly one command and stages it | You press Enter |
| [fish-ai](https://github.com/Realiserad/fish-ai), [zsh_codex](https://github.com/tom-doerr/zsh_codex), [zsh-copilot](https://github.com/Myzel394/zsh-copilot) | Active plugins. Ollama-capable [zsh-copilot forks](https://github.com/math-x-io/zsh-copilot-ollama) exist | A hotkey turns a `# comment` into a command via a cloud or local model | Rewrites the buffer and never auto-runs |
| [Microsoft AI Shell](https://learn.microsoft.com/en-us/powershell/utility-modules/aishell/overview) | **Archived Jan 2026** | | |

## 2. Fully local (small models)

- [tlm](https://github.com/yusufcanb/tlm): Ollama with `qwen2.5-coder:3b` by default. `tlm suggest` / `explain`, and it asks before executing.
- [ShellOracle](https://github.com/djcopley/ShellOracle): Ollama or cloud, with a hotkey and history.
- [fish-ai](https://github.com/Realiserad/fish-ai), [aichat](https://github.com/sigoden/aichat), [zsh_codex](https://github.com/tom-doerr/zsh_codex) and sgpt (via LiteLLM, though it [warns it is "not optimized for local models"](https://github.com/TheR1D/shell_gpt)) can all point at Ollama.
- Constrained choice: [nli](https://github.com/masaki39/natural-language-interface) caches each tool's real command spec (Fig specs or `--help`) and has a model **pick** from it rather than write free text. Every flag it suggests exists, and a suggestion takes about 0.5 s. The repo is now archived, but the idea is worth keeping.

## 3. No model at all

- [navi](https://github.com/denisidoro/navi) ([v2.24.0](https://github.com/denisidoro/navi/releases)): fzf over parameterised cheatsheets. Slots are filled interactively, and it can also pull in tldr and cheat.sh.
- [tldr-pages](https://github.com/tldr-pages/tldr): static examples per command.
- [pet](https://github.com/knqyf263/pet) and [hoard](https://github.com/Hyde46/hoard): personal snippet stores with `#param` placeholders. Hoard can also **ask ChatGPT once and save the result to its trove** (Ctrl-A). That is the closest packaged "learn once, replay free" tool, though saving is manual.
- [McFly](https://github.com/cantino/mcfly) and [Atuin search](https://atuin.sh/): history ranking. Your past commands work as an implicit cache of earlier translations.

## 4. "Learn once, replay free": what actually exists

| Tool | Mechanism | Limits |
|---|---|---|
| [shell_gpt](https://github.com/TheR1D/shell_gpt) | Exact-match cache of query plus parameters, 100 entries in `/tmp/shell_gpt` | The same exact wording is needed. It lives in `/tmp` and doesn't record whether you approved the command |
| [ccom](https://github.com/doublej/ccom) | **Claude via the Agent SDK or `claude` CLI**. Repeated prompts are served from a cache, `-f` bypasses it, and the pick is written to history | Small project. Cache key not documented, no safety layer |
| [oneliner](https://github.com/dorochadev/oneliner) | Result cache with `cache list/rm/clear`, a regex danger check and a binary blacklist (`rm`, `dd`, `curl`…) | Archived May 2026 |
| Warp Workflows, hoard | The user explicitly saves a generated command and replays it with no model | Manual |

**Gap:** no tool found caches only **approved** translations, normalises phrases into **templates with slots**, or promotes them into rules. Research warns that [semantic (embedding) caches get high hit rates but poor correctness](https://aclanthology.org/2025.naacl-long.555/), so near-match reuse needs a gate.

## Recommendation for the plugin

Borrow a tiered resolver, cheapest first:

1. **Rules** (navi/hoard style): a regex with typed slots maps to an argv, with no model. This covers the frequent verbs from the previous report.
2. **Approved-translation cache** (sgpt/ccom, improved): key on a normalised phrase (lowercase, accents stripped, slot values swapped for placeholders such as `abre <dir>`). Store a template **only after the user confirmed and ran it**. Replay without confirmation only for read-only verbs. After N reuses, offer to promote it to a rule.
3. **Small local model** (tlm/nli style): an Ollama 3B coder model that **picks** from the rule and cache verbs and fills slots instead of writing free shell. Always confirm the result.
4. **Claude last**, and only when the user asks for it (`$.ui.ask`). Show the command, confirm, and on success write it to tier 2.

Safety: argv only with no `sh -c`, plus an oneliner-style blacklist and Atuin-style "Enter twice" for writes and deletes. Never cache a command that failed or was edited without storing the edited version. Keep the store outside `/tmp`, and log which tier answered so token savings can be measured.
