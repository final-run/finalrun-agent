#Requires -Version 5.1
<#
.SYNOPSIS
    FinalRun installer for Windows.

.DESCRIPTION
    Mirrors scripts/install.sh for Windows hosts. Downloads the
    finalrun-windows-x64.exe binary plus (in interactive mode) the matching
    runtime tarball, sets up the user PATH, and optionally walks the user
    through Android tooling setup.

    Two install paths:

      Default (full local-dev setup):
        irm https://raw.githubusercontent.com/final-run/finalrun-agent/main/scripts/install.ps1 | iex

      CI / non-interactive (binary only; no runtime tarball, no prompts):
        $env:FINALRUN_NON_INTERACTIVE=1; irm https://raw.githubusercontent.com/final-run/finalrun-agent/main/scripts/install.ps1 | iex

    iOS local execution requires macOS (xcodebuild) — Windows installs
    only support Android. Cloud commands (`finalrun cloud test`,
    `finalrun cloud upload`) work the same on Windows for both Android
    and iOS.

.PARAMETER CI
    Skip runtime tarball download and all interactive prompts. Equivalent
    to setting $env:FINALRUN_NON_INTERACTIVE=1. Only honored when the
    script is run from a saved file (.\install.ps1 -CI), not via
    `irm | iex` — for the iex path, set the env var instead.

.NOTES
    Env overrides:
        FINALRUN_DIR              Install root (default: $env:USERPROFILE\.finalrun)
        FINALRUN_VERSION          Version to pin (default: latest GitHub release)
        FINALRUN_NON_INTERACTIVE  Set to skip all prompts (same as -CI)
#>

[CmdletBinding()]
param(
    [switch]$CI
)

$ErrorActionPreference = 'Stop'

# PowerShell 5.1 defaults to TLS 1.0/1.1; GitHub requires TLS 1.2+.
# Without this, every web call below silently fails on stock Win10 with a
# cryptic "underlying connection was closed" error. Must run before any
# Invoke-WebRequest / Net.WebClient call.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Force UTF-8 console output so ✓/⚠/✗ render correctly on legacy console
# code pages (e.g. Windows-1252). Modern Windows Terminal handles these
# already; this catches the older cmd-host case.
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$script:GitHubRepo = 'final-run/finalrun-agent'

# ---------------------------------------------------------------------------
# Console helpers
# ---------------------------------------------------------------------------

function Write-Heading { param([string]$Msg) Write-Host $Msg -ForegroundColor White }
function Write-Success { param([string]$Msg) Write-Host "  ✓ $Msg" -ForegroundColor Green }
function Write-Notice  { param([string]$Msg) Write-Host "  ⚠ $Msg" -ForegroundColor Yellow }
function Write-Failure { param([string]$Msg) Write-Host "  ✗ $Msg" -ForegroundColor Red }

function Format-Underline {
    param([string]$Text)
    $esc = [char]27
    "$esc[4m$Text$esc[24m"
}

# ---------------------------------------------------------------------------
# Step helpers
# ---------------------------------------------------------------------------

function Resolve-Version {
    if ($env:FINALRUN_VERSION) {
        return $env:FINALRUN_VERSION.TrimStart('v')
    }

    $latestUrl = "https://github.com/$script:GitHubRepo/releases/latest"

    # HttpWebRequest works the same on PS 5.1 and PS 7; Invoke-WebRequest's
    # response-uri property name differs between versions. HEAD + auto-redirect
    # gives us the final tag URL without a body download.
    try {
        $req = [System.Net.HttpWebRequest]::Create($latestUrl)
        $req.AllowAutoRedirect = $true
        $req.Method = 'HEAD'
        $req.UserAgent = 'FinalRun-Installer'
        $req.Timeout = 30000
        $resp = $req.GetResponse()
        $finalUri = $resp.ResponseUri.AbsoluteUri
        $resp.Close()
    } catch {
        Write-Failure "Could not resolve the latest finalrun release."
        Write-Failure $_.Exception.Message
        Write-Failure "Set `$env:FINALRUN_VERSION explicitly to bypass auto-resolution."
        exit 1
    }

    if ($finalUri -match '/releases/tag/v(\d+\.\d+\.\d+(?:-[\w\.]+)?)') {
        return $Matches[1]
    }

    Write-Failure "Could not parse latest release tag from redirect URL:"
    Write-Failure "  $finalUri"
    exit 1
}

