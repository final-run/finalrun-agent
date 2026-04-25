# Releasing finalrun-agent

The CLI is distributed as a Bun-compiled binary plus a per-platform runtime tarball, both uploaded to GitHub Releases. There is **no npm publication**. End users install via:

```sh
curl -fsSL https://raw.githubusercontent.com/final-run/finalrun-agent/main/scripts/install.sh | bash
```

Releases are cut by triggering [`.github/workflows/release.yml`](.github/workflows/release.yml) manually from the Actions UI. The workflow handles everything: building 4 binaries (Bun cross-compile), 4 runtime tarballs, tagging the build commit, creating the GitHub Release, attaching all 16 artifacts (binaries + tarballs + their `.sha256` sidecars), and marking the release as `latest` (or `prerelease` for non-main / pre-release versions).

---

## Standard release flow

### 1. Bump the version + write the changelog entry on a branch

```sh
git checkout -b release/vX.Y.Z
npm version X.Y.Z -w @finalrun/finalrun-agent --no-git-tag-version
```

Edit [`CHANGELOG.md`](./CHANGELOG.md): add a section under `## [Unreleased]` for the new version, following the Keep-a-Changelog format (Added / Changed / Deprecated / Removed / Fixed / Security):

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- ...

### Changed
- ...

### Fixed
- ...
```

This is the **only** place where version-specific notes are written. The release workflow extracts this exact section and combines it with the static install instructions from [`.github/release-notes-template.md`](.github/release-notes-template.md) to populate the GitHub Release body. **No manual editing of the GitHub Release UI is needed or expected.**

```sh
git add packages/cli/package.json package.json CHANGELOG.md package-lock.json
git commit -m "Release vX.Y.Z"
git push -u origin release/vX.Y.Z
```

The workflow validates that:

- The version in `packages/cli/package.json` is valid semver.
- The matching tag (`vX.Y.Z`) doesn't already exist locally **or** on origin.
- `CHANGELOG.md` has a `## [X.Y.Z]` section. **The workflow refuses to publish if this section is missing**, so a release can't accidentally go out with empty notes.

Workflow refuses to release if any check fails.

### 2. Open + merge the release PR

Open a PR from `release/vX.Y.Z` → `main`. Get review, address any CodeRabbit findings, merge with squash + delete branch. The `Release vX.Y.Z` commit lands on main.

### 3. Trigger the release workflow

**From the GitHub UI**:

1. Repo → Actions tab → **Release** workflow (left sidebar)
2. **Run workflow** dropdown (right side) → branch: `main` → **Run workflow**

**Or from `gh`**:

```sh
gh workflow run release.yml -f branch=main
gh run watch                              # watch progress live
gh release view vX.Y.Z                    # verify after success
```

The workflow takes ~4 min on `ubuntu-24.04`:

| Step | Duration |
|---|---|
| Resolve version, validate semver, refuse duplicate tag | ~5 s |
| `npm ci` + cache | ~30 s |
| `npm run build` across all workspaces | ~30 s |
| `bun build --compile` for 4 targets | ~1 min |
| Build runtime tarballs for 4 targets | ~1 min |
| Tag commit, push tag, `gh release create` with all artifacts | ~30 s |

When done, `~/.finalrun/bin/finalrun upgrade` (or a fresh `curl ... | sh`) on user machines will resolve to the new version.

---

## Pre-release tags

For testing the install flow without claiming `latest`, use a semver pre-release segment:

```sh
npm version 0.2.0-rc.1 -w @finalrun/finalrun-agent --no-git-tag-version
```

The workflow auto-detects the `-` and creates the GitHub Release with `--prerelease` instead of `--latest`. The `latest` pointer (which `install.sh` resolves) stays on the previous stable release.

---

## Re-running a failed release

The workflow is structured so the tag is **not created until the release job runs successfully**. If anything fails before that point, just re-run the workflow with the same branch — no cleanup needed.

If the release job itself failed mid-way (rare — could happen if `gh release create` flaked after the tag push), you have two options:

**Option A — keep the tag, just retry the upload**:

```sh
gh release delete vX.Y.Z --yes   # remove the partial release if any
# Then re-run via UI, OR via gh:
gh workflow run release.yml -f branch=main
```

The workflow's tag-existence check is local-only; deleting the release without deleting the tag will fail the second-attempt's pre-flight. Delete both:

