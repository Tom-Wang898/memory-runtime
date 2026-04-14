# Setup Guide

This is the public-safe setup path for new users.

## Prerequisites

- Node.js `22+`
- npm `10+`
- one supported host CLI already installed
- `zsh` or `bash`
- optional: Docker with `docker compose`

## Install

```bash
git clone https://github.com/Tom-Wang898/memory-runtime.git
cd memory-runtime
npm install
./scripts/install-shell-integration.sh --shell zsh
source ~/.zshrc
```

For `bash`:

```bash
./scripts/install-shell-integration.sh --shell bash
source ~/.bashrc
```

## Verify

```bash
type hmctl
type codex
hmctl bootstrap --cwd "$(pwd)" --mode warm --query "runtime smoke test" --json
```

## Optional: Codex app integration

Use the example config and app guide:

- `templates/config.example.toml`
- `docs/CODEX_APP.md`

## Optional: cold memory

Use the Docker guide:

- `docs/COLD_MEMORY_DOCKER.md`

## Optional: safe public export

```bash
./scripts/export-public.sh \
  --profile codex-project-memory \
  --source "$HOME/Documents/codex" \
  --output /tmp/memory-runtime-public
```

Review the staging output before copying anything into a public repo.

## Templates

- `templates/config.example.toml`
- `templates/AGENTS.memory.example.md`
- `templates/project-memory.example.json`

## Related docs

- `docs/CONFIGURATION.md`
- `docs/PRIVACY.md`
- `docs/TROUBLESHOOTING.md`
