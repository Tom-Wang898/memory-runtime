#!/usr/bin/env bash
set -euo pipefail

DEFAULT_INSTALL_ROOT="${HOME}/.memory-runtime/vendors/memory-palace-backend"
DEFAULT_RUNTIME_ENV_FILE="${HOME}/.memory-runtime/env.sh"
DEFAULT_BACKEND_PORT="${MEMORY_PALACE_BACKEND_PORT:-18000}"
DEFAULT_BACKEND_IMAGE="${MEMORY_PALACE_BACKEND_IMAGE:-ghcr.io/agi-is-going-to-arrive/memory-palace-backend:latest}"

install_root="${DEFAULT_INSTALL_ROOT}"
runtime_env_file="${DEFAULT_RUNTIME_ENV_FILE}"
backend_port="${DEFAULT_BACKEND_PORT}"
backend_image="${DEFAULT_BACKEND_IMAGE}"
compose_project_name="memory-palace-runtime"
allow_insecure_local=0
api_key="${MEMORY_RUNTIME_MP_API_KEY:-}"
start_stack=1
runtime_block_start="# memory-runtime-cold-memory:start"
runtime_block_end="# memory-runtime-cold-memory:end"

usage() {
  cat <<'USAGE'
Usage:
  ./scripts/install-memory-palace-docker.sh [options]

Options:
  --install-root <dir>       Target directory for docker assets
  --runtime-env-file <path>  Shell env file consumed by memory-runtime wrappers
  --backend-port <port>      Host port for Memory Palace backend (default: 18000)
  --backend-image <image>    Container image
  --compose-project <name>   Docker compose project name
  --api-key <key>            Explicit MCP API key
  --allow-insecure-local     Use loopback-only insecure local access instead of API key
  --no-start                 Generate files only, do not run docker compose
  --help                     Show this message
USAGE
}

generate_random_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24 | tr -d '\r\n'
    return 0
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import secrets; print(secrets.token_hex(24))'
    return 0
  fi
  echo "Failed to generate API key: need openssl or python3." >&2
  exit 1
}

is_positive_int() {
  [[ "$1" =~ ^[0-9]+$ ]] && [[ "$1" -ge 1 ]] && [[ "$1" -le 65535 ]]
}

wait_for_backend() {
  local url="$1"
  local attempts=30
  local attempt=1

  if ! command -v curl >/dev/null 2>&1; then
    return 0
  fi

  for ((attempt = 1; attempt <= attempts; attempt++)); do
    if curl -fsS "${url}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done

  return 1
}

while (($# > 0)); do
  case "$1" in
    --install-root)
      install_root="${2:-}"
      shift 2
      ;;
    --runtime-env-file)
      runtime_env_file="${2:-}"
      shift 2
      ;;
    --backend-port)
      backend_port="${2:-}"
      shift 2
      ;;
    --backend-image)
      backend_image="${2:-}"
      shift 2
      ;;
    --compose-project)
      compose_project_name="${2:-}"
      shift 2
      ;;
    --api-key)
      api_key="${2:-}"
      shift 2
      ;;
    --allow-insecure-local)
      allow_insecure_local=1
      shift
      ;;
    --no-start)
      start_stack=0
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if ! is_positive_int "${backend_port}"; then
  echo "Invalid backend port: ${backend_port}" >&2
  exit 1
fi

if [[ "${allow_insecure_local}" -eq 1 && -n "${api_key}" ]]; then
  echo "Use either --api-key or --allow-insecure-local, not both." >&2
  exit 1
fi

if [[ "${allow_insecure_local}" -eq 0 && -z "${api_key}" ]]; then
  api_key="$(generate_random_hex)"
fi

mkdir -p "${install_root}"
mkdir -p "$(dirname -- "${runtime_env_file}")"

compose_file="${install_root}/docker-compose.yml"
container_env_file="${install_root}/.env.docker"
data_volume="${compose_project_name}_data"
snapshots_volume="${compose_project_name}_snapshots"

