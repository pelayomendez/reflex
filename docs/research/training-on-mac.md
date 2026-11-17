# reflex phase 3: LoRA-tuning FunctionGemma on this Mac and serving it from Ollama

Research spike, 2026-11-06. Read-only: nothing was installed or downloaded, and no repo was edited. Each claim cites its source; the sources are listed at the end.

## Verdict

The pipeline works end to end with current tools, with three conditions:

1. **mlx-lm trains it as is.** FunctionGemma is `Gemma3ForCausalLM` / `model_type: gemma3_text` [S1]. mlx-lm ships `gemma3_text.py` [S2]. Its chat loader passes a per-line `tools` field into `apply_chat_template` [S3].
2. **The export must go through GGUF made by llama.cpp.** `mlx_lm.fuse --export-gguf` only accepts llama, mistral and mixtral [S4]. Ollama 0.40.4 (the version installed here) rejects LoRA adapters with "LoRA adapters are no longer supported" [S5]. Its safetensors import runs through the MLX runner, and that runner has no gemma3 architecture [S6]. llama.cpp's `convert_hf_to_gguf.py` does register `Gemma3ForCausalLM` [S7].
3. **The training data must be rendered the way Ollama's built-in `functiongemma` renderer renders it, not just the way the HF template does.** The local Ollama model has no Go template. It uses `TEMPLATE {{ .Prompt }}`, `RENDERER functiongemma` and `PARSER functiongemma` (from `ollama show functiongemma --modelfile`). Where that Go renderer [S8] differs from the HF Jinja template [S9] is listed under "Format" below.

## This Mac

| | Value | Consequence |
|---|---|---|
| CPU / RAM | Apple M4, 16 GB | Plenty. A *full* fine-tune of Gemma 3 270M in mlx-lm peaked at 2.2 GB [S10]; LoRA uses less. |
| Disk | **30 GB free of 926 GB (97% used)** | The pipeline needs roughly 3–4 GB: two venvs (about 1.5 GB), the base model (0.54 GB), the fused model (0.54 GB), the GGUF (0.3–0.54 GB) and the HF cache. That fits, but disk is the tightest resource here. |
| Python | `python3` 3.13.2; Homebrew 3.13.14 and 3.14.6 | mlx-lm needs ≥3.11 and lists up to 3.13 [S11]. llama.cpp's converter pins `numpy~=2.2.6` for <3.14 [S12]. **Use 3.13.** |
| uv | 0.5.9 (Dec 2024) at `~/.local/bin/uv` | Recent enough for `uv venv` / `uv pip`. |
| Ollama | 0.40.4, `functiongemma:latest` = gemma3, 268M params, Q8_0, tools capability | The stock GGUF has `eos_token_ids = [1, 50, 106]` (`<eos>`, `<start_function_response>`, `<end_of_turn>`). This was read from the blob's GGUF header. |

### Install size (from PyPI wheel sizes, macOS arm64, cp313)

- **Training venv** (`mlx-lm` 0.32.2): `mlx-metal` 45 MB, `transformers` 13 MB, `numpy` 12 MB, `tokenizers` 3 MB, plus `sentencepiece`, `protobuf`, `jinja2` and `pyyaml`. That is about 80 MB of wheels and **roughly 300–400 MB installed** [S11][S13].
- **Converter venv** (llama.cpp): `torch==2.11.0` (81 MB wheel, about 300+ MB installed), `transformers==4.57.6`, `numpy~=2.2.6`, `sentencepiece`, `gguf` and `protobuf<5` [S12]. Add a shallow llama.cpp checkout. That is **roughly 0.6–0.8 GB**.
- **The two venvs must stay separate.** mlx-lm requires `transformers>=5.7.0` [S11], and llama.cpp pins `transformers==4.57.6` [S12].

### Training time (estimate)

There is no published mlx-lm timing for FunctionGemma. The closest proxy is a full fine-tune of Gemma 3 270M with `mlx_lm.lora` on an M3 Air, which ran at about 1,070–1,095 tokens/s and 5.7 it/s with 2.2 GB peak memory [S10].

A reflex example is about 300 tokens: 4 tool declarations, a user phrase and a short call. A run of 500 examples × 3 epochs is about 450k tokens. At 1–3k tokens/s on an M4 with LoRA, that is **about 3–8 minutes**. Fuse and convert add under a minute. Measure it on the first run.

## Format: what Ollama sends, and what the training data must look like

FunctionGemma's turn format [S9][S14]:

