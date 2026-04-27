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
underline() { printf '\033[4m%s\033[24m' "$1"; }

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
  if ! maybe_skip_platform_setup; then
    prompt_platform
    setup_host_tools
  fi
  run_doctor
  sync_skills
  check_api_keys
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

  # Symlink into ~/.local/bin so users get a "just works" experience: this
  # path is already on $PATH for most Linux distros, and it matches the
  # convention used by claude, uv, pipx, pixi, mise. macOS users still need
  # to start a new shell on first install (rc files written by setup_path),
  # but that's the same constraint every curl|bash installer lives with.
  LOCAL_BIN="$HOME/.local/bin"
  LOCAL_BIN_LINK="$LOCAL_BIN/finalrun"
  if mkdir -p "$LOCAL_BIN" 2>/dev/null && ln -sf "$BIN_DEST" "$LOCAL_BIN_LINK" 2>/dev/null; then
    ok "Linked $LOCAL_BIN_LINK -> $BIN_DEST"
  else
    LOCAL_BIN_LINK=""
    warn "Could not write to $LOCAL_BIN — binary is at $BIN_DEST but you'll need to add it to PATH manually."
  fi
}

setup_path() {
  # Already on PATH via $LOCAL_BIN? Skip rc modification entirely. Common on
  # Linux distros that put ~/.local/bin in PATH via /etc/profile or systemd.
  case ":${PATH}:" in
    *":$LOCAL_BIN:"*) return 0 ;;
  esac

  local sh_line="export PATH=\"\$HOME/.local/bin:\$PATH\""
  local fish_line="fish_add_path -p \"\$HOME/.local/bin\""
  local rc

  # POSIX-shell rc files. Idempotent via the literal $HOME/.local/bin marker.
  for rc in \
    "$HOME/.bashrc" \
    "$HOME/.bash_profile" \
    "$HOME/.profile" \
    "${ZDOTDIR:-$HOME}/.zshrc" \
    "${ZDOTDIR:-$HOME}/.zprofile"
  do
    touch "$rc" 2>/dev/null || true
    if [ -f "$rc" ] && ! grep -qF '$HOME/.local/bin' "$rc" 2>/dev/null; then
      printf '\n# finalrun\n%s\n' "$sh_line" >> "$rc"
    fi
  done

  # Fish has different syntax and a dedicated config file.
  local fish_rc="$HOME/.config/fish/config.fish"
  if [ -d "$HOME/.config/fish" ] || command -v fish >/dev/null 2>&1; then
    mkdir -p "$HOME/.config/fish" 2>/dev/null || true
    touch "$fish_rc" 2>/dev/null || true
    if [ -f "$fish_rc" ] && ! grep -qF '.local/bin' "$fish_rc" 2>/dev/null; then
      printf '\n# finalrun\n%s\n' "$fish_line" >> "$fish_rc"
    fi
  fi
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
  verify_path
}

