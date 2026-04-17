# Benchmarks

The runtime needs three benchmark families:

- latency: bootstrap and recall timing
- token savings: repeated-session compression value
- fidelity: whether implementation quality regresses after memory injection

No benchmark runner is included in the scaffold yet.
Current runners:

- `npm run bench:bootstrap`
- `npm run bench:tokens`
  - compares compact primer output, continuity output, full bootstrap envelope, and naive JSON-sized context
- `npm run bench:skills-governance`
