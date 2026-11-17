# Roles: the app people mean, not the name they know

## The reflection

«show me the vpn», meaning the VPN app, offered a choose list of files with «vpn» in their name and never `/Applications/OpenVPN Connect.app`, because «vpn» is not a word of «OpenVPN Connect». Same root as «muéstrame el calendario» on an English macOS, where the app is «Calendar».

reflex grounds **names**. People speak in **roles**: the vpn, the mail, the calendar, the music. A role points to an app by what it does, and which app that is differs per Mac (and per language). Exact-name grounding cannot reach it, and fuzzier name matching (prefix, substring, typo) is exactly where the bar of 0 wrong actions is at risk, so the answer is not a looser matcher. It is a small, closed table of role words, and a per-Mac decision of which one app each role means. If the Mac cannot decide, there is no role and the ordinary rules apply, which ends with Claude.

## Design

**The table** (`src/roles.mjs`, data only): role → words in es/en. vpn; mail (mail, correo, email); calendar (calendar, calendario, agenda); browser (browser, navegador); music (music, música); notes (notes, notas); maps (maps, mapas); photos (photos, fotos); contacts (contacts, contactos); messages (messages, mensajes). Closed on purpose: a vague word like «chat» names no one app and is not added. A word belongs to one role.

**Resolution per Mac**, in order; the first step that decides wins:
1. `[roles]` in `~/.config/reflex/config.toml` (`vpn = "OpenVPN Connect"`, an app name or a `.app` path). The person's choice is final: if that app is not there, the role does not resolve (no silent substitute).
2. The default handler where one exists: `mailto:` for mail, `https:` for the browser. Asked once when the index is built (JXA, `NSWorkspace URLForApplicationToOpenURL`) and cached with it as `index.defaults`, so a phrase never waits on it.
3. Exactly one installed app whose name contains a role word as a substring (vpn → OpenVPN Connect).
4. The macOS app for the role (Calendar, Mail, Music, Notes, Maps, Photos, Contacts, Messages), only when it is in `/System/Applications`.

More than one candidate at a step, and nothing earlier decided → no role. A step that finds two does not hand over to the next: two VPN apps and a Calendar do not make reflex pick one.

**No fall-through.** Once a word is a role (and none of the exclusions below applies), the phrase either resolves to one app or passes to Claude. A configured app that is not installed, two candidates, a handler lookup with no answer: all pass. They never reach the partial/substring matcher or a choose list of files («abre el vpn» with `vpn = "WireGuard"` not installed passes; so does «show me the vpn in finder»).

**Default handlers, "none" versus "unknown".** The handler lookup (mail, browser) has three outcomes: a path, `null` (macOS answered that there is no handler), and no answer (the lookup failed or timed out, or the cached index predates `defaults`). `null` lets steps 3 and 4 decide. No answer passes: guessing the mail client from app names is how a wrong app gets opened. A failed lookup is not persisted as «none»: that role stays out of `defaults`, the index is marked `defaultsComplete: false`, and the next phrase rebuilds it in the background (at most every two minutes, the rebuild's lock is kept while it is incomplete). An old cache without `defaults` is rebuilt the same way.

**Precedence in `ground()`:** alias > an exact folder or file the person has > the `[roles]` entry > an exact app name > role (default handler, substring, system) > partial and file matches. The two parts of that are decisions:
- A `[roles]` entry is the person's explicit choice and final for the role's words: with `mail = "Mimestream"`, «open mail» and «abre mail» open Mimestream even though Mail.app exists. Only an alias or an exact folder name beats it (the folder is opened directly, since the ordinary rules would let the exact app win).
- The default handler is inferred, not chosen, so it does **not** override an exact app name: «open mail» with Mail.app installed opens Mail.app even if Mimestream is the `mailto:` handler; «abre el correo» (not an app name) opens Mimestream.

So the role sits ahead of prefix/substring matching and typo correction on apps. A folder called «calendario» is opened by «abre el calendario»; an alias `correo = "https://mail.google.com/"` still wins. On a Mac with a Music app and a `~/Music` folder, «open the music» opens the app (an exact app name, as before), «abre la música» the folder (an exact folder name, as before): roles leave that precedence alone.

**Where a role does not apply:**
- A kind word: «the vpn pdf», «carpeta calendario», «the vpn app folder». The person said what kind of thing, so the role (an app) is not it.
- `find` / `busca`: finding is about files; it never resolves a role.
- `quit` / `hide`: exact names only, as before. A role must not decide which app gets closed.
- Modifiers that need a path (in the editor, terminal in a folder), and a closing «in Finder» (keeps the reveal).
- Verbs other than open and reveal/show. «show me the vpn» becomes an open of the app (as «show me the calendar» already does, e5ba7be).

**On the model path** a role stands only when the model's target is exactly a role word, under the same «the words around it must be the request's own» check as any model answer. The model catalogue (`src/catalogue.mjs`) is byte-identical: roles are grounding, not something the model is taught, so there is no retraining.

## Alternatives considered

- **Fuzzier name matching** (synonyms inside the matcher, embeddings, «vpn» ~ «OpenVPN»). Rejected: unbounded, impossible to exam exhaustively, and a wrong app is a wrong action.
- **Ask the model to map roles to apps.** Rejected: it would have to see the app list, which is what the public model is deliberately not trained on, and the catalogue must not change.
- **Queries as read-only template verbs** («VPN status», «is the vpn connected?»): a fixed read-only command per role. Real value, a different feature (it needs output, not an action). **Later**, in the roadmap.
- **A choose list made only of documents that merely contain the word passes to Claude instead.** With no exact name and no role, «which one?» between two PDFs is a guess presented as a question. Cleaner for 0-wrong, but it changes existing behaviour of the whole file tier and needs its own exam pass. **Later**.

## Open questions

- **Quit by role** («cierra el correo»): not now. Quitting is the one verb where a wrong app costs work, so it stays exact-names-only. If it comes, it should require the role to resolve through step 1 or 2 only (the person's own decision, or the OS's), never the substring or system step.
- More roles (files, terminal, chat, calculator…), each only if one app really answers to the word on most Macs.
- Roles in other languages than es/en, and plurals («los mensajes» works; «mis fotos» is the Photos role but `fotos` is also a home folder alias: the folder, being an exact name, wins).
- A role word as the first word of a longer name («abre el calendario de equipo»): untouched, it is not exactly the word.

## Exam

Held-out cases (fixture with OpenVPN Connect, Mail, Mimestream as default mail, Notes, and a `notas` folder): «show me the vpn», «abre el vpn», «muéstrame la agenda», «abre email» (the default handler, not the system Mail), «abre el navegador»; traps: «show me the vpn pdf» (the file), «busca vpn» / «find the vpn» (pass), «abre notas» (the folder), «abre el correo» (the fixture's alias wins), «quit the vpn» / «cierra el correo» (pass), «open the music» (the Music app, an exact name) and «abre la música» (the `~/Music` folder, an exact name), «show me the vpn in finder» (pass: a role never becomes a list of files).
