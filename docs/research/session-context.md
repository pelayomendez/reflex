# Session context: «ábrelo» means the file Claude just made, «open the website» the page it just showed

## Why

reflex knows the Mac, not the conversation. «open that doc» right after Claude wrote `plan.md` has no name for the grounding to hit: «that doc» matched whatever file or folder the words happened to resemble (on a developer Mac, `open it` opened a folder whose name contains «it»; `open that doc` offered a list of unrelated ADRs). The one thing that makes the phrase exact is something only the session knows: which files Claude wrote.

## Design

**Recording.** The hooks module watches `tool.call` for Write, Edit and NotebookEdit and, once the call has gone through, puts the path and the time at the front of a list. Newest first, one entry per path (a second write moves it up), at most 20. A Read never records. The list lives in the plugin's state (`reflex.recent`, declared in `types/index.d.ts`); the CLI keeps none.

**Handing it over.** `prompt.submit` (and the preview as you type) calls the CLI as `--recent '<json>'`: `[{ "path", "at" }]`, newest first. No list, no flag. The CLI reads it, plans with it, and forgets it.

**Grounding, templates only** (`src/context.mjs`). A closed set of whole deictic phrases, es and en:
- any file: «ábrelo / ábrela», «abre ese archivo», «abre lo último», «open it / that / that file», «the file you made / wrote / created»
- a doc (`.md .txt .docx .pdf .rtf .html`): «abre ese doc / documento», «abre el doc que has hecho / creado / escrito», «open that doc», «the doc you made»
- an image (`png jpg jpeg gif svg webp`): «abre esa imagen», «open that image»
- reveal: «muéstramelo (en el Finder)», «show it», «show me it / this / that», «reveal it» (with or without «in Finder»); «open this», «abre eso», «muéstrame eso»

Each resolves to the newest recent file whose kind fits (a newer png does not answer «that doc»). The verbs are open and reveal; the editor modifier did not fall out of the templates, so «ábrelo en el editor» passes.

## Second slice: generic nouns, addresses, Bash

Real use found three wrong actions: «open the website» opened a folder named `website` (the person meant the site published in the session); «open the website of reflex» opened the reflex folder (model step); «open the doc» / «open the article» opened `~/Documents` / `~/Documents/Articles` (the person meant the .docx Claude had just made with `textutil … -output`, a Bash command, not a Write).

**A generic noun with an article is deictic.** `GENERIC_NOUNS` and `DEICTIC_DETERMINERS` (`src/vocab.mjs`, es + en) are a closed table: web (website, site, web, page, landing…), pr, repo, link, doc (doc, docs, document, article, draft, post, report…), deck, sheet, image, video, diagram, pdf, file. «the / this / that / my / el / la / ese…» + one of them never grounds by name, in templates or in the model step: `resolveDeictic` (phrase opens with it) answers from the session list, and `namesGenericThing` stops it anywhere else in a phrase («quiero ver la web», «take me to the docs») before the templates or the model see it. Without the article («open website») the exact folder still opens; «the docs folder» (a folder named outright) and «el post de watchmen» (a noun in front of a name) are not pointers. Singular only, except «docs»: «documents» and «pictures» are folders on every Mac. «en la web» / «in the browser» are places, not pointers.

**Resolution by kind.** web: the newest fresh page address that is not on a code host (github.com, gitlab.*, bitbucket…), not an API, raw or registry address, not a data file; localhost only when nothing else. pr: github/gitlab pull or merge request addresses; repo: a repo's root address; link: any address. doc: `.docx .doc .pdf .md .pages .odt .rtf .txt` (and `.html`, shown not opened); deck: `.pptx .ppt .key .odp .pdf`; sheet; image; video; diagram; pdf; file: any file. «it», «this», «that», «abre lo último» still mean a file only: a link in a reply must not turn «open it» into an address. Same freshness (30 min), same ambiguity (two fitting items within 5 min pass) and the same OPENABLE policy as before; an address is opened, never «shown in Finder».

