# Privacy And Safe Publishing

`memory-runtime` is meant to be publishable.

Your real memory data is not.

## Public vs private

Public:

- source code
- interfaces and contracts
- install scripts
- example configs
- redacted templates
- fake test fixtures

Private:

- real memory content
- local machine paths
- usernames, emails, hostnames
- proxy endpoints
- API keys, tokens, cookies, passwords
- local databases, logs, screenshots, snapshots
- raw config from `~/.codex`, `~/.claude`, `~/.gemini`

## Never publish these files

- `.env`, `.env.*` with real values
- `*.db`, `*.sqlite`, `*.sqlite3`
- `*.db-wal`, `*.db-shm`, `*.sqlite-wal`, `*.sqlite-shm`
- `logs/`, `snapshots/`, `artifacts/`, `test-results/`
- exported project memory bodies from `projects://...`

## Required checks before release

Run these checks before every public push:

```bash
git ls-files
git grep -n "/Users/|/home/|[A-Z]:\\\\Users\\\\" .
git grep -n "api_key\\|token\\|secret\\|password" .
find . -type f \\( -name "*.db" -o -name "*.sqlite*" -o -name "*.log" \\)
```

If any result contains private material, stop and clean it first.

## Safe export workflow

Use staged export instead of copying private files by hand:

```bash
./scripts/export-public.sh \
  --profile codex-project-memory \
  --source "$HOME/Documents/codex" \
  --output /tmp/memory-runtime-public \
  --dry-run
```

Then inspect:

- `PUBLIC_EXPORT_MANIFEST.json`
- the staged file diff
- remaining absolute-path leaks via `rg`

## Templates instead of raw local files

Use:

- `templates/config.example.toml`
- `templates/AGENTS.memory.example.md`
- `templates/project-memory.example.json`

Do not publish your real local files directly.

## Design rule

Publish the framework.

Keep your memory private.
