# Open Source Hygiene

## Safe to publish

- framework code
- adapters
- tests and benchmarks
- example configs
- architecture and safety docs

## Never publish

- real hot-memory databases
- real Memory Palace data or snapshots
- user conversation logs
- private API keys
- machine-specific shell history

## Release checklist

1. verify `.env.example` is generic
2. remove local debug paths from docs and code defaults
3. verify `LICENSE` is present
4. run `npm run check:all`
5. run benchmark scripts and attach results
6. verify `./scripts/install-shell-integration.sh` works on a clean shell profile
7. verify `./scripts/install-memory-palace-docker.sh --no-start` generates valid cold-memory assets
8. confirm no personal memory files are tracked
