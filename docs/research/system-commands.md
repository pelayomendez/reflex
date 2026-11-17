# reflex system commands: what people expect, how each runs on macOS 15+, and which tier it belongs to

Research spike, 2026-11-14. Read-only: nothing was installed and no system state changed. The only commands run were read-only checks on this Mac (macOS 15): `which`, `man`, `pmset -g`, `pmset -g batt`, `scutil --nc list|status|help`, `networksetup -listallhardwareports|-getairportpower|-getairportnetwork`, `ipconfig getifaddr|getsummary`, `osascript -e 'get volume settings'`, `defaults read`, `df`, `uptime`, `sysctl kern.boottime`, `ls` of app bundles and of `~/.Trash`. Claims cite the sources at the end; **[local]** means "checked on this Mac with the command named"; *unverified* marks a claim from a forum, a secondary source or memory.

Trigger: «empty trash» passed to Claude, because reflex has no such phrase. The launcher comparison of 2026-11-07 is in `vocabulary.md` and is not repeated; this doc goes deeper on the system half of it.

## Verdict

1. **The gap is real but narrow.** Raycast ships about 60 system commands [S1], Alfred about 18 [S2]. Of the groups people expect, reflex covers lock, volume and Settings panes. The missing ones that fit a terminal user are: **Trash** (open, empty), **a few status queries** (battery, VPN, disk, uptime, local IP), **appearance** (dark mode), **displays** (sleep displays, screen saver), **sleep**, **hide others**, **Mission Control**, **the Screenshot toolbar**, **eject all**, **keep awake**.
2. **Most of the rest needs a third-party tool, a private API or a Shortcut.** Bluetooth (`blueutil`, private IOBluetooth API [S12]), Night Shift (`nightlight` [S14]), output/input device (`SwitchAudioSource`, tested only to macOS 11.2 [S13]), True Tone, Focus and hotspot have no supported command-line path on macOS 15. Shortcuts has actions for Focus, Wi-Fi, Bluetooth, Appearance, Night Shift and True Tone [S16], and reflex already runs Shortcuts by name. So those are best reached through **the person's own Shortcut**, not new reflex code.
3. **A confirm tier fits the 0-wrong bar, for a very short list.** Empty Trash is the case that justifies it. The confirm is not what makes it safe: the exact phrase is. The confirm adds a second, informed yes («Empty the Trash: 312 items?») with **Cancel as the default**, and it runs only on Enter at the prompt, never in the preview. Restart, shut down and log out should wait until the confirm has a week of use on Empty Trash.
4. **Queries are the cheapest big win.** Battery, VPN status, disk space, uptime and local IP each come from one read-only command that needs no permission [local]. They answer in the prompt (`$.ui.log`) and change nothing. Two expected queries are **not reliable** on macOS 15: the Wi-Fi network name (`networksetup -getairportnetwork` reports "not associated" while connected, and `ipconfig getsummary` redacts the SSID [local][S20][S21]) and the public IP (it needs the network). Both stay Claude's.
5. **Two findings for today's code.** Spanish macOS calls the Appearance pane **«Aspecto»**, not «apariencia» [S24], and `src/system.mjs` has only `apariencia`. And reading `~/.Trash` from a terminal fails with "Operation not permitted" without Full Disk Access [local], so the Trash count for a confirm must come from Finder (Automation), not from the disk.

## 1. Catalogue

Key for the source columns: R = Raycast System [S1], A = Alfred System [S2], Sh = a Shortcuts action [S16][S17], Si = Siri on Mac [S18], VC = Voice Control [S8]. A dash means the primary source checked does not list it.

ES wording: **bold** = Apple's own Spanish UI or help wording, cited. Plain = natural phrasing reflex should accept, not from Apple.

### Power and session

| Command | R | A | Sh / Si | ES (Apple wording **bold**) | EN |
|---|---|---|---|---|---|
| Sleep | Sleep, Hibernate | Sleep | — | **Reposo** (menú Apple > Reposo) [S5]; **poner el Mac en reposo** [S4]; «pon el Mac en reposo», «duerme el Mac» | sleep, put the Mac to sleep |
| Sleep displays | Sleep Displays | Sleep Displays | — | **poner las pantallas en reposo** [S4]; «apaga la pantalla» | sleep displays, turn off the display |
| Restart | Restart | Restart | — | **Reiniciar** [S6]; «reinicia el Mac» | restart, reboot |
| Shut down | Shut Down | Shut Down | — | **Apagar** [S6] (the menu item reads «Apagar equipo…» on the Mac, *unverified* from a page); «apaga el Mac» | shut down, power off |
| Log out | Log Out | Log Out | — | **cerrar sesión** (de la cuenta de usuario) [S4]; «cierra sesión» | log out, sign out |
| Lock screen (has) | Lock Screen | Lock | Lock Screen (Sh) | **bloquear la pantalla** [S4] | lock screen |
| Screen saver | Show Screen Saver | Screen Saver | Start Screen Saver (Sh, *unverified*) | «salvapantallas», «pon el salvapantallas» | screen saver, start screen saver |
| Keep awake | — (Raycast store ext.) | — | — | «mantén el Mac despierto (una hora)», «no dejes que se duerma» | keep awake, caffeinate (for an hour) |
| Energy saver | Toggle Energy Saver | — | Low Power Mode (*unverified*) | «modo de bajo consumo» | low power mode |

