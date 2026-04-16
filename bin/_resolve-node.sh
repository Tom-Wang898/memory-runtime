#!/usr/bin/env bash
set -euo pipefail

resolve_memory_runtime_node() {
  if [[ -n "${MEMORY_RUNTIME_NODE_BIN:-}" && -x "${MEMORY_RUNTIME_NODE_BIN}" ]]; then
    printf '%s\n' "${MEMORY_RUNTIME_NODE_BIN}"
    return 0
  fi

  if command -v node >/dev/null 2>&1; then
    command -v node
    return 0
  fi

  local candidate=""
  local nvm_root="${HOME}/.nvm/versions/node"
  if [[ -d "${nvm_root}" ]]; then
    while IFS= read -r candidate; do
      if [[ -x "${candidate}" ]]; then
        printf '%s\n' "${candidate}"
        return 0
      fi
    done < <(find "${nvm_root}" -maxdepth 3 -type f -path '*/bin/node' | sort -r)
  fi

  for candidate in \
    "/opt/homebrew/bin/node" \
    "/usr/local/bin/node" \
    "/usr/bin/node"
  do
    if [[ -x "${candidate}" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done

  cat >&2 <<'EOF'
memory-runtime could not find a usable node binary.
Set MEMORY_RUNTIME_NODE_BIN to an absolute node path, or install Node.js in a standard location.
EOF
  return 127
}
