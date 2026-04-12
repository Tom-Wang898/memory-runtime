# Contributing

## Development rules

- keep layers replaceable
- do not couple host adapters to provider internals
- fail-open behavior must survive refactors
- prefer small, measurable changes

## Before opening a PR

Run:

```bash
npm run check:all
```

Add benchmark output when you change:

- bootstrap assembly
- token budgeting
- cold recall behavior
- checkpoint merge logic
