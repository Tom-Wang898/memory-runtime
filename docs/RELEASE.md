# Release Strategy

## Versioning

- `0.x`: architecture still moving, interfaces may tighten
- `1.x`: package interfaces become stability targets

## Distribution model

- current: public GitHub repository with local install flow
- later: optional npm packaging after host surfaces settle

## Required checks before a release

```bash
npm run check:all
npm run bench:bootstrap
npm run bench:tokens
./scripts/install-shell-integration.sh --shell zsh --rc-file /tmp/memory-runtime.zshrc
./scripts/install-memory-palace-docker.sh --install-root /tmp/memory-palace-backend --runtime-env-file /tmp/memory-runtime.env --no-start
./bin/hmctl context --cwd "$(pwd)" --query "continue" --json
./bin/hmctl continuity --cwd "$(pwd)" --json
./bin/hmctl compact --cwd "$(pwd)" --dry-run
./bin/hmctl compact-all --root "$(pwd)" --dry-run
./bin/hmctl primer --cwd "$(pwd)" --mode warm --json
./bin/hmctl bootstrap --cwd "$(pwd)" --mode warm --json
```

Manual startup sanity checks:

- bare `codex` launch should stay native and should not wait on `memory-runtime` startup
- bare `gemini` launch should not synthesize a fake first user prompt
- wrapper startup should not print noisy `ExperimentalWarning` lines

## Release notes must include

- changed interfaces
- migration notes for hot SQLite schema
- context routing or continuity behavior changes
- compactor defaults or auto-compaction changes
- cold adapter behavior changes
- benchmark deltas
- any new safety or bypass rules
- installation or shell integration changes
