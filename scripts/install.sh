#!/usr/bin/env bash
# FinalRun installer
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/final-run/finalrun-agent/main/scripts/install.sh | bash
#
# Flags (after `bash -s --`):
#   --cloud-only      Skip local-dev setup. Install only the CLI binary.
#                     CI environments are auto-detected and treated as
#                     --cloud-only by default.
#   --full-setup      Force interactive local-dev setup even when TTY
#                     detection misfires.
#
# Env overrides:
#   FINALRUN_DIR              Install root (default: $HOME/.finalrun)
#   FINALRUN_VERSION          Version to pin (default: latest GitHub release)
#   FINALRUN_NON_INTERACTIVE  Set to skip all prompts (same as --cloud-only)

set -euo pipefail

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
RESET='\033[0m'

info()  { printf "${BOLD}%s${RESET}\n" "$*"; }
ok()    { printf "${GREEN}  ✓ %s${RESET}\n" "$*"; }
warn()  { printf "${YELLOW}  ⚠ %s${RESET}\n" "$*"; }
fail()  { printf "${RED}  ✗ %s${RESET}\n" "$*"; }

GITHUB_REPO="final-run/finalrun-agent"

# ---------------------------------------------------------------------------
# Arg parsing
# ---------------------------------------------------------------------------

CLOUD_ONLY=false
FULL_SETUP=false

for arg in "$@"; do
  case "$arg" in
    --cloud-only)  CLOUD_ONLY=true ;;
    --full-setup)  FULL_SETUP=true ;;
    *) fail "Unknown argument: $arg"; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Prereqs (binary install path needs only curl + tar)
# ---------------------------------------------------------------------------

for cmd in curl tar uname mkdir chmod; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    fail "$cmd not found. Please install $cmd and re-run."
    exit 1
  fi
done

# ---------------------------------------------------------------------------
# Detect platform
# ---------------------------------------------------------------------------

OS_RAW="$(uname -s)"
ARCH_RAW="$(uname -m)"

case "$OS_RAW" in
  Darwin*) OS=darwin ;;
  Linux*)  OS=linux ;;
  CYGWIN*|MINGW*|MSYS*) OS=windows ;;
  *) fail "Unsupported OS: $OS_RAW"; exit 1 ;;
esac

case "$ARCH_RAW" in
  x86_64|amd64) ARCH=x64 ;;
  arm64|aarch64) ARCH=arm64 ;;
  *) fail "Unsupported architecture: $ARCH_RAW"; exit 1 ;;
esac

PLATFORM="${OS}-${ARCH}"

# ---------------------------------------------------------------------------
# Resolve install dir + version
# ---------------------------------------------------------------------------

FINALRUN_DIR="${FINALRUN_DIR:-$HOME/.finalrun}"
mkdir -p "$FINALRUN_DIR/bin"

resolve_version() {
  if [ -n "${FINALRUN_VERSION:-}" ]; then
    echo "$FINALRUN_VERSION"
    return
  fi
  # Resolve "latest" by following the redirect from the latest-release URL.
  local redirect
  redirect=$(curl -fsSLI -o /dev/null -w '%{url_effective}' \
    "https://github.com/${GITHUB_REPO}/releases/latest" 2>/dev/null || true)
  if [ -z "$redirect" ]; then
    fail "Could not resolve the latest finalrun release. Set FINALRUN_VERSION explicitly."
    exit 1
  fi
  # URL ends with /tag/v0.1.7 — strip prefix to get the tag.
  echo "${redirect##*/tag/}" | sed 's/^v//'
}

VERSION=$(resolve_version)
TAG="v${VERSION}"

# ---------------------------------------------------------------------------
# Step 1: Always — install the CLI binary
# ---------------------------------------------------------------------------

info "FinalRun Installer (${VERSION})"
info "─────────────────────────────"
echo ""

ext=""
if [ "$OS" = "windows" ]; then ext=".exe"; fi
BIN_NAME="finalrun${ext}"
BIN_URL="https://github.com/${GITHUB_REPO}/releases/download/${TAG}/finalrun-${PLATFORM}${ext}"
BIN_DEST="$FINALRUN_DIR/bin/$BIN_NAME"
BIN_TMP="${BIN_DEST}.tmp"

info "Downloading finalrun binary for ${PLATFORM}..."
if ! curl --fail --location --progress-bar "$BIN_URL" -o "$BIN_TMP"; then
  fail "Failed to download $BIN_URL"
  rm -f "$BIN_TMP"
  exit 1
fi
chmod +x "$BIN_TMP"
mv "$BIN_TMP" "$BIN_DEST"

# macOS: drop the quarantine flag so Gatekeeper doesn't block the binary.
if [ "$OS" = "darwin" ]; then
  xattr -d com.apple.quarantine "$BIN_DEST" 2>/dev/null || true
fi

ok "Installed $BIN_DEST"

