# Public export example

Use `hmctl public-export` to create a staging directory first.

Default publishing choice:

- keep the current `memory-runtime` repository as the only public repo
- use the staging export only for review, selective transplant, or future optional mirrors

Suggested flow:

```bash
hmctl public-export --profile codex-project-memory --source /path/to/codex --output /tmp/codex-public-export
hmctl public-export --profile memory-palace-project-tools --source /path/to/Memory-Palace --output /tmp/memory-palace-public-export
```

Then:

1. review `PUBLIC_EXPORT_MANIFEST.json`
2. grep for private absolute paths
3. transplant only the pieces you actually want into the current public repo, or initialize a separate mirror only if you truly need one
4. add repo-specific README and release metadata when needed

Do not push a raw private checkout.
