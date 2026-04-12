# Claude integration example

The Claude adapter exists to prove host-layer replaceability without coupling
memory-core to one CLI host.

Recommended install:

```bash
./scripts/install-shell-integration.sh --shell zsh
source ~/.zshrc
```

Runtime pattern:

- use a wrapper or supported hook at session start
- call `hmctl bootstrap`
- inject the rendered bootstrap envelope
- record a checkpoint when the session ends
