# Codex App Integration

The full `memory-runtime` server should not sit on the Codex app startup path.

The supported MCP shape is a three-layer setup:

- `memory-hot` MCP: hot-only local SQLite access for quick state and continuity.
- `memory-palace` MCP: durable cold memory for explicit long-term recall and writes.
- `hmctl`: maintenance, compaction, routing, promotion, benchmarks, and diagnostics.

The stable route for both native `codex cli` and `codex app` is:

- keep Codex native
- optionally enable the hot-only `memory-hot` MCP
- teach the project to call `hmctl`
- use `hmctl context` as the default router
- fall back to explicit `primer / continuity / bootstrap` only when you need manual control

## Why this is the recommended path

- `codex app` does not expose a deterministic pre-session shell hook
- startup-critical MCP failures add latency and can block the session before real work starts
- `memory-hot` avoids this by never calling cold memory or Docker during startup
- `hmctl context` keeps the default path small and predictable
- `hmctl primer` is much smaller than a full bootstrap envelope, so repeated project turns cost fewer tokens
- `hmctl continuity` restores current route and constraints without paying full bootstrap cost
- `hmctl bootstrap` still uses the same runtime, hot memory, and cold memory stack when a richer answer is needed

## Optional hot MCP

Use this only for hot-state tools. Keep `MEMORY_RUNTIME_COLD_PROVIDER=none` in
the MCP env so it cannot trigger Memory Palace or Docker:

```toml
[mcp_servers.memory-hot]
type = "stdio"
command = "{{MEMORY_RUNTIME_ROOT}}/bin/memory-hot-mcp"
startup_timeout_sec = 5.0
tool_timeout_sec = 10.0
enabled = true

[mcp_servers.memory-hot.env]
HOME = "{{HOME}}"
MEMORY_RUNTIME_COLD_PROVIDER = "none"
```

Do not enable the full `memory-runtime` MCP as startup-critical:

```toml
[mcp_servers.memory-runtime]
enabled = false
```

## Recommended flow

1. Resolve the real project root.
   If the workspace is a multi-project container, do not use the container root.
2. On the first real project turn, run:

```bash
hmctl context --cwd "<project-root>" --query "<user request>"
```

3. The router should behave like this:

```bash
no query -> primer
continuation-style query -> continuity
deep-history query -> bootstrap
```

4. Treat the returned memory as supplemental background only.
5. Write a checkpoint only when task state really changes:

```bash
hmctl checkpoint --cwd "<project-root>" --summary "<stage summary>" --active-task "<current task>"
```

## Recommended AGENTS rules

Use a project rule block that says, in effect:

- keep `codex` native
- on the first real project turn, call `hmctl context`
- use explicit `hmctl primer` / `hmctl continuity` / `hmctl bootstrap` only when the route should be forced
- answer "what do you already know" prompts only from stable background information
- do not replay the previous answer when the user starts a new standalone question
- checkpoint only when state changes, a new decision is made, or the user explicitly asks to record memory

See `templates/AGENTS.memory.example.md` for a ready-to-merge example block.

## Config guidance

For the normal app path:

- do not add the full `memory-runtime` server as a startup-critical MCP server
- use `memory-hot` if you want MCP tools for local hot memory
- keep `codex` native
- use `templates/config.example.toml` only for profile and env examples
- if you already run `memory-palace`, keep it as the cold backend only

The goal is simple: memory should help the model, not become a second startup chain that can fail before the session begins.

## Validation checklist

1. Open `codex app <project-path>`.
2. Start a real task in a project that already has hot or cold memory.
3. Confirm the first memory read uses `hmctl context`, not a startup MCP dependency.
4. Confirm a continuation-style query routes to `hmctl continuity`.
5. Ask a query that needs richer historical context and confirm the fallback path uses `hmctl bootstrap`.
6. Finish a stage and confirm `hmctl checkpoint` writes once.
7. Ask a new unrelated question and confirm the model answers the current turn directly instead of replaying the last answer.

## Failure behavior

App integration must stay fail-open.

If `hmctl context`, `hmctl primer`, `hmctl continuity`, or `hmctl bootstrap` fails:

- Codex app should keep working normally
- the project should continue from live repository context
- no memory failure should block user work
