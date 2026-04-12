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
```

## Release notes must include

- changed interfaces
- migration notes for hot SQLite schema
- cold adapter behavior changes
- benchmark deltas
- any new safety or bypass rules
- installation or shell integration changes
