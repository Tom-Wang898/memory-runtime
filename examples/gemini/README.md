# Gemini integration example

Gemini can still use a wrapped shell flow.

That is different from Codex, which should stay native and use `AGENTS + hmctl`.

Recommended install:

```bash
./scripts/install-shell-integration.sh --shell zsh
source ~/.zshrc
```

Runtime flow:

- wrapper loads a compact bootstrap from `hmctl`
- the original prompt stays intact
- the wrapper records a lightweight checkpoint after the command exits
