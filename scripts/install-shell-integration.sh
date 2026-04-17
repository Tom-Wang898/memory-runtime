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

if [[ "${shell_name}" == "zsh" ]]; then
  primer_async_operator='&!'
else
  primer_async_operator='&'
fi

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
export MEMORY_RUNTIME_AUTO_COMPACT="\${MEMORY_RUNTIME_AUTO_COMPACT:-1}"
export MEMORY_RUNTIME_COMPACT_MIN_INTERVAL_SEC="\${MEMORY_RUNTIME_COMPACT_MIN_INTERVAL_SEC:-1800}"

hmctl() {
  "\${MEMORY_RUNTIME_ROOT}/bin/hmctl" "\$@"
}

memory_runtime_bridge() {
  "\${MEMORY_RUNTIME_ROOT}/bin/memory-runtime-bridge" "\$@"
}

memory_runtime_project_root() {
  git -C "\${1:-\$PWD}" rev-parse --show-toplevel 2>/dev/null || printf '%s\n' "\${1:-\$PWD}"
}

memory_runtime_should_prime() {
  case "\${1:-}" in
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
  root="\$(memory_runtime_project_root "\${1:-\$PWD}")"
  memory_runtime_should_prime "\${root}" || return 0
  (
    "\${MEMORY_RUNTIME_ROOT}/bin/hmctl" primer \
      --cwd "\${root}" \
      --mode warm \
      --max-age-sec 900 >/dev/null 2>&1
  ) ${primer_async_operator}
}

memory_runtime_compact_if_due() {
  local root stamp_dir stamp_file now last_run min_interval sanitized_root
  [[ "\${MEMORY_RUNTIME_AUTO_COMPACT:-1}" == "0" ]] && return 0
  root="\$(memory_runtime_project_root "\${1:-\$PWD}")"
  memory_runtime_should_prime "\${root}" || return 0
  stamp_dir="\$HOME/.memory-runtime/compact-stamps"
  mkdir -p "\${stamp_dir}"
  sanitized_root="\${root//\//_}"
  sanitized_root="\${sanitized_root//:/_}"
  sanitized_root="\${sanitized_root// /_}"
  stamp_file="\${stamp_dir}/\${sanitized_root}.stamp"
  now="\$(date +%s)"
  min_interval="\${MEMORY_RUNTIME_COMPACT_MIN_INTERVAL_SEC:-1800}"
  if [[ -f "\${stamp_file}" ]]; then
    last_run="\$(cat "\${stamp_file}" 2>/dev/null || printf '0')"
  else
    last_run="0"
  fi
  if [[ \$((now - last_run)) -lt \${min_interval} ]]; then
    return 0
  fi
  printf '%s\n' "\${now}" >| "\${stamp_file}"
  (
    "\${MEMORY_RUNTIME_ROOT}/bin/hmctl" compact \
      --cwd "\${root}" \
      --update-primer >/dev/null 2>&1
  ) ${primer_async_operator}
}

memory_runtime_refresh() {
  memory_runtime_prime "\${1:-\$PWD}"
  memory_runtime_compact_if_due "\${1:-\$PWD}"
}

if [[ -n "\${ZSH_VERSION:-}" && -z "\${MEMORY_RUNTIME_ZSH_PRIMER_HOOK:-}" ]]; then
  export MEMORY_RUNTIME_ZSH_PRIMER_HOOK=1
  autoload -Uz add-zsh-hook 2>/dev/null || true
  if whence add-zsh-hook >/dev/null 2>&1; then
    add-zsh-hook chpwd memory_runtime_refresh
    memory_runtime_refresh "\$PWD"
  fi
fi

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