```
<bos><start_of_turn>developer
{system text}<start_function_declaration>declaration:open{description:<escape>…<escape>,parameters:{properties:{target:{description:<escape>…<escape>,type:<escape>STRING<escape>}},required:[<escape>target<escape>],type:<escape>OBJECT<escape>}}<end_function_declaration><end_of_turn>
<start_of_turn>user
¿me abres brand?<end_of_turn>
<start_of_turn>model
<start_function_call>call:open{target:<escape>brand<escape>}<end_function_call><start_function_response>
```

- Every string value is wrapped in `<escape>`. When the call is the last message, the template ends it with `<start_function_response>`, not `<end_of_turn>` [S9].
- `<start_function_response>` is token 50. It is an EOS in `generation_config.json` (`[1, 50, 106]`) [S15], and it is in the stock Ollama GGUF's `eos_token_ids`.

### Where Ollama's Go renderer [S8] and the HF template [S9] differ

| Point | HF Jinja (what `mlx_lm.lora` trains on) | Ollama `functiongemma` renderer (what inference sees) | Rule for reflex |
|---|---|---|---|
| Default developer text when no system message is given | `You are a model that can do function calling with the following functions` (no colon). The mlx-community mirror's template **drops this branch entirely**: the two templates differ only there. | `You can do function calling with the following functions:` (with a colon). If a system message is given, it renders `system + "\n" + default`. | Make the training `developer` message exactly `You can do function calling with the following functions:`, and send **no** system message from reflex. Both sides then render the same bytes. |
| `enum` on string params | rendered (`,enum:[…]`) | **not rendered** | Do not use `enum` in the catalogue schemas. |
| Nested object/array params | rendered (`properties`, `items`) | **not rendered** (only description and type) | Keep slots flat, with `STRING` only. reflex's verbs already fit this. |
| Property / argument order | `dictsort` | `sort.Strings` | Same order. |
| `tool_calls[].function.arguments` | mapping → `key:<escape>v<escape>`; **string → pasted raw** | Go map → `key:<escape>v<escape>` | Arguments must be a **JSON object (dict)**, not the JSON string from mlx-lm's own `tools` example [S16]. |

So the developer turn, declarations, user turn and the model's call come out byte-identical on both sides when the four rules above hold. Check this once, before training (step 3 below).

### Negatives (pass to Claude)

The template renders an assistant message with plain `content` as `<start_of_turn>model\n{text}<end_of_turn>` [S9]. Ollama's parser returns that as content with no tool calls [S17]. Train negatives with one fixed, very short content (for example `-`). That keeps decoding to 1–2 tokens and makes "no call" trivial to detect.

### Reference recipes

- **Google, Mobile Actions** (cookbook notebook) [S18]: full fine-tune with TRL, not LoRA. `num_train_epochs=2`, `per_device_train_batch_size=4`, `gradient_accumulation_steps=8` (effective batch 32), `learning_rate=1e-5`, cosine schedule, `completion_only_loss=True`. Prompt/completion are made by rendering `messages[:-1]` with `add_generation_prompt=True` and slicing; that is exactly what mlx-lm's `--mask-prompt` does [S3]. Dataset: `google/mobile-actions`, 9,654 rows [S19]. The model card reports 58% → 85% [S1].
- **Google, small FunctionGemma guide** [S20]: 20 train / 20 test examples, 8 epochs, lr 5e-5, batch 4, max_length 512. Accuracy went from 2/20 to 16/20. No LoRA config is shown.
- **Unsloth**: offers LoRA or full fine-tuning (16-bit LoRA), but its docs page gives no rank or alpha [S21].
- **Model card caveats** [S1]: "intended to be fine-tuned"; "not intended for use as a direct dialogue model"; **evaluations were English-only**, so Spanish phrases depend entirely on our data.

For a few hundred examples, a reasonable starting point (not sourced; derived from the recipes above) is LoRA on all 18 layers and all linear layers, rank 16, lr 1e-4, 3–5 epochs, batch 8, `--mask-prompt`. A **full fine-tune** is also cheap at 270M (2.2 GB [S10]) and is Google's own choice: try `--fine-tune-type full --learning-rate 1e-5` if LoRA plateaus. Watch for overfitting: the M3 Air full-FT run "forgot its original training" after 100 iterations on 90 examples [S10]. Keep `valid.jsonl` and keep the held-out set from phase 1 separate.

## Recommended pipeline

All paths are repo-local, per roadmap phase 3. `$R` = `~/Development/pelayomendez/reflex`, `$D` = `~/.local/share/reflex`.

