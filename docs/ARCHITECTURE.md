# Architecture

## Objective

Build a memory runtime that saves tokens without distorting user intent.

The runtime must:

- preserve the raw user request
- inject only small, stable background context
- degrade gracefully when hot or cold memory is unavailable
- keep the host integration separate from storage implementations

## Layering

### 1. Host adapter

The host adapter is the only layer that knows how a CLI session starts,
receives bootstrap context, and emits checkpoints.

Examples:

- Codex wrapper
- Claude hook integration
- Gemini wrapper

### 2. Memory core

The core owns contracts and routing policy:

- bootstrap mode selection
- token budget resolution
- hot-first / cold-second lookup order
- ambiguous short-reference anchoring and suppression
- conflict handling
- fail-open rules

### 3. Hot provider

The hot provider stores the fast local project state:

- project capsule
- active task
- recent decisions
- open loops
- working set

Hot memory must stay small, local, and cheap to update.

### 4. Cold provider

The cold provider handles durable recall and promotion.

The first adapter targets Memory Palace, but the interface is intentionally
generic so that another cold memory system can replace it later.

## Runtime flow

```text
session start
-> host adapter asks memory-core for bootstrap
-> memory-core reads hot capsule
-> memory-core optionally asks cold provider for gist/facts
-> host adapter injects compact bootstrap into the CLI

session progress
-> host adapter emits checkpoints
-> hot provider updates active task, working set, open loops

session end or milestone
-> memory-core decides whether to promote
-> cold provider writes durable summary
```

## Performance budgets

- hot lookup target: under 50 ms
- capsule assembly target: under 120 ms
- cold recall timeout target: 200 to 500 ms
- default bootstrap budget: 900 target tokens, 1400 hard cap

If a step misses budget, the runtime must downgrade to a smaller bootstrap
instead of blocking the CLI.

## Safety rules

- Raw user input is never rewritten by the runtime
- Hot memory adds context, it does not replace the request
- Current task constraints are not lossy-compressed by default
- If memory confidence is low, the runtime injects less, not more
- If a short query is ambiguous, cold recall is anchored or suppressed
- Failures in any provider must not block the host session
