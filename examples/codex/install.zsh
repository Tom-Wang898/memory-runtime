export MEMORY_RUNTIME_ROOT="$(cd -- "$(dirname -- "${(%):-%N}")/../.." && pwd)"
export MEMORY_RUNTIME_ENV_FILE="${MEMORY_RUNTIME_ENV_FILE:-$HOME/.memory-runtime/env.sh}"
if [[ -f "${MEMORY_RUNTIME_ENV_FILE}" ]]; then
  source "${MEMORY_RUNTIME_ENV_FILE}"
fi
export MEMORY_RUNTIME_COLD_PROVIDER="${MEMORY_RUNTIME_COLD_PROVIDER:-memory-palace}"
export MEMORY_RUNTIME_MP_BASE_URL="${MEMORY_RUNTIME_MP_BASE_URL:-http://127.0.0.1:18000}"
export MEMORY_RUNTIME_MP_PROMOTION_DOMAIN="${MEMORY_RUNTIME_MP_PROMOTION_DOMAIN:-projects}"
export MEMORY_RUNTIME_MP_AUTOSTART="${MEMORY_RUNTIME_MP_AUTOSTART:-0}"
export MEMORY_RUNTIME_AUTO_COMPACT="${MEMORY_RUNTIME_AUTO_COMPACT:-1}"
export MEMORY_RUNTIME_COMPACT_MIN_INTERVAL_SEC="${MEMORY_RUNTIME_COMPACT_MIN_INTERVAL_SEC:-1800}"

hmctl() {
  "${MEMORY_RUNTIME_ROOT}/bin/hmctl" "$@"
}

memory_runtime_bridge() {
  "${MEMORY_RUNTIME_ROOT}/bin/memory-runtime-bridge" "$@"
}

memory_runtime_project_root() {
  git -C "${1:-$PWD}" rev-parse --show-toplevel 2>/dev/null || printf '%s\n' "${1:-$PWD}"
}

memory_runtime_should_prime() {
  case "${1:-}" in
    ""|*/.git|*/node_modules|*/dist|*/build|*/coverage|*/test-results)
      return 1
      ;;
    *)
      return 0
      ;;
  esac
}

memory_runtime_prime() {
  local root
  root="$(memory_runtime_project_root "${1:-$PWD}")"
  memory_runtime_should_prime "${root}" || return 0
  (
    "${MEMORY_RUNTIME_ROOT}/bin/hmctl" primer \
      --cwd "${root}" \
      --mode warm \
      --max-age-sec 900 >/dev/null 2>&1
  ) &!
}

memory_runtime_compact_if_due() {
  local root stamp_dir stamp_file now last_run min_interval sanitized_root
  [[ "${MEMORY_RUNTIME_AUTO_COMPACT:-1}" == "0" ]] && return 0
  root="$(memory_runtime_project_root "${1:-$PWD}")"
  memory_runtime_should_prime "${root}" || return 0
  stamp_dir="$HOME/.memory-runtime/compact-stamps"
  mkdir -p "${stamp_dir}"
  sanitized_root="${root//\//_}"
  sanitized_root="${sanitized_root//:/_}"
  sanitized_root="${sanitized_root// /_}"
  stamp_file="${stamp_dir}/${sanitized_root}.stamp"
  now="$(date +%s)"
  min_interval="${MEMORY_RUNTIME_COMPACT_MIN_INTERVAL_SEC:-1800}"
  if [[ -f "${stamp_file}" ]]; then
    last_run="$(cat "${stamp_file}" 2>/dev/null || printf '0')"
  else
    last_run="0"
  fi
  if [[ $((now - last_run)) -lt ${min_interval} ]]; then
    return 0
  fi
  printf '%s\n' "${now}" >| "${stamp_file}"
  (
    "${MEMORY_RUNTIME_ROOT}/bin/hmctl" compact \
      --cwd "${root}" \
      --update-primer >/dev/null 2>&1
  ) &!
}

memory_runtime_refresh() {
  memory_runtime_prime "${1:-$PWD}"
  memory_runtime_compact_if_due "${1:-$PWD}"
}

if [[ -n "${ZSH_VERSION:-}" ]]; then
  autoload -Uz add-zsh-hook 2>/dev/null || true
  if whence add-zsh-hook >/dev/null 2>&1; then
    add-zsh-hook chpwd memory_runtime_refresh
    memory_runtime_refresh "$PWD"
  fi
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