# Tells the user whether finalrun is reachable in their *current* shell. If
# yes (Linux usually, re-runs always), stay quiet. If no (typical macOS
# first install), point them at the cheapest fix.
verify_path() {
  echo ""
  if command -v finalrun >/dev/null 2>&1; then
    ok "finalrun is on your PATH."
    return 0
  fi
  warn "finalrun isn't on PATH for this shell yet."
  echo "  Open a new terminal — your shell rc files were updated."
  echo "  If it still doesn't resolve, ensure \$HOME/.local/bin is in your PATH."
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

android_ready() {
  local android_home="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
  local sdk_present=false
  if [ -n "$android_home" ] && [ -d "$android_home" ]; then
    sdk_present=true
  fi
  if [ "$OS" = "darwin" ] && [ -d "/Applications/Android Studio.app" ]; then
    sdk_present=true
  fi
  [ "$sdk_present" = true ] && command -v scrcpy >/dev/null 2>&1
}

# iOS readiness requires the full Xcode app (not just Command Line Tools).
# `xcrun -f simctl` is the canonical signal: simctl ships with Xcode and is
# absent from CLT-only installs. `xcrun -f` is a path lookup, so it does not
# trigger a license check.
ios_ready() {
  [ "$OS" = "darwin" ] || return 1
  xcrun -f simctl >/dev/null 2>&1 && command -v applesimutils >/dev/null 2>&1
}

# If every relevant platform is already set up, skip the prompt entirely:
# print confirmations, set PLATFORM_CHOICE so run_doctor still verifies, and
# return 0 so main() bypasses prompt_platform + setup_host_tools.
maybe_skip_platform_setup() {
  local android=false ios=false
  android_ready && android=true
  ios_ready && ios=true

  if [ "$OS" = "darwin" ]; then
    if [ "$android" = true ] && [ "$ios" = true ]; then
      echo ""
      info "── Platform Setup ──"
      echo ""
      ok "Android tools detected — skipping setup."
      ok "iOS tools detected — skipping setup."
      PLATFORM_CHOICE=both
      ANDROID_OK=true
      IOS_OK=true
      return 0
    fi
  else
    # Linux: only Android applies — iOS isn't reachable on this host.
    if [ "$android" = true ]; then
      echo ""
      info "── Platform Setup ──"
      echo ""
      ok "Android tools detected — skipping setup."
      PLATFORM_CHOICE=android
      ANDROID_OK=true
      return 0
    fi
  fi
  return 1
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
    warn "Re-run the installer to try again, or run 'finalrun doctor' to diagnose host tooling."
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

  # `xcode-select -p` succeeds for both full Xcode AND Command Line Tools,
  # which is why the previous check produced false-positive "Xcode detected"
  # messages on CLT-only machines. `xcrun -f simctl` only succeeds when the
  # full Xcode app is the active developer dir — simctl ships with Xcode,
  # not CLT.
  if ! xcrun -f simctl >/dev/null 2>&1; then
    local devdir
    devdir=$(xcode-select -p 2>/dev/null || true)
    if [ -z "$devdir" ]; then
      fail "Xcode not found."
      info "  Install Xcode from the App Store, launch it once to accept the"
      info "  license, then re-run the installer."
    else
      fail "Xcode app not active (xcode-select -p points to: $devdir)."
      info "  iOS simulators need the full Xcode app, not just Command Line Tools."
      info "  Install Xcode from the App Store, then run:"
      info "    sudo xcode-select -s /Applications/Xcode.app/Contents/Developer"
    fi
    return 1
  fi
  ok "Xcode detected."

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

sync_skills() {
  echo ""
  info "── FinalRun AI Agent Skills ──"
  echo ""

  if ! command -v npx >/dev/null 2>&1; then
    warn "npx not found — skills require Node + npm. Install Node 20+ and re-run the installer if you want them."
    return
  fi

  # Detect already-installed finalrun-* skills via the skills CLI's JSON
  # output. `skills update` is internally diff-aware (it compares against the
  # source repo and only downloads stale skills), so running it on an
  # up-to-date system is essentially a no-op + a network round-trip.
  local installed
  installed=$(npx --yes skills ls -g --json 2>/dev/null \
    | grep -oE '"finalrun-[a-z0-9-]+"' \
    | tr -d '"' \
    | sort -u \
    | tr '\n' ' ')

  if [ -z "$installed" ]; then
    info "Installing FinalRun skills..."
    if npx --yes skills add final-run/finalrun-agent -y -g; then
      ok "FinalRun skills installed."
    else
      warn "FinalRun skills install failed — see output above. Re-run 'npx skills add final-run/finalrun-agent -g' to retry."
    fi
    return
  fi

  info "Checking FinalRun skills for updates..."
  # Capture so we can branch the success line on whether anything changed.
  # `skills update` prints "All global skills are up to date" when nothing is
  # stale, and "Updated N skill(s)" / "Found N update(s)" when work happened.
  local out
  # shellcheck disable=SC2086 — $installed is a deliberately split list.
  if out=$(npx --yes skills update -g -y $installed 2>&1); then
    printf '%s\n' "$out"
    if printf '%s' "$out" | grep -qi 'up to date'; then
      ok "FinalRun skills already up to date."
    else
      ok "FinalRun skills updated."
    fi
  else
    printf '%s\n' "$out"
    warn "FinalRun skills update failed — see output above."
  fi
}

check_api_keys() {
  echo ""
  info "── AI Provider Key ──"
  echo ""

  local detected=()
  local var
  for var in FINALRUN_API_KEY ANTHROPIC_API_KEY OPENAI_API_KEY GOOGLE_API_KEY; do
    if [ -n "${!var:-}" ]; then
      detected+=("$var")
    fi
  done

  if [ ${#detected[@]} -gt 0 ]; then
    for var in "${detected[@]}"; do
      ok "$var detected"
    done
    return
  fi

  warn "No API key detected."
  echo ""
  echo "  Fastest way to get started — FinalRun Cloud (free \$5 credits):"
  echo ""
  echo "      Sign up:  $(underline 'https://cloud.finalrun.app')"
  echo "      Docs:     $(underline 'https://docs.finalrun.app/configuration/cloud-api-key')"
  echo ""
  echo "  Prefer your own AI provider account? Bring your own key:"
  echo ""
  echo "      ANTHROPIC_API_KEY    →  anthropic/claude-* models"
  echo "      OPENAI_API_KEY       →  openai/gpt-* models"
  echo "      GOOGLE_API_KEY       →  google/gemini-* models"
  echo ""
  echo "  Set via .env (workspace root), shell export, or --api-key."
  echo "  Docs: $(underline 'https://docs.finalrun.app/configuration/ai-providers')"
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

  verify_path
  echo ""
  info "Try it:  finalrun --help"
  echo ""
}

# ---------------------------------------------------------------------------
# Entry
# ---------------------------------------------------------------------------

main "$@"
