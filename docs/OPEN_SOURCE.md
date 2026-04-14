# Open Source Hygiene

## Safe to publish

- framework code
- adapters
- tests and benchmarks
- example configs
- architecture and safety docs
- sanitized exports produced by `hmctl public-export`
- example templates from `templates/`

## Never publish

- real hot-memory databases
- real Memory Palace data or snapshots
- user conversation logs
- private API keys
- machine-specific shell history
- `sessions/`, `archived_sessions/`, `shell_snapshots/`
- `history.jsonl`, `auth.json`, `*.db`, `*.sqlite*`
- raw local checkout paths that still point at a personal machine

## Sanitized export profiles

Use `hmctl public-export --list-profiles` to inspect the built-in profiles.
For the full staging flow, see `docs/PUBLIC_EXPORT.md`.
For privacy rules, see `docs/PRIVACY.md`.

Current profiles:

- `codex-project-memory`: exports the project-memory scripts, prompts, and workflow overlay from a private Codex checkout
- `memory-palace-project-tools`: exports the project-memory optimizer modules and tests from a private Memory Palace checkout

Example:

```bash
hmctl public-export --profile codex-project-memory --source /path/to/codex --output /tmp/codex-public-export
hmctl public-export --profile memory-palace-project-tools --source /path/to/Memory-Palace --output /tmp/memory-palace-public-export
./scripts/export-public.sh --profile codex-project-memory --source /path/to/codex --output /tmp/codex-public-export
```

What the command does:

- copies only profile allowlisted files
- rewrites machine-specific paths into placeholders such as `${HOME}`, `${CODEX_REPO_ROOT}`, `${MEMORY_PALACE_ROOT}`
- writes `PUBLIC_EXPORT_MANIFEST.json` without local absolute paths
- aborts if any private absolute path survives redaction

What it deliberately does not do:

- it does not scan and publish an entire private repository
- it does not copy runtime databases, session logs, or shell state
- it does not guess which files are safe outside the allowlist

## Release checklist

1. verify `.env.example` is generic
2. verify `hmctl public-export --dry-run` succeeds for every private source you plan to mirror
3. verify templates under `templates/` do not contain private paths or secrets
4. remove local debug paths from docs and code defaults
5. verify `LICENSE` is present
6. run `npm run check:all`
7. run benchmark scripts and attach results
8. verify `./scripts/install-shell-integration.sh` works on a clean shell profile
9. verify `./scripts/install-memory-palace-docker.sh --no-start` generates valid cold-memory assets
10. confirm no personal memory files are tracked