# Append PATH to common shell rcs (idempotent).
PATH_LINE="export PATH=\$PATH:$FINALRUN_DIR/bin"
for rc in "$HOME/.bashrc" "$HOME/.bash_profile" "${ZDOTDIR:-$HOME}/.zshrc"; do
  touch "$rc" 2>/dev/null || true
  if [ -f "$rc" ] && ! grep -qF "$FINALRUN_DIR/bin" "$rc" 2>/dev/null; then
    echo "$PATH_LINE" >> "$rc"
  fi
done

# ---------------------------------------------------------------------------
# Step 2: Decide — continue with local-dev setup?
# ---------------------------------------------------------------------------

is_interactive() {
  [ -z "${CI:-}" ] || return 1
  [ -z "${FINALRUN_NON_INTERACTIVE:-}" ] || return 1
  if ! exec 3</dev/tty 2>/dev/null; then
    return 1
  fi
  exec 3<&-
  return 0
}

# Reclaim stdin from the controlling terminal so prompts work even when
# the script was piped from curl. Only succeeds on real terminals.
exec </dev/tty 2>/dev/null || true

INTERACTIVE=false
if [ "$CLOUD_ONLY" = true ]; then
  INTERACTIVE=false
elif [ "$FULL_SETUP" = true ]; then
  INTERACTIVE=true
elif is_interactive; then
  INTERACTIVE=true
fi

if [ "$INTERACTIVE" = false ]; then
  echo ""
  ok "finalrun installed."
  echo ""
  info "For cloud commands you're done — try:"
  echo ""
  echo "    finalrun cloud test --help"
  echo ""
  info "For local test execution on this machine, re-run with --full-setup:"
  echo ""
  echo "    curl -fsSL https://raw.githubusercontent.com/${GITHUB_REPO}/main/scripts/install.sh | bash -s -- --full-setup"
  echo ""
  echo "Open a new terminal or run:  export PATH=\"\$PATH:$FINALRUN_DIR/bin\""
  exit 0
fi

# ---------------------------------------------------------------------------
# Step 3: Download + extract the runtime tarball
# ---------------------------------------------------------------------------

echo ""
info "── Downloading runtime tarball ──"

RUNTIME_URL="https://github.com/${GITHUB_REPO}/releases/download/${TAG}/finalrun-runtime-${VERSION}-${PLATFORM}.tar.gz"
RUNTIME_DIR="$FINALRUN_DIR/runtime/${VERSION}"
RUNTIME_TMP="$FINALRUN_DIR/runtime/${VERSION}.tmp"
TAR_PATH="$FINALRUN_DIR/runtime/${VERSION}.tar.gz"

mkdir -p "$FINALRUN_DIR/runtime"
rm -rf "$RUNTIME_TMP"
mkdir -p "$RUNTIME_TMP"

info "Downloading $RUNTIME_URL ..."
if ! curl --fail --location --progress-bar "$RUNTIME_URL" -o "$TAR_PATH"; then
  fail "Failed to download runtime tarball."
  rm -rf "$RUNTIME_TMP" "$TAR_PATH"
  exit 1
fi

info "Extracting..."
if ! tar -xzf "$TAR_PATH" -C "$RUNTIME_TMP"; then
  fail "Failed to extract runtime tarball."
  rm -rf "$RUNTIME_TMP" "$TAR_PATH"
  exit 1
fi
rm -f "$TAR_PATH"

# Atomic rename: only after successful extract.
rm -rf "$RUNTIME_DIR"
mv "$RUNTIME_TMP" "$RUNTIME_DIR"
ok "Runtime ${VERSION} installed at $RUNTIME_DIR"

# ---------------------------------------------------------------------------
# Step 4: Platform prompt (with 30s timeout)
# ---------------------------------------------------------------------------

echo ""
info "── Platform Setup ──"
echo ""
echo "Which platform(s) would you like to set up host tools for?"
echo ""
echo "  1) Android"
echo "  2) iOS"
echo "  3) Both"
echo ""

PLATFORM_CHOICE=""
prompt_attempts=0
while [ $prompt_attempts -lt 3 ]; do
  prompt_attempts=$((prompt_attempts + 1))
  printf "Enter your choice (1/2/3) [30s timeout]: "
  if read -r -t 30 REPLY; then
    case "$REPLY" in
      1) PLATFORM_CHOICE="android"; break ;;
      2) PLATFORM_CHOICE="ios"; break ;;
      3) PLATFORM_CHOICE="both"; break ;;
      *) echo "Please enter 1, 2, or 3." ;;
    esac
  else
    echo ""
    warn "No response in 30s — skipping platform tool setup."
    break
  fi
done

# ---------------------------------------------------------------------------
# Step 5: Install host tools (per-platform)
# ---------------------------------------------------------------------------

