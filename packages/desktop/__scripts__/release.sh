#!/usr/bin/env bash
set -euo pipefail

# STAGE step of the release pipeline (local, macOS).
#
# Builds + signs + notarizes the DMG and uploads it as an asset on a DRAFT
# GitHub Release `v<version>` on the PRIVATE ambrovia/hyperidle repo. The draft
# is hidden — the DMG only becomes public when CD publishes it on merge (which
# mirrors it to ambrovia/hyperidle-releases and updates Homebrew).
#
# It also bumps the version (root + desktop + chart appVersion) and writes
# packages/desktop/release-manifest.json (sha256) so the PR *carries proof* the
# artifact was staged. The PR's Release Guard check fails if the version is
# bumped without a matching staged DMG.
#
# This script does NOT commit, tag, push, or publish. Workflow:
#   1. ./packages/desktop/scripts/release.sh <version>
#   2. git add -A && git commit && open a PR
#   3. merge to main → CD publishes the release + deploys the backend
#
# Prerequisites:
#   - Developer ID Application certificate in your keychain
#   - APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID in .env or environment
#   - gh CLI authenticated with write access to ambrovia/hyperidle
#
# Usage: ./scripts/release.sh <version>   (e.g. ./scripts/release.sh 0.5.0)

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>   (e.g. $0 0.5.0)"
  exit 1
fi
if ! printf '%s' "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
  echo "Error: version must be semver X.Y.Z (got '$VERSION')"
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
DESKTOP_DIR="$REPO_ROOT/packages/desktop"
REPO="ambrovia/hyperidle"
TAG="v$VERSION"
DMG_NAME="HyperIdle-${VERSION}-arm64.dmg"
DMG="$DESKTOP_DIR/release/$DMG_NAME"
MANIFEST="$DESKTOP_DIR/release-manifest.json"

# Load .env for Apple credentials
if [ -f "$REPO_ROOT/.env" ]; then
  set -a; source "$REPO_ROOT/.env"; set +a
fi

for var in APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID; do
  if [ -z "${!var:-}" ]; then
    echo "Error: $var is not set. Add it to .env or export it."
    exit 1
  fi
done

if ! gh auth status &>/dev/null; then
  echo "Error: gh CLI not authenticated. Run 'gh auth login'."
  exit 1
fi

echo "==> Staging HyperIdle $TAG"

# 1. Bump version everywhere it must move together (root is source of truth).
echo "==> Setting version to $VERSION (root + desktop + chart appVersion)"
node -e "
  const fs = require('fs');
  for (const p of ['$REPO_ROOT/package.json', '$DESKTOP_DIR/package.json']) {
    const pkg = JSON.parse(fs.readFileSync(p, 'utf-8'));
    pkg.version = '$VERSION';
    fs.writeFileSync(p, JSON.stringify(pkg, null, '\t') + '\n');
  }
"
# chart/Chart.yaml appVersion (string match — keep chart 'version' untouched)
perl -0pi -e "s/^appVersion:.*\$/appVersion: \"$VERSION\"/m" "$REPO_ROOT/chart/Chart.yaml"

# 2. Build web SPA + bundle desktop + build/sign/notarize the DMG.
echo "==> Building web SPA"
npm run -w @hyperidle/web build
echo "==> Bundling desktop (esbuild → dist/main.cjs)"
npx tsx packages/desktop/scripts/bundle.ts
echo "==> Building, signing, and notarizing DMG (this takes several minutes)"
cd "$DESKTOP_DIR"
npx electron-builder --config electron-builder.yml --mac --arm64 --publish never
cd "$REPO_ROOT"

if [ ! -f "$DMG" ]; then
  echo "Error: DMG not found at $DMG"
  ls "$DESKTOP_DIR/release/" 2>/dev/null || echo "(release dir does not exist)"
  exit 1
fi
echo "==> DMG built: $(du -sh "$DMG" | cut -f1)"

# 3. sha256 + manifest (the PR carries this as proof of the staged artifact).
SHA256="$(shasum -a 256 "$DMG" | cut -d' ' -f1)"
node -e "
  const fs = require('fs');
  fs.writeFileSync('$MANIFEST', JSON.stringify({
    version: '$VERSION',
    arch: 'arm64',
    dmgName: '$DMG_NAME',
    sha256: '$SHA256',
  }, null, '\t') + '\n');
"
echo "==> Wrote $MANIFEST (sha256 $SHA256)"

# 4. Upload the DMG to a DRAFT release on the private repo (hidden until CD).
#    Drafts do not create the git tag — that happens when CD publishes.
echo "==> Uploading DMG to DRAFT release $TAG on $REPO"
if gh release view "$TAG" --repo "$REPO" &>/dev/null; then
  gh release upload "$TAG" "$DMG" --clobber --repo "$REPO"
else
  gh release create "$TAG" "$DMG" \
    --repo "$REPO" \
    --draft \
    --title "HyperIdle $TAG" \
    --notes "Desktop release $TAG (arm64). Published automatically when the version-bump PR merges to main."
fi

echo ""
echo "Staged $TAG. Next:"
echo "  1. git add -A && git commit -m \"release: HyperIdle $TAG\""
echo "  2. open a PR to main (Release Guard will verify the staged DMG)"
echo "  3. merge → CD publishes the release (→ Homebrew) and deploys the backend"
