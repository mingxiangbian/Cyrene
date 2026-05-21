# CC Local Agent

Local TypeScript agent runtime with a web UI, REPL mode, project-local memory, and file tools scoped to a workspace.

## Portability Status

The Node application is portable across normal Node environments. A local model server is required at runtime, but it only needs to expose an OpenAI-compatible chat completions API.

The included `server/start.sh` is a convenience launcher for an MLX/Qwen setup. That path is optional and is mainly useful on Apple Silicon machines with `mlx_lm` installed and the model files available locally.

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- An OpenAI-compatible model endpoint
- Optional: Python plus `mlx_lm` if using `server/start.sh`

## Setup

```bash
npm ci
npm run setup
cp .env.example .env
```

`npm run setup` creates local runtime state that is intentionally not committed:

- `workspace/`
- `.cc-local/memory/daily.md`

Edit `.env` if your model endpoint or model name differs from the defaults.

## Run

Start the agent in one-shot or REPL mode:

```bash
npm run dev -- "Summarize this project"
npm run dev -- --repl
```

Start the web UI:

```bash
npm run dev -- --web
```

The web UI uses `workspace/` as its root. Create child directories inside `workspace/` if you want separate selectable workspaces.

## Model Endpoint

By default the app expects:

```bash
CC_LOCAL_BASE_URL=http://127.0.0.1:8080/v1
CC_LOCAL_MODEL=Qwen3.5-9B-MLX-4bit
```

Override those values in `.env` or your shell to point at any compatible server.

## Optional MLX Server

`server/start.sh` can launch the local MLX server. Defaults are preserved, but each setting can be overridden:

```bash
MODEL_PATH=/models/qwen HOST=0.0.0.0 PORT=8081 PYTHON=/opt/venv/bin/python ./server/start.sh
```

If no variables are provided, it uses:

- `MODEL_PATH=./Qwen3.5-9B-MLX-4bit`
- `HOST=127.0.0.1`
- `PORT=8080`
- `PYTHON=./.venv/bin/python`, falling back to `python3` or `python`

## Tests

```bash
npm run typecheck
npm test
```

The MLX tool-calling benchmark is not part of the default test suite because it needs local model weights and `mlx_lm`:

```bash
npm run benchmark:tool-calling
```

