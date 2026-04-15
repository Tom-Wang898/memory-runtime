# Codex App Integration

`memory-runtime` integrates with `codex cli` and `codex app` through different
entry paths.

## Why app integration is different

- `codex cli` can be wrapped before the session starts
- `codex app` does not expose the same shell-wrapper bootstrap hook
- the app does share `~/.codex/config.toml`, MCP servers, `AGENTS.md`, and skills

So the app path should use:

- `memory-runtime` MCP tools
- `AGENTS.md` rules that call those tools automatically

Not:

- shell-wrapper prompt injection

## App-compatible tool surface

The `memory-runtime-mcp` server exposes:

- `memory_bootstrap`
- `memory_checkpoint`
- `memory_search`
- `memory_project_state`

If the app workspace is a multi-project root, pass `projectHint` with the real
target project name or slug so the MCP layer can resolve the correct child
project instead of the workspace container.

These tools reuse the same project identity, bootstrap, risk-gating, and
checkpoint logic as the CLI runtime.

## Recommended config

Add a new MCP server entry without replacing existing `memory-palace` config:

```toml
[mcp_servers.memory-runtime]
type = "stdio"
command = "/absolute/path/to/memory-runtime/bin/memory-runtime-mcp"
startup_timeout_sec = 20.0
tool_timeout_sec = 120.0
```

Keep your existing `memory-palace` MCP server. `memory-runtime` sits above it
and reuses the same cold-memory backend.

## Recommended AGENTS behavior

When running inside `codex app`:

1. call `memory_project_state`
2. if project memory exists, call `memory_bootstrap`
3. if the workspace contains multiple real projects, pass `projectHint`
4. use `backgroundSummary` and `backgroundPoints` for stable project background
5. do not use `currentFocus` or `recentProgress` when the user asks what is already known about the project
6. for \"what do you already know\" prompts, do not write memory first and do not continue execution unless the user explicitly asks to proceed
7. only call `memory_checkpoint` when the task state changes, a new decision is made, an open loop appears, or the user explicitly asks to record it
8. for short references like `this`, `that`, `route A`, call `memory_search`
9. when the user asks a new standalone question, do not replay the previous answer unless the user explicitly asks for a recap or continuation

## Validation checklist

1. `codex_raw mcp list` shows `memory-runtime` as enabled
2. `memory-runtime-mcp` responds to `initialize`
3. open `codex app <project-path>`
4. start a real task in a project with existing `digest/current`
5. confirm the model first checks project memory before deeper work
6. finish a task and confirm a new checkpoint is written

## Failure behavior

App integration must stay fail-open.

If `memory-runtime` MCP is unavailable:

- the app should still operate normally
- project rules should fall back to existing digest/anchor guidance
- no memory tool failure should block user work