function Install-Binary {
    param(
        [string]$Version,
        [string]$Platform,
        [string]$FinalRunDir
    )

    $binDir = Join-Path $FinalRunDir 'bin'
    $binPath = Join-Path $binDir 'finalrun.exe'
    $tmpPath = "$binPath.tmp"
    $url = "https://github.com/$script:GitHubRepo/releases/download/v$Version/finalrun-$Platform.exe"

    Write-Heading "Downloading finalrun binary for $Platform..."
    if (Test-Path $tmpPath) { Remove-Item -Force $tmpPath }

    try {
        # Net.WebClient streams to disk; faster than Invoke-WebRequest's
        # in-memory progress-tracking on PS 5.1 for ~120MB binaries.
        (New-Object Net.WebClient).DownloadFile($url, $tmpPath)
    } catch {
        Write-Failure "Failed to download $url"
        Write-Failure $_.Exception.Message
        if (Test-Path $tmpPath) { Remove-Item -Force $tmpPath }
        exit 1
    }

    # Strip the NTFS Zone.Identifier alternate data stream so users don't
    # see "this file came from another computer" prompts on first run.
    # Does NOT bypass SmartScreen — that requires Authenticode signing.
    Unblock-File -Path $tmpPath -ErrorAction SilentlyContinue

    # Windows holds an exclusive image-section lock on a running .exe, so
    # `Move-Item -Force` over a live finalrun.exe (the case during
    # `finalrun upgrade`, where finalrun.exe spawns powershell.exe to run
    # this script) fails with a sharing violation. Renaming the running
    # .exe is allowed — it only updates the directory entry, not the open
    # image — so stash the old one out of the way before moving the new
    # one in. The stash file becomes deletable once the parent finalrun
    # process exits and is cleaned up on the next upgrade.
    if (Test-Path $binPath) {
        $stashName = 'finalrun.exe.old'
        $stashPath = Join-Path $binDir $stashName
        if (Test-Path $stashPath) {
            Remove-Item -Force $stashPath -ErrorAction SilentlyContinue
        }
        try {
            Rename-Item -Path $binPath -NewName $stashName -ErrorAction Stop
        } catch {
            Write-Failure "Could not replace existing $binPath."
            Write-Failure "Is finalrun running in another window?"
            Write-Failure $_.Exception.Message
            if (Test-Path $tmpPath) { Remove-Item -Force $tmpPath }
            exit 1
        }
    }

    Move-Item -Force -Path $tmpPath -Destination $binPath
    Write-Success "Installed $binPath"
    return $binPath
}

