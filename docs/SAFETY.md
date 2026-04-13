# Safety

## Non-negotiable rules

- Raw user input is never rewritten by the runtime
- Background context is additive only
- High-risk requests reduce background injection instead of increasing it
- Cold recall has a hard timeout and fail-open behavior
- Promotion writes are explicit and scoped
- Public skill governance stays audit-only unless the user explicitly opts into mutation tooling

## High-risk heuristics

The runtime treats a request as high risk when it contains patterns such as:

- strong constraints (`must`, `only`, `exact`, `do not`)
- migration / database wording
- security / auth wording
- explicit negation in Chinese or English

In high-risk mode:

- cold recall is skipped by default
- old background is trimmed harder
- only the smallest hot capsule is injected

This is deliberate. It is cheaper to inject less context than to distort a precise task.

## Skill governance safety

`hmctl skills-audit` is local and read-only.

- it scans local files only
- it does not upload skills anywhere
- it does not auto-edit `~/.codex/skills` or other private roots on install
- `hmctl skills-apply` requires explicit user intent and writes a rollback snapshot first
- `hmctl skills-duplicates-apply` quarantines duplicates instead of deleting them
- `hmctl skills-rollback` refuses conflicting files unless you pass `--force`
