# Actions proxy: token-free Mac actions from Claude Code (prior art)

Question: can routine local actions ("abre Descargas", reveal a file, copy an image to the clipboard) run from Claude Code without a model round-trip? Researched 2026-11-06 against current docs.

## 1. Inside Claude Code: what runs without the model

| Mechanism | Model called? | Notes |
|---|---|---|
| `!` shell mode in the prompt ([docs](https://code.claude.com/docs/en/interactive-mode.md#shell-mode-with-prefix)) | **Yes by default**: Claude replies to the output, "the same as sending a normal prompt". **No** with [`respondToBashCommands: false`](https://code.claude.com/docs/en/settings-reference.md#respondtobashcommands) | The output is still added to context, so you pay for it as input on the next real turn. Runs outside the sandbox. |
| Skill/command with `` !`cmd` `` ([docs](https://code.claude.com/docs/en/slash-commands)) | **Always** | The shell runs first and its output is inlined, then the rendered skill goes to Claude. `disable-model-invocation: true` only keeps the description out of context and stops Claude from calling the skill on its own. |
| `UserPromptSubmit` command hook ([docs](https://code.claude.com/docs/en/hooks.md#userpromptsubmit-decision-control)) | **No**, if it blocks (exit 2 or `decision: "block"`) | It receives `prompt` on stdin, can run any shell, then blocks: "never reaches Claude". The reason is shown to the user and not added to context. `suppressOriginalPrompt` hides the echo. The default timeout here is 30 s. The text still lands in the transcript and history. |
| Mod `command.run` ([mods API](https://code.claude.com/docs/en/plugins/mods/api.md)) | **No** | `$.command.register` adds `/do`, and the handler runs `$.process.run([...argv])`. Returning `{}` prints nothing and costs zero tokens. Returning `{text}` prints, and "Claude reads it" on the next turn. |
| Mod `prompt.submit` ([events](https://code.claude.com/docs/en/plugins/mods/events.md)) | **No**, if it returns `{ drop }` | Catch: dropped text goes *back into the input box* with "Prompt dropped by a hook:". That suits a guard better than an action runner. A hook that throws lets the prompt through, so it fails open. |
| Keybindings ([docs](https://code.claude.com/docs/en/keybindings)) | Depends on the command | `"meta+o": "command:<name>"` runs a slash command. Bound to a mod command, it gives a zero-token hotkey. |
| Status line ([docs](https://code.claude.com/docs/en/statusline)) | No | Display only (a script prints text). It can't trigger actions. |

## 2. MCP servers and plugins for macOS control

All of these cost a **full model turn per action**: the model reads the request, emits a tool call (output tokens), and reads the result plus the whole conversation again (cache reads). [Tool search](https://code.claude.com/docs/en/mcp) is on by default and defers definitions until needed, so the idle cost is mostly names. Without deferral, community counts put a definition at about [550–1,400 tokens per tool](https://dev.to/kenimo49/your-mcp-server-eats-55000-tokens-before-your-agent-says-a-word-i-measured-the-real-cost-19l8).

- [steipete/macos-automator-mcp](https://github.com/steipete/macos-automator-mcp): AppleScript/JXA with **2 tools** (`execute_script`, `get_scripting_tips`) and a script knowledge base. It's the leanest of these servers (one generic tool), but the model writes the script, which costs output tokens and is not deterministic.
- [wonderwhy-er/DesktopCommanderMCP](https://github.com/wonderwhy-er/DesktopCommanderMCP): terminal and file system. As of v0.2.38 its own counter reported [41 tools ≈ 13.7k tokens](https://newreleases.io/project/github/wonderwhy-er/DesktopCommanderMCP/release/v0.2.38), most of which Claude Code already has natively.
- Hammerspoon: [vukvukovich/hammerspoon-mcp](https://github.com/vukvukovich/hammerspoon-mcp) has about 41 tools in tiers, with eval/AppleScript gated behind an env var. [mobabur94/hammerspoon-mcp](https://glama.ai/mcp/servers/mobabur94/hammerspoon-mcp) has 60+ tools.
- Shortcuts: [recursechat mcp-server-apple-shortcuts](https://lobehub.com/mcp/recursechat-mcp-server-apple-shortcuts) (list and run). [eneko-codes/apple-shortcuts-mcp](https://github.com/eneko-codes/apple-shortcuts-mcp) deliberately avoids building a CLI line from a model-chosen name, to prevent injection. [foxtrottwist/shortcuts-mcp](https://www.claudepluginhub.com/plugins/foxtrottwist-shortcuts-mcp) is another option.
- Raycast: [RayBridge](https://github.com/jlokos/raybridge) exposes installed Raycast extensions as MCP tools. [raycast-mcp-server](https://github.com/expertvagabond/raycast-mcp-server) has 9 tools.

None of them skips the model. They make the action *possible*, not *free*.

## 3. Outside Claude: launchers that are already token-free

- **macOS Shortcuts CLI**: `shortcuts run "Name" -i <path>` ([Apple](https://support.apple.com/guide/shortcuts-mac/run-shortcuts-from-the-command-line-apd455c82f02/mac)). It exits 0 or 1, and a shortcut that waits for user input stalls it.
- **Hammerspoon**: `hs -c '<lua>'` after `require("hs.ipc")` ([docs](https://www.hammerspoon.org/docs/hs.ipc.html)). It's fast and covers windows, the clipboard and apps.
- **Raycast**: `open "raycast://extensions/<owner>/<ext>/<cmd>?arguments=…&launchType=background"` ([deeplinks](https://developers.raycast.com/information/lifecycle/deeplinks)). Raycast may ask for confirmation on deeplink launches. In the other direction, the [Agent Client Protocol extension](https://www.raycast.com/Yukai/agent-client-protocol) chats with Claude Code from Raycast.
- **Alfred**: `osascript -e 'tell application id "com.runningwithcrayons.Alfred" to run trigger "x" in workflow "id" with argument "y"'` ([forum](https://www.alfredforum.com/topic/4443-trigger-a-workflow-action-from-applescript/)). It's asynchronous and steals focus.
- Plain `open <dir>`, `open -a App`, `open -R <file>`, and `osascript` for the clipboard (`set the clipboard to (read POSIX file "x.png" as «class PNGf»)`) already cover most of the verbs with no dependency.

Claude Code to launcher: the proxy shells out to the commands above. Launcher to Claude: a Raycast/Alfred action runs `claude -p "…"` for jobs that need judgment.

## Recommendation

Build a **mod** (a plugin with a hooks module) with a plain-hook fallback:

1. **`/do <phrase>` command** (`$.command.register` + `command.run`). Match the phrase against a user rules file (`abre|open <alias>` → `["open", path]`; `revela <file>` → `["open","-R",path]`; `copia imagen <file>` → osascript; `atajo <name>` → `["shortcuts","run",name]`). Run with `$.process.run(argv)` and **no shell**, then return `{}` or a one-line `{text}`. Bind hotkeys with `command:do`.
2. **No match falls through**: ask with `$.ui.ask("No rule matched — send to Claude?")`, then `$.prompt.submit`. Only then are tokens spent. Optionally suggest a new rule from what Claude ran.
3. **Fallback without mods**: a `UserPromptSubmit` script that only fires on an explicit prefix (e.g. `> abre Descargas`), runs the rule, and exits 2 with `suppressOriginalPrompt`. Never intercept unprefixed prompts, so ordinary chat never triggers an action by accident.
4. Delegate rich actions to Shortcuts, Hammerspoon or Raycast instead of reimplementing them, so the proxy stays a thin router.

## Risks

- **Natural language to command**: use regex rules with typed slots, never `sh -c` with interpolated text. Resolve folders through an alias map and an allowlist of roots, and require confirmation for anything that writes, deletes or sends.
- **Permissions**: Automation, Accessibility and clipboard rights are granted by TCC to the *terminal app*, so Claude's own Bash tool inherits them too. Mod `process.run` and hook scripts run with full user rights, outside Claude Code's Bash permission rules and the sandbox (check this against the mods reference). Enterprise managed settings can disable user mods.
- **Fail-open**: a mod hook that throws, or a hook timeout (30 s), passes the prompt to the model. Add `.catch` handlers and keep actions async and short.
- **Hidden token leaks**: `{text}` results and `!` output enter context. Keep replies empty or one line.
- **Privacy**: blocked or dropped prompts still go to the transcript and history.
