#!/usr/bin/env bash
# FinalRun installer
# Usage: curl -fsSL https://raw.githubusercontent.com/final-run/finalrun-agent/main/scripts/install.sh | bash
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

# Read from /dev/tty so prompts work even when piped via curl | bash
prompt() {
  printf "%s" "$1"
  read -r REPLY </dev/tty
}

REQUIRED_NODE_MAJOR=20

# ---------------------------------------------------------------------------
# Step 1: Node.js
# ---------------------------------------------------------------------------

install_node() {
  info "Node.js >= $REQUIRED_NODE_MAJOR not found. Installing via nvm..."

  if ! command -v curl &>/dev/null && ! command -v wget &>/dev/null; then
    fail "Neither curl nor wget found. Please install one and re-run."
    exit 1
  fi

  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    info "  Installing nvm..."
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  fi

  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"

  nvm install "$REQUIRED_NODE_MAJOR"
  nvm use "$REQUIRED_NODE_MAJOR"
  ok "Node.js $(node --version) installed via nvm."
}

check_node() {
  if command -v node &>/dev/null; then
    local ver
    ver="$(node --version | sed 's/^v//')"
    local major
    major="$(echo "$ver" | cut -d. -f1)"
    if [ "$major" -ge "$REQUIRED_NODE_MAJOR" ]; then
      ok "Node.js v$ver detected."
      return 0
    fi
    warn "Node.js v$ver found but >= $REQUIRED_NODE_MAJOR is required."
  fi
  return 1
}

# ---------------------------------------------------------------------------
# Step 2: Install FinalRun CLI
# ---------------------------------------------------------------------------

install_finalrun() {
  info "Installing @finalrun/finalrun-agent..."
  npm install -g @finalrun/finalrun-agent@latest
  ok "finalrun $(finalrun --version) installed."
}

# ---------------------------------------------------------------------------
# Step 3: Platform setup
# ---------------------------------------------------------------------------

prompt_platform() {
  echo ""
  info "Which platform(s) would you like to set up?"
  echo ""
  echo "  1) Android"
  echo "  2) iOS"
  echo "  3) Both"
  echo ""

  while true; do
    prompt "Enter your choice (1/2/3): "
    case "$REPLY" in
      1) PLATFORM="android"; return ;;
      2) PLATFORM="ios"; return ;;
      3) PLATFORM="both"; return ;;
      *) echo "Please enter 1, 2, or 3." ;;
    esac
  done
}

detect_android_studio() {
  local android_home="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
  if [ -n "$android_home" ] && [ -d "$android_home" ]; then
    return 0
  fi

  if [ -d "/Applications/Android Studio.app" ]; then
    return 0
  fi

  return 1
}

detect_xcode() {
  xcode-select -p &>/dev/null
}

setup_android() {
  echo ""
  info "── Android Setup ──"
  echo ""

  if ! detect_android_studio; then
    fail "Android Studio not found."
    info "  Please install Android Studio: https://developer.android.com/studio"
    info "  After installing, re-run this script."
    return 1
  fi
  ok "Android Studio detected."

  if command -v scrcpy &>/dev/null; then
    ok "scrcpy already installed."
  elif command -v brew &>/dev/null; then
    info "  Installing scrcpy via Homebrew..."
    brew install scrcpy
    ok "scrcpy installed."
  else
    fail "scrcpy not found and Homebrew is not available."
    info "  Please install Homebrew (https://brew.sh) then run: brew install scrcpy"
  fi

  return 0
}

setup_ios() {
  echo ""
  info "── iOS Setup ──"
  echo ""

  if [ "$(uname -s)" != "Darwin" ]; then
    fail "iOS setup requires macOS."
    return 1
  fi

  if ! detect_xcode; then
    fail "Xcode not found."
    info "  Please install Xcode from the App Store."
    info "  After installing, re-run this script."
    return 1
  fi
  ok "Xcode detected."

  if xcrun --version &>/dev/null; then
    ok "Xcode Command Line Tools already installed."
  else
    info "  Installing Xcode Command Line Tools..."
    info "  A system dialog may appear. Please accept it."
    xcode-select --install 2>/dev/null || true
    ok "Xcode Command Line Tools installation initiated."
    info "  Note: Installation may continue in the background. Re-run this script when done."
  fi

  if command -v applesimutils &>/dev/null; then
    ok "applesimutils already installed."
  elif command -v brew &>/dev/null; then
    info "  Adding wix/brew tap for applesimutils..."
    brew tap wix/brew 2>/dev/null || true
    info "  Installing applesimutils via Homebrew..."
    brew install applesimutils
    ok "applesimutils installed."
  else
    fail "applesimutils not found and Homebrew is not available."
    info "  Please install Homebrew (https://brew.sh) then run:"
    info "    brew tap wix/brew && brew install applesimutils"
  fi

  return 0
}

# ---------------------------------------------------------------------------
# Step 4: Verify with doctor
# ---------------------------------------------------------------------------

run_doctor() {
  local doctor_platform="$1"
  echo ""
  info "── Verifying Setup ──"
  echo ""
  finalrun doctor --platform "$doctor_platform" || true
}

# ---------------------------------------------------------------------------
# Step 5: Install FinalRun skills (interactive, last step)
# ---------------------------------------------------------------------------

install_skills() {
  echo ""
  info "── FinalRun Skills ──"
  echo ""
  info "Installing FinalRun skills..."
  npx skills add final-run/finalrun-agent
  ok "FinalRun skills installed."
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
  echo ""
  info "FinalRun Installer"
  info "────────────────────"

  # Step 1: Node.js
  echo ""
  if ! check_node; then
    install_node
  fi

  # Step 2: FinalRun CLI
  echo ""
  if command -v finalrun &>/dev/null; then
    ok "finalrun already installed ($(finalrun --version)). Updating..."
  fi
  install_finalrun

  # Check npx
  echo ""
  if ! command -v npx &>/dev/null; then
    fail "npx not found. Please install a recent version of npm (npx ships with npm >= 5.2)."
    exit 1
  fi
  ok "npx available."

  # Step 3: Platform setup
  prompt_platform

  android_ok=true
  ios_ok=true

  if [ "$PLATFORM" = "android" ] || [ "$PLATFORM" = "both" ]; then
    setup_android || android_ok=false
  fi

  if [ "$PLATFORM" = "ios" ] || [ "$PLATFORM" = "both" ]; then
    setup_ios || ios_ok=false
  fi

  # Step 4: Doctor verification
  if [ "$PLATFORM" = "both" ]; then
    run_doctor all
  elif [ "$PLATFORM" = "android" ] && [ "$android_ok" = true ]; then
    run_doctor android
  elif [ "$PLATFORM" = "ios" ] && [ "$ios_ok" = true ]; then
    run_doctor ios
  fi

  # Summary
  echo ""
  info "── Summary ──"
  echo ""
  if [ "$PLATFORM" = "android" ] || [ "$PLATFORM" = "both" ]; then
    if [ "$android_ok" = true ]; then
      ok "Android: Setup complete."
    else
      warn "Android: Install Android Studio first, then re-run this script."
    fi
  fi
  if [ "$PLATFORM" = "ios" ] || [ "$PLATFORM" = "both" ]; then
    if [ "$ios_ok" = true ]; then
      ok "iOS: Setup complete."
    else
      warn "iOS: Install Xcode first, then re-run this script."
    fi
  fi

  # Step 5: Skills (last)
  install_skills

  echo ""
}

main
