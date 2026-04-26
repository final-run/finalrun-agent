# Releasing finalrun-agent

This is the runbook for cutting a new release. The normal path uses GitHub Actions and takes one click. There's also a manual fallback for when CI is unavailable or you want to release from your laptop.

## What a release contains

Every release ships **10 download files** plus a checksum file for each (20 files total) on the GitHub Releases page:

- A small `finalrun` program for each of: macOS Apple Silicon, macOS Intel, Linux x86_64, Linux ARM64, Windows x86_64.
- A "runtime bundle" (`.tar.gz`) for each of those five platforms — this contains the extra files local-test execution needs (driver app builds, gRPC schema, the report-server web UI). The Windows runtime is Android-only; iOS local execution requires macOS.

Users install the `finalrun` program by running:

```sh
curl -fsSL https://raw.githubusercontent.com/final-run/finalrun-agent/main/scripts/install.sh | bash
```

The installer downloads the right binary for their machine, and (in interactive mode) the matching runtime bundle.

There is **no npm publication.** The CLI is a binary, not an npm package.

---

## How to cut a release (the normal way)

You do three things. Steps 1 and 2 are a small PR. Step 3 is one click.

### 1. Open a release PR

Make a branch and bump the version:

```sh
git checkout -b release/vX.Y.Z
npm version X.Y.Z -w @finalrun/finalrun-agent --no-git-tag-version
```

Then edit [`CHANGELOG.md`](./CHANGELOG.md) and add a section for your new version under `## [Unreleased]`. Use this format:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- (new things)

### Changed
- (behavior changes)

### Fixed
- (bug fixes)
```

This is the **only** place you write release notes. The release process pulls this section from `CHANGELOG.md` and puts it on the GitHub Releases page automatically — you never edit the GitHub Releases page directly.

Commit and push:

```sh
git add packages/cli/package.json package.json CHANGELOG.md
git commit -m "Release vX.Y.Z"
git push -u origin release/vX.Y.Z
```

Open a PR from this branch to `main`, get review, merge.

### 2. Trigger the release

After the PR is merged, in your browser:

1. Go to the repo's **Actions** tab on GitHub
2. Click **Release** in the left sidebar
3. Click **Run workflow** on the right, pick `main`, click the green **Run workflow** button

Or from your terminal:

```sh
gh workflow run release.yml -f branch=main
gh run watch                              # follow progress live
```

### 3. Verify it shipped

The workflow takes about 4 minutes. When it's done:

```sh
gh release view vX.Y.Z                    # see the release page contents
```

Or open `https://github.com/final-run/finalrun-agent/releases/tag/vX.Y.Z` in a browser.

You should see:

- 20 downloadable files (10 binaries/tarballs + 10 checksum files)
- A release body that includes install instructions and your CHANGELOG section

That's it — `finalrun upgrade` on user machines, and fresh `curl ... | bash` runs, will now pull your new version.

---

## What the workflow checks before publishing

The workflow refuses to release if any of these fail. This is your safety net.

- The version in `packages/cli/package.json` must look like a valid version (e.g. `1.2.3` or `0.2.0-rc.1`).
- A tag named `vX.Y.Z` must not already exist on origin (so you can't accidentally overwrite a previous release).
- `CHANGELOG.md` must have a `## [X.Y.Z]` section. **No release notes, no release.**

If any of these fail, the workflow exits early with a message telling you exactly what to fix. Nothing ships.

---

## Manual fallback (no CI needed)

Use this when GitHub Actions is down, you don't have access to it, or you want to release straight from your laptop. The result is identical — same files, same release page.

You'll need:

- `bun` installed: `curl -fsSL https://bun.sh/install | bash` (one time)
- `gh` CLI logged in: `gh auth login` (one time)
- About 5 minutes

Steps:

```sh
# 1. Be on the merged release commit on main
git checkout main && git pull

# 2. Set the version you're releasing
VERSION=X.Y.Z

# 3. Build all 10 release files
./scripts/build-binary.sh
for t in darwin-arm64 darwin-x64 linux-x64 linux-arm64 windows-x64; do
  npm run build:tarball --workspace=@finalrun/local-runtime -- --target=$t
done

# 4. Tag the commit and push the tag
git tag -a "v$VERSION" -m "Release v$VERSION"
git push origin "v$VERSION"

# 5. Build the release notes (combines the static install instructions with
#    your CHANGELOG section — same logic the workflow uses)
awk -v marker="## [${VERSION}]" '
  index($0, marker) == 1 { c=1; print; next }
  c && /^## \[/ { exit }
  c { print }
' CHANGELOG.md > /tmp/version-notes.md

{
  cat .github/release-notes-template.md
  echo ""
  echo "---"
  echo ""
  echo "## What's changed in this release"
  echo ""
  tail -n +2 /tmp/version-notes.md
} > /tmp/release-body.md

# 6. Create the release with all artifacts attached
gh release create "v$VERSION" \
  --title "FinalRun $VERSION" \
  --notes-file /tmp/release-body.md \
  --latest \
  dist/binaries/finalrun-* \
  packages/local-runtime/dist/finalrun-runtime-*.tar.gz*
```

For a pre-release (e.g. `0.2.0-rc.1`), swap `--latest` for `--prerelease` so it doesn't displace the current "latest" pointer.

---

## If the workflow fails partway through

The workflow is designed so the tag isn't created until the build has succeeded. So if it fails before that point, just **fix the issue and re-run** — there's no leftover state to clean up.

If it fails AFTER the tag is created (rare — only happens if the GitHub Releases upload itself flakes), do this cleanup before retrying:

```sh
git push origin :refs/tags/vX.Y.Z         # delete the tag from GitHub
git tag -d vX.Y.Z                         # delete it locally too
gh release delete vX.Y.Z --yes            # delete the partial release if any
```

Then re-trigger the workflow.

---

## Rolling back a release that shipped broken

If a release goes out and turns out to be broken:

```sh
gh release delete vX.Y.Z --yes            # this rolls back the "latest" pointer
git push origin :refs/tags/vX.Y.Z         # delete the tag
git tag -d vX.Y.Z                         # locally too
```

Now fix the issue on a new PR, then cut a fresh release (either re-using `vX.Y.Z` or moving to `vX.Y.Z+1` — your call).

Note: anyone who already installed the broken version still has it on their disk. They'll get the new version when they run `finalrun upgrade` or re-run the curl install command. The public install URL goes through "latest", so deleting the broken release immediately stops new users from getting it.
