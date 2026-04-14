## Memory Runtime App Rules

- In Codex app, call `memory_project_state` before deeper work.
- If project memory exists, call `memory_bootstrap`.
- If the current cwd is a multi-project workspace, pass `projectHint`.
- For "what do you already know" style prompts:
  - read memory first
  - answer only from `backgroundSummary` and `backgroundPoints`
  - do not use `currentFocus` or `recentProgress`
  - do not write `memory_checkpoint` first
  - stop after answering unless the user explicitly asks to continue
- Use `memory_search` for short references such as `this`, `that`, or `route A`.
- Call `memory_checkpoint` only when task state actually changes.
