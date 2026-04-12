#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
BLOCK_START="# memory-runtime:start"
BLOCK_END="# memory-runtime:end"

shell_name="$(basename -- "${SHELL:-zsh}")"
target_rc=""

while (($# > 0)); do
  case "$1" in
    --shell)
      shell_name="${2:-}"
      shift 2
      ;;
    --rc-file)
      target_rc="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "${shell_name}" ]]; then
  shell_name="zsh"
fi

case "${shell_name}" in
  zsh)
    default_rc="${HOME}/.zshrc"
    ;;
  bash)
    default_rc="${HOME}/.bashrc"
    ;;
  *)
    echo "Unsupported shell: ${shell_name}. Use --shell zsh or --shell bash." >&2
    exit 1
    ;;
esac

if [[ -z "${target_rc}" ]]; then
  target_rc="${default_rc}"
fi

mkdir -p "$(dirname -- "${target_rc}")"
touch "${target_rc}"
temp_file="$(mktemp)"

awk -v start="${BLOCK_START}" -v end="${BLOCK_END}" '
  $0 == start { skip = 1; next }
  $0 == end { skip = 0; next }
  !skip { print }
' "${target_rc}" > "${temp_file}"

cat >> "${temp_file}" <<EOF

${BLOCK_START}
export MEMORY_RUNTIME_ROOT="${PROJECT_ROOT}"
export MEMORY_RUNTIME_ENV_FILE="\${MEMORY_RUNTIME_ENV_FILE:-\$HOME/.memory-runtime/env.sh}"
if [[ -f "\${MEMORY_RUNTIME_ENV_FILE}" ]]; then
  source "\${MEMORY_RUNTIME_ENV_FILE}"
fi
export MEMORY_RUNTIME_COLD_PROVIDER="\${MEMORY_RUNTIME_COLD_PROVIDER:-memory-palace}"
export MEMORY_RUNTIME_MP_BASE_URL="\${MEMORY_RUNTIME_MP_BASE_URL:-http://127.0.0.1:18000}"
export MEMORY_RUNTIME_MP_PROMOTION_DOMAIN="\${MEMORY_RUNTIME_MP_PROMOTION_DOMAIN:-projects}"
export MEMORY_RUNTIME_MP_AUTOSTART="\${MEMORY_RUNTIME_MP_AUTOSTART:-0}"

hmctl() {
  "\${MEMORY_RUNTIME_ROOT}/bin/hmctl" "\$@"
}

memory_runtime_bridge() {
  "\${MEMORY_RUNTIME_ROOT}/bin/memory-runtime-bridge" "\$@"
}

codex_raw() {
  command codex "\$@"
}

codex() {
  "\${MEMORY_RUNTIME_ROOT}/bin/codex-memory-runtime" "\$@"
}

claude_raw() {
  command claude "\$@"
}

claude() {
  "\${MEMORY_RUNTIME_ROOT}/bin/claude-memory-runtime" "\$@"
}

gemini_raw() {
  command gemini "\$@"
}

gemini() {
  "\${MEMORY_RUNTIME_ROOT}/bin/gemini-memory-runtime" "\$@"
}
${BLOCK_END}
EOF

mv "${temp_file}" "${target_rc}"

cat <<EOF
Installed memory-runtime shell integration into:
  ${target_rc}

Next step:
  source "${target_rc}"

Optional cold-memory autostart:
  export MEMORY_RUNTIME_MP_AUTOSTART=1
  export MEMORY_RUNTIME_MP_BACKEND_ROOT=/absolute/path/to/Memory-Palace/backend
EOF
