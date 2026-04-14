#!/usr/bin/env bash
set -euo pipefail

bundle_root=""
target_root=""
force=0

usage() {
  cat <<'EOF'
Usage:
  ./scripts/install-memory-palace-project-tools.sh \
    --bundle <public-export-dir> \
    --target <memory-palace-checkout> \
    [--force]

Options:
  --bundle <dir>   Sanitized bundle produced by hmctl public-export
  --target <dir>   Target Memory Palace checkout
  --force          Allow overwrite without extra prompt
  --help           Show this message
EOF
}

while (($# > 0)); do
  case "$1" in
    --bundle)
      bundle_root="${2:-}"
      shift 2
      ;;
    --target)
      target_root="${2:-}"
      shift 2
      ;;
    --force)
      force=1
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

if [[ -z "${bundle_root}" || -z "${target_root}" ]]; then
  echo "Both --bundle and --target are required." >&2
  usage >&2
  exit 1
fi

bundle_root="$(cd -- "${bundle_root}" && pwd)"
target_root="$(cd -- "${target_root}" && pwd)"
manifest_path="${bundle_root}/PUBLIC_EXPORT_MANIFEST.json"

if [[ ! -f "${manifest_path}" ]]; then
  echo "Missing bundle manifest: ${manifest_path}" >&2
  exit 1
fi

if [[ ! -d "${target_root}/backend" ]]; then
  echo "Target does not look like a Memory Palace checkout: ${target_root}" >&2
  exit 1
fi

if ! python3 - "${manifest_path}" <<'PY'
import json
import sys
from pathlib import Path

manifest = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
profile = str(manifest.get("profile") or "")
if profile != "memory-palace-project-tools":
    raise SystemExit(1)
PY
then
  echo "Bundle profile must be memory-palace-project-tools." >&2
  exit 1
fi

mapfile -t files < <(python3 - "${manifest_path}" <<'PY'
import json
import sys
from pathlib import Path

manifest = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
for item in manifest.get("files", []):
    path = str(item.get("path") or "").strip()
    if path:
        print(path)
PY
)

if [[ "${#files[@]}" -eq 0 ]]; then
  echo "Bundle manifest contains no files." >&2
  exit 1
fi

if [[ "${force}" -ne 1 ]]; then
  echo "Install project-memory backend tools into:"
  echo "  ${target_root}"
  echo
  echo "Files:"
  for relative_path in "${files[@]}"; do
    echo "  - ${relative_path}"
  done
  echo
  read -r -p "Continue? [y/N] " reply
  if [[ ! "${reply}" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
  fi
fi

for relative_path in "${files[@]}"; do
  source_path="${bundle_root}/${relative_path}"
  target_path="${target_root}/${relative_path}"
  if [[ ! -f "${source_path}" ]]; then
    echo "Missing file in bundle: ${source_path}" >&2
    exit 1
  fi
  mkdir -p "$(dirname -- "${target_path}")"
  cp "${source_path}" "${target_path}"
done

cat <<EOF
Installed Memory Palace project tools from:
  ${bundle_root}

Into target checkout:
  ${target_root}

Next step:
  cd "${target_root}/backend"
  .venv/bin/python -m pytest tests/test_project_memory_optimizer.py -q
EOF