```bash
# 0. Two venvs (Python 3.13). Separate because of the transformers 5.x vs 4.57 clash.
uv venv -p 3.13 $R/.venv-train && VIRTUAL_ENV=$R/.venv-train uv pip install mlx-lm
git clone --depth 1 https://github.com/ggml-org/llama.cpp $R/.cache/llama.cpp
uv venv -p 3.13 $R/.venv-convert && VIRTUAL_ENV=$R/.venv-convert \
  uv pip install -r $R/.cache/llama.cpp/requirements/requirements-convert_hf_to_gguf.txt

# 1. Base model. The google/ repo is gated ("manual"). unsloth/functiongemma-270m-it is an
#    ungated copy whose template matches Google's. mlx-community/functiongemma-270m-it-bf16 is
#    also ungated, but its template lacks the default-developer branch. Either is fine once
#    every example carries an explicit developer message.
BASE=unsloth/functiongemma-270m-it

# 2. Data: $D/train/{train,valid}.jsonl, one object per line:
# {"messages":[
#   {"role":"developer","content":"You can do function calling with the following functions:"},
#   {"role":"user","content":"¿me abres brand?"},
#   {"role":"assistant","tool_calls":[{"type":"function","function":{"name":"open","arguments":{"target":"brand"}}}]}],
#  "tools":[{"type":"function","function":{"name":"open","description":"Open a folder, file, app or URL",
#    "parameters":{"type":"object","properties":{"target":{"type":"string","description":"…"}},"required":["target"]}}}, …]}
# Negatives: {"role":"assistant","content":"-"} as the last message.
# The `tools` list must be the exact catalogue reflex sends at inference (same descriptions, same order).

# 3. Parity check before training (cheap, catches the main risk):
#    render one example with the HF tokenizer (apply_chat_template(messages[:-1], tools, add_generation_prompt=True))
#    and compare byte-for-byte with what Ollama receives. To see what Ollama receives, run
#    `OLLAMA_DEBUG=1 ollama serve` and log the prompt for the same /api/chat request against stock functiongemma.

# 4. Baseline: evaluate stock `functiongemma` in Ollama through `reflex eval` (phase 1).

# 5. Train (lora.yaml carries lora_parameters, which can only be set via config [S16]):
cat > $D/train/lora.yaml <<'YAML'
model: unsloth/functiongemma-270m-it
train: true
data: ~/.local/share/reflex/train
fine_tune_type: lora
num_layers: -1          # all 18 layers
batch_size: 8
iters: 200              # ≈ 3–4 epochs for ~450 examples
learning_rate: 1e-4
mask_prompt: true       # loss on the model's call only
max_seq_length: 1024
steps_per_eval: 25
save_every: 50
adapter_path: ~/.local/share/reflex/adapters/v1
lora_parameters: {rank: 16, scale: 20.0, dropout: 0.05}   # keys omitted = every Linear in the layer
YAML
$R/.venv-train/bin/mlx_lm.lora -c $D/train/lora.yaml

# 6. Smoke test in MLX (it also has a FunctionGemma tool parser [S22]):
$R/.venv-train/bin/mlx_lm.server --model $BASE --adapter-path $D/adapters/v1 --port 8090
#    then point reflex's [model] url at http://localhost:8090/v1 and run `reflex eval`.

# 7. Fuse to plain HF safetensors (keep bf16; do not use --export-gguf):
$R/.venv-train/bin/mlx_lm.fuse --model $BASE --adapter-path $D/adapters/v1 --save-path $D/fused/v1

# 8. Convert to GGUF with llama.cpp (Gemma3ForCausalLM is supported; q8_0 matches the stock model):
$R/.venv-convert/bin/python $R/.cache/llama.cpp/convert_hf_to_gguf.py $D/fused/v1 \
  --outtype q8_0 --outfile $D/gguf/reflex-core-v1.q8_0.gguf

# 9. Ollama: reuse the stock renderer and parser (gemma3 GGUFs are NOT auto-assigned one [S23]).
cat > $D/gguf/Modelfile <<EOF
FROM $D/gguf/reflex-core-v1.q8_0.gguf
TEMPLATE {{ .Prompt }}
RENDERER functiongemma
PARSER functiongemma
PARAMETER top_k 64
PARAMETER top_p 0.95
PARAMETER temperature 0
EOF
ollama create reflex-core -f $D/gguf/Modelfile
ollama show reflex-core --verbose     # check stop tokens (risk 2)

# 10. reflex config: [model] name = "reflex-core"; run `reflex eval`; keep only if better.
```

