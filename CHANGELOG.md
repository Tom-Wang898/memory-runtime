# Changelog

All notable changes to this project will be documented here.

The format is inspired by Keep a Changelog.

## [Unreleased]

### Added

- GitHub Actions CI workflow for push and pull request verification
- repo hero SVG for README and GitHub social preview upload
- social preview guidance and Discussions recommendation
- scoped cold-recall anchoring for ambiguous short references
- regression tests for anchored recall, suppression fallback, and summary sanitization
- routed context entrypoint via `hmctl context`
- dedicated continuity payloads and continuity cache
- hot-memory compactor plus `hmctl compact` and `hmctl compact-all`
- hot-memory schema v2 with pinned constraints and next-step persistence

### Changed

- README now uses a stronger homepage hero with badges
- GitHub metadata now includes a clear Discussions policy for the alpha phase
- wrappers no longer write synthetic automatic checkpoint summaries into hot memory
- cold recall now suppresses ambiguous short queries when no hot-memory anchor exists
- native Codex path now routes reads through `primer / continuity / bootstrap`
- shell integration now supports throttled background compaction for active projects

### Fixed

- removed a local absolute filesystem path from `assets/social-preview-compose.html`

## [0.1.0-alpha] - 2026-04-12

### Added

- hot-memory runtime backed by local SQLite
- Memory Palace cold-memory adapter
- Codex, Claude, and Gemini wrappers
- shell integration installer for `zsh` and `bash`
- backend-only Docker installer for Memory Palace cold memory
- cold-memory Docker install self-check
- backend auto-discovery tests for local Memory Palace checkouts
- troubleshooting and configuration docs for public GitHub users

### Changed

- README now reflects the real public install path
- cold-memory autostart now resolves backend roots dynamically instead of using one machine-specific path
- release checklist now includes shell-install and cold-docker validation

### Safety

- wrappers keep user prompts intact and only add supplemental bootstrap context
- cold-memory bootstrap remains fail-open under backend unavailability
- Docker-backed cold memory is separated from wrapper lifecycle control