### Trash and disks

| Command | R | A | ES | EN |
|---|---|---|---|---|
| Open Trash | Open Trash | Show Trash | «abre la papelera», «muestra la papelera» | open trash, show trash |
| Empty Trash | Empty Trash (optional warning) | Empty Trash | **vaciar la papelera** [S4]; «vacía la papelera» | empty trash, empty the trash |
| Eject all disks | Eject All Disks | Eject, Eject All | **expulsar** el disco o el volumen [S4]; «expulsa todos los discos» | eject all, eject all disks |

### Appearance and display

| Command | R | Sh / Si | ES | EN |
|---|---|---|---|---|
| Dark / light mode | Toggle System Appearance | Set Appearance (Sh) [S16] | Ajustes > **Aspecto** > **Oscuro / Claro / Automático** [S24]; «modo oscuro», «activa el modo oscuro», «pon el modo claro» | dark mode, light mode, toggle appearance |
| Night Shift | Toggle Night Light (Windows only) | Set Night Shift (Sh) [S16]; Si [S18] | «Night Shift» (same name), «activa Night Shift» | turn on Night Shift |
| True Tone | — | Set True Tone (Sh) [S16] | «True Tone» | True Tone on/off |
| Brightness | — | Si ("Increase my screen brightness") [S18] | «sube el brillo», «baja el brillo» | brightness up/down |
| Stage Manager, HDR | Toggle Stage Manager, Toggle HDR | — | «Organizador visual» (*unverified*) | Stage Manager |

### Audio

| Command | R | A | ES | EN |
|---|---|---|---|---|
| Mute / volume (has) | Toggle Mute, Set Volume, Turn Volume Up/Down | Volume Up/Down, Toggle Mute | «silencia», «sube el volumen», «volumen al 30» | mute, volume up, volume 30 |
| Output device | Manage Sound Output Devices | — | «usa los AirPods», «salida de audio a los altavoces» | output to AirPods |
| Input device | Manage Sound Input Devices | — | «usa el micro del Mac» | use the MacBook mic |
| Mute microphone | Toggle Microphone Mute | — | «silencia el micro» | mute the mic |
| Media | Play/Pause, Next/Previous Track | — | «pausa», «siguiente canción» | pause, next track |

### Connectivity

| Command | R | Sh / Si | ES | EN |
|---|---|---|---|---|
| Wi-Fi on/off | WiFi, Toggle WiFi | Set Wi-Fi (Sh) [S17]; Si [S18] | «apaga el wifi», «activa el wifi» | turn off Wi-Fi |
| Bluetooth on/off | Bluetooth, Toggle Bluetooth | Set Bluetooth (Sh) [S17]; Si [S18] | «activa el bluetooth» | turn on Bluetooth |
| Airplane mode | Toggle Airplane Mode | — | «modo avión» | airplane mode |
| AirDrop | — | — | «abre AirDrop» | open AirDrop |
| VPN connect / disconnect | — | — | «conecta la vpn», «desconecta la vpn» | connect the VPN |
| Personal hotspot | — | — | «conéctate al hotspot del iPhone» | connect to my hotspot |

### Focus

| Command | Sources | ES | EN |
|---|---|---|---|
| Do Not Disturb / a Focus | Set Focus (Sh) [S16]; Si "Turn on Do Not Disturb" [S18] | **modo de concentración**, **No molestar** [S23]; «activa no molestar», «quita no molestar» | turn on Do Not Disturb, focus on |
| Dismiss notifications | Dismiss Notifications (R) | «borra las notificaciones» | dismiss notifications |

### Windows and apps

