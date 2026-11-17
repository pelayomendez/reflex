# reflex vocabulary: what similar tools let you say, and what to add next

Research spike, 2026-11-07. Read-only: nothing was installed and no code was changed. Claims cite the sources listed at the end. Where a primary source does not name a verb or keyword, the table says so and does not fill the gap from memory.

## Verdict

reflex has four verbs today: open, reveal, copy, run a Shortcut. quit is in progress. Every comparable launcher has a fifth group that reflex lacks: **controlling a running app or the Mac itself** (hide, lock, volume, appearance). Most of those are local, instant and reversible, so they fit reflex's rules. Three findings matter most:

1. **The cheapest wins are variants of verbs reflex already has.** Copy path is a copy, a System Settings pane is an open, "open X with Y" is an open, and Quick Look is a gentler reveal. They need new target kinds, not new rules.
2. **The new verbs that fit are hide, lock, mute/volume and dark mode.** Each is a one-line system call that you can undo by hand at once.
3. **Today the REQUEST gate would send the most natural Spanish phrasing for these to the wrong verb.** `pon`, `activ*`, `enciend*` and `turn` sit in REQUEST and in `REQUEST_FORMS` as **open** forms. So "pon el modo oscuro", "activa el modo oscuro" and "turn on dark mode" would ask the model for `open`. Adding toggles means these openers stop meaning "open" by default.

Spanish phrasing: Apple documents no Spanish Siri command list for the Mac. The Spanish Voice Control page gives only a few examples ("Abrir Mail", "Mostrar comandos", "Dejar de escuchar") [S8]. The most reliable Spanish source turned out to be macOS's own Spanish wording, in Apple's Spanish keyboard-shortcut reference [S10]: *salir de la app*, *ocultar*, *forzar la salida*, *bloquear la pantalla*, *poner el Mac en reposo*, *vaciar la papelera*, *mostrar el escritorio*, *minimizar*. Those are the verbs a Spanish macOS user reads in menus every day.

## 1. Actions across tools

Key: ✓ = offered, with the name or keyword the source gives. — = not in the primary source checked (it may still exist). EN names are the tools' own. ES comes from Apple's Spanish UI wording [S10] or Voice Control [S8] where noted.