cat > "${compose_file}" <<EOF
services:
  backend:
    image: ${backend_image}
    pull_policy: missing
    env_file:
      - ./.env.docker
    volumes:
      - memory_palace_data:/app/data
      - memory_palace_snapshots:/app/snapshots
    extra_hosts:
      - "host.docker.internal:host-gateway"
    ports:
      - "${backend_port}:8000"
    security_opt:
      - no-new-privileges:true
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3).read()"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 10s
    restart: unless-stopped

volumes:
  memory_palace_data:
    name: ${data_volume}
  memory_palace_snapshots:
    name: ${snapshots_volume}
EOF

cat > "${container_env_file}" <<EOF
DATABASE_URL=sqlite+aiosqlite:////app/data/memory_palace.db
VALID_DOMAINS=core,projects,notes
SEARCH_DEFAULT_MODE=hybrid
RETRIEVAL_EMBEDDING_BACKEND=hash
RETRIEVAL_EMBEDDING_MODEL=hash-v1
RETRIEVAL_EMBEDDING_DIM=64
RETRIEVAL_RERANKER_ENABLED=false
RUNTIME_INDEX_WORKER_ENABLED=true
RUNTIME_INDEX_DEFER_ON_WRITE=true
RUNTIME_SESSION_FIRST_SEARCH=true
RUNTIME_AUTO_FLUSH_ENABLED=true
MCP_API_KEY=${api_key}
MCP_API_KEY_ALLOW_INSECURE_LOCAL=$([[ "${allow_insecure_local}" -eq 1 ]] && printf 'true' || printf 'false')
EOF

touch "${runtime_env_file}"
runtime_temp_file="$(mktemp)"

awk -v start="${runtime_block_start}" -v end="${runtime_block_end}" '
  $0 == start { skip = 1; next }
  $0 == end { skip = 0; next }
  !skip { print }
' "${runtime_env_file}" > "${runtime_temp_file}"

cat >> "${runtime_temp_file}" <<EOF

${runtime_block_start}
export MEMORY_RUNTIME_COLD_PROVIDER="memory-palace"
export MEMORY_RUNTIME_MP_BASE_URL="http://127.0.0.1:${backend_port}"
export MEMORY_RUNTIME_MP_API_KEY_MODE="header"
export MEMORY_RUNTIME_MP_PROMOTION_DOMAIN="projects"
export MEMORY_RUNTIME_MP_AUTOSTART="0"
EOF

if [[ "${allow_insecure_local}" -eq 1 ]]; then
  cat >> "${runtime_temp_file}" <<'EOF'
unset MEMORY_RUNTIME_MP_API_KEY
EOF
else
  cat >> "${runtime_temp_file}" <<EOF
export MEMORY_RUNTIME_MP_API_KEY="${api_key}"
EOF
fi

cat >> "${runtime_temp_file}" <<EOF
${runtime_block_end}
EOF

mv "${runtime_temp_file}" "${runtime_env_file}"

if [[ "${start_stack}" -eq 1 ]]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "docker is required to start the cold-memory backend." >&2
    exit 1
  fi
  docker compose -f "${compose_file}" -p "${compose_project_name}" up -d
  if ! wait_for_backend "http://127.0.0.1:${backend_port}/health"; then
    echo "Memory Palace backend did not become healthy in time." >&2
    echo "Check logs with:" >&2
    echo "  docker compose -f ${compose_file} -p ${compose_project_name} logs backend" >&2
    exit 1
  fi
fi

cat <<EOF
Memory Palace backend assets written to:
  ${install_root}

memory-runtime env file written to:
  ${runtime_env_file}

Next step:
  source "${runtime_env_file}"

Backend health URL:
  http://127.0.0.1:${backend_port}/health

Manage the backend with:
  docker compose -f "${compose_file}" -p "${compose_project_name}" up -d
  docker compose -f "${compose_file}" -p "${compose_project_name}" logs backend
  docker compose -f "${compose_file}" -p "${compose_project_name}" down
EOF

if [[ "${runtime_env_file}" != "${DEFAULT_RUNTIME_ENV_FILE}" ]]; then
  cat <<EOF

Custom runtime env file detected.
Make sure your shell integration points to it:
  export MEMORY_RUNTIME_ENV_FILE="${runtime_env_file}"
EOF
fi
