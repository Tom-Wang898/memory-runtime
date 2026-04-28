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
hmctl primer --cwd "$(pwd)" --mode warm --json
hmctl continuity --cwd "$(pwd)" --json
hmctl context --cwd "$(pwd)" --query "continue with the current route" --json
hmctl bootstrap --cwd "$(pwd)" --mode warm --query "setup smoke test" --json
```

Expected:

- `codex` resolves to the native host CLI, not `memory-runtime`
- `hmctl primer` returns a compact cacheable primer for repeated project turns
- `hmctl continuity` returns a compact active-state pack for continuation-style turns
- `hmctl context` automatically routes between primer, continuity, and bootstrap
- `hmctl bootstrap` returns the fuller fallback payload for query-specific context

## Optional: Codex app integration

Use the example config and app guide:

- `templates/config.example.toml`
- `docs/CODEX_APP.md`

Recommended MCP split:

- enable `memory-hot` for hot-only local SQLite tools
- keep the full `memory-runtime` MCP disabled
- keep `memory-palace` as the optional cold-memory MCP/backend

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