setup_android() {
  echo ""
  info "── Android Setup ──"
  echo ""

  local android_home="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
  local studio_present=false
  if [ -n "$android_home" ] && [ -d "$android_home" ]; then
    studio_present=true
  fi
  if [ -d "/Applications/Android Studio.app" ]; then
    studio_present=true
  fi

  if [ "$studio_present" = false ]; then
    fail "Android Studio not found."
    info "  Install from https://developer.android.com/studio, then re-run --full-setup."
    return 1
  fi
  ok "Android Studio detected."

  if command -v scrcpy >/dev/null 2>&1; then
    ok "scrcpy already installed."
  elif command -v brew >/dev/null 2>&1; then
    info "  Installing scrcpy via Homebrew..."
    brew install scrcpy && ok "scrcpy installed."
  else
    fail "scrcpy not found and Homebrew is not available."
    info "  Install Homebrew (https://brew.sh), then run: brew install scrcpy"
    return 1
  fi

  return 0
}

setup_ios() {
  echo ""
  info "── iOS Setup ──"
  echo ""

  if [ "$OS" != "darwin" ]; then
    fail "iOS setup requires macOS."
    return 1
  fi

  if ! xcode-select -p >/dev/null 2>&1; then
    fail "Xcode not found."
    info "  Install Xcode from the App Store, then re-run --full-setup."
    return 1
  fi
  ok "Xcode detected."

  if xcrun --version >/dev/null 2>&1; then
    ok "Xcode Command Line Tools already installed."
  else
    info "  Installing Xcode Command Line Tools..."
    info "  A system dialog may appear — please accept it."
    xcode-select --install 2>/dev/null || true
    ok "Xcode Command Line Tools installation initiated (re-run after it finishes)."
  fi

  if command -v applesimutils >/dev/null 2>&1; then
    ok "applesimutils already installed."
  elif command -v brew >/dev/null 2>&1; then
    info "  Tapping wix/brew for applesimutils..."
    brew tap wix/brew 2>/dev/null || true
    info "  Installing applesimutils via Homebrew..."
    brew install applesimutils && ok "applesimutils installed."
  else
    fail "applesimutils not found and Homebrew is not available."
    info "  Install Homebrew (https://brew.sh), then run: brew tap wix/brew && brew install applesimutils"
    return 1
  fi

  return 0
}

android_ok=true
ios_ok=true

case "$PLATFORM_CHOICE" in
  android)  setup_android || android_ok=false ;;
  ios)      setup_ios     || ios_ok=false ;;
  both)     setup_android || android_ok=false; setup_ios || ios_ok=false ;;
  "")       : ;;  # skipped via timeout
esac

# ---------------------------------------------------------------------------
# Step 6: Run doctor (verification)
# ---------------------------------------------------------------------------

if [ -n "$PLATFORM_CHOICE" ]; then
  echo ""
  info "── Verifying Setup ──"
  echo ""
  doctor_platform="$PLATFORM_CHOICE"
  if [ "$doctor_platform" = "both" ]; then doctor_platform="all"; fi
  "$BIN_DEST" doctor --platform "$doctor_platform" || true
fi

# ---------------------------------------------------------------------------
# Step 7: Skills (optional, last)
# ---------------------------------------------------------------------------

echo ""
info "── FinalRun AI Agent Skills ──"
echo ""
printf "Install AI agent skills (used by Claude Code/Cursor for /finalrun-* commands)? [Y/n] [30s timeout]: "
SKILLS_CHOICE=""
if read -r -t 30 SKILLS_REPLY; then
  case "$SKILLS_REPLY" in
    n|N|no|NO)  SKILLS_CHOICE=skip ;;
    *)          SKILLS_CHOICE=install ;;
  esac
else
  echo ""
  warn "No response in 30s — skipping skills install."
  SKILLS_CHOICE=skip
fi

if [ "$SKILLS_CHOICE" = "install" ]; then
  if ! command -v npx >/dev/null 2>&1; then
    warn "npx not found — skills require Node + npm. Install Node 20+ and re-run --full-setup if you want them."
  else
    info "Installing FinalRun skills..."
    npx skills add final-run/finalrun-agent && ok "FinalRun skills installed."
  fi
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo ""
info "── Summary ──"
echo ""
ok "finalrun ${VERSION} installed at $BIN_DEST"
ok "Runtime ${VERSION} extracted to $RUNTIME_DIR"
case "$PLATFORM_CHOICE" in
  android) [ "$android_ok" = true ] && ok "Android: ready." || warn "Android: setup incomplete." ;;
  ios)     [ "$ios_ok" = true ]     && ok "iOS: ready."     || warn "iOS: setup incomplete." ;;
  both)
    [ "$android_ok" = true ] && ok "Android: ready." || warn "Android: setup incomplete."
    [ "$ios_ok" = true ]     && ok "iOS: ready."     || warn "iOS: setup incomplete."
    ;;
esac

echo ""
info "Open a new terminal, or run:"
echo ""
echo "    export PATH=\"\$PATH:$FINALRUN_DIR/bin\""
echo ""
info "Try it:  finalrun --help"
echo ""

exec <&- 2>/dev/null || true
exit 0
