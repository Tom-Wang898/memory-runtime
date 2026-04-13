# Skill Governance

`memory-runtime` now includes a skill governance companion with:

- audit
- explicit apply
- rollback
- benchmark

It is built for one job:

- inspect local skill trees
- surface token-cost hotspots
- catch host-coupled instructions that do not travel well
- avoid silently rewriting user-owned skills

## What it audits

`hmctl skills-audit` scans discovered skill roots and reports:

- description budget overflows
- heavy skills with large body/reference token cost
- duplicate skill names
- duplicate skill bodies
- host-specific coupling such as `TodoWrite`, `Skill tool`, Claude hooks, or host-only tool names
- reference files that are missing lightweight `When` / `Topics` routing metadata

## Default root discovery

If you do not pass `--root`, the command uses one of these sources:

- `MEMORY_RUNTIME_SKILL_ROOTS` when it is set
- otherwise the built-in defaults:
  - `~/.codex/skills`
  - `~/.claude/skills`
  - `~/.gemini/skills`
  - `~/.config/codex/skills`
  - `~/.config/claude/skills`
  - `~/.config/gemini/skills`

`MEMORY_RUNTIME_SKILL_ROOTS` uses the platform path delimiter:

- macOS / Linux: `:`
- Windows: `;`

Example:

```bash
export MEMORY_RUNTIME_SKILL_ROOTS="$HOME/.codex/skills:$HOME/.claude/skills"
```

## Host profiles

Available profiles:

- `codex`
- `claude`
- `gemini`
- `universal`

Example:

```bash
hmctl skills-audit --root "$HOME/.codex/skills" --host codex
```

## Usage

Scan auto-discovered roots:

```bash
hmctl skills-audit
```

Scan one explicit root and emit JSON:

```bash
hmctl skills-audit --root "$HOME/.codex/skills" --json
```

Plan changes without touching files:

```bash
hmctl skills-plan --root "$HOME/.codex/skills" --host codex
```

Apply managed transforms and write a snapshot automatically:

```bash
hmctl skills-apply --root "$HOME/.codex/skills" --host codex
```

Export a duplicate-resolution template:

```bash
hmctl skills-duplicates \
  --root "$HOME/.codex/skills" \
  --decision-out /tmp/duplicate-decisions.json
```

The generated decision file contains:

- `action`: `quarantine` or `skip`
- `keepPath`: the canonical skill path to keep active
- `quarantinePaths`: the duplicate paths to isolate
- `reason`: human-readable rationale that can be edited before apply

The duplicate report now also shows per-path review metadata:

- `status`
- whether the path is under `skillio-managed`
- `descriptionTokens`
- `totalTokens`

Duplicate groups are also sorted by review priority and labeled with:

- `high`
- `medium`
- `low`

The current risk model prioritizes entrypoint involvement, mixed managed/non-managed copies, host-coupled duplicates, heavy payloads, and larger duplicate groups.

Apply that duplicate-resolution file:

```bash
hmctl skills-duplicates-apply --decision-file /tmp/duplicate-decisions.json
```

Both `skills-apply` and `skills-duplicates-apply` now return:

- operation counts by change category
- before/after audit summaries
- a delta block that shows which problem counts actually moved

Rollback later:

```bash
hmctl skills-rollback --snapshot "$HOME/.memory-runtime/skill-governance/snapshots/<snapshot>.json"
```

Run a sandbox benchmark:

```bash
hmctl skills-benchmark --root "$HOME/.codex/skills" --host codex --json
```

Persist both outputs:

```bash
hmctl skills-audit \
  --root "$HOME/.codex/skills" \
  --json-out "$HOME/.memory-runtime/reports/skills-audit.json" \
  --markdown-out "$HOME/.memory-runtime/reports/skills-audit.md"
```

## Safety model

This command is intentionally conservative.

- no network calls
- no background mutation of skill files
- no auto-apply on install
- no hidden backups because nothing is modified

Today it is **audit-only by default**.

That is deliberate. Public users should be able to install the repo, inspect their local skill debt, and decide what to change without the runtime silently touching `~/.codex/skills` or other private skill trees.

`apply` is available, but it is still explicit, local, and snapshot-backed.

## Managed transforms

The current safe automatic subset is:

- trim over-budget descriptions
- rewrite host-coupled phrases into generic host-compatible wording
- inject `When` / `Topics` routing metadata into reference files

The current manual-review subset is:

- duplicate skill names
- duplicate skill bodies

Current duplicate workflow:

1. run `skills-duplicates`
2. review the generated decision file
3. run `skills-duplicates-apply`

This path quarantines the non-kept duplicates by setting `status: quarantined`.
It also writes `replaced_by` and `notes` frontmatter fields to make the quarantine explainable.
It does not delete files.

## Intended next step

The safe public path is:

1. audit
2. review
3. explicit apply with backup and rollback
