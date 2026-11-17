# reflex beyond Claude Code: where else it can live

Research spike, 2026-11-07. Read-only: nothing was installed, and nothing but this file was written. Each claim cites a source listed at the end, all checked on 2026-11-07. Anything marked *unverified* comes from a secondary source or could not be confirmed in official docs.

## Verdict

The property that makes reflex worth having is that **an action never wakes the LLM**: the phrase is consumed before the model sees it. A host supports that only if it has a hook that runs on the submitted prompt *and can block it*. Rewriting is not enough, because a rewritten prompt still costs a turn. A **live preview while typing** is rarer still.

1. **Only Claude Code has both** a pre-LLM block and a live preview (mods: `prompt.edit`, `ui.render AbovePrompt`, `prompt.submit` → `{ drop }`) [C1][C2].
2. **Block, but no preview:** Codex CLI, Gemini CLI, Cursor and Cline. Continue's `cn` and Amp probably too (*unverified*). There, reflex can still keep the phrase from the model, but it acts without showing what it will do first. That breaks the "Visible" principle in `design.md` unless the host shows the block reason afterwards. All four confirmed hosts do show it.
3. **Rewrite or observe only:** GitHub Copilot (CLI and VS Code), opencode, Goose. **No hook at all:** Warp, Zed, Aider. For these, reflex can only be an MCP tool the agent calls. That costs one LLM turn per action, which is the cost reflex exists to avoid.
4. **Outside agents**, zsh (ZLE) and Alfred give the full Claude Code experience: a preview while typing and Enter intercepted. Raycast does too, but only as an extension, not as a script command.
5. **Ollama:** publish under `pelayomendez/reflex-core` on ollama.com, but only after roadmap phase 7 proves the model holds up on a foreign index. v4 is trained on this Mac's names. Use a Hugging Face GGUF as a mirror, not as the install path. Once the zsh widget ships, reflex fits Ollama's "Terminal & CLI" integrations list.

## 1. Hosts

Legend for the hook column. **block:** a hook can stop the prompt before the model. **rewrite:** it can change the text the model receives. **context:** it can only append context. **observe:** it sees the prompt, and its output is ignored. **none:** no hook.

