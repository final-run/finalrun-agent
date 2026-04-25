#!/usr/bin/env bash
# FinalRun installer
#
# Two install paths — pick whichever fits:
#
#   Default (full local-dev setup):
#     curl -fsSL https://raw.githubusercontent.com/final-run/finalrun-agent/main/scripts/install.sh | bash
#
#   --ci (binary only; no runtime tarball, no prompts, no host-tool installs):
#     curl -fsSL https://raw.githubusercontent.com/final-run/finalrun-agent/main/scripts/install.sh | bash -s -- --ci
#
# CI environments (CI=1 in env) auto-apply --ci behavior even without the flag.
#
# Env overrides:
#   FINALRUN_DIR              Install root (default: $HOME/.finalrun)
#   FINALRUN_VERSION          Version to pin (default: latest GitHub release)
#   FINALRUN_NON_INTERACTIVE  Set to skip all prompts (same as --ci)

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
# main — wraps the entire install flow.
#
# Why a function? When this script runs as `curl … | bash`, bash reads the
# script from a pipe. If we ran `exec </dev/tty` at the top level mid-script,
# bash would then try to read the *rest of the script* from the terminal
# instead of the pipe and the install would hang waiting for keystrokes.
# Wrapping the body in main() forces bash to parse the entire function body
# into memory before invoking it, so reassigning stdin only affects what
# `read` and child processes (`brew`, `xcode-select`, etc.) see.
# ---------------------------------------------------------------------------

main() {
  CI_MODE=false

  for arg in "$@"; do
    case "$arg" in
      --ci)
        CI_MODE=true
        ;;
      --cloud-only)
        fail "--cloud-only was renamed in v0.1.8. Use --ci instead:"
        echo "    curl -fsSL https://raw.githubusercontent.com/${GITHUB_REPO}/main/scripts/install.sh | bash -s -- --ci"
        exit 1
        ;;
      --full-setup)
        fail "--full-setup was removed in v0.1.8. Full setup is now the default — drop the flag:"
        echo "    curl -fsSL https://raw.githubusercontent.com/${GITHUB_REPO}/main/scripts/install.sh | bash"
        exit 1
        ;;
      *)
        fail "Unknown argument: $arg"
        info "Supported flags: --ci"
        exit 1
        ;;
    esac
  done

  # CI auto-detect: every major CI provider sets CI=1, so plain
  # `curl ... | bash` from a CI runner falls back to --ci behavior
  # automatically and never hits a prompt.
  if [ -n "${CI:-}" ] || [ -n "${FINALRUN_NON_INTERACTIVE:-}" ]; then
    CI_MODE=true
  fi

  # Prereqs (binary install path needs only curl + tar)
  for cmd in curl tar uname mkdir chmod; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      fail "$cmd not found. Please install $cmd and re-run."
      exit 1
    fi
  done

  # Detect platform
  local os_raw arch_raw
  os_raw="$(uname -s)"
  arch_raw="$(uname -m)"

  case "$os_raw" in
    Darwin*) OS=darwin ;;
    Linux*)  OS=linux ;;
    CYGWIN*|MINGW*|MSYS*)
      fail "Windows hosts (Cygwin / MinGW / MSYS / Git Bash) are not supported yet."
      info "Install on a macOS or Linux host, or run finalrun in WSL2."
      exit 1
      ;;
    *) fail "Unsupported OS: $os_raw"; exit 1 ;;
  esac

  case "$arch_raw" in
    x86_64|amd64) ARCH=x64 ;;
    arm64|aarch64) ARCH=arm64 ;;
    *) fail "Unsupported architecture: $arch_raw"; exit 1 ;;
  esac

  PLATFORM="${OS}-${ARCH}"
  FINALRUN_DIR="${FINALRUN_DIR:-$HOME/.finalrun}"
  mkdir -p "$FINALRUN_DIR/bin"

  VERSION=$(resolve_version)
  TAG="v${VERSION}"

  info "FinalRun Installer (${VERSION})"
  info "─────────────────────────────"
  echo ""

  install_binary
  setup_path

  if [ "$CI_MODE" = true ]; then
    print_ci_summary
    exit 0
  fi

  # Safe NOW — bash has parsed the entire main() body before invoking it,
  # so reassigning stdin no longer makes bash try to read script bytes from
  # the terminal. All subsequent `read` calls and child processes inherit
  # /dev/tty as their stdin.
  exec </dev/tty

  download_runtime
  prompt_platform
  setup_host_tools
  run_doctor
  prompt_skills
  print_summary

  exit 0
}

