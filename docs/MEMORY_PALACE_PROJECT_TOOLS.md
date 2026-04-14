# Memory Palace Project Tools

This doc covers the cold-memory companion path for users who want the
project-memory digest and optimizer modules inside their own Memory Palace
checkout.

## Goal

Make the project-memory backend improvements reusable without publishing your
private local checkout.

## Recommended flow

1. create a sanitized bundle from a private Memory Palace checkout
2. review the bundle
3. apply the reviewed bundle into a target Memory Palace checkout
4. run the target project's tests

## Step 1: export a public-safe bundle

```bash
./scripts/export-public.sh \
  --profile memory-palace-project-tools \
  --source "$HOME/Documents/Memory-Palace" \
  --output /tmp/memory-palace-project-tools
```

Review:

- `PUBLIC_EXPORT_MANIFEST.json`
- staged file diffs
- private path leaks via `rg`

## Step 2: apply into a target checkout

```bash
./scripts/install-memory-palace-project-tools.sh \
  --bundle /tmp/memory-palace-project-tools \
  --target /path/to/Memory-Palace
```

By default the installer:

- checks the bundle manifest
- requires the `memory-palace-project-tools` profile
- copies only allowlisted project-memory backend files
- does not touch `.env`, databases, logs, or snapshots

## Step 3: verify the target checkout

Example:

```bash
cd /path/to/Memory-Palace/backend
.venv/bin/python -m pytest tests/test_project_memory_optimizer.py -q
```

## Files covered by the bundle

- `backend/project_memory_inventory.py`
- `backend/project_memory_digest.py`
- `backend/project_memory_merge.py`
- `backend/project_memory_relations.py`
- `backend/project_memory_optimizer.py`
- `backend/tests/test_project_memory_optimizer.py`

## Privacy boundary

This path is meant for code only.

Do not copy:

- real project memory databases
- local snapshots
- logs
- `.env` with real secrets
- exported `projects://...` memory content

See `docs/PRIVACY.md` for the full release boundary.
