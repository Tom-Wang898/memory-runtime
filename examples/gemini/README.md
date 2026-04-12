# Gemini integration example

Gemini uses the same host-wrapper pattern as Codex and Claude.

Recommended install:

```bash
./scripts/install-shell-integration.sh --shell zsh
source ~/.zshrc
```

Runtime flow:

- wrapper loads a compact bootstrap from `hmctl`
- the original prompt stays intact
- the wrapper records a lightweight checkpoint after the command exits
