# Article notes: «Cómo entrenar a tu modelo»

Working notes for the article. The facts and numbers come from this repo's history. Write the article itself with `in-my-own-words`.

## Thesis

The big labs use their models to build the next ones: synthetic data, a teacher model and a student model, then evaluation. **You can do the same at home, at the scale of one Mac**, and build an app around the result. Karpathy calls the result a *cognitive core*: a small model that knows your system rather than the world, and asks a big model (the *oracle*) when it needs to.

## The film parallel (title play only; no characters or images)

| The film's idea | In reflex |
|---|---|
| You don't tame it by force; you get to know it | Base FunctionGemma resolved 0 of 8 phrases. It wasn't broken, it was untrained. |
| A dragon on its own can't fly; it needs a prosthesis | The model alone acts wrongly. It flies with scaffolding: templates, grounding, the copy rule, the request gate. |
| Training means sessions, falls and corrections | v1 good, v2 refuses everything, v3 confuses verbs, v4… |
| Trust is earned | Precision over recall: it never acts wrongly; when in doubt, it hands over to Claude. |
| A dragon for each rider | A LoRA for each person or system: 14.5 MB on top of a shared base model. |

## How the frontier labs do it, and the small-scale version

| Labs | reflex |
|---|---|
| A large model generates training data | `reflex teach`: Claude writes the examples from your index |
| Filtering and verification of the data | reflex validates each example: it grounds, the target is copied from the phrase, and negatives are checked against `plan()` |
| Distillation into a smaller model | LoRA on FunctionGemma 270M with mlx, 4–8 min on an M4 |
| Evals and red teaming | `reflex eval` (224 phrases) and an adversarial reviewer agent that tries to break it |
| Iterate and keep the best | v1…v4, chosen by exam score, not by loss |

## «And build your apps»

The model is one part. The app is model + rules + grounding + exam + interface (the line above the prompt). Most of the work, and of the gains, came from what surrounds the model:
- Templates alone: 64 → 81 right after fixing the gate, typos and kind words. No training involved.
- The model added +7 right on top.

## Lessons, each with its anecdote (all real)

1. **Measure before you train.** The exam came first (phase 1). Without it, «it seems better» means nothing.
2. **The exam has blind spots too.** We had 0 wrong until the reviewer typed «what is brand» and reflex opened the folder. None of the 49 pass-to-Claude phrases named anything real. Now there are 43+ trap phrases.
3. **Lists of what is not a request never end.** Questions, statements, past tense, gerunds, conditionals… The fix was to flip it: an allow-list of request words.
4. **Validation loss lies.** v2 had the best loss (0.225) and answered «-» to everything: one token deciding «act or not» weighs almost nothing in a per-token average.
5. **Coverage beats quantity.** 650 examples, but only 8 with «ver» and 2 with «take me». The model cannot learn what it never sees.
6. **Train on what the model will actually receive.** The first paraphrase prompt asked for «brand en el finder», which the gate never lets through. Notes for an exam that does not exist.
7. **Packaging has traps.** mlx's fuse dropped the tokenizer, and the converter picked another one: the model was «reading» different words («reflex?frame»).
8. **Allow-lists beat deny-lists.** Three times (request words, words around a file name, the speaker) a list of what is *not* allowed kept leaking; flipping it closed the class.
9. **Split the work by what each does best.** The model finds *what* you mean in free text; everything the phrase states explicitly (the verb, the place, whether it is a request) the system decides. That took v4 from 18 wrong to 0 on the model exam.
10. **The cost of a mistake sets the bar.** Opening the wrong folder is a nuisance; running a Shortcut has side effects, so Shortcuts need an exact name and an anchored activation word.
11. **Check the exam can be passed.** An oracle model showed 49 of 136 exam requests were unreachable for any model.
12. **The model proposes, the system decides.** A small, imperfect model is safe if reality, not the model, chooses the target.
13. **Teach the task, not the machine.** The model learns to split a phrase into what to do and what to do it to; the names come from the phrase and each Mac's index checks them. So one trained model can ship to everyone, and retraining on your own use is personalisation, not a requirement.
14. **The workshop is not the home.** Train where training is easy (MLX, on the Mac), serve where serving is fast (GGUF in Ollama, 8-bit, always loaded): ~520 ms became ~155 ms with the same weights.
15. **Grow by data, not by rules.** The vocabulary went from open/reveal/copy/shortcut to editor, terminal, find, newest file, copy path, repo page, quit, hide, settings panes, lock and volume in one day, without retraining: a closed table of modifiers and target kinds, stripped before the model sees the phrase. The model still does one job.
16. **The host decides what a phrase means.** «edita el README» typed into Claude Code means "change it" — Claude's job, not "open it in the editor". «busca tests» means search the code. A phrase is read in the place it was typed.
17. **Every new verb brought its own wrong action, and review found each one.** Quitting the terminal the session lives in; «sube el volumen en 20» setting it to 20; «baja el volumen» unmuting; «abre la última descarga» opening an HTML file; «busca tests» revealing a vendor file. Zero wrong on the exams did not mean zero wrong: an adversarial reviewer typing like a person did.
18. **Practise on dummies, not on the neighbours.** The public model was taught on three invented people's Macs, none of my names. The first try had a third of its examples saying «do nothing» and learned exactly that: it answered «-» to everything. Cutting negatives to a fifth fixed it, and the model that never saw my Mac beat the one trained on it, on my own exams.