**«the website of <project>»** (also «<project>'s website», «la web de <project>», «the <project> website»): a session address that holds the project's name; else the person's alias for the name; else the project's GitHub Pages address, derived with no network from the folder's `origin` remote and only if the repo has `docs/index.html` or a `CNAME` (a custom domain wins); else Claude. Never the project folder. Only addresses take a qualifier: «el repo de brand» is still the folder.

**What is recorded.** The list now holds `{ path, at }` and `{ url, at }`, newest first, 20 of each kind (links never push files out). After a *successful* Bash call the hook records: the files `open` was given and the addresses it opened; output files (`-output x`, `-o x`, `> x`: an absolute or cwd-relative existing file whose mtime lies inside the call; the hook cannot read the disk, so `reflex touched --since <ms> --cwd <dir> -- "<command>"` does, and runs nothing); and the http(s) addresses in the command. `turn.complete` carries `answer`, the final text of the turn: its http(s) addresses are recorded (the main loop only, never a subagent's). Addresses lose credentials and fragment, and one with a token, key, signature, password or session in the query, a long opaque value, a webhook path, or a non-http(s) scheme is never kept (`cleanUrl`, `src/recent.mjs`); `parseRecent` applies the same check to what the CLI is handed.

**Review hardening.**
- Bash addresses: only those given to `open` (and `open -a <browser> <url>`) are recorded, never those in curl, git, echo or a commit message. Addresses in Claude's reply stay.
- Relative paths are dropped when the command has `cd`, `pushd`, `popd`, `-C`, `--git-dir` or `--work-tree`; `open --stdin/--stdout/--stderr` arguments are not opens.
- A Bash call counts as successful only if its result is not `isError` (a non-zero exit comes back that way: the Bash output type has no exit code field), not interrupted, not moved to the background (`backgroundTaskId`), and has no `returnCodeInterpretation` (an exit Claude Code reads as meaningful).
- `cleanUrl` also refuses: private, loopback and link-local hosts, single-label and `.local/.internal/.corp/.lan/.home.arpa` hosts, reserved placeholder domains (example.com/org/net, `.test`, `.invalid`, `.example`, `.localhost`), token-like path segments (UUID, 16+ letters and digits), opaque or hex query values, hook/webhook/callback paths, and paths or query keys with logout, signout, delete, verify, confirm, reset, invite, login, auth, token and the like. So localhost is never «the website».
- A project name matches an address only as a whole host label or path segment (3+ characters; `github`, `io`, `com`, `www`, `app` and other generic labels never qualify). The person's own alias for the name still answers «la web de linkedin».
- «it / this / that / eso / lo último» pass when the newest fresh item is an address, or an address and a file are fresh within 5 minutes.
- A typo (one edit or swap, nouns of 6+ letters only), a plural or a hyphen variant of a generic noun after a determiner is guard-only: it passes to Claude and never resolves to a session item; only an exact singular noun resolves. `documents`, `pictures`, `screenshots` and similar folder plurals stay names, and a word that is exactly an installed app's name («the pages» with Pages.app) is not guarded: the app opens.
- Also never kept: query keys t, h, k, sig, code, key, hash, otp; paths with optout, unsub, checkout, cart, pay, payment, download, purchase, subscribe; placeholder hosts (your-site, yourdomain, mysite, yoursite, domain.com).
- Only doc, document, article and draft (and their Spanish forms) mean the document Claude made. docs, post, paper and report are guarded too, but resolve only to a fresh file whose own name holds the word.
- Code-host pages that are not a project (`/settings`, `/marketplace`, `/explore`...) are not a repo or a PR; installers and archives (`dmg pkg iso exe msi deb rpm whl 7z bz2 xz apk tar tgz`) are not pages.

## Safety rules

A deictic phrase passes to Claude, with a reason `reflex why` shows, when:
- there is no list (and a bare «ábrelo» with none is Claude's, as before);
- nothing in the list fits the kind;
- the newest fitting file is gone, or older than 30 minutes;
- the second fitting file is also fresh, exists and was written within 5 minutes of the first (one turn's work: which one is meant is not for reflex to guess). «it» fits any kind, so a doc and an image written together are two candidates;
- the phrase says anything beyond (clause punctuation like «open it, please» is not part of the words) the template («abre ese doc de brand», «open it with Preview», «…y borra el otro»): once a phrase opens deictically it never falls through to name grounding;
- for open only: the file's extension is not in `OPENABLE` (`src/selectors.mjs`, the one policy for what `open` may take). A `.command`, `.sh`, `.py`, `.app`, and pages that can run script (`.html`, `.svg`) are shown in Finder at most.

The model never resolves a deictic phrase, and `src/catalogue.mjs` is untouched: no retraining. Only absolute paths without control characters are recorded.

## Known trade-offs

- **Newest wins.** «that doc» is the newest fitting file even if the person meant an earlier one Claude wrote; only a second file written within 5 minutes makes it pass. Accepted: the preview line names the file before Enter.
- A phrase whose target is only a deictic word (it, this, that, eso, esto) never reaches name grounding, with or without a list.

## Alternatives considered

- **The model resolves «it» given the list.** Rejected: the catalogue and the public model stay as they are, and a model guessing which of two files is the bar's failure.
- **The CLI remembers the last file** (a state file). Rejected: stale across sessions, and the session already has the facts.
- **Reading Claude's transcript** for files it mentioned. Rejected: broader than «wrote», and parsing prose is a guess.

## Open questions

- «That one» after Claude listed several files: not recorded, so it passes.
- Addresses in a Bash command are recorded without proof that they are pages (a `curl` of a JSON endpoint is filtered by host and extension only); «the website» with two pages from one turn passes.
- A project's Pages address is derived, not checked: a repo with `docs/index.html` and no Pages enabled opens a 404. No network, by design.
- A noun anywhere but at the start of a phrase never resolves, it only passes («quiero ver la web» is Claude's even with a fresh address).
- The two thresholds (30 minutes, 5 minutes) are judgment, to be tuned from the learn log.
