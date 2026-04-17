# Configuration

## Core variables

| Variable | Default | Purpose |
|---|---|---|
| `MEMORY_RUNTIME_ROOT` | auto-detected repo root | Install root used by shell wrappers |
| `MEMORY_RUNTIME_ENV_FILE` | `~/.memory-runtime/env.sh` | Optional shell env snippet loaded before wrapper defaults |
| `MEMORY_RUNTIME_HOT_DB_PATH` | `~/.memory-runtime/hot-memory.db` | Local SQLite hot-state database |
| `MEMORY_RUNTIME_PRIMER_DIR` | `~/.memory-runtime/primers` | Cache directory for compact primer files used by native Codex and shell hooks |
| `MEMORY_RUNTIME_CONTINUITY_DIR` | `~/.memory-runtime/continuity` | Cache directory for continuity payloads used by routed context |
| `MEMORY_RUNTIME_COLD_PROVIDER` | `memory-palace` | Cold provider selection (`memory-palace` or `none`) |
| `MEMORY_RUNTIME_COLD_TIMEOUT_MS` | `350` | Hard timeout for cold recall |
| `MEMORY_RUNTIME_AUTO_COMPACT` | `1` | Enable low-frequency background hot-memory compaction from shell integration |
| `MEMORY_RUNTIME_COMPACT_MIN_INTERVAL_SEC` | `1800` | Minimum seconds between background compactor runs for the same project |

## Memory Palace adapter

| Variable | Default | Purpose |
|---|---|---|
| `MEMORY_RUNTIME_MP_BASE_URL` | `http://127.0.0.1:18000` | Memory Palace backend base URL |
| `MEMORY_RUNTIME_MP_API_KEY` | empty | Optional API key |
| `MEMORY_RUNTIME_MP_API_KEY_MODE` | `header` | `header` or `bearer` |
| `MEMORY_RUNTIME_MP_PROMOTION_DOMAIN` | `projects` | Promotion target domain |
| `MEMORY_RUNTIME_MP_PROMOTION_PARENT_PATH` | `<project-id>` | Promotion parent path override |
| `MEMORY_RUNTIME_MP_AUTOSTART` | `0` in installer examples | Auto-start a local backend for loopback URLs |
| `MEMORY_RUNTIME_MP_BACKEND_ROOT` | auto-detect common sibling/vendor paths | Absolute path to `Memory-Palace/backend` |

## Memory Palace autostart behavior

Autostart is intentionally conservative.

It only runs when:

- `MEMORY_RUNTIME_MP_AUTOSTART=1`
- `MEMORY_RUNTIME_MP_BASE_URL` points to `127.0.0.1` or `localhost`
- the backend root contains:
  - `main.py`
  - `.venv/bin/python`

Backend root resolution order:

1. `MEMORY_RUNTIME_MP_BACKEND_ROOT`
2. `<runtime-root>/../Memory-Palace/backend`
3. `<runtime-root>/../memory-palace/backend`
4. `<runtime-root>/vendor/Memory-Palace/backend`
5. `<runtime-root>/vendor/memory-palace/backend`

If no valid backend root is found, bootstrap continues without cold autostart.

## Docker-backed cold memory

Use:

```bash
./scripts/install-memory-palace-docker.sh
source ~/.memory-runtime/env.sh
```

That installer writes `MEMORY_RUNTIME_MP_BASE_URL`, `MEMORY_RUNTIME_MP_API_KEY`
and related exports into `MEMORY_RUNTIME_ENV_FILE`.

Recommended rule for Docker deployments:

- keep `MEMORY_RUNTIME_MP_AUTOSTART=0`
- manage Docker lifecycle outside the CLI wrapper
- let the wrapper consume the generated env file only

## Wrapper control

| Variable | Default | Purpose |
|---|---|---|
| `MEMORY_RUNTIME_DISABLE` | `0` | If set to `1`, Claude and Gemini wrappers bypass memory runtime and call the host directly. Native Codex is already unaffected |

## Skill governance

| Variable | Default | Purpose |
|---|---|---|
| `MEMORY_RUNTIME_SKILL_ROOTS` | empty | Optional path-delimited list of skill roots used by `hmctl skills-audit` instead of built-in defaults |

Skill governance host profiles are selected per command with:

```bash
--host codex
--host claude
--host gemini
--host universal
```

## Recommended profiles

### Hot-only local setup

```bash
export MEMORY_RUNTIME_COLD_PROVIDER=none
```

### Hot + remote Memory Palace

```bash
export MEMORY_RUNTIME_COLD_PROVIDER=memory-palace
export MEMORY_RUNTIME_MP_BASE_URL=https://your-memory-palace-host
```

### Hot + local autostarted Memory Palace

```bash
export MEMORY_RUNTIME_COLD_PROVIDER=memory-palace
export MEMORY_RUNTIME_MP_BASE_URL=http://127.0.0.1:18000
export MEMORY_RUNTIME_MP_AUTOSTART=1
export MEMORY_RUNTIME_MP_BACKEND_ROOT=/absolute/path/to/Memory-Palace/backend
```