**Shortest route to Ollama:** GGUF + a Modelfile copied from `ollama show functiongemma --modelfile` (steps 7–9). Ollama has no `ADAPTER` route (removed [S5]) and no safetensors route for gemma3 (the MLX runner lists no gemma3 [S6]). If GGUF stalls, step 6 is a working fallback for the spike. reflex only needs an OpenAI-compatible URL, and `mlx_lm.server` is one.

## Risks, in the order to check them

1. **Prompt drift between training and Ollama** (the biggest risk). These are the four differences in the table above. Check: step 3's byte comparison, on day one, before any training.
2. **Stop token after the call.** The model must stop at `<start_function_response>` (id 50). The stock Ollama GGUF lists it in `eos_token_ids`, but that GGUF was written by Ollama's own converter. llama.cpp's Gemma3 converter only writes the vocab via SentencePiece [S7], so it may not carry token 50 as EOS. Check: `ollama show reflex-core --verbose`, or a raw `/api/generate`. If generation runs past `<end_function_call>`, add `PARAMETER stop "<start_function_response>"` or set `num_predict` low. reflex only needs the first call either way.
3. **llama.cpp conversion of an mlx-fused model.** mlx-lm keeps HF-convention norm weights (`1.0 + weight` at runtime) and drops `lm_head` when it is tied [S2]. llama.cpp then adds the +1 shift itself [S7], so the fused model should convert cleanly. Check: compare the outputs of steps 6 and 9 on 20 phrases. They should match apart from q8_0 noise.
4. **Spanish.** FunctionGemma was evaluated in English only [S1]. Check: `reflex eval` split by language. If Spanish lags, add more Spanish examples before switching models.
5. **Overfitting / wrong actions.** The exit criterion is zero wrong actions. Keep negatives at roughly 25–30% of the data, use early stopping on `valid.jsonl` loss, and use temperature 0.
6. **Disk** (30 GB free) and **license** (Gemma terms: a derivative needs a NOTICE file if it is ever distributed; a local model is fine).

## Fallbacks

