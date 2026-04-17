# Codex integration example

Codex should stay native.

Use `AGENTS + hmctl`, not a startup MCP dependency and not a `codex` shell wrapper.

Why:

- this avoids startup regressions and MCP timeout noise
- `hmctl primer` is smaller than full bootstrap, so repeated project turns cost fewer tokens
- `hmctl bootstrap` stays available as the higher-fidelity fallback when the task actually needs it

Runtime flow:

```text
native codex session
-> AGENTS rule resolves the real project root
-> hmctl primer --cwd <project> --mode warm
-> if needed, hmctl bootstrap --cwd <project> --mode warm --query "<request>"
-> use the result as supplemental background only
-> hmctl checkpoint when task state changes
```

Recommended install:

```bash
./scripts/install-shell-integration.sh --shell zsh
source ~/.zshrc
```

That gives you `hmctl`, background primer warming on directory change, and leaves
`codex` itself untouched.