## Where it goes

One dragon per trade instead of one that does everything: a shared base and a small adapter per plugin, picked per phrase. Not yet: while the task is one, one model is better. It pays when a plugin brings a task of another kind (an app's MCP tools, a Teams message draft).


The deciding lives in a CLI, so Claude Code is one host among possible ones: a shell widget, other agent CLIs, an editor, a launcher, each a thin layer that asks, draws and intercepts. The model runs anywhere Ollama does; only the actions are macOS. For the article this is a direction, not a claim: say only what has shipped.

## Numbers so far (held-out exam)

| Version | Right | Wrong | Notes |
|---|---|---|---|
| Templates, start | 64/153 | 0 | |
| Base FunctionGemma | +0 | 0 | 2.5 s timeouts |
| Better pipeline, no model | 81/224 | 0 | |
| LoRA v1 (298 examples) | 88/224 | 0 | 4.5 min of training |
| LoRA v2 (650, more negatives) | 81 | 0 | refuses everything |
| LoRA v3 (fewer negatives, lower lr) | 86 | 1–2 | verb confusion |
| LoRA v4 (paraphrase focus) | 88/224 | 0 | ties v1: the exam barely tested the model |
| Model-only exam (127 reachable requests), v1 → v4 | 44 → 88 | 11 → 19 | v4 understands twice as much, and acts wrongly more |
| + the system decides what the phrase says (verb, neighbours) | v4: 99/127 | **0** | heldout 97/239, 0 wrong |
| v4 packaged in Ollama (tokenizer fixed) | 98/239 · 97/127 | **0** | p95 ~155 ms |

### Foreign index

An invented person's Mac (`test/phrases/foreign/`: 26 repos and 16 home folders, 22 apps, 4 Shortcuts, 67 files, none of the names in this Mac's index or in the training data), 217 hand-written phrases (160 positives, 57 negatives). Run with `reflex eval [--model] --index test/phrases/foreign/index.json test/phrases/foreign/phrases.jsonl`. `reflex-core:v4`, the same model, never retrained.

| Run | Right | Wrong | Missed | Passed |
|---|---|---|---|---|
| Templates only | 90/217 | 0 | 70 | 57 |
| Templates + v4 | 136/217 | **0** | 24 | 57 |
| Model step alone (of the 70 the templates miss) | 46 | 0 | 24 | none |

Recall on positives: templates 90/160 (56%), with the model 136/160 (85%); the model answered 46 of the 70 the templates could not. This Mac's numbers are not directly comparable: its model exam holds only phrases the model must answer (97/127), and this one mixes in phrases the templates answer. On the phrases only the model could answer it got 46/70 (66%) with names it had never seen, against 97/127 (76%) on this Mac's: it learned the task, not the names. p95 137 ms with the model kept loaded.

### One day of vocabulary (2026-11-07)

| Exam | Morning | Evening | Wrong |
|---|---|---|---|
| Held-out (with v4) | 98/239 | 179/436 | 0 |
| Foreign index (with v4) | — | 174/288 | 0 |
| Model-only | 97/127 reachable | unchanged (model untouched) | 0 |

### Public model (2026-11-08)

Trained on 3 invented indexes (672 examples, 20% negatives), none of this Mac's names; the same recipe as v4 (LoRA rank 16, lr 5e-5, 300 iterations).

| Exam | v4 (trained on my names) | public (never saw them) | Wrong |
|---|---|---|---|
| Held-out | 179/436 | 180/436 | 0 |
| Foreign index | 174/288 | 177/288 | 0 |
| Model-only | 97/127 | 106/127 | 0 |

First public try, 33% negatives: 0 right on the model exam (answered «-» to everything).

## Still open, for the ending

- Live in Claude Code since 2026-11-07, installed from its own marketplace: the line appears while typing, Enter acts without Claude.
- Cold start: Ollama unloads the model after idle minutes, and the first phrase then passes to Claude (safe, but a miss).
- Before distributing: an exam on someone else's index, to prove the model did not learn this Mac's names.

- Learning from use (phase 5): phrases Claude handled become new examples.
- Cost: tokens Claude spent teaching, versus the turns reflex saves.