| Host | Pre-LLM prompt hook | Live preview while typing | Packaging channel | MCP |
|---|---|---|---|---|
| **Claude Code** | **block + rewrite**: mods `prompt.submit` returns changed text or `{ drop }` [C2]. Hooks `UserPromptSubmit` can block (exit 2 / `decision: "block"`) but cannot replace the prompt [C3] | **yes**: `prompt.edit` (50 ms budget) + `ui.render` on `AbovePrompt` [C2]. What `hooks/register.tsx` does today | plugin marketplace (`/plugin install … --marketplace`), the current reflex route | yes |
| **OpenAI Codex CLI** | **block**: `UserPromptSubmit` with `decision: "block"` or exit 2; context via stdout. No rewrite [X1] | no hook while typing found [X1] | plugins bundle `hooks/hooks.json`; `codex plugin marketplace add owner/repo`. Plugin hooks stay untrusted until the user reviews them [X1][X2] | yes, plugins declare `mcp.json` [X2] |
| **Gemini CLI** | **block**: `BeforeAgent` with `"deny"` discards the user's message ("it will not appear in history"). Context is appended. No rewrite field [G1] | no [G1] | extensions (`gemini extensions install <github-url>`) bundle hooks + MCP; public gallery [G2] | yes [G2] |
| **Antigravity CLI** (replaced Gemini CLI for unpaid and Google One users on 2026-06-18 [G2]) | *unverified*: one plugin author reports it reads `SessionStart`, `PreInvocation`, `PostToolUse`, `PostInvocation`, `Stop`, not `BeforeAgent` [G3] | *unverified* | plugins with `plugin.json`, `hooks.json`, `mcp_config.json` (*unverified*) [G3] | yes (*unverified*) [G3] |
| **GitHub Copilot CLI** | **rewrite only**: `userPromptTransformed` is "mutation-only — it can rewrite the content the model receives, but not block". Config-file `userPromptSubmitted` output is dropped [H1] | no [H1] | Copilot plugins (hooks, MCP, skills, agents) shared through plugin marketplaces; `copilot plugin install` [H2] | yes [H2] |
| **Copilot in VS Code (chat)** | **observe**: "command-hook output is ignored for `userPromptSubmitted`" [H3]. Chat participants (the extension API) are deprecated in the Copilot harness [H4] | no API found for the chat input (*unverified*) [H4] | agent plugins via customization marketplaces [H3]; VS Code Marketplace for extensions | yes |
| **Cursor** | **block**: `beforeSubmitPrompt` returns `continue: false` + `user_message`, with no field to rewrite [U1] | no [U1] | project `.cursor/hooks.json`, MDM, enterprise cloud sync, plugins (command hooks only) [U1]; Cursor Marketplace [U2] | yes, stdio [U2] |
| **Cline** | **block**: `UserPromptSubmit` returns `cancel: true`; `contextModification` adds context [L1][L2]. The CLI keeps run-start hook control "inert" for now [L3] | no (*unverified*) | hook scripts in the user or workspace hooks dir; VS Code extension [L1] | yes |
| **Continue (`cn` CLI)** | Claude Code-compatible hooks incl. `UserPromptSubmit` merged in PR #11029 (2026-03) but undocumented; whether it can block is *unverified* [N1] | no (*unverified*) | config / hub (*unverified*) | yes, agent mode only [N2] |
| **Aider** | **none**: no input hook in the options reference [A1] | no | pip | **no native MCP** (requests open) [A2] |
| **opencode** | **rewrite (undocumented)**: mutating `chat.message` `output.parts` in place works but is "fragile and undocumented"; **no block** (feature request #30434) [O1][O2] | not found; TUI plugins exist, prompt-box API *unverified* [O3] | npm packages (`opencode plugin add <pkg>`) [O3] | yes, stdio [O4] |
| **Goose** | **observe**: "a block decision from those events is ignored"; only `PreToolUse` and `Stop` can block [S1] | no [S1] | plugin dirs (`~/.agents/plugins/<name>/`), Open Plugins hooks format; copied by hand [S1] | yes (extensions are MCP) [S1] |
| **Warp** | **none**: no hooks surface; requests open (#6857 and others) (*unverified*, secondary) [W1] | no | none | yes [W2] |
| **Zed agent** | **none**: lifecycle hooks are proposals (#57890, #57943) with no prompt-submit event [Z1][Z2] | no | extensions (MCP servers as extensions) [Z3] | yes [Z3] |
| **Amp** | **context**: `agent.start` fires on each user prompt, and its returned message is "appended after the user's content" [M1]. A `cancel()` "prevents the turn from starting" during `agent.start` per the type reference, but the event docs don't say so (*unverified*) [M1] | no; status items "near the prompt editor" are display-only [M1] | Bun plugin files in `.amp/plugins/` or `~/.config/amp/plugins/` [M1] | yes [M1] |

## 2. Who keeps "never wakes the LLM"

**Same property as Claude Code (prompt blocked locally, zero tokens):**

| Host | How | What is lost |
|---|---|---|
| Codex CLI | `UserPromptSubmit` → run action → `decision: "block"`, `reason: "⚡ opened brand"` | preview; the user must trust the plugin's hooks once |
| Gemini CLI | `BeforeAgent` → `deny`, message discarded from history | preview; future unclear (Antigravity) |
| Cursor | `beforeSubmitPrompt` → `continue: false`, `user_message` | preview |
| Cline (VS Code) | `UserPromptSubmit` → `cancel: true`, `errorMessage` shown | preview; not in the CLI yet |
| Continue `cn`, Amp | likely, per the sources above | *unverified* |

Without a preview, Enter runs an action the user has not seen. Before shipping to these hosts, decide which of these mitigations to use: (a) act only on template hits, not on model hits; (b) require a prefix (e.g. `⚡`/`!` or `r `) there; (c) report the result loudly through the block reason. Option (c) is the floor; (a) keeps the "conservative" principle.

**Only the MCP fallback:** Copilot CLI and VS Code, opencode, Goose, Warp, Zed, Amp (until `cancel` is confirmed), and Continue in agent mode. The agent reads the prompt, decides to call `reflex.act`, and answers. That is one full LLM turn: the input tokens of the whole context plus a tool call. reflex then saves only the model's *work*, grounding and running the action safely, not the turn. Copilot CLI's rewrite does not help either: a rewritten prompt still goes to the model. Aider has neither hook nor MCP.

The MCP server is still worth one small build: one stdio server wrapping `reflex --json` and `reflex --pick` covers every MCP host at once, and it is the `design.md` "MCP tool for other agents" item. Its value is the safe, grounded action catalogue, not tokens.

## 3. Ollama

**Publishing the model.** The ollama.com route is: account → add the local Ollama public key on the Keys page → `ollama cp reflex-core pelayomendez/reflex-core` → `ollama push pelayomendez/reflex-core`; users run `ollama pull pelayomendez/reflex-core` [Y1]. Prefer this over Hugging Face as the install path. The pushed model keeps its Modelfile, including `RENDERER functiongemma` / `PARSER functiongemma`, which the training format depends on (`training-on-mac.md`, "Format"). `ollama run hf.co/<user>/<repo>` picks a template from the GGUF's `tokenizer.chat_template`, or from a Go `template` file in the repo [Y2]. Nothing in that page says it sets a renderer or parser. Ollama's GGUF renderer auto-detect covers only gemma4, laguna and nemotron (`training-on-mac.md` [S23]). So an `hf.co/` pull would likely render prompts differently from training (*unverified*: test it before you recommend it). Publish the HF GGUF as a mirror for llama.cpp / LM Studio users, with the Modelfile in the repo.

**When.** Not v4. It was trained on phrases built from this Mac's index (repo, app, file and Shortcut names), so the weights may carry those names. That is a privacy leak, and it is useless to anyone else. Roadmap phase 7 already sets the gate: a held-out set on a foreign index, with zero wrong actions. Publish then, under the Gemma terms. The terms' redistribution conditions were not re-read for this spike (*unverified*).

**Integrations list.** The README's Community Integrations has these headings: Chat Interfaces, Code Editors & Development, Libraries & SDKs, Frameworks & Agents, RAG & Knowledge Bases, Bots & Messaging, **Terminal & CLI**, **Productivity & Apps**, Observability & Monitoring, Database & Embeddings, Infrastructure & Deployment. Adding a project is "open a pull request" [Y3].
- *Terminal & CLI* already holds natural-language-to-shell tools (tlm, ShellOracle, cmdh) [Y3]. reflex with a zsh widget fits here: a local NL → typed Mac action layer.
- *Productivity & Apps* lists a Raycast extension; there is no Alfred entry [Y3]. A reflex Raycast or Alfred front end would fit.
- *Code Editors & Development* lists Cline and Continue [Y3]. These hosts can carry reflex (Cline via its hook), but reflex as a Claude Code plugin is not an Ollama client in the sense that list means.
- A listing is cheap but only makes sense once a non-Claude-Code host ships, because today reflex needs Claude Code to be useful.

**Hosts on that list that could carry a reflex-like layer:** Cline and Continue (prompt hooks, above); the Raycast extension's host (a Raycast extension of reflex's own, §4); shell copilots like tlm/ShellOracle are the same idea in a different shape (they suggest shell commands, they don't intercept).

## 4. Shells and launchers

| Host | Preview while typing | Intercept Enter | Effort |
|---|---|---|---|
| **zsh (ZLE)** | yes: `zle-line-pre-redraw` runs before each redraw; set `POSTDISPLAY` ("text to be displayed after the end of the editable text buffer") or `zle -M` for a line below [Z4] | yes: `zle -N accept-line my-widget` overrides it; `.accept-line` still reaches the original [Z4] | **thin**. Call the CLI asynchronously (`zle -F` or a debounce) so typing never waits on Node |
| **fish** | partial: `commandline` reads the buffer; a preview would go through the right prompt or a repaint (*unverified*) [F1] | yes, in principle: a function bound to Enter can replace the buffer and skip `execute` [F1] | thin–medium |
| **Alfred** | yes: a Script Filter runs as you type; "Automatic" queue delay waits for a pause [R1] | yes: the chosen item runs the action | **thin**, but needs Powerpack for workflows (*unverified*) |
| **Raycast script command** | no: arguments only, no per-keystroke run (`refreshTime` ≥ 10 s is for inline output) [R2] | runs on submit | thin, weak UX |
| **Raycast extension** | yes: `List` `onSearchTextChange` fires on text change, with `throttle` [R3] | yes: an action on the row | medium (React/TS, Raycast Store review) |

A preview needs a call per keystroke. A cold `node src/cli.mjs` per keystroke is the main cost in shells. A long-lived `reflex serve` (stdin/stdout or a Unix socket) would make every host above cheaper; that is the one `src/` change worth considering.

## 5. Recommendation (after Claude Code)

1. **zsh widget.** The only non-Claude host with the full property: preview, Enter intercepted, zero LLM. It works under every terminal agent's *shell*, not inside their prompt boxes. Thin layer (one `.zsh` file plus maybe `reflex serve`). Ship via Homebrew tap or plugin managers (oh-my-zsh / zinit), and it unlocks the Ollama "Terminal & CLI" listing. Already in the roadmap.
2. **Codex CLI plugin.** Its `UserPromptSubmit` block has the same shape as Claude Code's hook (JSON `decision: "block"`), and plugins have a marketplace. Thin layer: a `hooks/hooks.json` + a ~30-line script calling `reflex --json`. Loses the preview, so act only on template hits or behind a prefix. Second-largest terminal agent audience.
3. **Cursor (then Gemini CLI, Cline).** Same thin pattern: `beforeSubmitPrompt` → `continue: false`. The biggest editor audience. Gemini CLI's `deny` is just as clean, but Antigravity is replacing it for free users, so build it only if its hook surface is confirmed. Cline's works in the extension, not yet its CLI.
4. **Alfred Script Filter** (or a Raycast extension, if you'd rather build for the Store). A launcher with a live preview and no agent at all: reflex as a plain Mac launcher. Thin for Alfred, medium for Raycast.

**Not worth targeting for the core value:** Copilot (CLI and VS Code), opencode, Goose, Warp, Zed, Aider. One generic MCP server covers all of them except Aider, at the cost of an LLM turn. Build it once, late, as the `design.md` "MCP tool" item. Revisit opencode if #30434 (block in `chat.message`) lands, and Amp if `cancel()` in `agent.start` is confirmed.

## Sources (all checked 2026-11-07)

- [C1] Claude Code mods, getting started: https://claude.dev/blog/getting-started-with-claude-code-mods/
- [C2] Claude Code Mods reference (`prompt.edit` 50 ms, `prompt.submit` drop, `ui.render` `AbovePrompt`): https://code.claude.com/docs/en/plugins/mods/reference (details via search summary; reflex's own `hooks/register.tsx` uses all three)
- [C3] Claude Code hooks reference, `UserPromptSubmit` and "What a blocked prompt leaves behind": https://code.claude.com/docs/en/hooks
- [X1] Codex hooks: https://learn.chatgpt.com/docs/hooks (redirected from https://developers.openai.com/codex/hooks)
- [X2] OpenAI, package your plugin (marketplace add, `mcp.json`, hook trust): https://developers.openai.com/plugins/build/plugins (via search summary)
- [G1] Gemini CLI hooks reference (`BeforeAgent` deny): https://geminicli.com/docs/hooks/reference/
- [G2] Gemini CLI extensions (packaging, gallery, Antigravity note): https://geminicli.com/docs/extensions/
- [G3] Antigravity CLI hook names, *unverified* (secondary): https://docs.claude-mem.ai/antigravity-cli/setup
- [H1] GitHub Copilot hooks configuration (`userPromptSubmitted`, `userPromptTransformed`): https://docs.github.com/en/copilot/reference/hooks-configuration
- [H2] Copilot CLI, creating plugins: https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-creating
- [H3] VS Code agent hooks: https://code.visualstudio.com/docs/copilot/customization/hooks
- [H4] VS Code chat participant API (deprecated in the Copilot harness): https://code.visualstudio.com/api/extension-guides/ai/chat
- [U1] Cursor hooks (`beforeSubmitPrompt`, distribution): https://cursor.com/docs/agent/hooks
- [U2] Cursor MCP and Marketplace: https://cursor.com/docs/context/mcp
- [L1] Cline hooks (mirror of the moved docs; `cancel`, `contextModification`), *secondary*: https://mintlify.wiki/cline/cline/customization/hooks; launch post: https://cline.bot/blog/cline-v3-36-hooks
- [L2] Cline v4.1.20 (context injection fixed; CLI inert): https://github.com/cline/cline/releases/tag/v4.1.20
- [L3] Current Cline docs point hooks to SDK Plugins: https://docs.cline.bot/features/hooks
- [N1] Continue CLI hooks docs request (PR #11029 merged 2026-03-04): https://github.com/continuedev/continue/issues/11115
- [N2] Continue MCP (agent mode only): https://docs.continue.dev/customize/deep-dives/mcp
- [A1] Aider options reference: https://aider.chat/docs/config/options.html
- [A2] Aider MCP request: https://github.com/Aider-AI/aider/issues/3314, RFC https://github.com/Aider-AI/aider/issues/4506
- [O1] opencode block request: https://github.com/anomalyco/opencode/issues/30434
- [O2] opencode `chat.message` parts issues: https://github.com/anomalyco/opencode/issues/22831, https://github.com/code-yeongyu/oh-my-openagent/issues/885
- [O3] opencode plugins (npm install): https://opencode.ai/docs/plugins/ (the build guide at /build/plugins returned 404)
- [O4] opencode MCP servers: https://opencode.ai/docs/mcp-servers/
- [S1] Goose hooks: https://goose-docs.ai/docs/guides/context-engineering/hooks/
- [W1] Warp hooks request: https://github.com/warpdotdev/warp/issues/6857; tracker (secondary): https://clients.dev/clients/warp
- [W2] Warp MCP: https://docs.warp.dev/guides/external-tools/using-mcp-servers-with-warp/
- [Z1] Zed agent hooks proposal: https://github.com/zed-industries/zed/issues/57890
- [Z2] Zed agent extensibility discussion: https://github.com/zed-industries/zed/discussions/57943
- [Z3] Zed MCP: https://zed.dev/docs/ai/mcp
- [M1] Amp Plugin API (`agent.start`, `cancel`, plugin locations): https://ampcode.com/manual/plugin-api; manual: https://ampcode.com/manual
- [Z4] zsh Line Editor (`POSTDISPLAY`, `zle-line-pre-redraw`, `zle -N`, `zle -M`): https://zsh.sourceforge.io/Doc/Release/Zsh-Line-Editor.html
- [F1] fish `commandline`: https://fishshell.com/docs/current/cmds/commandline.html
- [R1] Alfred Script Filter: https://www.alfredapp.com/help/workflows/inputs/script-filter/
- [R2] Raycast script commands: https://github.com/raycast/script-commands
- [R3] Raycast List API (`onSearchTextChange`, `throttle`): https://developers.raycast.com/api-reference/user-interface/list
- [Y1] Ollama import and push: https://docs.ollama.com/import
- [Y2] Hugging Face GGUF in Ollama: https://huggingface.co/docs/hub/ollama
- [Y3] Ollama README, Community Integrations: https://github.com/ollama/ollama/blob/main/README.md
