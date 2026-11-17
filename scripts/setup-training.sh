#!/usr/bin/env bash
# Sets up what training the small model needs, all inside this repo (nothing global):
#   .venv-train    mlx-lm, which trains the LoRA on Apple silicon
#   .venv-convert  llama.cpp's converter to GGUF (separate: it pins an older transformers)
#   .cache/        a shallow llama.cpp checkout
# and downloads the base model (unsloth/functiongemma-270m-it, ~540 MB) into the Hugging Face cache.
# About 3–4 GB of disk in all. Safe to run again.
set -euo pipefail
R="$(cd "$(dirname "$0")/.." && pwd)"
UV="$(command -v uv || echo "$HOME/.local/bin/uv")"

[ -x "$R/.venv-train/bin/mlx_lm.lora" ] || { "$UV" venv -q -p 3.13 "$R/.venv-train"; VIRTUAL_ENV="$R/.venv-train" "$UV" pip install -q mlx-lm; }
echo "✓ mlx-lm $("$R/.venv-train/bin/python" -c 'import mlx_lm; print(mlx_lm.__version__)')"

[ -d "$R/.cache/llama.cpp" ] || git clone -q --depth 1 https://github.com/ggml-org/llama.cpp "$R/.cache/llama.cpp"
[ -x "$R/.venv-convert/bin/python" ] && "$R/.venv-convert/bin/python" -c 'import gguf' 2>/dev/null || {
  "$UV" venv -q -p 3.13 "$R/.venv-convert"
  VIRTUAL_ENV="$R/.venv-convert" "$UV" pip install -q -r "$R/.cache/llama.cpp/requirements/requirements-convert_hf_to_gguf.txt"
}
echo "✓ llama.cpp converter"

"$R/.venv-train/bin/python" -c "from huggingface_hub import snapshot_download as s; print('✓ base model', s('unsloth/functiongemma-270m-it'))"
du -sh "$R/.venv-train" "$R/.venv-convert" "$R/.cache" 2>/dev/null
df -h ~ | tail -1
