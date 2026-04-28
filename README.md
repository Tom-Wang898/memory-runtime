# memory-runtime

![memory-runtime social preview](./assets/social-preview-github.png)

[![CI](https://github.com/Tom-Wang898/memory-runtime/actions/workflows/ci.yml/badge.svg)](https://github.com/Tom-Wang898/memory-runtime/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Tom-Wang898/memory-runtime?include_prereleases&display_name=tag)](https://github.com/Tom-Wang898/memory-runtime/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-6BE1C6.svg)](./LICENSE)
[![Node 22+](https://img.shields.io/badge/node-22%2B-5FA04E.svg)](./package.json)

`memory-runtime` gives Codex, Claude, and Gemini a compact hot/cold memory layer
for project context.

It saves tokens without rewriting the user request, stays fail-open when memory
providers are unavailable, and keeps host integrations replaceable.

Use it when you want:

- automatic project bootstrap for CLI agents
- local hot memory with optional Memory Palace cold memory
- safer recall for short references like `route A`, `this`, or `that`
- explicit local skill governance without silent edits
- public-repo-friendly export tooling for sanitized memory assets

Quick links:

- Chinese quick start: `README_CN.md`
- Docker cold memory: `docs/COLD_MEMORY_DOCKER.md`
- Codex app integration: `docs/CODEX_APP.md`
- Configuration: `docs/CONFIGURATION.md`
- Setup guide: `docs/SETUP.md`
- Privacy and safe publishing: `docs/PRIVACY.md`
- Memory Palace project tools: `docs/MEMORY_PALACE_PROJECT_TOOLS.md`
- Public export workflow: `docs/PUBLIC_EXPORT.md`
- Troubleshooting: `docs/TROUBLESHOOTING.md`
- Changelog: `CHANGELOG.md`

## Current status

This repo is ready for public GitHub use as an `0.x` GitHub-first runtime:

- hot memory is backed by local SQLite via `node:sqlite`
- cold memory can use a real Memory Palace backend
- Claude and Gemini wrappers are implemented
- Codex stays native and uses `AGENTS + hmctl` for memory integration
- Codex can optionally enable the hot-only `memory-hot` MCP without enabling the full runtime MCP
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
- `memory-hot-mcp`: optional hot-only MCP for local SQLite state and continuity
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
- `zsh` or `bash` if you want shell helpers such as `hmctl`
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

4. Verify the shell helpers and routed context path:

```bash
codex --help
claude --help
gemini --help
hmctl primer --cwd "$(pwd)" --mode warm --json
hmctl continuity --cwd "$(pwd)" --json
hmctl context --cwd "$(pwd)" --query "continue with the current route" --json
hmctl bootstrap --cwd "$(pwd)" --mode warm --query "runtime smoke test" --json
```

Expected:

- `codex` stays the native host CLI
- `hmctl` is available as the memory sidecar command
- `hmctl primer` returns a compact primer and writes a cache file
- `hmctl continuity` returns a compact active-state recovery pack
- `hmctl context` auto-routes between primer, continuity, and bootstrap
- `hmctl bootstrap` returns the fuller fallback payload for query-specific recall
- `claude` and `gemini` may still be wrapped through shell integration

If you stop here, the runtime already works in hot-memory mode and will fail open
if cold memory is unavailable.

## Why routed context saves tokens

The normal Codex path is:

1. read a tiny cached primer
2. use continuity for continuation-style queries
3. only fall back to full bootstrap when the task needs more context

That matters because both primer and continuity are intentionally smaller than the
full Codex bootstrap envelope:

- primer keeps only a short background line plus a few deduplicated points
- continuity keeps the current route, pinned constraints, next step, and active open loops
- primer is cached per project, so repeated project turns do not have to rebuild full context
- continuity is cached separately, so “continue / route A / next step” style turns do not need full bootstrap
- bootstrap still uses the same hot/cold runtime, but it is reserved for query-specific recall

Run this to compare the sizes:

```bash
npm run bench:tokens
```

That benchmark reports token estimates for:

- compact primer text
- continuity text
- full Codex bootstrap envelope
- naive JSON-sized context

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
- `docs/SETUP.md`
- `docs/PRIVACY.md`

## What gets installed

The shell installer injects a managed block into your shell rc file and wires:

- `hmctl`
- `memory_runtime_bridge`
- `memory_runtime_prime`
- `claude`
- `gemini`

It leaves `codex` native.

Codex MCP support is split on purpose:

- `memory-hot` can be enabled for local SQLite hot memory
- `memory-palace` can be enabled for explicit durable cold memory
- the full `memory-runtime` MCP should stay disabled on the startup path

The installed sidecar path:

- warms compact primer files in the background when you enter a real project directory
- lets native Codex route reads through `hmctl context` or explicit `primer / continuity / bootstrap`
- keeps `hmctl continuity` available for continuation-style turns without full bootstrap cost
- keeps full `hmctl bootstrap` available when the task needs richer context
- prefers project hot-layer memory from `projects://<slug>/digest/current` and `projects://<slug>/anchors/current` when the cold backend provides them
- keeps the raw user prompt intact
- avoids polluting hot memory with synthetic wrapper summaries
- keeps heavy consolidation out of the synchronous startup path

Claude and Gemini wrappers still exist for users who want wrapped shell flows on
those hosts, but native Codex should not depend on them.

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

Useful runtime commands:

```bash
hmctl context --cwd "$(pwd)" --query "continue" --json
hmctl continuity --cwd "$(pwd)" --json
hmctl compact --cwd "$(pwd)" --dry-run
hmctl bootstrap --cwd "$(pwd)" --mode warm --query "debug query" --json
hmctl checkpoint --cwd "$(pwd)" --summary "checkpoint summary"
hmctl inspect --cwd "$(pwd)"
hmctl metrics --cwd "$(pwd)"
```

## Repository docs

- `docs/ARCHITECTURE.md`
- `docs/COLD_MEMORY_DOCKER.md`
- `docs/CODEX_APP.md`
- `docs/DATA_CONTRACTS.md`
- `docs/CONFIGURATION.md`
- `docs/SETUP.md`
- `docs/PRIVACY.md`
- `docs/MEMORY_PALACE_PROJECT_TOOLS.md`
- `docs/PUBLIC_EXPORT.md`
- `docs/SAFETY.md`
- `docs/SOCIAL_PREVIEW.md`
- `docs/TROUBLESHOOTING.md`
- `docs/OPEN_SOURCE.md`
- `docs/RELEASE.md`
- `docs/SKILL_GOVERNANCE.md`