**Option B — full reset and retry**:

```sh
git push origin :refs/tags/vX.Y.Z   # delete remote tag
git tag -d vX.Y.Z                   # delete local tag (if any)
gh release delete vX.Y.Z --yes      # delete release if any
# Then re-trigger the workflow.
```

---

## Concurrency

The workflow has a `concurrency:` block keyed on the chosen branch — two clicks of "Run workflow" for the same branch queue rather than race. `cancel-in-progress: false` so an in-flight release is never aborted by a duplicate trigger.

---

## What ships in each release

For every release tag, the workflow uploads 16 files to the GitHub Release:

| Platform | Binary | Runtime tarball |
|---|---|---|
| macOS Apple Silicon | `finalrun-darwin-arm64` | `finalrun-runtime-X.Y.Z-darwin-arm64.tar.gz` |
| macOS Intel | `finalrun-darwin-x64` | `finalrun-runtime-X.Y.Z-darwin-x64.tar.gz` |
| Linux x86_64 | `finalrun-linux-x64` | `finalrun-runtime-X.Y.Z-linux-x64.tar.gz` |
| Linux ARM64 | `finalrun-linux-arm64` | `finalrun-runtime-X.Y.Z-linux-arm64.tar.gz` |

Each file ships with a matching `.sha256` sidecar. Total: 16 artifacts.

The release notes are populated from [`.github/release-notes-template.md`](.github/release-notes-template.md).

---

## Local dry-run before triggering CI

To validate the full pipeline locally before clicking the button:

```sh
# Build all artifacts:
./scripts/build-binary.sh
for t in darwin-arm64 darwin-x64 linux-x64 linux-arm64; do
  npm run build:tarball --workspace=@finalrun/local-runtime -- --target=$t
done

# Stage them where install.sh expects them:
mkdir -p /tmp/fr-test-release/vX.Y.Z
cp dist/binaries/finalrun-* /tmp/fr-test-release/vX.Y.Z/
cp packages/local-runtime/dist/finalrun-runtime-*.tar.gz /tmp/fr-test-release/vX.Y.Z/

# Serve locally and run the installer against it:
(cd /tmp/fr-test-release && python3 -m http.server 8765 &)
sed -e 's|https://github.com/${GITHUB_REPO}/releases/download/${TAG}|http://localhost:8765/${TAG}|g' scripts/install.sh \
  | FINALRUN_DIR=/tmp/fr-test-install FINALRUN_VERSION=X.Y.Z bash -s -- --cloud-only

/tmp/fr-test-install/bin/finalrun --version
```

This catches build/install regressions without touching real GitHub Releases. Cleanup: `kill %1 && rm -rf /tmp/fr-test-release /tmp/fr-test-install`.

---

## Rolling back a bad release

If a release goes out broken:

1. **Delete the GitHub Release** (this rolls back the `latest` pointer):
   ```sh
   gh release delete vX.Y.Z --yes
   ```
2. **Delete the tag** so the next release can re-use the version (or pick a new one):
   ```sh
   git push origin :refs/tags/vX.Y.Z
   git tag -d vX.Y.Z
   ```
3. **Fix the issue** on a new PR.
4. **Cut a new release** following the standard flow above.

Users who already curl-installed the bad version keep it on disk until they `finalrun upgrade` or re-run the install URL. The public install URL points at `latest`, so deleting the bad release immediately stops new users from getting it.

---

## What CI needs

Nothing beyond the default repo permissions. The workflow uses `GITHUB_TOKEN` (auto-provided) with `contents: write` to push the tag and create the release. No PATs, no secrets, no third-party integrations.

If you ever need to **publish from a fork or restricted runner**, that's a separate setup and not currently supported.

---

## Future work

These are explicitly out of scope for the current release flow:

- **macOS notarization / code signing**: Gatekeeper warnings handled via `xattr -d com.apple.quarantine` in `install.sh`. Proper signing requires an Apple Developer account secret and a re-architected workflow with a macOS runner.
- **Windows binaries**: `install.sh` refuses Windows hosts up front. Adding Windows support means cross-compiling a fifth target plus optional Authenticode signing.
- **Auto-bump on tag push**: workflow is manual-only by design. To switch to tag-push triggering, add an `on: push: tags: ['v*']` block and adjust the version-validation step to read from the tag rather than from `packages/cli/package.json`.