# ---------------------------------------------------------------------------
# Step helpers
# ---------------------------------------------------------------------------

resolve_version() {
  if [ -n "${FINALRUN_VERSION:-}" ]; then
    echo "$FINALRUN_VERSION"
    return
  fi
  # Resolve "latest" by following the redirect from the latest-release URL.
  # GitHub rewrites .../releases/latest → .../releases/tag/v<x>; we read the
  # final URL and strip everything up through "/tag/" to get the tag.
  local redirect
  redirect=$(curl -fsSLI -o /dev/null -w '%{url_effective}' \
    "https://github.com/${GITHUB_REPO}/releases/latest" 2>/dev/null || true)
  if [ -z "$redirect" ]; then
    fail "Could not resolve the latest finalrun release. Set FINALRUN_VERSION explicitly."
    exit 1
  fi
  if ! [[ "$redirect" =~ /releases/tag/v[0-9]+\.[0-9]+\.[0-9]+ ]]; then
    fail "Could not parse latest release tag from redirect URL:"
    fail "  $redirect"
    fail "Set FINALRUN_VERSION explicitly to bypass auto-resolution."
    exit 1
  fi
  echo "${redirect##*/tag/}" | sed 's/^v//'
}

install_binary() {
  local bin_url="https://github.com/${GITHUB_REPO}/releases/download/${TAG}/finalrun-${PLATFORM}"
  BIN_DEST="$FINALRUN_DIR/bin/finalrun"
  local bin_tmp="${BIN_DEST}.tmp"

  info "Downloading finalrun binary for ${PLATFORM}..."
  if ! curl --fail --location --progress-bar "$bin_url" -o "$bin_tmp"; then
    fail "Failed to download $bin_url"
    rm -f "$bin_tmp"
    exit 1
  fi
  chmod +x "$bin_tmp"
  mv "$bin_tmp" "$BIN_DEST"

  # macOS: drop the quarantine flag so Gatekeeper doesn't block the binary.
  if [ "$OS" = "darwin" ]; then
    xattr -d com.apple.quarantine "$BIN_DEST" 2>/dev/null || true
  fi

  ok "Installed $BIN_DEST"
}

setup_path() {
  local path_line="export PATH=\$PATH:$FINALRUN_DIR/bin"
  local rc
  for rc in "$HOME/.bashrc" "$HOME/.bash_profile" "${ZDOTDIR:-$HOME}/.zshrc"; do
    touch "$rc" 2>/dev/null || true
    if [ -f "$rc" ] && ! grep -qF "$FINALRUN_DIR/bin" "$rc" 2>/dev/null; then
      echo "$path_line" >> "$rc"
    fi
  done
}

print_ci_summary() {
  echo ""
  ok "finalrun installed."
  echo ""
  info "For cloud commands you're done — try:"
  echo ""
  echo "    finalrun cloud test --help"
  echo ""
  info "For local test execution on this machine, re-run without --ci:"
  echo ""
  echo "    curl -fsSL https://raw.githubusercontent.com/${GITHUB_REPO}/main/scripts/install.sh | bash"
  echo ""
  echo "Open a new terminal or run:  export PATH=\"\$PATH:$FINALRUN_DIR/bin\""
}

download_runtime() {
  echo ""
  info "── Downloading runtime tarball ──"

  local runtime_url="https://github.com/${GITHUB_REPO}/releases/download/${TAG}/finalrun-runtime-${VERSION}-${PLATFORM}.tar.gz"
  RUNTIME_DIR="$FINALRUN_DIR/runtime/${VERSION}"
  local runtime_tmp="$FINALRUN_DIR/runtime/${VERSION}.tmp"
  local tar_path="$FINALRUN_DIR/runtime/${VERSION}.tar.gz"

  mkdir -p "$FINALRUN_DIR/runtime"
  rm -rf "$runtime_tmp"
  mkdir -p "$runtime_tmp"

  info "Downloading $runtime_url ..."
  if ! curl --fail --location --progress-bar "$runtime_url" -o "$tar_path"; then
    fail "Failed to download runtime tarball."
    rm -rf "$runtime_tmp" "$tar_path"
    exit 1
  fi

  info "Extracting..."
  if ! tar -xzf "$tar_path" -C "$runtime_tmp"; then
    fail "Failed to extract runtime tarball."
    rm -rf "$runtime_tmp" "$tar_path"
    exit 1
  fi
  rm -f "$tar_path"

  rm -rf "$RUNTIME_DIR"
  mv "$runtime_tmp" "$RUNTIME_DIR"
  ok "Runtime ${VERSION} installed at $RUNTIME_DIR"
}

