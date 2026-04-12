# Safety

## Non-negotiable rules

- Raw user input is never rewritten by the runtime
- Background context is additive only
- High-risk requests reduce background injection instead of increasing it
- Cold recall has a hard timeout and fail-open behavior
- Promotion writes are explicit and scoped

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
