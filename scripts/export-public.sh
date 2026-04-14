#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

if [[ $# -eq 0 ]]; then
  cat <<'EOF'
Usage:
  ./scripts/export-public.sh --profile <name> --source <dir> --output <dir> [--dry-run]

Examples:
  ./scripts/export-public.sh \
    --profile codex-project-memory \
    --source "$HOME/Documents/codex" \
    --output /tmp/codex-public-export \
    --dry-run

  ./scripts/export-public.sh \
    --profile memory-palace-project-tools \
    --source "$HOME/Documents/Memory-Palace" \
    --output /tmp/memory-palace-public-export
EOF
  exit 0
fi

exec "${PROJECT_ROOT}/bin/hmctl" public-export "$@"