prompt_platform() {
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
  local attempts=0
  while [ $attempts -lt 3 ]; do
    attempts=$((attempts + 1))
    printf "Enter your choice (1/2/3) [30s timeout]: "
    if read -r -t 30 reply; then
      case "$reply" in
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

  if [ -z "$PLATFORM_CHOICE" ] && [ $attempts -ge 3 ]; then
    echo ""
    warn "No valid platform selected after $attempts attempts — skipping platform tool setup."
    warn "Re-run without --ci to try again."
  fi
}

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
    info "  Install from https://developer.android.com/studio, then re-run the installer."
    return 1
  fi
  ok "Android Studio detected."

  if command -v scrcpy >/dev/null 2>&1; then
    ok "scrcpy already installed."
  elif command -v brew >/dev/null 2>&1; then
    info "  Installing scrcpy via Homebrew..."
    if brew install scrcpy; then
      ok "scrcpy installed."
    else
      fail "brew install scrcpy failed — check the brew output above."
      return 1
    fi
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
    info "  Install Xcode from the App Store, then re-run the installer."
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
    if brew install applesimutils; then
      ok "applesimutils installed."
    else
      fail "brew install applesimutils failed — check the brew output above."
      return 1
    fi
  else
    fail "applesimutils not found and Homebrew is not available."
    info "  Install Homebrew (https://brew.sh), then run: brew tap wix/brew && brew install applesimutils"
    return 1
  fi

  return 0
}

setup_host_tools() {
  ANDROID_OK=true
  IOS_OK=true
  case "$PLATFORM_CHOICE" in
    android)  setup_android || ANDROID_OK=false ;;
    ios)      setup_ios     || IOS_OK=false ;;
    both)     setup_android || ANDROID_OK=false; setup_ios || IOS_OK=false ;;
    "")       : ;;  # skipped via timeout / exhausted attempts
  esac
}

run_doctor() {
  if [ -z "$PLATFORM_CHOICE" ]; then
    return
  fi
  echo ""
  info "── Verifying Setup ──"
  echo ""
  local doctor_platform="$PLATFORM_CHOICE"
  if [ "$doctor_platform" = "both" ]; then
    doctor_platform="all"
  fi
  "$BIN_DEST" doctor --platform "$doctor_platform" || true
}

prompt_skills() {
  echo ""
  info "── FinalRun AI Agent Skills ──"
  echo ""
  printf "Install AI agent skills (used by Claude Code/Cursor for /finalrun-* commands)? [Y/n] [30s timeout]: "
  local reply choice
  if read -r -t 30 reply; then
    case "$reply" in
      n|N|no|NO)  choice=skip ;;
      *)          choice=install ;;
    esac
  else
    echo ""
    warn "No response in 30s — skipping skills install."
    choice=skip
  fi

  if [ "$choice" = "install" ]; then
    if ! command -v npx >/dev/null 2>&1; then
      warn "npx not found — skills require Node + npm. Install Node 20+ and re-run the installer if you want them."
    else
      info "Installing FinalRun skills..."
      npx skills add final-run/finalrun-agent && ok "FinalRun skills installed."
    fi
  fi
}

print_summary() {
  echo ""
  info "── Summary ──"
  echo ""
  ok "finalrun ${VERSION} installed at $BIN_DEST"
  ok "Runtime ${VERSION} extracted to $RUNTIME_DIR"
  case "$PLATFORM_CHOICE" in
    android) [ "$ANDROID_OK" = true ] && ok "Android: ready." || warn "Android: setup incomplete." ;;
    ios)     [ "$IOS_OK" = true ]     && ok "iOS: ready."     || warn "iOS: setup incomplete." ;;
    both)
      [ "$ANDROID_OK" = true ] && ok "Android: ready." || warn "Android: setup incomplete."
      [ "$IOS_OK" = true ]     && ok "iOS: ready."     || warn "iOS: setup incomplete."
      ;;
  esac

  echo ""
  info "Open a new terminal, or run:"
  echo ""
  echo "    export PATH=\"\$PATH:$FINALRUN_DIR/bin\""
  echo ""
  info "Try it:  finalrun --help"
  echo ""
}

# ---------------------------------------------------------------------------
# Entry
# ---------------------------------------------------------------------------

main "$@"
