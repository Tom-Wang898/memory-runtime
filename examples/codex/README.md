# Codex integration example

Codex should use a wrapper, not MCP-only bootstrap.

Why:

- wrappers are deterministic
- bootstrap happens before the session starts
- token budget can be enforced without depending on model tool choice

Runtime flow:

```text
codex wrapper
-> hmctl bootstrap --cwd <project> --host codex
-> render host-safe bootstrap text
-> launch codex with the compact bootstrap envelope
```

Recommended install:

```bash
./scripts/install-shell-integration.sh --shell zsh
source ~/.zshrc
```

MCP remains useful for:

- manual inspection
- ad hoc cold recall
- promotion debug

It is not the primary automatic bootstrap channel.
