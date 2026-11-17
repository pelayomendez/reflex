# Session context: «ábrelo» means the file Claude just made

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

- «That one» after Claude listed several files, and files Claude created through Bash (`> out.md`): not recorded, so they pass.
- The two thresholds (30 minutes, 5 minutes) are judgment, to be tuned from the learn log.