| Command | R / A | ES (Apple wording **bold**, all [S4]) | EN |
|---|---|---|---|
| Minimise | — | **minimizar** | minimise |
| Full screen | — | **pantalla completa** | full screen |
| Show desktop | Show Desktop (R) | **mostrar el escritorio** | show desktop |
| Mission Control | — | **abrir Mission Control** | Mission Control |
| Hide others | Hide All Apps Except Frontmost (R) | **ocultar las demás apps**; «oculta las demás» | hide others |
| Unhide all | Unhide All Hidden Apps (R) | «muestra todas las apps» | unhide all |
| Force quit | Force Quit (A) | **forzar la salida** | force quit |
| Quit all apps | Quit All Apps (R, warning on by default), Quit All (A) | «cierra todas las apps» | quit all apps |
| Restart Finder / Dock | Restart Frontmost App (R) | «reinicia el Finder», «reinicia el Dock» | relaunch Finder |
| Toggle hidden files | Toggle Hidden Files (R) | «muestra los archivos ocultos» | show hidden files |
| Spotlight | — | **mostrar u ocultar el campo de búsqueda de Spotlight** | Spotlight |
| Launchpad | — | «abre Launchpad» | Launchpad |

### Screen

| Command | Sources | ES | EN |
|---|---|---|---|
| Screenshot / recording | ⌘⇧3/4/5 [S4] | **hacer una captura o grabación de pantalla** [S4]; «haz una captura», «graba la pantalla» | take a screenshot, record the screen |

### Status queries

| Query | ES | EN |
|---|---|---|
| Battery | «¿qué batería tengo?», «batería», «cuánta batería queda» | battery, how much battery |
| Wi-Fi network | «¿a qué wifi estoy conectado?» | what Wi-Fi am I on |
| IP address | «mi IP», «¿cuál es mi IP?» | what's my IP |
| Disk space | «espacio en disco», «cuánto disco queda» | disk space, free space |
| Uptime | «cuánto lleva encendido» | uptime |
| VPN status | «estado de la VPN», «¿está conectada la VPN?» | VPN status, is the VPN on |
| Volume / appearance state | «¿a cuánto está el volumen?» | what's the volume |

### Clipboard

| Command | Sources | ES | EN |
|---|---|---|---|
| Clipboard history | R, A (off by default "for privacy") — see `vocabulary.md` | «historial del portapapeles» | clipboard history |
| Clear clipboard | LaunchBar "Clear Clipboard History" (`vocabulary.md`) | «vacía el portapapeles» | clear the clipboard |

## 2. How each runs on macOS 15+

Permission key: **none** = no TCC prompt; **Auto(X)** = Automation to control app X, granted to the terminal app the first time [S9]; **AX** = Accessibility [S10]; **FDA** = Full Disk Access; **SR** = Screen Recording. reflex runs inside the terminal's process tree, so every grant goes to the terminal app (Ghostty, iTerm, Terminal), not to reflex.

