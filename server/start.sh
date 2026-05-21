#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODEL_PATH="${MODEL_PATH:-${ROOT_DIR}/Qwen3.5-9B-MLX-4bit}"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-8080}"
PYTHON="${PYTHON:-${ROOT_DIR}/.venv/bin/python}"

if ! command -v "${PYTHON}" >/dev/null 2>&1; then
  if command -v python3 >/dev/null 2>&1; then
    PYTHON="python3"
  else
    PYTHON="python"
  fi
fi

"${PYTHON}" -m mlx_lm server \
  --model "${MODEL_PATH}" \
  --host "${HOST}" \
  --port "${PORT}"
