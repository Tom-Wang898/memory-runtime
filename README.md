# memory-runtime

![memory-runtime social preview](./assets/social-preview-github.png)

[![CI](https://github.com/Tom-Wang898/memory-runtime/actions/workflows/ci.yml/badge.svg)](https://github.com/Tom-Wang898/memory-runtime/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Tom-Wang898/memory-runtime?display_name=tag)](https://github.com/Tom-Wang898/memory-runtime/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-6BE1C6.svg)](./LICENSE)
[![Node 22+](https://img.shields.io/badge/node-22%2B-5FA04E.svg)](./package.json)

`memory-runtime` is a hot/cold memory runtime for CLI agents.

It is designed to save tokens without rewriting the user request, stay fail-open
under provider failures, and keep host integrations replaceable.

- Chinese quick start: `README_CN.md`
- Changelog: `CHANGELOG.md`
- GitHub social preview note: use `assets/social-preview-github-4x3-upload.jpg` in repository settings

## Current status

This repo is ready for public GitHub use as an `0.x` GitHub-first runtime:

- hot memory is backed by local SQLite via `node:sqlite`
- cold memory can use a real Memory Palace backend
- Codex, Claude, and Gemini wrappers are implemented
- shell integration can be installed with one command
- cold-memory autostart is optional and fail-open
- ambiguous short references are anchor-expanded or cold-recall-suppressed
- local skill governance supports audit, explicit apply, rollback, and benchmark flows

The current distribution model is:

- clone from GitHub
- run locally
- install shell integration into `zsh` or `bash`
- optionally audit, apply, rollback, and benchmark local skill governance

It is not an npm-published product yet.

## Architecture

The runtime is split into replaceable layers:

- `memory-core`: contracts, token budget policy, routing rules
- `hot-memory-sqlite`: fast local hot-state provider
- `cold-memory-memory-palace`: cold-memory adapter for Memory Palace
- `cold-memory-fixture`: deterministic fixture adapter for tests and benchmarks
- `host-codex`: Codex bootstrap and checkpoint integration surface
- `host-claude`: Claude-oriented bootstrap rendering surface
- `mcp-bridge`: optional stdio bridge for inspection and promotion flows

```text
CLI host
-> host adapter
-> memory-core
-> hot provider
-> cold provider
```

## Design goals

- high cohesion, low coupling
- fail-open behavior that never blocks normal development
- fast local bootstrap with strict latency and token budgets
- replaceable hot and cold memory providers
- ambiguous short references should recall less rather than recall wrong
- public-repo-friendly code with no bundled personal memory data

## Prerequisites

- Node.js `22+` with `node:sqlite` support
- npm `10+`
- at least one supported host CLI already installed: Codex, Claude, or Gemini
- `zsh` or `bash` if you want automatic wrapper loading
- optional: a running Memory Palace backend for cold recall
- optional for Docker cold memory: Docker with `docker compose`

## Quick start

1. Clone the repo and install dependencies:

```bash
git clone https://github.com/Tom-Wang898/memory-runtime.git
cd memory-runtime
npm install
```

2. Install shell integration:

```bash
./scripts/install-shell-integration.sh --shell zsh
```

Use `--shell bash` if you want `~/.bashrc` instead.

3. Reload the shell:

```bash
source ~/.zshrc
```

4. Verify the wrappers and hot-memory runtime:

```bash
codex --help
claude --help
gemini --help
hmctl bootstrap --cwd "$(pwd)" --mode warm --query "runtime smoke test" --json
```

If you stop here, the runtime already works in hot-memory mode and will fail open
if cold memory is unavailable.

5. Optional: audit local skills without editing them:

```bash
hmctl skills-audit
```

You can also point it at one explicit tree:

```bash
hmctl skills-audit --root "$HOME/.codex/skills" --json
```

6. Optional: generate a safe mutation plan first:

```bash
hmctl skills-plan --root "$HOME/.codex/skills" --host codex
```

7. Optional: apply managed changes with an automatic snapshot:

```bash
hmctl skills-apply --root "$HOME/.codex/skills" --host codex
```

8. Optional: rollback from a snapshot:

```bash
hmctl skills-rollback --snapshot "$HOME/.memory-runtime/skill-governance/snapshots/<snapshot>.json"
```

9. Optional: export duplicate-skill decisions:

```bash
hmctl skills-duplicates --root "$HOME/.codex/skills" --decision-out /tmp/duplicate-decisions.json
```

10. Optional: apply duplicate decisions without deleting files:

```bash
hmctl skills-duplicates-apply --decision-file /tmp/duplicate-decisions.json
```

You can edit the exported decision file first.
Set `action` to `skip` if a duplicate group should remain untouched.
The duplicate report now includes per-path status and token metadata, and apply results include before/after deltas.
Duplicate groups are now ordered by review risk so the ugliest sets float to the top first.

11. Optional: stage a sanitized public export from a private Codex or Memory Palace checkout:

```bash
hmctl public-export --list-profiles
hmctl public-export --profile codex-project-memory --source /path/to/codex --output /tmp/codex-public-export
hmctl public-export --profile memory-palace-project-tools --source /path/to/Memory-Palace --output /tmp/memory-palace-public-export
```

That command only copies allowlisted files, replaces machine-specific paths with placeholders such as `${HOME}` and `${CODEX_REPO_ROOT}`, and fails if a private absolute path marker survives redaction.

See `docs/PUBLIC_EXPORT.md` for the full staging and mirror workflow.

## Optional cold-memory setup

Cold memory uses Memory Palace.

If you already run Memory Palace somewhere, set its base URL:

```bash
export MEMORY_RUNTIME_MP_BASE_URL="http://127.0.0.1:18000"
```

### Recommended Docker path

If you want a stable cold-memory setup without cloning the full Memory Palace
repo, use the backend-only installer:

```bash
./scripts/install-memory-palace-docker.sh
source ~/.memory-runtime/env.sh
```

That path:

- deploys the official GHCR backend image only
- generates a local API key by default
- enables the `projects` domain needed by `memory-runtime`
- writes shell exports to `~/.memory-runtime/env.sh`

### Existing full Memory Palace deployment

If you want `memory-runtime` to auto-start a local Memory Palace backend, also set:

```bash
export MEMORY_RUNTIME_MP_AUTOSTART=1
export MEMORY_RUNTIME_MP_BACKEND_ROOT=/absolute/path/to/Memory-Palace/backend
```

Autostart only attempts to run when:

- `MEMORY_RUNTIME_MP_AUTOSTART=1`
- the base URL is a loopback address
- the backend root contains both `main.py` and `.venv/bin/python`

If any of those checks fail, the runtime degrades gracefully and continues.

Docker deployments are treated differently:

- the wrapper does not try to start or stop Docker for you
- use `install-memory-palace-docker.sh` once, then keep `MEMORY_RUNTIME_MP_AUTOSTART=0`
- if you want the full Dashboard and SSE stack, use the official Memory Palace repo

See:

- `docs/COLD_MEMORY_DOCKER.md`
- `docs/CONFIGURATION.md`

## What gets installed

The shell installer injects a managed block into your shell rc file and wires:

- `hmctl`
- `memory_runtime_bridge`
- `codex`
- `claude`
- `gemini`

The wrappers:

- inject compact bootstrap context before a session starts
- prefer project hot-layer memory from `projects://<slug>/digest/current` and `projects://<slug>/anchors/current` when the cold backend provides them
- keep the raw user prompt intact
- write a lightweight checkpoint after the wrapped command exits
- avoid polluting hot memory with synthetic wrapper summaries

The skill audit companion:

- scans local skill trees only when you call it
- reports token-heavy and host-coupled skills
- supports explicit apply and rollback with snapshots
- supports explicit duplicate review and quarantine decisions
- does not auto-edit private skill directories unless you run `skills-apply`

## Validation

Run the full verification suite:

```bash
npm run check:all
```

Optional benchmarks:

```bash
npm run bench:bootstrap
npm run bench:tokens
npm run bench:skills-governance
```

## Repository docs

- `docs/ARCHITECTURE.md`
- `docs/COLD_MEMORY_DOCKER.md`
- `docs/DATA_CONTRACTS.md`
- `docs/CONFIGURATION.md`
- `docs/PUBLIC_EXPORT.md`
- `docs/SAFETY.md`
- `docs/SOCIAL_PREVIEW.md`
- `docs/TROUBLESHOOTING.md`
- `docs/OPEN_SOURCE.md`
- `docs/RELEASE.md`
- `docs/SKILL_GOVERNANCE.md`