| Action | Raycast [S1][S2][S3] | Alfred [S4][S5][S6] | LaunchBar [S7][S12] | Spotlight [S9][S16] | Shortcuts / Siri [S13][S14] | Voice Control / Talon [S8][S11][S15] | ES wording (source) |
|---|---|---|---|---|---|---|---|
| Open app / file / folder | Root search, ↵; "Open in Finder" for a typed path | default results; `open` keyword | ↵ "Open" | ↵ open | Open App (Shortcuts) | "Open Mail" (VC); `launch chrome` (Talon) | "Abrir Mail" (VC) |
| Switch to a running app | — | — | — | — | — | `focus chrome` (Talon) | — |
| Show in Finder | — (file search) | `find` keyword | "Show in Finder" ⌘↵ | "locate a file in the Finder" (hold ⌘) | — | — | — |
| Quick Look preview | "Quick Look" | — | Quick Look | Space bar | — | — | — |
| Copy path | — | — | ⌘C on a file copies its path | — | — | — | — |
| Copy file contents | — | — | ⌘⌥C | — | — | "copy that" (Talon, selection) | — |
| Open with another app | — | — | "Open with" | — | — | — | — |
| Quit app | Quit All Apps, Quit All Apps Except Frontmost (confirm on by default) | Quit, Quit All | Quit, Quit All Applications | — | Quit App (incl. all, with exceptions) | — (Talon: none; VC: not on the page) | *salir de la app* |
| Force quit | — | Force Quit | Force Quit | — | — | — | *forzar la salida* |
| Restart frontmost app | Restart Frontmost App | — | — | — | — | — | — |
| Hide app / hide others | Hide All Apps Except Frontmost, Unhide All Hidden Apps | Hide | Hide, Hide Others | — | Hide App | — | *ocultar* (las ventanas de la app) |
| Show desktop | Show Desktop | — | — | — | — | — | *mostrar el escritorio* |
| Close / minimize window | — | — | — | — | — | `window close` (Talon) | *cerrar la ventana*, *minimizar* |
| Lock screen | Lock Screen | Lock | — | — | Lock Screen | — | *bloquear la pantalla* |
| Sleep / sleep displays | Sleep, Sleep Displays, Hibernate | Sleep, Sleep Displays | Sleep | — | — | — | *poner el Mac en reposo* |
| Screen saver | Show Screen Saver | Screen Saver (`screensaver`) | Start Screen Saver | — | Start Screen Saver | — | — |
| Restart / shut down / log out | ✓ all three | ✓ all three | ✓ all three | — | — | — | — |
| Volume / mute | Turn Volume Up/Down, Set Volume to 0–100%, Toggle Mute, per-app mute, mic/camera mute | Volume Up, Volume Down, Toggle Mute | Increase/Decrease Volume, Min/Medium/Max, Mute, Mute Off, Toggle Mute | — | Set Volume | `volume up`, `volume down`, `volume mute` (Talon) | — |
| Media play/pause/next | Play / Pause, Next/Previous Track, Seek ±10 s | — | Play, Pause, Next Song, Back Track | — | — | — | — |
| Dark mode | Toggle System Appearance, Auto Dark Mode | — | Dark Mode On/Off | — | Set Appearance (Toggle) | — | — |
| Wi-Fi / Bluetooth / airplane | Toggle WiFi, Toggle Bluetooth, Toggle Airplane Mode | — | — | — | — | — | — |
| Open trash | Open Trash | Show Trash | Open Trash | — | — | — | — |
| Empty trash | Empty Trash (optional warning) | Empty Trash | Empty Trash, Secure Empty Trash | — | — | — | *vaciar la papelera* |
| Eject | Eject All Disks | Eject, Eject All | Eject, Eject All Ejectable Volumes | — | — | — | — |
| Toggle hidden files | Toggle Hidden Files | — | — | — | — | — | — |
| Dismiss notifications | Dismiss Notifications | — | — | — | — | — | — |
| Open a System Settings pane | root search | "Preferences" in default results | — | — | — | — | — |
| Search files | Search Files | `open`/`find`, `in` (content) | File Content Search, Search in Spotlight | ✓ | — | — | — |
| Calculator / conversions | Calculator | — (not on the pages read) | Calculator | "15% of 85", "5 miles in km" | — | — | — |
| Dictionary | — | — | Look Up in Dictionary | type a word | — | — | — |
| Clipboard history | Clipboard History | Clipboard History (off by default "for privacy") | Clipboard History, Clear Clipboard History | clipboard history search | — | — | — |
| Screenshot | — | — | Copy Screenshot of Selected Area / Window | — | — | — | *hacer una captura* |
| Run a Shortcut / action | — | — | — | Actions (⌘3) with quick keys, incl. Shortcuts | run shortcut | — | — |
| Show date/time, IP | — | — | Show Date and Time, Show IP Address | — | — | — | — |

## 2. Which fit reflex's rules

The rules: local, instant, reversible or harmless, nothing that writes files, moves, deletes or sends.

| Action | Fits? | Why |
|---|---|---|
| Copy path | yes | A copy, like copying text; the clipboard is already in scope. |
| Open a System Settings pane | yes | An open with a new target kind. |
| Open with another app | yes | An open with a second slot. |
| Quick Look preview | yes | Read-only; closes with Esc. |
| Switch to / focus app | yes | Same as opening a running app. |
| Hide app / hide others / show desktop | yes | Nothing changes state; one click brings the app back. |
| Lock screen | yes | Harmless; unlock restores everything. |
| Volume / mute | yes | Instant and reversible, but it does change a system setting. |
| Dark mode | yes | Same; it writes a system preference, so it needs care. |
| Media play/pause/next | yes | Harmless; reversible at once. |
| Screen saver / sleep displays | yes | Harmless; any key wakes it. |
| Copy screenshot to clipboard | yes, borderline | Clipboard only, no file, but it is interactive (select an area), so it is not instant. |
| Calculator / conversions | borderline | Harmless, but it is an answer, not an action; Claude answers it already. Only fits as "copy the result". |
| Quit app | yes, with care | Apps normally ask to save; reversible by reopening. Excluding Claude Code's own terminal is a must. |
| Open trash | yes | An open. |
| Sleep (whole Mac) | borderline | Reversible, but it stops running jobs, the Claude session included. |
| Eject | borderline | macOS refuses while busy, but it can interrupt a backup or a copy. |
| Wi-Fi / Bluetooth / airplane | no | Can cut the network Claude Code itself is using; not instantly reversible from the prompt. |
| Toggle hidden files | no | Writes a Finder default and relaunches Finder. |
| Dismiss notifications | no | Destroys information you may not have read. |
| Force quit, quit all, restart frontmost | no | Loses unsaved work. |
| Restart / shut down / log out | no | Ends the session that typed the command. |
| Empty trash | no | Deletes, irreversibly. |
| Clipboard history | no | Needs a resident store of everything copied: neither instant nor private by default (Alfred ships it off). |
| Search files (as a list) | no | Results are a list to choose from, which is Claude's job; reveal already covers "where is X". |

