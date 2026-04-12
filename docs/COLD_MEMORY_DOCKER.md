# Cold Memory Docker

This document covers the recommended Docker deployment path for cold memory
when `memory-runtime` is used by other people.

## Recommendation

For `memory-runtime`, the stable default is:

- deploy the Memory Palace **backend only**
- keep the runtime talking to `http://127.0.0.1:<port>`
- use an explicit API key by default
- keep wrapper autostart disabled for Docker-backed installs

Why:

- `memory-runtime` only needs backend APIs for recall and promotion
- fewer containers means fewer moving parts
- users avoid cloning and maintaining the full Memory Palace repo just to get cold recall

## Prerequisites

- Docker installed
- `docker compose` available
- a supported host CLI already installed if you want wrapper-level automatic bootstrap

## One-command backend setup

Run:

```bash
./scripts/install-memory-palace-docker.sh
source ~/.memory-runtime/env.sh
```

What the script does:

- writes Docker assets into `~/.memory-runtime/vendors/memory-palace-backend`
- creates a backend-only `docker-compose.yml`
- creates a container env file aligned with Memory Palace Profile B
- enables `VALID_DOMAINS=core,projects,notes`
- generates an `MCP_API_KEY` unless you explicitly allow insecure local mode
- writes `memory-runtime` exports into `~/.memory-runtime/env.sh`

## Important runtime behavior

For Docker-backed cold memory:

- set `MEMORY_RUNTIME_MP_AUTOSTART=0`
- do not expect the CLI wrapper to launch Docker
- treat the Docker stack as operator-managed infrastructure

This separation keeps wrappers fast and predictable.

## Options

### Custom backend port

```bash
./scripts/install-memory-palace-docker.sh --backend-port 18100
source ~/.memory-runtime/env.sh
```

### Explicit API key

```bash
./scripts/install-memory-palace-docker.sh --api-key your-local-key
source ~/.memory-runtime/env.sh
```

### Loopback-only insecure local mode

Use this only on your own machine:

```bash
./scripts/install-memory-palace-docker.sh --allow-insecure-local
source ~/.memory-runtime/env.sh
```

### Generate files without starting Docker

```bash
./scripts/install-memory-palace-docker.sh --no-start
```

## Operations

Default paths:

- compose root: `~/.memory-runtime/vendors/memory-palace-backend`
- runtime env: `~/.memory-runtime/env.sh`

Typical commands:

```bash
docker compose -f ~/.memory-runtime/vendors/memory-palace-backend/docker-compose.yml -p memory-palace-runtime up -d
docker compose -f ~/.memory-runtime/vendors/memory-palace-backend/docker-compose.yml -p memory-palace-runtime logs backend
docker compose -f ~/.memory-runtime/vendors/memory-palace-backend/docker-compose.yml -p memory-palace-runtime down
```

Health check:

```bash
curl http://127.0.0.1:18000/health
```

## Full Memory Palace stack

If users want the Dashboard, SSE endpoint, or the broader operator surface,
point them to the official repo:

- `https://github.com/AGI-is-going-to-arrive/Memory-Palace`

That path is heavier, but it is the right choice for:

- dashboard browsing
- SSE-based remote MCP flows
- frontend-assisted review workflows

## Why `projects` must be enabled

`memory-runtime` promotes durable summaries under:

- `projects://<project-id>/...`

If the cold-memory backend does not allow the `projects` domain, promotion and
project-scoped recall will misbehave.

That is why the Docker installer explicitly writes:

```text
VALID_DOMAINS=core,projects,notes
```
