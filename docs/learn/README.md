# Learning with reflex

reflex is small enough to read in an afternoon, and it touches most of the ideas behind running AI on your own machine. This guide explains those ideas, in the order a phrase meets them. For what reflex does, see `../design.md`; for what comes next, `../roadmap.md`.

## 1. The problem: not every request needs a big model

In Claude Code, "abre la carpeta brand" costs a full model turn: the prompt travels to the cloud, a large model reads it with all the context, decides to call a tool and runs `open`. That takes seconds and tokens to do something a shell does in milliseconds.

Most agent tools have this cost. The work splits into two very different kinds:
- **Reasoning:** understanding code, planning, writing. This needs a large model.
- **Reflexes:** open, show, copy, run. The intent is clear and the action is known. A large model is wasted on these.

reflex takes the second kind away from Claude.

## 2. The idea: a cognitive core

Andrej Karpathy describes a **cognitive core**: a small model, a few hundred million to a few billion parameters, always on in your computer. It **gives up knowing the world in exchange for being fast, private and capable with tools**. When it is out of its depth, it asks a large model in the cloud, which he calls an **oracle**.

reflex is that idea applied to one job:

```
 phrase ──▶ templates ──▶ small local model ──▶ Claude (oracle)
            free, exact    cheap, flexible       expensive, knows everything
```

Each step handles what it can and passes the rest up. That is the **capability dial**: the cheapest component that can answer, answers.

## 3. Following one phrase

Take `¿me abres brand?`:

1. **Interception.** The Claude Code plugin (`hooks/register.tsx`) sees the text while you type. Claude Code plugins work through *hooks*: functions that run on an event (`prompt.change`, `prompt.submit`) and can change or stop it. Before Enter, it asks the CLI what this would do and draws `⚡ open ~/…/brand` above the prompt.
2. **Templates** (`src/phrase.mjs`). Fixed patterns: a verb from a closed list, then a target. `abre brand` matches. `¿me abres brand?` does not, because "me abres" is not on the list.
3. **Small model** (`src/model.mjs`). The phrase sounds like an action, so the local model is asked. It answers with a **function call**, `open(target="brand")`, not with prose.
4. **Grounding** (`src/ground.mjs`). `brand` has to exist. reflex looks it up in the **index** of this Mac and finds `~/Development/pelayomendez/brand`. If nothing matched, the phrase would go to Claude.
5. **Action** (`src/run.mjs`). On Enter it runs `open ~/Development/pelayomendez/brand` as a fixed argument list, never through a shell. The prompt never reaches Claude.

## 4. The concepts, one by one

### Templates: deterministic first
Before any model there are rules. Home Assistant's voice assistant works the same way: templates first, a model only as a fallback. Rules are free, instant and predictable, and they set the bar any model has to beat.

### Grounding: the model proposes, the system decides
A model can invent things. If it says `open(target="brnad")`, nothing happens, because nothing called "brnad" exists in the index. **The model chooses the intent; reality chooses the target.** That is why a small, imperfect model is safe here: the worst case is "go to Claude", never "open the wrong thing".

### The index: knowing this Mac
`src/index.mjs` collects folders, git repos, apps, Shortcuts and files into one JSON file (`~/.cache/reflex/index.json`). It is cached for ten minutes and rebuilt in the background (*stale-while-revalidate*), so no keystroke ever waits for it. This file is the "knowledge" of the cognitive core: not the world, just your machine.

### Function calling: typed output
Instead of asking a model "what should I do?" and parsing prose, you give it a list of functions with typed arguments (a JSON schema). The model answers with one call. This is **structured output**: the answer can be checked like data. The catalogue (`open`, `reveal`, `copy`, `shortcut`) is the whole vocabulary reflex accepts.

### Small models, and why a base model is not enough
FunctionGemma has 270M parameters (300 MB) and runs on a laptop in milliseconds. Out of the box it is generic: on our phrases it refused or asked questions, and resolved 0 of 8. Small models have little general knowledge to fall back on, so **they have to be specialised**. Google reports 58% → 85% on its own task after fine-tuning.

### Fine-tuning and LoRA
*Fine-tuning* continues training a model on examples of your task. Doing it on all the weights is expensive. **LoRA (Low-Rank Adaptation)** freezes the original weights and trains two thin matrices beside each layer. Their product is a small correction, usually around 1% of the parameters. The result is an **adapter**: a few MB that "plugs into" the base model. That is Karpathy's "LoRA slot", a personal layer on top of a shared model.

### Distillation: the big model teaches the small one
Where does the training data come from? From a large model. Claude writes hundreds of example phrases from the catalogue and from *your* index: your repo names, your apps, your way of asking. The small model learns from them. This is **distillation** (teacher → student). It is how distil labs gets 350M models to 96–98% on tool calling.

### Evaluation: measure before training
A **held-out set** is a set of phrases never used for training, and only for measuring. Without one, "it seems better" means nothing. reflex sorts each phrase into one of four outcomes:
- **right:** the expected action;
- **wrong:** it acted, but on the wrong thing. This is **the only unacceptable outcome**;
- **missed:** an action went to Claude. This only costs a model turn;
- **passed:** it correctly went to Claude.

This asymmetry has a name: **precision over recall**. An assistant that sometimes does nothing is fine; one that sometimes does the wrong thing is not.

### Formats and runtimes: MLX, GGUF, Ollama
- **MLX** is Apple's library for running and training models on Apple-silicon GPUs. It is where the LoRA gets trained.
- **GGUF** is a single-file model format from llama.cpp, often *quantized* (weights stored in fewer bits: smaller and faster, slightly less precise).
- **Ollama** runs GGUF models behind an OpenAI-compatible HTTP API, so reflex can talk to any model the same way, local or not.

The pipeline: train the adapter with MLX → fuse it into the base model → convert to GGUF → `ollama create`.

### The loop: keep only what is better
Karpathy's *autoresearch* lets an agent try a change, train for a few minutes, measure, and keep the change only if the score improves. reflex uses the same discipline for its adapter: train, run `reflex eval`, keep the new adapter only if it beats the last one. Later the training examples come from use: every time Claude does something reflex could have done becomes a new example.

## 5. Glossary

| Term | Meaning here |
|---|---|
| cognitive core | small always-on local model; knows your system, not the world |
| oracle | the large cloud model (Claude) the core delegates to |
| capability dial | templates → small model → large model, cheapest first |
| hook | function a host (Claude Code) calls on an event, able to change or stop it |
| grounding | checking that a model's answer refers to something that exists |
| function calling | the model answers with a typed call instead of text |
| fine-tuning | further training on examples of one task |
| LoRA / adapter | small trainable add-on to a frozen model |
| distillation | a large model produces the data a small one learns from |
| held-out set | examples kept only for measuring, never for training |
| precision over recall | better to miss than to act wrongly |
| quantization | storing weights in fewer bits to save memory and time |
| GGUF / MLX / Ollama | model file format / Apple training library / local model server |

## 6. Further reading

- Karpathy, the cognitive core: https://x.com/karpathy/status/1938626382248149433
- Karpathy, autoresearch: https://github.com/karpathy/autoresearch
- LoRA paper (Hu et al., 2021): https://arxiv.org/abs/2106.09685
- FunctionGemma and its fine-tuning guide: https://ai.google.dev/gemma/docs/functiongemma
- distil labs, small models from few examples: https://www.distillabs.ai/learn/few-shot-fine-tuning-train-model-with-10-examples/
- MLX LoRA: https://github.com/ml-explore/mlx-lm
- Research behind reflex's choices: `../research/`
