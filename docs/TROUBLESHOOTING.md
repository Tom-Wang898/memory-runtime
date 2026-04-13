# Troubleshooting

## Wrappers are not active

Symptoms:

- `type codex` does not show a shell function
- `type claude` does not show a shell function
- `type gemini` does not show a shell function

Fix:

```bash
./scripts/install-shell-integration.sh --shell zsh
source ~/.zshrc
```

Use `--shell bash` if you are on bash.

## Current shell still uses the old commands

The installer edits your shell rc file.

Already-running shells do not reload automatically.

Fix:

```bash
source ~/.zshrc
```

or just open a new terminal tab.

## Cold memory does not auto-start

Autostart only runs when all of these are true:

- `MEMORY_RUNTIME_MP_AUTOSTART=1`
- `MEMORY_RUNTIME_MP_BASE_URL` is loopback
- `MEMORY_RUNTIME_MP_BACKEND_ROOT` is valid or auto-discovery finds a valid backend

Check:

```bash
echo "$MEMORY_RUNTIME_MP_AUTOSTART"
echo "$MEMORY_RUNTIME_MP_BASE_URL"
echo "$MEMORY_RUNTIME_MP_BACKEND_ROOT"
```

The backend root must contain:

- `main.py`
- `.venv/bin/python`

If you are using Docker-backed cold memory, stop looking at autostart first.
That path is supposed to keep `MEMORY_RUNTIME_MP_AUTOSTART=0`.

## Docker-backed cold memory is down

Default compose root:

```bash
~/.memory-runtime/vendors/memory-palace-backend
```

Check:

```bash
docker compose -f ~/.memory-runtime/vendors/memory-palace-backend/docker-compose.yml -p memory-palace-runtime ps
docker compose -f ~/.memory-runtime/vendors/memory-palace-backend/docker-compose.yml -p memory-palace-runtime logs backend
curl http://127.0.0.1:18000/health
```

If the health check fails, restart the backend:

```bash
docker compose -f ~/.memory-runtime/vendors/memory-palace-backend/docker-compose.yml -p memory-palace-runtime up -d
```

## Bootstrapping works, but cold recall is empty

That usually means one of these:

- cold provider is disabled
- Memory Palace has no matching durable facts yet
- the query is in high-risk mode, so cold recall was suppressed
- the query is too short or ambiguous and no hot-memory anchor was available

Check the JSON payload:

```bash
hmctl bootstrap --cwd "$(pwd)" --mode warm --query "debug query" --json
```

Look at:

- `diagnostics.coldRecallAttempted`
- `diagnostics.coldRecallUsed`
- `diagnostics.recallQueryStrategy`
- `diagnostics.degradeReasons`

If `recallQueryStrategy` is `suppressed`, the runtime intentionally refused
to query cold memory because the current prompt looked like a short reference
such as "route A", "option B", "this", or "that" without enough project-local
anchor context.

## I want to bypass memory-runtime temporarily

Use:

```bash
export MEMORY_RUNTIME_DISABLE=1
```

That makes the wrappers call the underlying CLI directly.

## I want to test the runtime without touching real work

Use:

```bash
hmctl bootstrap --cwd "$(pwd)" --mode warm --query "runtime smoke test" --json
npm run check:all
```
