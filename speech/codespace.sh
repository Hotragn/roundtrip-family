#!/usr/bin/env bash
# Voice and score the demo's clips in the Codespace, then free the disk the models used.
#
#   bash -l speech/codespace.sh              # voice new or changed texts, score them, update docs
#   bash -l speech/codespace.sh --dry-run    # list what would be voiced
#   bash -l speech/codespace.sh --force      # every clip again
#   nohup bash -l speech/codespace.sh > /tmp/roundtrip-speech.log 2>&1 &   # long runs
#
# Arguments go to `python -m speech.generate` (see speech/speech/generate.py).
# A login shell (-l) loads HF_TOKEN from the Codespaces secrets; it is never printed.
# Models, the uv cache and the Python environment live under /tmp, the VM's scratch disk, so they
# don't count toward the Codespace storage quota and disappear when the Codespace stops. Each
# model is deleted from the cache as soon as its clips are done.
set -euo pipefail
cd "$(dirname "$0")"

if grep -qi '^ID=alpine' /etc/os-release 2>/dev/null; then
  echo "This is the Codespace's Alpine recovery container: PyTorch has no wheels for it." >&2
  echo "Fix the dev container first (docs/blocked.md, 'The Codespace runs its recovery container')." >&2
  exit 1
fi

if ! command -v uv >/dev/null; then
  echo "uv isn't on PATH; the dev container's postCreateCommand installs it (https://docs.astral.sh/uv/)." >&2
  exit 1
fi

scratch=/tmp/roundtrip-speech
export HF_HOME="$scratch/hf"
export UV_CACHE_DIR="$scratch/uv-cache"
export UV_PROJECT_ENVIRONMENT="$scratch/venv"
export UV_PYTHON_INSTALL_DIR="$scratch/python"
export HF_HUB_DISABLE_TELEMETRY=1

uv sync --group models
uv run --group models python -m speech.generate "$@"

rm -rf "$HF_HOME"
uv cache clean >/dev/null 2>&1 || true
echo "Model downloads and the uv cache are cleared; the environment in $UV_PROJECT_ENVIRONMENT stays until the Codespace stops."
