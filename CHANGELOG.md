# Changelog

All notable changes to this project will be documented here.

The format is inspired by Keep a Changelog.

## [Unreleased]

### Added

- GitHub Actions CI workflow for push and pull request verification
- repo hero SVG for README and GitHub social preview upload
- social preview guidance and Discussions recommendation

### Changed

- README now uses a stronger homepage hero with badges
- GitHub metadata now includes a clear Discussions policy for the alpha phase

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
