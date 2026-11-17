# Held-out phrases

The score for every step of reflex (`reflex eval`, roadmap phase 1). `heldout.jsonl` holds phrases
with the answer reflex should give; `fixture.json` is the fake index and config they are scored
against, so the numbers are the same on every machine.

**This set is never used for training.** Not as examples, not to tune templates, not to pick a
model. Training phrases come from `reflex teach` and are kept apart from it. If a phrase here is
ever shown to a model that is then scored on it, the score means nothing.

## Two sets

- `heldout.jsonl` is the whole-reflex exam: templates and model together, including phrases the
  templates answer, passes, ambiguity and the known gaps. It says how reflex does overall, but the
  templates answer most of its actions, so two models can tie on it.
- `model.jsonl` is the model-only exam, scored against the same `fixture.json`. Every phrase passes the
  request gate and no template answers it, so each one reaches the model (a test in
  `test/model-set.test.mjs` holds that). About 75% are positives, paraphrases over every request form
  and verb in `REQUEST_FORMS`, in Spanish and English, with trailing fillers and polite forms. About 25%
  are negatives (`nonaction`, expect `pass`) that use request words without asking for anything
  ("quiero ver cómo funciona esto"): the model has to decline them.
  Run it with `reflex eval --model test/phrases/model.jsonl`. Use it to compare models and to decide what to train.

- `foreign/` is the exam on someone else's Mac: `foreign/index.json` is an invented index (the shape
  `loadIndex()` returns) and `foreign/phrases.jsonl` is hand-written free phrasing against it. Run it with
  `reflex eval [--model] --index test/phrases/foreign/index.json test/phrases/foreign/phrases.jsonl`.
  `--index` replaces the fixture's index and drops its aliases. Its names appear neither in this Mac's
  index nor in the training data; it is never used for training, and `reflex teach` drops its phrases too.

- `synthetic/` holds three invented indexes (`index-a.json`, `-b`, `-c`: the shape `loadIndex()` returns, fake
  `/Users/<name>/…` paths) that the public model is taught from: `reflex teach --index test/phrases/synthetic/index-a.json`.
  They are training material, not an exam, and `test/synthetic.test.mjs` holds that none of their names is in the
  foreign index, in another synthetic index or in any exam phrase. With `--index`, teach takes names, grounding and
  validation from that file alone, and ignores this Mac's config (aliases are private names).

- `context.jsonl` is the session-context exam (`docs/research/session-context.md`): deictic phrases («ábrelo», «open that doc») against
  the files Claude wrote. Each line carries `recent: [{ path, ago (seconds), missing? }]`, read against a fixed clock; lines without one
  see no list, so the other exams are untouched. Run it with `reflex eval test/phrases/context.jsonl` (templates only, no model).

Every positive in `model.jsonl` is reachable: a test plays an oracle model that answers every run of
consecutive words of the phrase with each verb, and at least one answer must give the expected action
through `plan()`. The six `quoted` copies (copying a quoted text) are the exception. Copying text stays
template-only by design, so no model answer reaches them: they are kept, tagged `quoted`, and
`reflex eval` leaves them out of the score unless you pass `--quoted`.

Both are exams. **Neither is ever used for training**, and `reflex teach` drops any phrase found in any
`test/phrases/*.jsonl`. Do not tune `model.jsonl` to a model: if a phrase is awkward, the awkwardness is
the measurement. If the gate or the templates change, a phrase that no longer reaches the model fails the
test and has to be replaced by another that does, not reworded to pass.

## Format

One JSON object per line: `{"phrase", "expect", "tags"}`. `expect` is one of
`{"status":"action","verb","value"}`, `{"status":"choose"}` (several matches, reflex asks which) or
`{"status":"pass"}` (it belongs to Claude). `value` is the grounded target: a path, an app path, an
address, a Shortcut name or the quoted text. An `edit` or `terminal` action (a modifier, tag `modifier`) may
also pin `"app"` (the app path, or `null` for the system's text app) and `"line"`; `reflex eval` then marks a
different app or line wrong. `reflex eval` runs with no environment, so `$EDITOR` never changes a score.

## Outcomes

- **right**: the expected action, or the expected question.
- **wrong**: reflex took a phrase from Claude that it should not have, or acted on another verb or
  target. A question where a pass was expected is wrong too. The number that matters; `reflex eval`
  exits 1 if there is any.
- **missed**: it passed (or asked) where an action was expected. Acceptable: Claude gets the phrase.
- **passed**: a correct pass.

## Tags

- Language: `es`, `en`.
- Verb: `open`, `reveal`, `copy`, `shortcut`, `quit` (templates only, apps only), `edit` and `terminal`
  (modifiers: «en Cursor», «una terminal en X»; tag `modifier`; `kind-misfit` is a modifier on a target it
  does not fit, `system-default` an editor phrase with no editor configured). Kind: `folder`, `app`, `url`, `alias`, `file`,
  `image`, `text`.
- `template`: a phrase the templates are meant to get right.
- `paraphrase`: phrasing the templates miss on purpose and a model should get (`¿me abres reflex?`).
- `typo`, `accent`: misspellings, and missing, extra or shouting accents and capitals.
- `ambiguous`: several files match; the expected answer is `choose`. (`several`: the same for a find or a path, which pass instead of asking.)
- `negation`, `compound`, `nonaction`: must go to Claude. `nonaction-named`: talk or a question that names something real in the fixture ("what is brand", "figma va lento"); it must also go to Claude.
- `missing`: names that are not in the fixture; must go to Claude, never be invented.
- `escape`: the `\` prefix that forces Claude.
- `postfix-kind`, `quote-trailer`: **known template gaps, kept on purpose.** The templates only
  strip a kind word before the name ("la carpeta de descargas"), not after it ("open the desktop
  folder"), and a quoted text followed by a trailer ("copy 'x' to the clipboard") is not read. People
  type these. They count as missed until the templates or the model learn them; do not rewrite the
  phrases to make them pass.

## Combinations not covered

Verb × kind pairs the templates do not handle, so there is nothing to expect:

- `reveal` × app, url: Finder reveals files and folders; an app or an address has nothing to reveal.
- `copy` × app, folder, url: `copy` takes files, images and text. Copying a folder or an app is not
  something the clipboard does here, and a URL is not a target `copy` grounds.
- `shortcut` has no kind: it only runs a Shortcut by name.

Note on the model set's English file phrases: they name files the way the index spells them («find the contrato de alquiler in finder», "my correo"). So the set measures copying a name verbatim out of a code-switched phrase, not translation; English file scores are not general English understanding.

## Slice 2: find, newest, path, web

`heldout.jsonl` and `foreign/phrases.jsonl` carry positives and traps for the four forms of the second CLI slice
(tags `find`, `latest`, `path`, `web`). They read the disk through a fake: `fixture.json` (and a foreign `index.json`)
has an `fs` block, `{ listings: { dir: [{ name, mtimeMs }] }, screenshots: { dir, prefix }, remotes: { dir: origin } }`,
which `reflex eval` feeds to the planner (`fakeDeps`), so a run never reads the Mac it is on and `--index` brings its
own. An expectation may also pin `"type"` (`text` is a copied path, `file` the copied file: their value is the same).
Tags: `no-place`, `no-verb`, `unknown-kind`, `plural`, `empty-place` (selector traps), `wrong-host`, `no-remote`
(web traps), `partial-name` (a find that names only part of a name), `known-gap` (a phrase the strict grounding misses
on purpose, e.g. a folder whose name has a hyphen scoping a find; counted as missed).
`model.jsonl` is unchanged: «dónde está X» and «find X in finder» still reach the model, so they stay in it.
