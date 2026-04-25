#!/usr/bin/env bash
# Bun-compile the FinalRun CLI for all supported targets.
# Output: dist/binaries/finalrun-<os>-<arch>[.exe]
#
# Requires: bun (https://bun.sh)
#
# Usage: scripts/build-binary.sh [target1 target2 ...]
#   With no args, builds all four targets.
#   Pass specific targets to build only those, e.g.:
#     scripts/build-binary.sh bun-darwin-arm64

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v bun >/dev/null 2>&1; then
  echo "✖ bun not installed. Install from https://bun.sh and re-run."
  exit 1
fi

VERSION=$(node -p "require('./packages/cli/package.json').version")

ALL_TARGETS=(
  bun-darwin-arm64
  bun-darwin-x64
  bun-linux-x64
  bun-linux-arm64
)

if [ "$#" -eq 0 ]; then
  TARGETS=("${ALL_TARGETS[@]}")
else
  TARGETS=("$@")
fi

OUT_DIR="$ROOT/dist/binaries"
mkdir -p "$OUT_DIR"

# Ensure the workspace deps are built so cloud-core/common dist files exist.
echo "[build-binary] Building workspace dist files..."
npm run build --workspace=@finalrun/common --workspace=@finalrun/cloud-core --workspace=@finalrun/finalrun-agent >/dev/null 2>&1

for target in "${TARGETS[@]}"; do
  os_arch="${target#bun-}"  # darwin-arm64, etc.
  ext=""
  case "$os_arch" in
    windows-*) ext=".exe" ;;
  esac
  out="$OUT_DIR/finalrun-${os_arch}${ext}"

  echo "[build-binary] Compiling for ${target}..."
  bun build \
    --compile \
    --target="${target}" \
    --outfile "${out}" \
    packages/cli/bin/finalrun.ts

  size=$(du -h "$out" | cut -f1)
  sha=$(shasum -a 256 "$out" | cut -d' ' -f1)
  echo "  ✓ ${out}"
  echo "    size:   ${size}"
  echo "    sha256: ${sha}"
  echo "${sha}  $(basename "$out")" > "${out}.sha256"
done

echo ""
echo "✓ Built ${#TARGETS[@]} binary(ies) for finalrun ${VERSION}"
