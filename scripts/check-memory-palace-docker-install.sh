#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
INSTALL_ROOT="$(mktemp -d)"
RUNTIME_ENV_FILE="$(mktemp)"

cleanup() {
  rm -rf "${INSTALL_ROOT}" >/dev/null 2>&1 || true
  rm -f "${RUNTIME_ENV_FILE}" >/dev/null 2>&1 || true
}

trap cleanup EXIT

"${PROJECT_ROOT}/scripts/install-memory-palace-docker.sh" \
  --install-root "${INSTALL_ROOT}" \
  --runtime-env-file "${RUNTIME_ENV_FILE}" \
  --backend-port 18080 \
  --no-start \
  >/dev/null

grep -q 'VALID_DOMAINS=core,projects,notes' "${INSTALL_ROOT}/.env.docker"
grep -q 'MCP_API_KEY=' "${INSTALL_ROOT}/.env.docker"
grep -q '18080:8000' "${INSTALL_ROOT}/docker-compose.yml"
grep -q 'export MEMORY_RUNTIME_MP_BASE_URL="http://127.0.0.1:18080"' "${RUNTIME_ENV_FILE}"
grep -q 'export MEMORY_RUNTIME_MP_PROMOTION_DOMAIN="projects"' "${RUNTIME_ENV_FILE}"

echo "Memory Palace docker install check passed."