| Command | Implementation | Permission | Third-party | Notes, flakiness |
|---|---|---|---|---|
| Sleep | `pmset sleepnow` ("causes an immediate system sleep") [local man][S11] | none (*unverified* that no admin is needed; the man page puts it among actions, not settings) | no | Stops every running job, Claude's included. |
| Sleep displays | `pmset displaysleepnow` [local man][S11] | none | no | reflex already uses it for lock. Locks only if "require password" is Immediately (reflex checks this). |
| Screen saver | `open -a ScreenSaverEngine` (bundle at `/System/Library/CoreServices/ScreenSaverEngine.app`) [local] | none | no | Harmless; any key ends it. |
| Restart / shut down | `osascript -e 'tell application "System Events" to restart'` / `shut down` [S19] | Auto(System Events) | no | Apps ask to save; one app can block it. `loginwindow «event aevtrrst»` variants differ in whether a dialog shows; sources disagree [S19]. `shutdown -r now` needs sudo: never. |
| Log out | `tell application "System Events" to log out` (dialog with 60 s countdown) or `tell application "loginwindow" to «event aevtrlgo»` (immediate) [S19] | Auto | no | Sources disagree which shows a dialog [S19]: *unverified*, test before use. |
| Keep awake | `caffeinate -di -t 3600` detached; stop by its PID [local man] | none | no | Leaves a process running: reflex must record the PID to stop it ("deja de mantenerlo despierto"). `-s` only on AC. |
| Open Trash | `open ~/.Trash` (Finder shows it), or `tell application "Finder" to open trash` | none for `open` (*unverified*: LaunchServices hands the path to Finder, the terminal never reads it); Auto(Finder) for the script | no | |
| Empty Trash | `tell application "Finder" to empty trash`, guarded by `if (count items of trash) > 0` [S15] | Auto(Finder) | no | Errors when the Trash is already empty [S15]. Whether Finder's own "warn before emptying" dialog shows when scripted varies by report [S15]: reflex must not rely on it. `rm -rf ~/.Trash/*` is out: needs FDA [local] and misses the Trashes on other volumes. |
| Trash count / size | `tell application "Finder" to count items of trash`; size: `size of` items, slow on big Trashes | Auto(Finder) | no | `ls`/`du ~/.Trash` fail with "Operation not permitted" without FDA [local]. |
| Eject all | `diskutil list -plist external physical`, then `diskutil eject <disk>` each | none | no | `diskutil` refuses a busy volume unless forced; never force. Finder alternative `eject (every disk whose ejectable is true)` needs Auto(Finder). |
| Dark / light mode | `tell application "System Events" to tell appearance preferences to set dark mode to true\|false\|not dark mode` [S22] | Auto(System Events) | no | Read without permission: `defaults read -g AppleInterfaceStyle` → `Dark`, or an error in light mode [local]. A denied grant fails silently [S22]. |
| Night Shift, True Tone | no supported CLI; private `CoreBrightness.framework` (present [local]); `nightlight on\|off\|toggle\|status` [S14]; or a user Shortcut with Set Night Shift / Set True Tone [S16] | — | `nightlight` (Homebrew) | Private API; treat as out. |
| Brightness | System Events key codes for brightness (*unverified* codes 144/145) | AX | or `brightness` (not installed [local]) | Built-in display only; external displays need DDC tools. Flaky. |
| Mute / volume (has) | `osascript` StandardAdditions `set volume …` [local] | none | no | Read: `get volume settings` → `output volume:88, …, output muted:true` [local]. |
| Mute mic | `set volume input volume 0`; restore needs the old level kept | none | no | "Unmute" has no natural value to return to. |
| Output / input device | `SwitchAudioSource -s "<name>" [-t input]` [S13] | none | yes (tested to macOS 11.2) | No built-in CLI. Out. |
| Wi-Fi on/off | `networksetup -setairportpower <device> on\|off` [local man]; device from `-listallhardwareports` (here `en0`) [local] | none for admins (*unverified*) | no | Cuts the network Claude Code is using. Read: `-getairportpower en0` → `On` [local]. |
| Bluetooth | `blueutil --power 0\|1\|toggle` [S12] | Bluetooth access (exit code 134 hints at none) [S12] | yes, private IOBluetooth API | Out. A user Shortcut with Set Bluetooth instead. |
| Airplane mode, hotspot | no CLI | — | — | Out. |
| AirDrop | `open /System/Library/CoreServices/Finder.app/Contents/Applications/AirDrop.app` [local] | none | no | Opens the AirDrop window; harmless. |
| VPN connect / disconnect / status | `scutil --nc list`, `status <service>`, `start <service>`, `stop <service>` [local `scutil --nc help`] | none for status | no | Only for services in the network set. Whether `start` works for app-provider VPNs (AnyConnect, OpenVPN Connect) is *unverified* and likely needs the app's own login. Status: yes; connect: later. |
| Focus / DND | no CLI; a user Shortcut with Set Focus [S16], run with `shortcuts run "<name>"` | none (Shortcuts runs it) | no | reflex already runs Shortcuts by name: «activa no molestar» works today if the person names a Shortcut so. `DoNotDisturb.framework` is private [local]. |
| Show desktop | ⌘-Mission Control / Fn-F11 [S4]; System Events key code (F11) | AX | no | The `Mission Control` binary with an argument is folklore, *unverified*. |
| Mission Control | `open -a "Mission Control"` (bundle in `/System/Applications`) [local] | none | no | |
| Launchpad | `open -a Launchpad` [local] | none | no | Gone in macOS 26: replaced by the Apps view of Spotlight [S25]. Map «Launchpad» per OS version, or skip. |
| Spotlight | ⌘Space via System Events | AX | no | Low value from a prompt. |
| Minimise, full screen | System Events keystroke (⌘M, ⌃⌘F) | AX | no | The frontmost window is the terminal reflex runs in. Out. |
| Hide others | JXA over `NSWorkspace.runningApplications`, `.hide` every regular app except the frontmost (reflex's `HIDE_SCRIPT` pattern) | none (no Apple Events) | no | Same mechanism as today's hide. |
| Force quit | ⌥⌘Esc window via System Events | AX | no | Opening the window is harmless; killing is not. Out. |
| Restart Finder / Dock | `killall Finder` / `killall Dock`, or `tell application "Finder" to quit` then `open -a Finder` | none / Auto(Finder) | no | On managed Macs, `killall`/`pkill` can trip endpoint-security tamper alerts. Rare need. Out. |
| Toggle hidden files | `defaults write com.apple.finder AppleShowAllFiles -bool true` + relaunch Finder; or ⌘⇧. in a Finder window | none / AX | no | Writes a preference and relaunches Finder (closes its windows). Read: the key does not exist by default [local]. Out. |
| Screenshot / recording | `open -a Screenshot` (the ⌘⇧5 toolbar; `/System/Applications/Utilities/Screenshot.app`) [local] | none for reflex: the Screenshot app captures | no | `screencapture -i -c` (interactive, to the clipboard) [local man] needs SR for the terminal, and Sequoia re-asks for SR periodically (*unverified* interval). Prefer the app. |
| Battery | `pmset -g batt` → `100%; discharging; 10:09 remaining` [local] | none | no | Desktops: no battery line; answer "no battery". |
| Wi-Fi network | `networksetup -getairportnetwork en0` → "You are not associated with an AirPort network." while connected [local]; disabled in macOS 15 for location privacy [S20]; `ipconfig getsummary en0` → `SSID : <redacted>` [local][S21] | Location Services | no | **Broken on 15.** Pass to Claude. |
| IP address | local: `ipconfig getifaddr en0` → `192.168.1.20` [local]; public: needs a web request | none | no | Answer the local one only, labelled "local IP"; public IP is a network call. |
| Disk space | `df -H /System/Volumes/Data` → 213 G free [local] | none | no | `df /` reports the sealed system snapshot (17 G used of 926 G) [local], which is misleading. Use the Data volume. |
| Uptime | `sysctl -n kern.boottime` or `uptime` → `up 12 days, 14:43` [local] | none | no | |
| Appearance / volume state | `defaults read -g AppleInterfaceStyle`; `get volume settings` [local] | none | no | |
| Bluetooth state | no simple built-in read: `defaults read /Library/Preferences/com.apple.Bluetooth ControllerPowerState` does not exist on 15 [local] | — | `blueutil --power` | Out. |
| Clear clipboard | `pbcopy < /dev/null` | none | no | Loses what was copied. Low value. |
| Clipboard history | needs a resident store | — | — | Out (`vocabulary.md`). |

Third-party tools named, none installed here [local]: `blueutil` [S12], `SwitchAudioSource` [S13], `nightlight` [S14], `brightness`. A launcher can depend on them; reflex installs nothing, so they are out unless the person installs them and a later slice detects them.

## 3. Risk tiers

| Tier | Meaning | Commands |
|---|---|---|
| **Q: read-only query** | Runs a read, prints an answer, changes nothing | battery, VPN status, disk space, uptime, local IP, volume level, appearance state, Wi-Fi power state |
| **1: instant and undoable** | One more phrase or one click puts it back | dark/light mode, mute/volume (has), mic mute, hide others, unhide all, Mission Control, Launchpad, open Trash, AirDrop window, Screenshot toolbar, screen saver, show desktop, Night Shift, True Tone, brightness, keep awake (ends on its own) |
| **2: disruptive but harmless** | Interrupts you or cuts a connection; nothing is lost, but undoing takes more than a phrase, or the session stalls | lock (has), sleep displays, sleep, Wi-Fi off, Bluetooth off, airplane mode, VPN disconnect, eject all, Focus / DND on, restart Finder or Dock, toggle hidden files (relaunches Finder) |
| **3: irreversible or data-losing** | Deletes, or ends the session with possible unsaved work | empty Trash, restart, shut down, log out, force quit, quit all apps, clear clipboard, dismiss notifications |

Notes:

- **Sleep is tier 2, not 1.** Waking is a keypress, but it stops running jobs, the Claude session included, and network sessions may drop.
- **Restart and shut down through System Events are graceful** (apps ask to save), so the data loss is bounded. What is irreversible is ending the session that typed the command and anything running unattended.
- **VPN connect is tier 2 too.** It can change routing for the session's own traffic.

## 4. Design: tiers in reflex

### Today

Each action is a fixed phrase in `src/system.mjs` or a verb of `phrase.mjs`, previewed in the `⚡` line while typing and run on Enter (`hooks/register.tsx`). Irreversible actions have no phrase, so they pass to Claude. The `choose` step (`plan.status === 'choose'`) asks `$.ui.ask('Which one?', labels)` with 2–4 labels. No answer drops the prompt as "nothing chosen". It never passes to Claude.

### Recommendation: a confirm tier, for tier 3 only, built on `$.ui.ask`

A new plan status, `confirm`, with a question and exactly two labels. `register.tsx` handles it like `choose`:

```
plan = { status: 'confirm', action: { verb: 'empty-trash', … }, question: 'Empty the Trash: 312 items?', labels: ['Cancel', 'Empty the Trash'] }
```

Guardrails, each one load-bearing:

1. **Exact phrases only.** A closed table in `system.mjs`, matched whole after fillers, like lock and volume. «vacía la papelera», «vaciar la papelera», «empty trash», «empty the trash». Nothing fuzzy, no slot.
2. **The model never produces these.** `src/catalogue.mjs` gets no such tool. `mentionsSystem` adds `vac[ií]\w*|empty|papelera|trash` so a near-miss («vacía la papelera de descargas», «empty the trash folder in brand») never reaches the model, which could only answer it with an open.
3. **Refuse when ambiguous.** A folder, app, alias or Shortcut named «papelera»/«trash» makes it pass (same `taken()` check as the Settings root). So do a question («¿vacío la papelera?»), a negation, a past form and a compound.
4. **Cancel is first and is the default.** A double Enter, or Enter on a stale menu, must not empty anything. If no answer is given, or Cancel is chosen, the prompt is dropped as "reflex: not done". It is not passed to Claude, because the person said what they wanted and then said no.
5. **The count is real and comes at submit only.** The preview line says `⚡ empty the Trash (asks first)` and runs nothing: the preview runs on every keystroke, and a Finder call there would raise the Automation prompt while typing. On Enter, `plan` asks Finder for the count. **0 items → pass**, with "the Trash is already empty", which Finder would otherwise raise as an error [S15].
6. **What is confirmed is what runs.** The run re-reads the count. If it has grown since the question, reflex refuses rather than empty items the person never saw counted.
7. **Permission failure is a pass, not a hang.** If Finder's Automation grant is denied (osascript error -1743, *unverified* code) or times out, reflex passes with the reason. The first-ever run raises the macOS prompt, which is acceptable once.

Size in the question («4.1 GB») is optional: Finder's `size` over a big Trash is slow. Count alone meets the "informed yes" bar; add size only if it returns within the 10 s CLI budget.

Why not confirm tier 2 too? Lock is tier 2 and runs on Enter today; the preview line already shows it before Enter. A confirm on every disruptive action trains people to press Enter twice, and then the confirm on Empty Trash is worth less. Keep tier 2 on exact phrases + preview, and keep **Wi-Fi off, Bluetooth off, airplane mode and VPN disconnect out**: they can cut the session's own network, and from a terminal their value is low.

Restart, shut down and log out fit the same confirm («Restart the Mac? Apps will ask to save.»). Add them only after Empty Trash has a week of logs with no surprise, and never force quit or quit all.

### Recommendation: queries as a read-only verb

The roadmap's "Queries as read-only template verbs" item, made concrete:

- A plan status `answer` (or verb `query` with `status: 'action'`). The run is one fixed argv from a closed table (`pmset -g batt`, `scutil --nc status <id>`, `df -H /System/Volumes/Data`, `sysctl -n kern.boottime`, `ipconfig getifaddr <wifi device>`). Its output is parsed into one line and shown with `$.ui.log`, and the prompt is dropped. Nothing is written; the learn log records it like any accepted action.
- **Questions are the point here.** `systemAction` refuses a «?» for actions («¿bloquea la pantalla?»). Queries invert that: a question is the expected form, so the query table is matched before the question rule, and only with its own exact phrasings.
- **Answer only what is certain.** If the output does not parse (a desktop without battery, two VPN services and no `[roles] vpn`), reflex passes. VPN status uses the role: `[roles] vpn` names the service, or exactly one service exists in `scutil --nc list`; otherwise it passes.
- **No network, no secrets.** Public IP and the Wi-Fi name stay Claude's (network call; SSID redacted on 15).
- **Preview can show the answer** (`⚡ battery: 100%, 10:09 left`): the reads are cheap and harmless, but 4 s+ commands (`system_profiler`) are excluded for that reason.

## 5. Ranked shortlist for the next slice

Ranked by value to someone in Claude Code × risk × cost. Cost: S = a table row and one argv; M = a new plan status or state.

| # | Command | ES phrases | EN phrases | Tier | Implementation | Cost |
|---|---|---|---|---|---|---|
| 1 | **Empty Trash** (with confirm) | vacía la papelera, vaciar la papelera | empty trash, empty the trash | 3 → confirm | Finder `count items of trash` + `empty trash`, Auto(Finder) | M (confirm status) |
| 2 | **Battery** | batería, ¿qué batería tengo?, cuánta batería queda | battery, how much battery | Q | `pmset -g batt` | M (answer status), then S each |
| 3 | **VPN status** | estado de la vpn, ¿está conectada la vpn? | vpn status, is the vpn connected | Q | `scutil --nc status <service>` via role | S |
| 4 | **Disk space** | espacio en disco, cuánto disco queda | disk space, free space | Q | `df -H /System/Volumes/Data` | S |
| 5 | **Open Trash** | abre la papelera, muestra la papelera | open trash, show the trash | 1 | `open ~/.Trash` | S |
| 6 | **Dark / light mode** | modo oscuro, activa el modo oscuro, pon el modo claro | dark mode, light mode, turn on dark mode | 1 | System Events `appearance preferences`, Auto(System Events); state from `defaults` | S, plus the `pon/activa` collision (`vocabulary.md` §3) |
| 7 | **Sleep displays** | pon las pantallas en reposo, apaga la pantalla | sleep displays, turn off the display | 2 | `pmset displaysleepnow` | S (already in run.mjs) |
| 8 | **Screen saver** | salvapantallas, pon el salvapantallas | screen saver | 1 | `open -a ScreenSaverEngine` | S |
| 9 | **Hide others** | oculta las demás, oculta las demás apps | hide others | 1 | JXA, hide every regular app but the frontmost | S (extends hide) |
| 10 | **Screenshot toolbar** | haz una captura, captura de pantalla, graba la pantalla | take a screenshot, screenshot, record the screen | 1 | `open -a Screenshot` | S |
| 11 | **Mission Control** | abre Mission Control, Mission Control | Mission Control | 1 | `open -a "Mission Control"` | S |
| 12 | **Uptime / local IP** | cuánto lleva encendido, mi ip local | uptime, my local ip | Q | `sysctl kern.boottime`, `ipconfig getifaddr` | S |
| 13 | **Sleep** | pon el Mac en reposo, reposo, duerme el Mac | sleep, put the Mac to sleep | 2 | `pmset sleepnow` | S |
| 14 | **Eject all disks** | expulsa todos los discos, expulsa los discos | eject all, eject all disks | 2 | `diskutil eject` per external physical disk, never forced | S–M |
| 15 | **Keep awake** | mantén el Mac despierto una hora | keep awake for an hour, caffeinate | 1 | `caffeinate -di -t <s>` detached, PID kept | M (state to stop it) |

Why this order:

- **1** is the trigger and the only tier-3 command worth a new mechanism now. It sets the confirm pattern that restart/shut down/log out reuse later.
- **2–4** are what the roadmap already wants (queries), need no permission, and are answered by commands verified on this Mac. VPN status reuses roles. One `answer` status pays for all of them.
- **5–11** are tier 1, need no permission (except dark mode's one Automation grant), and are one argv each. Dark mode ranks highest of them because both Siri and Raycast offer it and people say it, but it carries the known `pon/activa` gate collision, which must be settled first.
- **12** is cheap but lower value: Claude answers it well, and "my IP" usually means the public one.
- **13–14** are tier 2: real use, but they interrupt. Sleep is last of the power group because it stops Claude's own work. Eject is useful on a laptop with drives but rarer in a coding session.
- **15** needs state (a PID to stop later), so it costs more than its value now.

Left out on purpose: Wi-Fi, Bluetooth, airplane mode, VPN connect/disconnect (cut the session's network; Bluetooth needs a third-party private-API tool). Night Shift, True Tone, Focus/DND (no supported CLI: the person's own Shortcut via the existing verb covers them; document the recipe). Output/input device (third-party, unmaintained). Brightness, show desktop, Spotlight, minimise, full screen (Accessibility, and the frontmost window is the terminal). Restart Finder/Dock and hidden files (rare, relaunch Finder). Restart, shut down, log out (after the confirm proves itself). Force quit, quit all, clear clipboard, dismiss notifications (tier 3 with too little value for a confirm). Wi-Fi network name and public IP (broken or networked).

Two fixes to do with the slice: add «aspecto» to the Appearance pane in `PANES` [S24], and add `vac[ií]\w*|empty|papelera|trash` to `mentionsSystem` so near-misses of Empty Trash never reach the model.

## Gaps

- **Apple's Spanish menu wording for «Apagar equipo…» and «Cerrar sesión de <usuario>…»** was not found on a fetched page. Apple's help says «Apagar» [S6] and «cerrar sesión» [S4]. Read the Apple menu on a Spanish Mac to confirm.
- **Voice Control and Siri command lists.** Apple publishes no full list. Voice Control's list exists only in System Settings › Accessibility › Voice Control › Commands [S8]. The Siri examples come from secondary sources [S18].
- **Shortcuts on Mac has no public action list.** Set Focus/Wi-Fi/Bluetooth/Appearance/Night Shift/True Tone come from a 2024 secondary source [S16][S17]. Confirm in the Shortcuts app.
- **Not verified on this Mac without changing state:**
  - whether `pmset sleepnow` and `networksetup -setairportpower` need admin;
  - whether scripted `empty trash` shows Finder's warning;
  - whether `open ~/.Trash` works without FDA;
  - whether log out via System Events or loginwindow shows a dialog;
  - whether `scutil --nc start` works for app-provider VPNs;
  - the osascript error code for a denied Automation grant;
  - the brightness key codes.
  
  Each needs one deliberate test by the person.
- **Trash size** for the confirm: Finder's `size` on a large Trash may exceed the CLI's 10 s budget. Not measured.
- **Trashes on other volumes** (`/Volumes/X/.Trashes`): Finder's `empty trash` covers them; the count from `count items of trash` should too (*unverified*).
- **macOS 26:** Launchpad is gone [S25]; other commands here were checked on 15 only.

## Sources

- [S1] Raycast manual, System Commands: https://manual.raycast.com/system-commands
- [S2] Alfred help, System Commands: https://www.alfredapp.com/help/features/system/
- [S3] Apple, Mac keyboard shortcuts (EN): https://support.apple.com/en-us/102650
- [S4] Apple, Atajos de teclado del Mac (ES), Spanish wording for reposo, cerrar sesión, bloquear la pantalla, vaciar la papelera, forzar la salida, minimizar, pantalla completa, mostrar el escritorio, ocultar las demás apps, captura o grabación de pantalla, Mission Control, Spotlight, expulsar, poner las pantallas en reposo: https://support.apple.com/es-es/102650
- [S5] Apple, Poner el Mac en reposo o activarlo (ES), «menú Apple > Reposo»: https://support.apple.com/es-es/guide/mac-help/mh10330/mac
- [S6] Apple, Apagar o reiniciar el Mac (ES), «Apagar», «Reiniciar»: https://support.apple.com/es-es/guide/mac-help/mchlp2522/mac
- [S8] Apple, Voice Control commands on Mac: https://support.apple.com/guide/mac-help/mh40719/mac
- [S9] Apple, Allow apps to automate and control other apps (Automation): https://support.apple.com/guide/mac-help/mchl108e1718/mac
- [S10] Apple, Allow accessibility apps to access your Mac: https://support.apple.com/guide/mac-help/mh43185/mac
- [S11] `man pmset`, `man caffeinate`, `man scutil`, `man networksetup`, `man screencapture` on macOS 15 [local]; online copy: https://ss64.com/mac/pmset.html
- [S12] blueutil (third-party, private IOBluetooth API): https://github.com/toy/blueutil
- [S13] switchaudio-osx / SwitchAudioSource (third-party, tested to macOS 11.2): https://github.com/deweller/switchaudio-osx
- [S14] nightlight (third-party, Night Shift CLI): https://github.com/smudge/nightlight
- [S15] Empty Trash via AppleScript: count guard and warning behaviour (forums): https://www.macscripter.net/t/issue-with-empty-trash/77182, https://www.macscripter.net/t/empty-trash-question/77264, http://hints.macworld.com/article.php?story=20090909014630766
- [S16] Shortcuts action categories on Mac (secondary): https://matthewcassinelli.com/apple-has-finally-made-shortcuts-action-editor-easier-to-browse/
- [S17] Set Wi-Fi / Set Bluetooth actions (secondary): https://matthewcassinelli.com/shortcuts/reset-connections/
- [S18] Siri on Mac: https://support.apple.com/guide/mac-help/find-info-and-get-things-done-mchl6b029310/mac; settings examples (secondary): https://www.macrumors.com/guide/most-useful-siri-commands-on-macos/, https://srt.csb-cde.ca.gov/voiceover/mac/mac-09.0-siri.html
- [S19] Restart / shut down / log out via osascript (community; sources disagree on dialogs): https://gist.github.com/atifazad/6afd3cbedb8819dd7ed7be92dec2dc0d, https://www.macscripter.net/t/eject-volume-and-log-off/64566
- [S20] `networksetup -getairportnetwork` disabled in macOS 15 (Jamf community): https://community.jamf.com/t5/jamf-pro/macos-sequoia-bugg/m-p/331064
- [S21] SSID redacted in `ipconfig getsummary` (Apple Community): https://discussions.apple.com/thread/256108303, https://discussions.apple.com/thread/256212349
- [S22] Dark mode via System Events and the Automation prompt (secondary): https://techearl.com/mac-dark-mode-command-line
- [S23] Apple, Configurar un modo de concentración del Mac (ES), «modo de concentración», «No molestar»: https://support.apple.com/es-es/guide/mac-help/mchl613dc43f/mac
- [S24] Apple, Personalizar el aspecto del Mac (ES), Ajustes del Sistema > «Aspecto» > Automático / Claro / Oscuro: https://support.apple.com/es-es/guide/macbook-air/apd2add7474b/mac
- [S25] Launchpad removed in macOS 26 (secondary): https://www.phonearena.com/news/launchpad-is-gone-macos-26-tahoe-brings-a-big-change-to-how-you-find-apps-on-your-mac_id171196