function Update-UserPath {
    param([string]$BinDir)

    # Two independent updates: User PATH in the registry (for new windows),
    # and $env:Path in the current PS session (for the running window). The
    # registry might already be correct while $env:Path lags behind — e.g.
    # the PS process started before a previous installer run, or somebody
    # manually pruned the session. Don't short-circuit one because the other
    # is fine.

    # Registry: idempotent via exact-segment, case-insensitive membership
    # check (Windows paths are case-insensitive; substring matching would
    # falsely match C:\foo\bin against C:\foo\bin\subdir).
    $current = [Environment]::GetEnvironmentVariable('Path', 'User')
    if ($null -eq $current) { $current = '' }
    $segments = ($current -split ';') | Where-Object { $_ }
    if (-not ($segments -icontains $BinDir)) {
        $trimmed = $current.TrimEnd(';')
        $newPath = if ($trimmed) { "$trimmed;$BinDir" } else { $BinDir }
        [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
    }

    # Current PowerShell session: same idempotent check, separate state.
    # The script is run via `irm | iex`, so this assignment lives in the
    # user's shell process — no restart needed for the running window.
    $sessionSegments = (($env:Path -split ';') | Where-Object { $_ })
    if (-not ($sessionSegments -icontains $BinDir)) {
        $sessionTrimmed = ($env:Path).TrimEnd(';')
        $env:Path = if ($sessionTrimmed) { "$sessionTrimmed;$BinDir" } else { $BinDir }
    }
}

function Install-Runtime {
    param(
        [string]$Version,
        [string]$Platform,
        [string]$FinalRunDir
    )

    Write-Heading ""
    Write-Heading "── Downloading runtime tarball ──"

    $url = "https://github.com/$script:GitHubRepo/releases/download/v$Version/finalrun-runtime-$Version-$Platform.tar.gz"
    $runtimeRoot = Join-Path $FinalRunDir 'runtime'
    $runtimeDir = Join-Path $runtimeRoot $Version
    $tarPath = Join-Path $runtimeRoot "$Version.tar.gz"
    $tmpDir = Join-Path $runtimeRoot "$Version.tmp"

    New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null
    if (Test-Path $tmpDir) { Remove-Item -Recurse -Force $tmpDir }
    New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

    Write-Heading "Downloading $url ..."
    try {
        (New-Object Net.WebClient).DownloadFile($url, $tarPath)
    } catch {
        Write-Failure "Failed to download runtime tarball."
        Write-Failure $_.Exception.Message
        if (Test-Path $tmpDir) { Remove-Item -Recurse -Force $tmpDir }
        if (Test-Path $tarPath) { Remove-Item -Force $tarPath }
        exit 1
    }

    Write-Heading "Extracting..."
    & tar -xzf $tarPath -C $tmpDir
    if ($LASTEXITCODE -ne 0) {
        Write-Failure "Failed to extract runtime tarball (tar exited $LASTEXITCODE)."
        if (Test-Path $tmpDir) { Remove-Item -Recurse -Force $tmpDir }
        if (Test-Path $tarPath) { Remove-Item -Force $tarPath }
        exit 1
    }
    Remove-Item -Force $tarPath

    if (Test-Path $runtimeDir) { Remove-Item -Recurse -Force $runtimeDir }
    Move-Item -Path $tmpDir -Destination $runtimeDir
    Write-Success "Runtime $Version installed at $runtimeDir"
    return $runtimeDir
}

function Test-AndroidReady {
    $androidHome = $env:ANDROID_HOME
    if (-not $androidHome) { $androidHome = $env:ANDROID_SDK_ROOT }
    $defaultSdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'

    $sdkPresent = $false
    if ($androidHome -and (Test-Path $androidHome)) { $sdkPresent = $true }
    if (Test-Path $defaultSdk) { $sdkPresent = $true }

    return ($sdkPresent -and [bool](Get-Command scrcpy -ErrorAction SilentlyContinue))
}

function Read-AndroidPrompt {
    Write-Heading ""
    Write-Heading "── Platform Setup ──"
    Write-Heading ""
    Write-Host "FinalRun on Windows supports Android local execution."
    Write-Host "(iOS simulator testing requires macOS — use 'finalrun cloud' for iOS, or a Mac.)"
    Write-Heading ""

    $reply = Read-Host "Set up Android tooling now? [Y/n]"
    if ($reply -match '^[Nn]') { return $false }
    return $true
}

function Install-Android {
    Write-Heading ""
    Write-Heading "── Android Setup ──"
    Write-Heading ""

    # Detect Android Studio / SDK. Either env vars OR the default install
    # path under LOCALAPPDATA satisfy the check.
    $androidHome = $env:ANDROID_HOME
    if (-not $androidHome) { $androidHome = $env:ANDROID_SDK_ROOT }
    $defaultSdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'

    $sdkPresent = $false
    if ($androidHome -and (Test-Path $androidHome)) { $sdkPresent = $true }
    if (Test-Path $defaultSdk) { $sdkPresent = $true }

    if (-not $sdkPresent) {
        Write-Failure "Android Studio / SDK not found."
        Write-Heading "  Install from https://developer.android.com/studio,"
        Write-Heading "  then re-run the installer."
        return $false
    }
    Write-Success "Android Studio / SDK detected."

    # scrcpy: try winget, then Chocolatey, then manual instructions.
    if (Get-Command scrcpy -ErrorAction SilentlyContinue) {
        Write-Success "scrcpy already installed."
        return $true
    }

    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Heading "  Installing scrcpy via winget..."
        & winget install --id Genymobile.scrcpy --accept-source-agreements --accept-package-agreements --silent
        if ($LASTEXITCODE -eq 0) {
            Write-Success "scrcpy installed via winget."
            return $true
        }
        Write-Failure "winget install scrcpy failed (exit $LASTEXITCODE)."
    }

    if (Get-Command choco -ErrorAction SilentlyContinue) {
        Write-Heading "  Installing scrcpy via Chocolatey..."
        & choco install scrcpy -y
        if ($LASTEXITCODE -eq 0) {
            Write-Success "scrcpy installed via Chocolatey."
            return $true
        }
        Write-Failure "choco install scrcpy failed (exit $LASTEXITCODE)."
    }

    Write-Failure "scrcpy not found and neither winget nor Chocolatey is available."
    Write-Heading "  Manual install: download the latest zip from"
    Write-Heading "    https://github.com/Genymobile/scrcpy/releases"
    Write-Heading "  extract it, and add the directory to your PATH."
    return $false
}