## 3. Shortlist: what to add next

Ranked by value to a reflex user × fit with the rules × how little new machinery it needs.

| # | Action | ES examples | EN examples | Risk |
|---|---|---|---|---|
| 1 | **quit app** (in progress) | "cierra Slack", "sal de Slack", "cierra Figma" | "quit Slack", "close Figma" | side effects |
| 2 | **copy path** (copy, new target kind) | "copia la ruta de brand", "pásame la ruta del post de watchmen" | "copy the path of brand", "copy path to Downloads" | harmless |
| 3 | **open a System Settings pane** (open, new target kind) | "abre ajustes de sonido", "abre los ajustes de Bluetooth" | "open sound settings", "open Bluetooth settings" | harmless |
| 4 | **hide app / hide others** | "oculta Slack", "esconde Slack", "oculta las demás" | "hide Slack", "hide others" | harmless |
| 5 | **lock screen** | "bloquea la pantalla", "bloquea el Mac" | "lock screen", "lock the Mac" | harmless |
| 6 | **mute / volume** | "silencia", "sube el volumen", "volumen al 30" | "mute", "volume up", "set volume to 30" | harmless |
| 7 | **open with** (open, second slot) | "abre el post de watchmen con Typora", "abre brand con Cursor" | "open brand in Cursor", "open the post with Typora" | harmless |
| 8 | **dark mode** | "modo oscuro", "activa el modo oscuro", "pon el modo claro" | "dark mode", "turn on dark mode", "toggle appearance" | harmless (writes a preference) |
| 9 | **preview (Quick Look)** | "previsualiza la imagen de cache-nudge", "vista rápida del post" | "preview the cache-nudge image", "quick look the post" | harmless |
| 10 | **sleep displays / screen saver** | "apaga la pantalla", "salvapantallas" | "sleep display", "screen saver" | harmless |

Notes:

- 2, 3, 7 and 9 reuse resolvers reflex already has (files, folders, apps), so they are the cheapest. 3 needs a small fixed table of pane names in both languages.
- 4, 5, 6, 8 and 10 have no target, or a closed one (an app name, a number). They suit a fixed parser better than the model.
- 8 collides with today's gate: `pon`, `activ*`, `enciend*` and `turn` are open forms in `REQUEST_FORMS`. "activa el modo foco" (a Shortcut) has the same shape. Decide which wins before teaching the model either.
- 1: in Spanish, *cierra* means both "quit the app" and "close the window" (*cerrar la ventana*, [S10]). For reflex, "cierra <app>" should mean quit, and "cierra la ventana" should go to Claude.
- Left off on purpose: media keys (useful, but not what people type in a coding terminal), sleep the whole Mac, eject, and every destructive item in section 2.

## 4. Synonyms the tools use that REQUEST does not cover

What REQUEST already has: abr*, open*, launch*, lanz*, start, arranc*, inicia*, ejecut*, run, muestr*/mostr*, ensen*, show, reveal*/revel*, copi*/copy, bring, take, llev*, pon*, turn, enciend*, ve, go, vamos, ver, let me see, dame, give, get, saca, trae*, find, busca*, encuentra*, activ*, pasa/pasame, trigger, donde esta.

Seen in the tools and missing:

