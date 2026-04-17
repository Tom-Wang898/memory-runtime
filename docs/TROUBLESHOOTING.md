# Troubleshooting

## Shell integration is not active

Symptoms:

- `type codex` does not resolve to the native host CLI
- `type claude` does not show a shell function
- `type gemini` does not show a shell function
- `type hmctl` does not show a shell function

Fix:

```bash
./scripts/install-shell-integration.sh --shell zsh
source ~/.zshrc
```

Use `--shell bash` if you are on bash.

## Startup shows Node experimental warnings

Current wrapper entrypoints suppress the noisy `ExperimentalWarning` lines from:

- `--loader` deprecation guidance
- `node:sqlite` experimental notices

If you still see them, check whether your shell is pointing at the current repo
wrapper instead of an older install.

Check:

```bash
type hmctl
type codex
type gemini
```

Expected shape:

- `hmctl` resolves to `memory-runtime/bin/hmctl`
- `codex` resolves to the native host CLI
- `gemini` resolves to the shell function installed by `install-shell-integration.sh`

## Primer cache never appears

Check:

```bash
type hmctl
hmctl primer --cwd "$(pwd)" --mode warm --json
```

Expected:

- the command returns `ok: true`
- the result includes a cache `path`
- repeated calls without `--force` should switch to `source: "cache"`

If it keeps returning `source: "fresh"` forever, check whether your shell is
changing directories into a real project root or a throwaway folder that should
not be primed.

## Continuity cache is missing or stale

Check:

```bash
hmctl continuity --cwd "$(pwd)" --json
hmctl compact --cwd "$(pwd)" --dry-run
```

Expected:

- `hmctl continuity` returns `ok: true` with either `source: "cache"` or `source: "fresh"`
- `hmctl compact --dry-run` reports whether stale hot memory would actually change

If continuity is stale, run:

```bash
hmctl compact --cwd "$(pwd)"
```

That refreshes the hot capsule, rewrites the continuity cache, and optionally
lets later flows refresh primer separately.

## Current shell still uses the old commands

The installer edits your shell rc file.

Already-running shells do not reload automatically.

Fix:

```bash
source ~/.zshrc
```

or just open a new terminal tab.

## Codex or Gemini starts doing work before I type anything

That was old wrapper behavior.

Current Codex integration keeps `codex` native.

Only explicit helper flows such as `hmctl bootstrap` or non-interactive wrapper
paths should inject memory.

Plain interactive launches such as:

```bash
codex
gemini
```

should no longer synthesize a first user message.

If they still do, your shell is probably using stale wrapper files.

Fix:

```bash
source ~/.zshrc
type codex
type gemini
```

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

That only affects the Claude and Gemini wrappers.

Native Codex is already unaffected. If you want to bypass memory in Codex, stop
calling `hmctl context`, `hmctl primer`, `hmctl continuity`, or `hmctl bootstrap`
from your project instructions.

## I want to test the runtime without touching real work

Use:

```bash
hmctl context --cwd "$(pwd)" --query "continue" --json
hmctl continuity --cwd "$(pwd)" --json
hmctl bootstrap --cwd "$(pwd)" --mode warm --query "runtime smoke test" --json
npm run check:all
```
