#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
TEMP_RC="$(mktemp)"
trap 'rm -f "${TEMP_RC}"' EXIT

"${PROJECT_ROOT}/scripts/install-shell-integration.sh" --shell zsh --rc-file "${TEMP_RC}" >/dev/null

grep -q '^# memory-runtime:start$' "${TEMP_RC}"
grep -q 'hmctl()' "${TEMP_RC}"
grep -q 'memory_runtime_bridge()' "${TEMP_RC}"
grep -q 'memory_runtime_prime()' "${TEMP_RC}"
grep -q 'memory_runtime_compact_if_due()' "${TEMP_RC}"
grep -q 'memory_runtime_refresh()' "${TEMP_RC}"
grep -q 'add-zsh-hook chpwd memory_runtime_refresh' "${TEMP_RC}"
grep -q 'bin/claude-memory-runtime' "${TEMP_RC}"
grep -q 'bin/gemini-memory-runtime' "${TEMP_RC}"
grep -q 'MEMORY_RUNTIME_ENV_FILE' "${TEMP_RC}"
grep -q 'MEMORY_RUNTIME_AUTO_COMPACT' "${TEMP_RC}"

if grep -q 'bin/codex-memory-runtime' "${TEMP_RC}" || grep -q '^codex() {' "${TEMP_RC}"; then
  echo "Shell installer should not override native codex." >&2
  exit 1
fi

"${PROJECT_ROOT}/scripts/install-shell-integration.sh" --shell zsh --rc-file "${TEMP_RC}" >/dev/null

start_count="$(grep -c '^# memory-runtime:start$' "${TEMP_RC}")"
end_count="$(grep -c '^# memory-runtime:end$' "${TEMP_RC}")"

if [[ "${start_count}" != "1" || "${end_count}" != "1" ]]; then
  echo "Shell installer block is not idempotent." >&2
  exit 1
fi

echo "Shell install check passed."
