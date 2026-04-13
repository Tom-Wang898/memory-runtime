# Public export example

Use `hmctl public-export` to create a staging directory first.

Recommended split:

- `codex-memory-overlays`
- `memory-palace-project-tools`

Suggested flow:

```bash
hmctl public-export --profile codex-project-memory --source /path/to/codex --output /tmp/codex-public-export
hmctl public-export --profile memory-palace-project-tools --source /path/to/Memory-Palace --output /tmp/memory-palace-public-export
```

Then:

1. review `PUBLIC_EXPORT_MANIFEST.json`
2. grep for private absolute paths
3. initialize a fresh public repo from the staging directory
4. add a repo-specific README and release metadata

Do not push a raw private checkout.