| | LFM2.5-350M | Qwen3-0.6B |
|---|---|---|
| Size | 350M params, 16 layers (10 conv + 6 GQA), 32k ctx, includes Spanish, licence `lfm1.0` [S24] | 0.6B, 28 layers, tied embeddings [S25]; Ollama `qwen3:0.6b` is 523 MB [S26] |
| mlx-lm | `lfm2.py` [S2]; official `LiquidAI/LFM2.5-350M-MLX-{bf16,8bit,…}` | `qwen3.py` [S2] (and it is mlx-lm's default `lora` model [S27]) |
| Tool format | tools as a JSON list in the system prompt; Pythonic calls inside `<\|tool_call_start\|>…<\|tool_call_end\|>` [S24] | Hermes style: `<tools>` in the system prompt, `<tool_call>{json}</tool_call>`; has `<think>` / `enable_thinking`, so it must be trained and served with thinking off [S25] |
| GGUF | llama.cpp registers `Lfm2ForCausalLM` [S7]; official `LiquidAI/LFM2.5-350M-GGUF` | llama.cpp registers `Qwen3ForCausalLM` [S7] |
| Ollama | **No 350M tag in the library** (only `lfm2.5:8b`/`24b`) [S26]. Import the GGUF with `RENDERER lfm2` / `PARSER lfm2`, which exist in 0.40.4 [S28]; check that they match the 2.5 template. | Library tag exists. A fused Qwen3 can also go **straight from safetensors** (`ollama create` → MLX runner, which lists `qwen3` [S6]), so no llama.cpp is needed. |
| Note | A community home-assistant fine-tune exists (`Paulescu/home-assistant-LFM2.5-350M-GGUF`), which suggests the use case fits. | Twice the size of FunctionGemma; latency budget is 300 ms. |

Order: FunctionGemma → LFM2.5-350M (smaller, multilingual, Spanish listed) → Qwen3-0.6B (largest, but the simplest Ollama import).

## Sources

- [S1] FunctionGemma model card: https://huggingface.co/google/functiongemma-270m-it (config: https://huggingface.co/unsloth/functiongemma-270m-it/raw/main/config.json)
- [S2] mlx-lm models (`gemma3_text.py`, `lfm2.py`, `qwen3.py`): https://github.com/ml-explore/mlx-lm/tree/main/mlx_lm/models; norm and lm_head handling: https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/models/gemma3_text.py
- [S3] mlx-lm `ChatDataset` (reads `tools`, `mask_prompt` offset): https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/tuner/datasets.py
- [S4] `mlx_lm.fuse` GGUF guard (llama/mixtral/mistral only): https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/fuse.py and LORA.md "Fuse": https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/LORA.md
- [S5] Ollama v0.40.4 `errAdaptersUnsupported`: https://github.com/ollama/ollama/blob/v0.40.4/server/create.go
- [S6] Ollama MLX-runner architectures (no gemma3): https://github.com/ollama/ollama/blob/main/mlxrunner/model/architectures/architectures.go
- [S7] llama.cpp converter: https://github.com/ggml-org/llama.cpp/blob/master/conversion/gemma.py (Gemma3ForCausalLM), https://github.com/ggml-org/llama.cpp/blob/master/conversion/lfm2.py, https://github.com/ggml-org/llama.cpp/blob/master/conversion/__init__.py (Qwen3ForCausalLM)
- [S8] Ollama FunctionGemma renderer: https://github.com/ollama/ollama/blob/main/model/renderers/functiongemma.go
- [S9] FunctionGemma chat template: https://huggingface.co/unsloth/functiongemma-270m-it/blob/main/chat_template.jinja (mlx-community variant: https://huggingface.co/mlx-community/functiongemma-270m-it-bf16/blob/main/chat_template.jinja)
- [S10] Gemma 3 270M full fine-tune with mlx_lm, M3 Air timings: https://samairtimer.substack.com/p/full-training-using-mlx_lm-gemma
- [S11] mlx-lm packaging (Python ≥3.11, transformers ≥5.7): https://github.com/ml-explore/mlx-lm/blob/main/pyproject.toml, https://pypi.org/project/mlx-lm/
- [S12] llama.cpp converter requirements: https://github.com/ggml-org/llama.cpp/blob/master/requirements/requirements-convert_hf_to_gguf.txt, https://github.com/ggml-org/llama.cpp/blob/master/requirements/requirements-convert_legacy_llama.txt
- [S13] PyPI wheel sizes: https://pypi.org/project/mlx-metal/, https://pypi.org/project/torch/2.11.0/, https://pypi.org/project/transformers/
- [S14] FunctionGemma formatting guide: https://ai.google.dev/gemma/docs/functiongemma/formatting-and-best-practices
- [S15] generation_config / special tokens: https://huggingface.co/unsloth/functiongemma-270m-it/blob/main/generation_config.json, https://huggingface.co/unsloth/functiongemma-270m-it/blob/main/special_tokens_map.json
- [S16] mlx-lm LoRA docs (tools data format, config-only `lora_parameters`): https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/LORA.md, https://github.com/ml-explore/mlx-lm/blob/main/examples/lora_config.yaml
- [S17] Ollama FunctionGemma parser: https://github.com/ollama/ollama/blob/main/model/parsers/functiongemma.go
- [S18] Mobile Actions HF notebook: https://github.com/google-gemini/gemma-cookbook/blob/main/FunctionGemma/%5BFunctionGemma%5DFinetune_FunctionGemma_270M_for_Mobile_Actions_with_Hugging_Face.ipynb; guide: https://ai.google.dev/gemma/docs/mobile-actions
- [S19] Mobile Actions dataset (9,654 rows): https://huggingface.co/datasets/google/mobile-actions
- [S20] FunctionGemma fine-tuning guide: https://ai.google.dev/gemma/docs/functiongemma/finetuning-with-functiongemma
- [S21] Unsloth FunctionGemma docs: https://unsloth.ai/docs/models/functiongemma
- [S22] mlx-lm FunctionGemma tool parser: https://github.com/ml-explore/mlx-lm/tree/main/mlx_lm/tool_parsers; dict-arguments fix: https://github.com/ml-explore/mlx-lm/pull/1904
- [S23] Ollama GGUF renderer auto-detect (gemma4/laguna/nemotron only): https://github.com/ollama/ollama/blob/v0.40.4/server/create.go (around L869)
- [S24] LFM2.5-350M card: https://huggingface.co/LiquidAI/LFM2.5-350M
- [S25] Qwen3-0.6B: https://huggingface.co/Qwen/Qwen3-0.6B (tokenizer_config chat template, config.json)
- [S26] Ollama library tags: https://ollama.com/library/qwen3/tags, https://ollama.com/library/lfm2.5/tags, https://ollama.com/library/functiongemma/tags
- [S27] mlx-lm `lora.py` defaults: https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/lora.py
- [S28] Ollama renderer registry (`functiongemma`, `lfm2`): https://github.com/ollama/ollama/blob/v0.40.4/model/renderers/renderer.go
- Older issue, fixed in 2025: 4-bit gemma-3-270m failed in LoRA with an `lm_head` shape mismatch (https://github.com/ml-explore/mlx-lm/issues/379). Train from bf16, not a quantized mirror.