| For verb | Missing word | Seen in | Note |
|---|---|---|---|
| open | **focus** | Talon `focus chrome` [S11] | Means "switch to a running app"; the same thing as open for an app. |
| open | **switch (to)**, ES **cambia a** | Voice Control cheat sheets (unofficial) [S15] | Apple's own page only shows "Open Mail" [S8]; treat as likely, not confirmed. |
| open | **launch** ✓, **lanza** ✓ | Talon [S11] | Already covered. |
| reveal | **locate**, ES **localiza** / **ubica** | Spotlight: "locate a file in the Finder" [S9] | `find` is in REQUEST but `STATED` marks `find`/`buscar` as NOT_DONE; "locate" is the unambiguous reveal word. |
| reveal | "**open in Finder**", "**show in current Finder window**" | Raycast [S3], LaunchBar [S12] | "open in Finder" currently reads as open + a place; it should resolve to reveal, as "pon … en el finder" does. |
| reveal / preview | **preview**, **quick look**, ES **previsualiza**, **vista rápida** | Raycast, LaunchBar, Spotlight [S3][S7][S9] | Only if preview is added (#9). |
| copy | **copy path**, ES **copia la ruta** | LaunchBar [S12] | "copia" already passes the gate; the gap is the *path* target, not the verb. |
| shortcut | **do**, **perform**, ES **haz** | Shortcuts / Spotlight call them "actions" [S16] | "haz modo foco" goes nowhere today. Weak evidence; consider it only if the logs show it. |
| shortcut | **activ*** for Focus | Shortcuts | Already in REQUEST, but mapped to open; see the collision note in section 3. |

New verbs need their own words, none of which are in REQUEST today: **quit/close, cierra, sal (de)** · **hide, oculta, esconde** · **lock, bloquea** · **mute, silencia, sube/baja (el volumen), volume** · **dark/light mode, modo oscuro/claro** · **preview, previsualiza**.

## Sources

- [S1] Raycast manual, System Commands (macOS): https://manual.raycast.com/system-commands
- [S2] Raycast, System extension: https://www.raycast.com/core-features/system
- [S3] Raycast manual, File Search: https://manual.raycast.com/file-search
- [S4] Alfred help, System Commands: https://www.alfredapp.com/help/features/system/
- [S5] Alfred help, File Search (`open`, `find`, `in`): https://www.alfredapp.com/help/features/file-search/
- [S6] Alfred help, Default Results; Clipboard History: https://www.alfredapp.com/help/features/default-results/, https://www.alfredapp.com/help/features/clipboard/
- [S7] LaunchBar features (full built-in action list): https://www.obdev.at/products/launchbar/features.html
- [S8] Apple, Voice Control commands on Mac (EN / ES): https://support.apple.com/guide/mac-help/use-voice-control-commands-mh40719/mac, https://support.apple.com/es-es/guide/mac-help/mh40719/mac
- [S9] Apple, Search with Spotlight on Mac: https://support.apple.com/guide/mac-help/search-with-spotlight-mchlp1008/mac
- [S10] Apple, Mac keyboard shortcuts (EN / ES, for the menu verbs): https://support.apple.com/en-us/102650, https://support.apple.com/es-es/102650
- [S11] Talon wiki, Basic Usage (community command set): https://talon.wiki/Basic%20Usage/basic_usage/
- [S12] LaunchBar help, Opening Items; Working with Files and Folders: https://www.obdev.at/resources/launchbar/help/OpeningItems.html, https://www.obdev.at/resources/launchbar/help/WorkingWithFiles.html
- [S13] Apple, Shortcuts User Guide for Mac (no public per-action list): https://support.apple.com/guide/shortcuts-mac/welcome/mac, https://support.apple.com/guide/shortcuts-mac/navigate-the-action-list-apdc33e4f4da/mac
- [S14] Shortcuts' Quit App / Hide App / Set Appearance / Lock Screen actions (secondary sources, since Apple publishes no list): https://www.imore.com/apps/shortcuts-for-mac, https://www.popsci.com/diy/shortcuts-app-ideas-apple/, https://github.com/lukeeey/apple-shortcuts/issues/1
- [S15] Voice Control cheat sheet (unofficial, Maricopa): https://help.maricopa.edu/TDClient/36/DO/KB/PrintArticle?ID=455
- [S16] Spotlight actions and quick keys in macOS 26 (secondary; the Apple page read does not cover them): https://www.macrumors.com/how-to/do-more-with-spotlight-in-macos-tahoe/

Gaps: Apple publishes no Spanish (or English) list of Siri commands for the Mac, and the full Voice Control command list exists only inside System Settings › Accessibility › Voice Control › Commands. Read it there to confirm "Quit", "Hide" and "Switch to" phrasing in both languages.