function Invoke-Doctor {
    param([string]$BinPath)

    Write-Heading ""
    Write-Heading "── Verifying Setup ──"
    Write-Heading ""
    & $BinPath doctor --platform android
    # Don't exit on doctor failure — it's diagnostic, not blocking. The user
    # might be missing a piece they'll fix later. Bash version does the same.
}

function Sync-Skills {
    Write-Heading ""
    Write-Heading "── FinalRun AI Agent Skills ──"
    Write-Heading ""

    if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
        Write-Notice "npx not found — skills require Node + npm. Install Node 20+ from"
        Write-Notice "https://nodejs.org and re-run the installer if you want them."
        return
    }

    # Detect already-installed finalrun-* skills via the skills CLI's JSON
    # output. `skills update` is internally diff-aware — it only downloads
    # what's stale, so an up-to-date system pays only a network round-trip.
    $installed = @()
    try {
        $listJson = & npx --yes skills ls -g --json 2>$null
        if ($LASTEXITCODE -eq 0 -and $listJson) {
            $entries = $listJson | ConvertFrom-Json
            $installed = @($entries |
                Where-Object { $_.name -like 'finalrun-*' } |
                ForEach-Object { $_.name })
        }
    } catch {
        # Fall through — treat as not-installed.
    }

    if ($installed.Count -eq 0) {
        Write-Heading "Installing FinalRun skills..."
        & npx --yes skills add final-run/finalrun-agent -y -g
        if ($LASTEXITCODE -eq 0) {
            Write-Success "FinalRun skills installed."
        } else {
            Write-Notice "FinalRun skills install failed — see output above. Re-run 'npx skills add final-run/finalrun-agent -g' to retry."
        }
        return
    }

    Write-Heading "Checking FinalRun skills for updates..."
    # `skills update` prints "All global skills are up to date" when nothing is
    # stale, and "Updated N skill(s)" otherwise.
    $out = & npx --yes skills update -g -y @installed 2>&1 | Out-String
    Write-Host $out
    if ($LASTEXITCODE -eq 0) {
        if ($out -match '(?i)up to date') {
            Write-Success "FinalRun skills already up to date."
        } else {
            Write-Success "FinalRun skills updated."
        }
    } else {
        Write-Notice "FinalRun skills update failed — see output above."
    }
}

function Test-ApiKeys {
    Write-Heading ""
    Write-Heading "── API Key Setup ──"
    Write-Heading ""

    $detected = @()
    foreach ($var in @('FINALRUN_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GOOGLE_API_KEY')) {
        if ([Environment]::GetEnvironmentVariable($var)) {
            $detected += $var
        }
    }

    if ($detected.Count -gt 0) {
        foreach ($v in $detected) {
            if ($v -eq 'FINALRUN_API_KEY') {
                Write-Success "$v detected — cloud runs ready."
            } else {
                Write-Success "$v detected — local provider key available."
            }
        }
        return
    }

    Write-Heading "  To run your first cloud test:"
    Write-Heading "    1. Get an API key"
    Write-Heading "         -> $(Format-Underline 'https://cloud.finalrun.app')   (free, ~30 seconds, `$5 credits)"
    Write-Heading "    2. Save it to your shell"
    Write-Heading "         -> `$env:FINALRUN_API_KEY = 'fr_...'"
    Write-Heading "    3. Run from your app workspace"
    Write-Heading "         -> finalrun cloud test <test.yaml> --platform android"
    Write-Heading ""
    Write-Heading "  Running locally instead?"
    Write-Heading "    Configure a provider model/key:"
    Write-Heading "    $(Format-Underline 'https://docs.finalrun.app/configuration/ai-providers')"
}

