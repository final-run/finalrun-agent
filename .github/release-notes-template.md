## Install

One command on macOS or Linux. No Node.js, no npm, nothing else required.

```sh
curl -fsSL https://raw.githubusercontent.com/final-run/finalrun-agent/main/scripts/install.sh | bash
```

For CI / non-interactive environments (binary only, no runtime tarball, no prompts):

```sh
curl -fsSL https://raw.githubusercontent.com/final-run/finalrun-agent/main/scripts/install.sh | bash -s -- --ci
```

CI environments (`CI=1`) get this behavior automatically even without the flag.

For Windows, download `finalrun-windows-x64.exe` from the assets below and place it on your PATH. Local Android execution also needs the matching `finalrun-runtime-<version>-windows-x64.tar.gz` extracted to `%USERPROFILE%\.finalrun\runtime\<version>\`. (A PowerShell installer is in the works.)

## Artifacts

| Platform | Binary | Runtime tarball |
|---|---|---|
| macOS Apple Silicon | `finalrun-darwin-arm64`  | `finalrun-runtime-<version>-darwin-arm64.tar.gz`  |
| macOS Intel         | `finalrun-darwin-x64`    | `finalrun-runtime-<version>-darwin-x64.tar.gz`    |
| Linux x86_64        | `finalrun-linux-x64`     | `finalrun-runtime-<version>-linux-x64.tar.gz`     |
| Linux ARM64         | `finalrun-linux-arm64`   | `finalrun-runtime-<version>-linux-arm64.tar.gz`   |
| Windows x86_64      | `finalrun-windows-x64.exe` | `finalrun-runtime-<version>-windows-x64.tar.gz` |

Each artifact ships with a matching `.sha256` sidecar.

## Upgrading from a previous version

```sh
finalrun upgrade
```

The CLI re-runs the install script with sensible defaults (auto-detects whether you previously installed the runtime tarball, preserves your install directory).
