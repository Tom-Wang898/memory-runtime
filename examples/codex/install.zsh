export MEMORY_RUNTIME_ROOT="$(cd -- "$(dirname -- "${(%):-%N}")/../.." && pwd)"
export MEMORY_RUNTIME_ENV_FILE="${MEMORY_RUNTIME_ENV_FILE:-$HOME/.memory-runtime/env.sh}"
if [[ -f "${MEMORY_RUNTIME_ENV_FILE}" ]]; then
  source "${MEMORY_RUNTIME_ENV_FILE}"
fi
export MEMORY_RUNTIME_COLD_PROVIDER="${MEMORY_RUNTIME_COLD_PROVIDER:-memory-palace}"
export MEMORY_RUNTIME_MP_BASE_URL="${MEMORY_RUNTIME_MP_BASE_URL:-http://127.0.0.1:18000}"
export MEMORY_RUNTIME_MP_PROMOTION_DOMAIN="${MEMORY_RUNTIME_MP_PROMOTION_DOMAIN:-projects}"
export MEMORY_RUNTIME_MP_AUTOSTART="${MEMORY_RUNTIME_MP_AUTOSTART:-0}"

hmctl() {
  "${MEMORY_RUNTIME_ROOT}/bin/hmctl" "$@"
}

memory_runtime_bridge() {
  "${MEMORY_RUNTIME_ROOT}/bin/memory-runtime-bridge" "$@"
}

codex_raw() {
  command codex "$@"
}

codex() {
  "${MEMORY_RUNTIME_ROOT}/bin/codex-memory-runtime" "$@"
}

claude_raw() {
  command claude "$@"
}

claude() {
  "${MEMORY_RUNTIME_ROOT}/bin/claude-memory-runtime" "$@"
}

gemini_raw() {
  command gemini "$@"
}

gemini() {
  "${MEMORY_RUNTIME_ROOT}/bin/gemini-memory-runtime" "$@"
}