function Test-FinalrunOnPath {
    Write-Heading ""
    if (Get-Command finalrun -ErrorAction SilentlyContinue) {
        Write-Success "finalrun is on your PATH."
        return
    }
    Write-Notice "finalrun isn't on PATH for this shell yet."
    Write-Heading "  Open a new PowerShell window — your User PATH was updated."
}

function Show-CISummary {
    param([string]$FinalRunDir)
    Write-Heading ""
    Write-Success "finalrun installed."
    Write-Heading ""
    Write-Heading "For cloud commands you're done — try:"
    Write-Heading ""
    Write-Heading "    finalrun cloud test --help"
    Write-Heading ""
    Write-Heading "For local Android execution on this machine, re-run without -CI:"
    Write-Heading ""
    Write-Heading "    irm https://raw.githubusercontent.com/$script:GitHubRepo/main/scripts/install.ps1 | iex"
    Test-FinalrunOnPath
}

function Show-Summary {
    param(
        [string]$BinPath,
        [string]$RuntimeDir,
        [bool]$AndroidOk,
        [string]$FinalRunDir
    )
    Write-Heading ""
    Write-Heading "── Summary ──"
    Write-Heading ""
    Write-Success "finalrun installed at $BinPath"
    if ($RuntimeDir) {
        Write-Success "Runtime extracted to $RuntimeDir"
    }
    if ($AndroidOk) {
        Write-Success "Android: ready."
    } else {
        Write-Notice "Android: setup incomplete — run 'finalrun doctor --platform android' for details."
    }

    Test-FinalrunOnPath
    Write-Heading ""
    Write-Heading "Try it:  finalrun --help"
    Write-Heading ""
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

function Invoke-Main {
    # CI auto-detect: env vars take precedence over the -CI param so users
    # running via `irm | iex` (which can't pass switches) still get the
    # non-interactive path.
    $ciMode = $CI -or [bool]$env:CI -or [bool]$env:FINALRUN_NON_INTERACTIVE

    # Architecture
    $arch = $env:PROCESSOR_ARCHITECTURE
    if ($arch -ne 'AMD64') {
        Write-Failure "Unsupported architecture: $arch."
        Write-Heading "  Windows ARM64 is not yet supported (Bun does not currently provide"
        Write-Heading "  a bun-windows-arm64 cross-compile target)."
        exit 1
    }
    $platform = 'windows-x64'

    # Prereqs: tar.exe ships in Windows 10 1803+ (build 17134). It's the
    # only thing the installer needs that older Windows might lack.
    if (-not (Get-Command tar -ErrorAction SilentlyContinue)) {
        Write-Failure "tar.exe not found in PATH."
        Write-Heading "  Windows 10 build 17134 (April 2018) or later required."
        exit 1
    }

    # Install location
    $finalRunDir = $env:FINALRUN_DIR
    if (-not $finalRunDir) {
        $finalRunDir = Join-Path $env:USERPROFILE '.finalrun'
    }
    $binDir = Join-Path $finalRunDir 'bin'
    New-Item -ItemType Directory -Force -Path $binDir | Out-Null

    $version = Resolve-Version

    Write-Heading "FinalRun Installer ($version)"
    Write-Heading "─────────────────────────────"
    Write-Heading ""

    $binPath = Install-Binary -Version $version -Platform $platform -FinalRunDir $finalRunDir
    Update-UserPath -BinDir $binDir

    if ($ciMode) {
        Show-CISummary -FinalRunDir $finalRunDir
        exit 0
    }

    $runtimeDir = Install-Runtime -Version $version -Platform $platform -FinalRunDir $finalRunDir

    $androidOk = $false
    if (Test-AndroidReady) {
        Write-Heading ""
        Write-Heading "── Platform Setup ──"
        Write-Heading ""
        Write-Success "Android tools detected — skipping setup."
        $androidOk = $true
        Invoke-Doctor -BinPath $binPath
    } elseif (Read-AndroidPrompt) {
        $androidOk = Install-Android
        if ($androidOk) {
            Invoke-Doctor -BinPath $binPath
        }
    }

    Sync-Skills
    Show-Summary -BinPath $binPath -RuntimeDir $runtimeDir -AndroidOk $androidOk -FinalRunDir $finalRunDir
    Test-ApiKeys
}

Invoke-Main
