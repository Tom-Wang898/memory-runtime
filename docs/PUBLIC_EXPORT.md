# Public Export

`hmctl public-export` exists for one job:

- take a private local checkout
- copy only explicitly allowlisted files
- redact machine-specific absolute paths
- produce a reviewable staging directory for a public mirror repo

It is deliberately conservative.

## Supported profiles

- `codex-project-memory`
  - exports project-memory scripts, prompts, and workflow overlay files from a private Codex checkout
- `memory-palace-project-tools`
  - exports project-memory optimizer modules and tests from a private Memory Palace checkout

Inspect the live list with:

```bash
hmctl public-export --list-profiles
```

If you want a shorter wrapper, use:

```bash
./scripts/export-public.sh --profile codex-project-memory --source /path/to/codex --output /tmp/codex-public-export
```

## Basic usage

```bash
hmctl public-export \
  --profile codex-project-memory \
  --source /path/to/codex \
  --output /tmp/codex-public-export
```

```bash
hmctl public-export \
  --profile memory-palace-project-tools \
  --source /path/to/Memory-Palace \
  --output /tmp/memory-palace-public-export
```

For CI or preflight checks:

```bash
hmctl public-export \
  --profile codex-project-memory \
  --source /path/to/codex \
  --output /tmp/codex-public-export \
  --dry-run
```

## What gets written

The output directory contains:

- exported allowlisted files
- `PUBLIC_EXPORT_MANIFEST.json`

Template assets for common README and `.gitignore` scaffolding live in:

- `examples/public-export/templates/`

Public-safe local config templates now also live in:

- `templates/`

The manifest includes:

- profile name
- placeholder root
- exported relative paths
- replacement counts
- file sizes

The manifest intentionally does not include local absolute paths.

## Redaction model

The exporter rewrites known machine-specific paths into placeholders such as:

- `${HOME}`
- `${CODEX_REPO_ROOT}`
- `${MEMORY_PALACE_ROOT}`

If any absolute private path survives sanitization, export fails.

That fail-fast behavior is the whole point.

## Publish workflow

1. Run `hmctl public-export` into an empty staging directory.
2. Inspect `PUBLIC_EXPORT_MANIFEST.json`.
3. Run a second grep pass before publishing:

```bash
rg -n '/Users/|/home/|[A-Z]:\\\\Users\\\\' /path/to/staging
```

4. Decide whether to transplant selected files into the current public repo or keep the staging directory as a local review artifact.
5. Add project-specific README, license, and release metadata when needed.
6. Review `docs/PRIVACY.md` and make sure the staged output still respects it.
7. Push only after reviewing the final diff.

## Recommended publishing shape

Default recommendation:

- keep using the current `memory-runtime` repository as the single public repo
- use `hmctl public-export` only as a safe staging tool when you need to review or transplant selected assets

Optional advanced setup:

- split exports into separate mirrors only if the Codex-side overlays and Memory Palace-side tools truly need independent ownership or release cadence

For most users, one public repo is simpler and easier to maintain.

## Deliberate non-features

- no recursive full-repo publish mode
- no auto-guessing of safe files
- no best-effort path cleanup that silently leaves leftovers behind
- no direct push to GitHub

You still review the staging output yourself.
